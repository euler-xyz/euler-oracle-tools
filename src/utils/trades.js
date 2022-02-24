import { Contract, utils } from "ethers";
import { Decimal } from "decimal.js";
import { sortBy } from "lodash";

import {
  WETH_ADDRESS,
  UNISWAP_QUOTERV2_ADDRESS,
  QUOTER_ABI,
  c1e18,
} from "./constants";
import {
  isInverted,
  provider,
  sqrtPriceX96ToPrice,
  formatPrice,
} from ".";


const quoterContract = new Contract(
  UNISWAP_QUOTERV2_ADDRESS,
  QUOTER_ABI,
  provider
);

export const getDump = async (
  currPrice,
  token,
  fee,
  ethPrice,
  tradeValueInUSD
) => {
  if (token.address.toLowerCase() === WETH_ADDRESS || currPrice.eq(0))
    return { value: tradeValueInUSD, price: "0", priceImpact: "0" };

  try {
    let inverted = isInverted(token.address);
    let quote;

    let amountIn = utils
      .parseEther(new Decimal(tradeValueInUSD / ethPrice).toFixed(18))
      .mul(c1e18)
      .div(currPrice);
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: token.address,
      tokenOut: WETH_ADDRESS,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0,
    });
    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = utils.formatEther(
      after.sub(currPrice).mul(c1e18).div(currPrice).mul(100)
    );

    return {
      amountIn,
      value: tradeValueInUSD,
      priceImpact,
      sqrtPriceX96After: quote.sqrtPriceX96After.toString(),
      price: formatPrice(after, token),
      after,
      amountOut: quote.amountOut,
      tokenOut: WETH_ADDRESS,
      gasEstimate: quote.gasEstimate,
    };
  } catch (e) {
    console.log("e dump: ", token.symbol, e);
    throw e;
  }
};

export const getPump = async (
  currPrice,
  token,
  fee,
  ethPrice,
  tradeValueInUSD
) => {
  if (token.address.toLowerCase() === WETH_ADDRESS || currPrice.eq(0))
    return { value: tradeValueInUSD, price: "0", priceImpact: "0" };

  try {
    let inverted = isInverted(token.address);
    let quote;

    let amountIn = utils.parseEther(new Decimal(tradeValueInUSD / ethPrice).toFixed(18));
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: WETH_ADDRESS,
      tokenOut: token.address,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0,
    });

    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);

    const priceImpact = utils.formatEther(
      after.sub(currPrice).mul(c1e18).div(currPrice).mul(100)
    );

    return {
      amountIn,
      value: tradeValueInUSD,
      priceImpact,
      sqrtPriceX96After: quote.sqrtPriceX96After.toString(),
      price: formatPrice(after, token),
      after,
      amountOut: quote.amountOut,
      tokenOut: token.address,
      gasEstimate: quote.gasEstimate,
    };
  } catch (e) {
    console.log("e pump: ", token.symbol, e);
    throw e;
  }
};

export const getPumpAndDump = async (
  currPrice,
  token,
  fee,
  ethPrice,
  tradeValueInUSD
) => {
  const [pump, dump] = await Promise.all([
    getPump(currPrice, token, fee, ethPrice, tradeValueInUSD),
    getDump(currPrice, token, fee, ethPrice, tradeValueInUSD),
  ]);
  return { pump, dump };
};

