/* eslint-disable */

import { Contract, providers, BigNumber, utils, constants } from "ethers";
import { sortBy } from "lodash";
import { Decimal } from "decimal.js";
// import { TickMath } from "@uniswap/v3-sdk";
import { getSqrtRatioAtTick } from "./tickMath";
import axios from "axios";

import eulerViewArtifacts from "../artifacts/EulerGeneralView.json";
// import lp from "../lp.json";

const c1e18 = BigNumber.from(10).pow(18);
const UNISWAP_QUOTERV2_ADDRESS = '0x0209c4Dc18B2A1439fD2427E34E7cF3c6B91cFB9';
const UNISWAP_FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const POOL_INIT_CODE_HASH = '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54';
const EULER_VIEW_ADDRESS = '0x9D2B3052f5A3c156A34FC32cD08E9F5501720ea4';
const EULER_CONTRACT_ADDRESS = '0x27182842E098f60e3D576794A5bFFb0777E025d3';

const provider = new providers.JsonRpcProvider(process.env.REACT_APP_ETHEREUM_NETWORK_HTTP);
const quoterAbi = [
  'function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) public returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const poolAbi = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];
const factoryAbi = [
  'function getPool(address token0, address token1, uint24 fee) public view returns (address)',
];
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
const eulerViewContract = new Contract(
  EULER_VIEW_ADDRESS,
  eulerViewArtifacts.abi,
  provider,
);
Decimal.set({precision: 50})
    
export const TICK_SPACINGS = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
}

export const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
export const MAX_TICK_PRICE = Decimal.pow(1.0001, 887272);
export const MIN_TICK_PRICE = Decimal.pow(1.0001, -887272);

export const sqrtPriceX96ToPrice = (a, invert) => {
  const scale = BigNumber.from(2).pow(96*2).div(c1e18);
  a = BigNumber.from(a);
  a = a.mul(a).div(scale);

  if (invert && !a.eq(0)) a = c1e18.mul(c1e18).div(a);
  return a;
};

// a is decimal
export const priceToSqrtX96Price = a => {
  a = new Decimal(a);
  return a.mul(Decimal.pow(2, 2*96)).sqrt().floor();
};

export const isInverted = address => BigNumber.from(address).gt(WETH_ADDRESS);


export const getSlot0 = async (token, fee) => {
  if (token.address.toLowerCase() === WETH_ADDRESS) return BigNumber.from(1);
  try {
    const inverted = isInverted(token.address);
    const pool = new Contract(
      computeUniV3PoolAddress(token.address, WETH_ADDRESS, fee),
      poolAbi,
      provider,
    );

    const res = await pool.slot0();
    return {
      ...res,
      price: sqrtPriceX96ToPrice(res.sqrtPriceX96, inverted),
    }
  } catch (e) {
    console.log('current price Error: ', token.symbol, e);
  }
};

export const getPoolFees = async (address) => {
  const [token0, token1] = BigNumber.from(address).gt(WETH_ADDRESS)
    ? [WETH_ADDRESS, address]
    : [address, WETH_ADDRESS];

  const pools = await Promise.all([100, 500, 3000, 10000].map(async fee => {
    const pool = await factoryContract.getPool(token0, token1, fee);
    if (pool !== constants.AddressZero) return fee;
  }));

  return pools.filter(Boolean);
};

export const getDump = async (currPrice, token, fee, ethPrice, tradeValueInUSD) => {
  if (
    token.address.toLowerCase() === WETH_ADDRESS ||
    currPrice.eq(0)
  ) return { value: tradeValueInUSD, price: '0', priceImpact: '0' };

  try {
    let inverted = isInverted(token.address);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice)).mul(c1e18).div(currPrice);
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: token.address,
      tokenOut: WETH_ADDRESS,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0
    });
    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);
    const priceImpact = utils.formatEther(after.sub(currPrice).mul(c1e18).div(currPrice).mul(100));

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
    console.log('e dump: ', token.symbol, e);
    throw e;
  }
};

