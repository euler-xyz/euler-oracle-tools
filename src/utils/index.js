import { Contract, providers, BigNumber, utils, constants } from "ethers";

const c1e18 = BigNumber.from(10).pow(18);
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const UNISWAP_QUOTERV2_ADDRESS = '0x0209c4Dc18B2A1439fD2427E34E7cF3c6B91cFB9';
const provider = new providers.JsonRpcProvider(process.env.REACT_APP_ETHEREUM_HTTP);
const abi = [
  'function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) public returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const quoterContract = new Contract(
  UNISWAP_QUOTERV2_ADDRESS,
  abi,
  provider,
);

export const sqrtPriceX96ToPrice = (a, invert) => {
  const scale = BigNumber.from(2).pow(96*2).div(c1e18);
  a = BigNumber.from(a);
  a = a.mul(a).div(scale);
  if (invert) a = c1e18.mul(c1e18).div(a);
  return a;
}

export const getCurrPrice = async (market, fee) => {
  if (market.underlying.toLowerCase() === WETH_ADDRESS) return { pump: '0', dump: '0' };
  try {
    let inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    let quote;

    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: market.underlying,
      tokenOut: WETH_ADDRESS,
      fee,
      amountIn: 1,
      sqrtPriceLimitX96: 0,
    });

    return sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted)
  } catch (e) {
    console.log('e: ', market.symbol, e);
    // if (market.symbol !== 'renDOGE') sendAlert("uniswapMarkets : " + e.toString())
  }
}

export const getDump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  if (market.underlying.toLowerCase() === WETH_ADDRESS) return '0';
  try {
    let inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice)).mul(c1e18).div(currPrice);
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: market.underlying,
      tokenOut: WETH_ADDRESS,
      fee,
      amountIn: amountIn,
      sqrtPriceLimitX96: 0
    });
    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = after.sub(currPrice).mul(utils.parseUnits('1', market.decimals)).div(currPrice);

    return {
      value: tradeValueInUSD,
      priceImpact: utils.formatUnits(priceImpact.mul(100), market.decimals),
      price: formatPrice(after, market),
    }
  } catch (e) {
    console.log('e: ', market.symbol, e);
    // if (market.symbol !== 'renDOGE') sendAlert("uniswapMarkets : " + e.toString())
  }
}

export const getPump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  if (market.underlying.toLowerCase() === WETH_ADDRESS) return '0';
  try {
    let inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice));
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: WETH_ADDRESS,
      tokenOut: market.underlying,
      fee,
      amountIn: amountIn,
      sqrtPriceLimitX96: 0
    });

    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = after.sub(currPrice).mul(utils.parseUnits('1', market.decimals)).div(currPrice);

    return {
      value: tradeValueInUSD,
      priceImpact: utils.formatUnits(priceImpact.mul(100), market.decimals),
      price: formatPrice(after, market),
    }
  } catch (e) {
    console.log('e: ', market.symbol, e);
    // if (market.symbol !== 'renDOGE') sendAlert("uniswapMarkets : " + e.toString())
  }
}

export const getPumpAndDump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  const [pump, dump] = await Promise.all([
    getPump(currPrice, market, fee, ethPrice, tradeValueInUSD),
    getDump(currPrice, market, fee, ethPrice, tradeValueInUSD),
  ]);
  return { pump, dump };
}

export const searchTrade = (currPrice, market, fee, ethPrice, target, targetType, pumpOrDump) => {
  let currPriceFormatted = formatPrice(currPrice, market);
  if (
    targetType === 'price' &&
    (pumpOrDump === 'pump' && target <= currPriceFormatted || pumpOrDump === 'dump' && target >= currPriceFormatted)
  ) return [];

  let isCancelled = false
  const cancel = () => {
    isCancelled = true
  }

  const exec = async () => {
    let high = 1_000_000_000;
    let low = 0;
    let currOutcome;
    let tolerance = target / 100;
    let ranges = 20;
    let factor = 2;

    const getTrade = pumpOrDump === 'pump' ? getPump : getDump;
    
    // while (currOutcome < target) {
    //     if (isCancelled) throw 'cancelled';
    //     high = high * factor;
    //     currOutcome = Math.abs(await getTrade(currPrice, market, fee, ethPrice, high));
    //     factor += 1;
    //   }
      
    // low = high === 100000 * 2 ? 0 : high / (factor - 1);

      
    high = 1_000_000_000;
    low = 0;
    let tradeValue = -1;
    while (!currOutcome || Math.abs(currOutcome[targetType] - target) > tolerance) {
      console.log('searching...');
      if (isCancelled) throw 'cancelled';

      let points = Array(ranges - 1).fill(null).map((_, i) => low + (high - low) / ranges * (i + 1));

      const res = await Promise.all(points.map(async (point) => {
        const trade = await getTrade(currPrice, market, fee, ethPrice, point);
        return {
          priceImpact: Math.abs(trade.priceImpact),
          price: trade.price,
        };
      }));

      points = [low, ...points, high];

      let found = false;
      [currOutcome, tradeValue, low, high] = res.reduce((accu, r, i) => {
        if (!accu[0] || Math.abs(r[targetType] - target) < Math.abs(accu[0][targetType] - target)) {
          found = true;
          return [r, points[i + 1], points[i], points[i + 2]]
        }
        return accu;
      }, []);
      if (!found) throw "Improvement not found";
    }
  
    return { value: tradeValue, ...currOutcome};
  }
  return [exec(), cancel];
}

export const binarySearchTradeValues = (currPrice, market, fee, ethPrice, target, targetType) => {
  const [execPump, cancelPump] = searchTrade(currPrice, market, fee, ethPrice, target, targetType, 'pump');
  const [execDump, cancelDump] = searchTrade(currPrice, market, fee, ethPrice, target, targetType, 'dump');
  const cancel = () => {
    if (cancelPump) cancelPump();
    if (cancelDump) cancelDump();
  };

  const exec = () => Promise.all([execPump, execDump]);

  return { promise: exec(), cancel };
}

export const numberFormatText = (num, noAbbrev = false) => {
  if (Number(num) === 0) {
    return 0
  } else if (Number.parseFloat(num) < 1) {
    return Number.parseFloat(num).toFixed(6)
  } else if (Number.parseFloat(num) < 1) {
    return Number.parseFloat(num).toPrecision(6)
  } else if (num < 1000 || noAbbrev) {
    return Number.parseFloat(num).toFixed(2)
  } else {
    const si = [
      { value: 1, symbol: "" },
      { value: 1e3, symbol: "k" },
      { value: 1e6, symbol: "M" },
      { value: 1e9, symbol: "B" },
    ]
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/

    let i
    for (i = si.length - 1; i > 0; i--) {
      if (num >= si[i].value) {
        break
      }
    }

    return (num / si[i].value).toFixed(2).replace(rx, "$1") + si[i].symbol
  }
}

export const formatPrice = (price, token) =>
 utils.formatEther(price.div(BigNumber.from(10).pow(18 - token.decimals)));