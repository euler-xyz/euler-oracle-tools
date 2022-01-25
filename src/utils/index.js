/* eslint-disable */

import { Contract, providers, BigNumber, utils, constants } from "ethers";
import { sortBy } from "lodash";
import { Decimal } from "decimal.js";

const c1e18 = BigNumber.from(10).pow(18);
const UNISWAP_QUOTERV2_ADDRESS = '0x0209c4Dc18B2A1439fD2427E34E7cF3c6B91cFB9';
const UNISWAP_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const POOL_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';
const MAX_SQRT_RATIO = '1461446703485210103287273052203988822378723970342'; // from TickMath.sol
const provider = new providers.JsonRpcProvider(process.env.REACT_APP_ETHEREUM_HTTP);
const quoterAbi = [
  'function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) public returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const poolAbi = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
]
const factoryAbi = [
  'function getPool(address token0, address token1, uint24 fee) public view returns (address)',
]
const quoterContract = new Contract(
  UNISWAP_QUOTERV2_ADDRESS,
  quoterAbi,
  provider,
);
const factoryContract = new Contract(
  UNISWAP_FACTORY_ADDRESS,
  factoryAbi,
  provider,
);
    
export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

export const sqrtPriceX96ToPrice = (a, invert) => {
  const scale = BigNumber.from(2).pow(96*2).div(c1e18);
  a = BigNumber.from(a);
  a = a.mul(a).div(scale);
  if (invert) a = c1e18.mul(c1e18).div(a);
  return a;
}

export const MAX_TICK_PRICE = sqrtPriceX96ToPrice(MAX_SQRT_RATIO, false).toString();


export const getCurrPrice = async (market, fee) => {
  if (market.underlying.toLowerCase() === WETH_ADDRESS) return BigNumber.from(1);
  try {
    const inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    const pool = new Contract(
      computeUniV3PoolAddress(market.underlying, WETH_ADDRESS, fee),
      poolAbi,
      provider,
    );

    const quote = await pool.slot0();
    return sqrtPriceX96ToPrice(quote.sqrtPriceX96, inverted)
  } catch (e) {
    console.log('current price: ', market.symbol, e);
  }
}

export const getPoolFees = async (address) => {
  const [token0, token1] = BigNumber.from(address).gt(WETH_ADDRESS)
    ? [WETH_ADDRESS, address]
    : [address, WETH_ADDRESS];

  const pools = await Promise.all([100, 500, 3000, 10000].map(async fee => {
    const pool = await factoryContract.getPool(token0, token1, fee);
    if (pool !== constants.AddressZero) return fee;
  }));

  return pools.filter(Boolean);
}

export const getDump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  if (
    market.underlying.toLowerCase() === WETH_ADDRESS ||
    currPrice.eq(0)
  ) return { value: tradeValueInUSD, price: '0', priceImpact: '0' };

  try {
    let inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice)).mul(c1e18).div(currPrice);
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: market.underlying,
      tokenOut: WETH_ADDRESS,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0
    });
    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = after.sub(currPrice).mul(utils.parseUnits('1', market.decimals)).div(currPrice);

    return {
      value: tradeValueInUSD,
      priceImpact: utils.formatUnits(priceImpact.mul(100), market.decimals),
      price: formatPrice(after, market),
      after,
      amountOut: quote.amountOut,
      tokenOut: WETH_ADDRESS,
      gasEstimate: quote.gasEstimate,
    };
  } catch (e) {
    console.log('e: ', market.symbol, e);
    throw e;
  }
}

export const getPump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  if (
    market.underlying.toLowerCase() === WETH_ADDRESS ||
    currPrice.eq(0)
  ) return { value: tradeValueInUSD, price: '0', priceImpact: '0' };

  try {
    let inverted = BigNumber.from(market.underlying).gt(WETH_ADDRESS);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice));
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: WETH_ADDRESS,
      tokenOut: market.underlying,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0,
    });

    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = after.sub(currPrice).mul(utils.parseUnits('1', market.decimals)).div(currPrice);

    return {
      value: tradeValueInUSD,
      priceImpact: utils.formatUnits(priceImpact.mul(100), market.decimals),
      price: formatPrice(after, market),
      after,
      amountOut: quote.amountOut,
      tokenOut: market.underlying,
      gasEstimate: quote.gasEstimate,
    };
  } catch (e) {
    console.log('e: ', market.symbol, e);
    throw e;
  }
}