export const getPump = async (currPrice, token, fee, ethPrice, tradeValueInUSD) => {
  if (
    token.address.toLowerCase() === WETH_ADDRESS ||
    currPrice.eq(0)
  ) return { value: tradeValueInUSD, price: '0', priceImpact: '0' };

  try {
    let inverted = isInverted(token.address);
    let quote;

    let amountIn = utils.parseEther(String(tradeValueInUSD / ethPrice));
    quote = await quoterContract.callStatic.quoteExactInputSingle({
      tokenIn: WETH_ADDRESS,
      tokenOut: token.address,
      fee,
      amountIn,
      sqrtPriceLimitX96: 0,
    });

    let after = sqrtPriceX96ToPrice(quote.sqrtPriceX96After, inverted);

    const priceImpact = utils.formatEther(after.sub(currPrice).mul(c1e18).div(currPrice).mul(100));

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
    console.log('e pump: ', token.symbol, e);
    throw e;
  }
};

export const getPumpAndDump = async (currPrice, token, fee, ethPrice, tradeValueInUSD) => {
  const [pump, dump] = await Promise.all([
    getPump(currPrice, token, fee, ethPrice, tradeValueInUSD),
    getDump(currPrice, token, fee, ethPrice, tradeValueInUSD),
  ]);
  return { pump, dump };
};