// TODO only price target
export const searchTrade = (
  currPrice,
  currSqrtPriceX96,
  token,
  fee,
  ethPrice,
  target,
  targetType,
  direction
) => {
  let currPriceFormatted = formatPrice(currPrice, token);

  if (
    (targetType === "price" &&
      ((direction === "pump" && target.lte(currPriceFormatted)) ||
        (direction === "dump" && target.gte(currPriceFormatted)))) ||
    (targetType === "sqrtPriceX96After" &&
      ((direction === "pump" && target.lte(currSqrtPriceX96)) ||
        (direction === "dump" && target.gte(currSqrtPriceX96))))
  ) {
    return [];
  }

  let isCancelled = false;
  const cancel = () => {
    isCancelled = true;
  };

  const exec = async () => {
    let high = 1_000_000_000;
    let low = 0;
    let tolerance = 0.01;
    let ranges = 20;

    let allTrades = [];
    let best;

    // TODO improve this hack
    const inverted = isInverted(token.address);
    const adjustedDirection = inverted
      ? { pump: "dump", dump: "pump" }[direction]
      : direction;

    const getTrade = adjustedDirection === "pump" ? getPump : getDump;
    const getNewTicks = (_, i) => low + ((high - low) / ranges) * (i + 1);
    const getTickTrade = async (tick, index) => {
      const trade = await getTrade(currPrice, token, fee, ethPrice, tick);
      allTrades.push(trade);
      return {
        ...trade,
        priceImpact: Math.abs(trade.priceImpact),
        value: tick,
        index,
      };
    };

    const findBest = (samples) => samples.reduce((accu, s, i) => {
      const sampleVal = new Decimal(s[targetType]);
      const accuVal = new Decimal(accu[targetType]);

      if (
        sampleVal
          .log(10)
          .sub(target.log(10))
          .abs()
          .lessThan(accuVal.log(10).sub(target.log(10)).abs())
      ) {
        // console.log(direction, 'found:', s)
        return s;
      }
      return accu;
    });

    let i = 0;
    while (high - low > high * tolerance && high >= 100) {
      if (isCancelled) throw new Error("cancelled");

      let ticks = Array(ranges - 1)
        .fill(null)
        .map(getNewTicks);
      // console.log(direction, 'ticks: ', ticks);

      const samples = await Promise.all(ticks.map(getTickTrade));

      best = findBest(samples);
      // console.log(direction, 'best: ', best);

      // best result is to the far right, increase range
      if (i === 0 && best.index === ranges - 2) {
        high *= 1_000_000; // 1000 trillions
        low = ticks[ranges - 3];
      } else if (i === 1 && best.index === ranges - 2 && high > 1_000_000_000) {
        // range was increased already, it's ridiculous to continue
        throw new Error("Max trade value exceeded (1000T USD)");
      } else if (best.index === 0) {
        // no improvement after the first sample - go down the left
        high = ticks[1];
      } else {
        // otherwise make sure the range is not flat
        for (let j = 0; j < best.index; j++) {
          if (samples[j][targetType] !== best[targetType]) {
            low = ticks[j];
          }
        }
        high = ticks[best.index + 1] || high;
      }
      // console.log(direction, 'low high: ', low, high);
      i++;
    }

    allTrades = sortBy(allTrades, "value");

    // take the best trade above target if available
    best =
      allTrades.find((t) =>
        targetType === "priceImpact" || direction === "pump"
          ? target.lte(Decimal.abs(t[targetType]))
          : target.gte(Decimal.abs(t[targetType]))
      ) || best;

    // console.log(direction, 'RESULT', best);
    return {
      best,
      // include trades below and a few over
      trades: allTrades.filter(
        (t) => t.value < Math.max(10_000_000, best.value * 1.2)
      ),
    };
  };
  return [exec(), cancel];
};

export const binarySearchTradeValues = (
  currPrice,
  currSqrtPriceX96,
  token,
  fee,
  ethPrice,
  target,
  targetType
) => {
  let [execPump, cancelPump] = searchTrade(
    currPrice,
    currSqrtPriceX96,
    token,
    fee,
    ethPrice,
    target,
    targetType,
    "pump"
  );
  let [execDump, cancelDump] = searchTrade(
    currPrice,
    currSqrtPriceX96,
    token,
    fee,
    ethPrice,
    target,
    targetType,
    "dump"
  );
  const cancel = () => {
    if (cancelPump) cancelPump();
    if (cancelDump) cancelDump();
  };

  // todo improve!
  if (isInverted(token.address)) [execPump, execDump] = [execDump, execPump];
  return { promise: Promise.all([execPump, execDump]), cancel };
};