export const getPumpAndDump = async (currPrice, market, fee, ethPrice, tradeValueInUSD) => {
  const [pump, dump] = await Promise.all([
    getPump(currPrice, market, fee, ethPrice, tradeValueInUSD),
    getDump(currPrice, market, fee, ethPrice, tradeValueInUSD),
  ]);
  return { pump, dump };
}

export const searchTrade = (currPrice, market, fee, ethPrice, target, targetType, direction) => {
  let currPriceFormatted = formatPrice(currPrice, market);
  if (
    targetType === 'price' &&
    (direction === 'pump' && target.lte(currPriceFormatted) || direction === 'dump' && target.gte(currPriceFormatted))
  ) return [];

  let isCancelled = false
  const cancel = () => {
    isCancelled = true
  }

  const exec = async () => {
    let high = 1_000_000_000;
    let low = 0;
    let tolerance = 0.01;
    let ranges = 20;

    let allTrades = [] 
    let best;
   
    const getTrade = direction === 'pump' ? getPump : getDump;

    let i = 0;
    while (high - low > high * tolerance) {
      if (isCancelled) throw new Error('cancelled');

      console.log(direction, 'searching...');

      let ticks = Array(ranges - 1).fill(null).map((_, i) => low + (high - low) / ranges * (i + 1));
      console.log(direction, 'ticks: ', ticks);

      const samples = await Promise.all(ticks.map(async (tick, index) => {
        const trade = await getTrade(currPrice, market, fee, ethPrice, tick);
        allTrades.push(trade);
        return {
          priceImpact: Math.abs(trade.priceImpact),
          price: trade.price,
          value: tick,
          index,
        };
      }));

      best = samples.reduce((accu, s, i) => {
        const sampleVal = new Decimal(s[targetType]);
        const accuVal = new Decimal(accu[targetType])

        if (sampleVal.log(10).sub(target.log(10)).abs().lessThan(accuVal.log(10).sub(target.log(10)).abs())) {
          console.log(direction, 'found:', s)
          return s;
        }
        return accu;
      });
      console.log(direction, 'best: ', best);

      // best result is to the far right, increase range
      if (i === 0 && best.index === ranges - 2) {
        high *= 1_000_000; // 1000 trillions
        low = ticks[ranges - 3];
      } else if (i === 1 && best.index === ranges - 2 && high > 1_000_000_000) { 
        // range was increased already, it's ridiculous to continue
        throw new Error('Max trade value exceeded (1000T USD)');
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
      console.log(direction, 'low high: ', low, high);
      i++;
    }

    allTrades = sortBy(allTrades, 'value');
   
    // take the best trade above target if available
    best = allTrades.find(
      t => targetType === 'priceImpact' || direction === 'pump'
        ? target.lte(Decimal.abs(t[targetType]))
        : target.gte(Decimal.abs(t[targetType]))
    ) || best;

    console.log(direction, 'RESULT', best);
    return {
      best,
      // include trades below and a few over
      trades: allTrades.filter(t => t.value < Math.max(10_000_000, best.value * 1.2))
    };
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

  return { promise: Promise.all([execPump, execDump]), cancel };
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
 utils.formatEther(BigNumber.from(price).div(BigNumber.from(10).pow(18 - token.decimals)));

 export function computeUniV3PoolAddress(tokenA, tokenB, fee) {
  const [token0, token1] = BigNumber.from(tokenA).lt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
  return utils.getCreate2Address(
    UNISWAP_FACTORY_ADDRESS,
    utils.solidityKeccak256(
      ['bytes'],
      [utils.defaultAbiCoder.encode(['address', 'address', 'uint24'], [token0, token1, fee])]
    ),
    POOL_INIT_CODE_HASH
  )
}