// TODO only price target
export const searchTrade = (currPrice, currSqrtPriceX96, token, fee, ethPrice, target, targetType, direction) => {
  let currPriceFormatted = formatPrice(currPrice, token);

  if (
    (targetType === 'price' &&
    (direction === 'pump' && target.lte(currPriceFormatted) || direction === 'dump' && target.gte(currPriceFormatted)))
    ||
    (targetType === 'sqrtPriceX96After' &&
    (direction === 'pump' && target.lte(currSqrtPriceX96) || direction === 'dump' && target.gte(currSqrtPriceX96)))
  ) {
    return [];
  };

  let isCancelled = false;
  const cancel = () => {
    isCancelled = true;
  };

  const exec = async () => {
    let high = 1_000_000_000;
    let low = 0;
    let tolerance = 0.01;
    let ranges = 20;

    let allTrades = [] 
    let best;
   
    // TODO improve this hack
    const inverted = isInverted(token.address);
    const adjustedDirection = inverted ? {'pump': 'dump', 'dump': 'pump'}[direction] : direction;
    const getTrade = adjustedDirection === 'pump' ? getPump : getDump;


    let i = 0;
    while (high - low > high * tolerance) {
      if (isCancelled) throw new Error('cancelled');

      let ticks = Array(ranges - 1).fill(null).map((_, i) => low + (high - low) / ranges * (i + 1));
      console.log(direction, 'ticks: ', ticks);

      const samples = await Promise.all(ticks.map(async (tick, index) => {
        const trade = await getTrade(currPrice, token, fee, ethPrice, tick);
        allTrades.push(trade);
        return {
          ...trade,
          priceImpact: Math.abs(trade.priceImpact),
          value: tick,
          index,
        };
      }));

      best = samples.reduce((accu, s, i) => {
        const sampleVal = new Decimal(s[targetType]);
        const accuVal = new Decimal(accu[targetType])

        if (sampleVal.log(10).sub(target.log(10)).abs().lessThan(accuVal.log(10).sub(target.log(10)).abs())) {
          // console.log(direction, 'found:', s)
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
};

export const binarySearchTradeValues = (currPrice, currSqrtPriceX96, token, fee, ethPrice, target, targetType) => {
  let [execPump, cancelPump] = searchTrade(currPrice, currSqrtPriceX96, token, fee, ethPrice, target, targetType, 'pump');
  let [execDump, cancelDump] = searchTrade(currPrice, currSqrtPriceX96, token, fee, ethPrice, target, targetType, 'dump');
  const cancel = () => {
    if (cancelPump) cancelPump();
    if (cancelDump) cancelDump();
  };

  // todo improve!
  if (isInverted(token.address)) [execPump, execDump] = [execDump, execPump];
  return { promise: Promise.all([execPump, execDump]), cancel };
};

export const getMarketConfig = async (underlyingAddress) => {
  const res = await eulerViewContract.callStatic.doQuery({
    eulerContract: EULER_CONTRACT_ADDRESS,
    account: constants.AddressZero,
    markets: [underlyingAddress],
  });

  if (res.markets[0].config.eTokenAddress === constants.AddressZero)
    return null;

  const factorScale = 4e9;
  return {
    borrowFactor: res.markets[0].config.borrowFactor / factorScale,
    collateralFactor: res.markets[0].config.collateralFactor / factorScale,
    twapWindowSeconds: res.markets[0].config.twapWindow,
  }
};

export const getTwapTargetRatio = (targetEthTwap, token, currPrice, window, attackBlocks) => {
  const inverted = isInverted(token.address); 
  let target = targetEthTwap;

  if (inverted) {
    target = Decimal.div(1, target);
    currPrice = Decimal.div(1, currPrice);
  }

  target = target.pow(window).div(currPrice.pow(window - attackBlocks)).pow(Decimal.div(1, attackBlocks));

  return priceToSqrtX96Price(target).add(2);
};

export const getTwapAfterAttack = (manipulatedSpotPrice, currPrice, window, attackBlocks) =>
  manipulatedSpotPrice.pow(attackBlocks).mul(Decimal.pow(currPrice, window - attackBlocks)).pow(Decimal.div(1, window));

  
export const getAmount0ForLiquidity = (sqrtRatioAX96, sqrtRatioBX96, liquidity) => {
  sqrtRatioAX96 = BigNumber.from(sqrtRatioAX96);
  sqrtRatioBX96 = BigNumber.from(sqrtRatioBX96);
  if (sqrtRatioAX96.gt(sqrtRatioBX96)) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];

  return BigNumber.from(liquidity)
                  .mul(BigNumber.from(2).pow(96))
                  .mul(sqrtRatioBX96.sub(sqrtRatioAX96))
                  .div(sqrtRatioBX96)
                  .div(sqrtRatioAX96);
};

export const getAmount1ForLiquidity = (sqrtRatioAX96, sqrtRatioBX96, liquidity) => {
  sqrtRatioAX96 = BigNumber.from(sqrtRatioAX96);
  sqrtRatioBX96 = BigNumber.from(sqrtRatioBX96);
  if (sqrtRatioAX96.gt(sqrtRatioBX96)) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];

  return BigNumber.from(liquidity)
                  .mul(sqrtRatioBX96.sub(sqrtRatioAX96))
                  .div('0x1000000000000000000000000')
};

export const getLiquidityForAmount0 = (sqrtRatioAX96, sqrtRatioBX96, amount0) => {
  sqrtRatioAX96 = BigNumber.from(sqrtRatioAX96);
  sqrtRatioBX96 = BigNumber.from(sqrtRatioBX96);
  if (sqrtRatioAX96.gt(sqrtRatioBX96)) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  const intermediate = sqrtRatioAX96.mul(sqrtRatioABX96).div('0x1000000000000000000000000')
  return BigNumber.from(amount0)
                  .mul(intermediate)
                  .div(sqrtRatioBX96.sub(sqrtRatioAX96));

};

export const getLiquidityForAmount1 = (sqrtRatioAX96, sqrtRatioBX96, amount1) => {
  sqrtRatioAX96 = BigNumber.from(sqrtRatioAX96);
  sqrtRatioBX96 = BigNumber.from(sqrtRatioBX96);
  if (sqrtRatioAX96.gt(sqrtRatioBX96)) [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  return BigNumber.from(amount1)
                  .mul('0x1000000000000000000000000')
                  .div(sqrtRatioBX96.sub(sqrtRatioAX96));
};


export const getLiquidityProfile = async (token, fee) => {
  const lpUrl = process.env.REACT_APP_LIQUIDITY_PROFILE_HTTP;
  if (!lpUrl) return;
  const pool = computeUniV3PoolAddress(token.address, WETH_ADDRESS, fee);
  console.log('`${lpUrl}?contract_address=${pool}`: ', `${lpUrl}?contract_address=${pool.toLowerCase()}`);
  // let  p = await axios.get(`${lpUrl}?contract_address=${pool.toLowerCase()}`);
  // p = p.data.split('\n').slice(1, p.length - 1);
  // p = p.map(tick => {
  //   const [ iterator, amount, initialised ] = tick.split(',');
  //   return { iterator, amount, initialised };
  // });
  return lp;
};

export const parseLiquidityRange = (liquidityProfile, currTick, token, ethPrice, price, rangeLeft, rangeRight) => {
  price = formatPrice(price, token);
  const tickIndex = liquidityProfile.findIndex(l => l.iterator > currTick) - 1;
  const range = rangeLeft || rangeRight ? liquidityProfile.slice(tickIndex - rangeLeft, tickIndex + rangeRight) : liquidityProfile;
  return range.map((l, i, arr) => {
    const tokenAmount = i === arr.length - 1 ? '0' :
      l.iterator < currTick
        ? utils.formatEther(getAmount1ForLiquidity(
            getSqrtRatioAtTick(l.iterator),
            getSqrtRatioAtTick(arr[i + 1].iterator),
            new Decimal(l.amount).toFixed(),
          ))
        : utils.formatUnits(getAmount0ForLiquidity(
            getSqrtRatioAtTick(l.iterator),
            getSqrtRatioAtTick(arr[i + 1].iterator),
            new Decimal(l.amount).toFixed(),
          ), token.decimals);
        
    return ({
    tick: l.iterator,
    liquidity: l.amount,
    tokenAmount,
    usdValue: l.iterator < currTick ? tokenAmount * ethPrice : tokenAmount * ethPrice * price,
    symbol: l.iterator < currTick ? 'WETH' : token.symbol,
  })});
};

export const getLiquidityStats = (liquidityProfile, currTick, token, fee, price, ethPrice) => {
  const liquidityLevelsUsd = [
    0,
    10,
    100,
    1000,
    100000,
  ];

  let tickLiquidityStats = Object.fromEntries(
    liquidityLevelsUsd.map(l => [
      l,
      {
        count: 0,
      }
    ]),
  );
  const fullRange = parseLiquidityRange(liquidityProfile, currTick, token, ethPrice, price);
  fullRange.forEach((tick, i) => {
    Object.entries(tickLiquidityStats).forEach(([level, stats]) => {
      if (level === 0) {
        if (utils.parseEther(tick.tokenAmount).gt(0)) {
          stats.count += 1;
        }
      } else {
        if (tick.usdValue > level) {
          stats.count += 1;
        }
      }
    })
  });

  Object.entries(tickLiquidityStats).forEach(([level, stats]) => {
    tickLiquidityStats[level].percentage = stats.count / Math.floor((887272 * 2 + 1) / TICK_SPACINGS[fee]) * 100;
  });

  return tickLiquidityStats;
};


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
        break;
      }
    }

    return (num / si[i].value).toFixed(2).replace(rx, "$1") + si[i].symbol;
  }
};

export const formatPrice = (price, token) => {
  return utils.formatEther(BigNumber.from(price).div(BigNumber.from(10).pow(18 - token.decimals)));
};

export const computeUniV3PoolAddress = (tokenA, tokenB, fee) => {
  const [token0, token1] = BigNumber.from(tokenA).lt(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]

  return utils.getCreate2Address(
    UNISWAP_FACTORY_ADDRESS,
    utils.solidityKeccak256(
      ['bytes'],
      [utils.defaultAbiCoder.encode(['address', 'address', 'uint24'], [token0, token1, fee])],
    ),
    POOL_INIT_CODE_HASH,
  );
};