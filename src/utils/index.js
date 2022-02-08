import { Contract, providers, BigNumber, utils, constants } from "ethers";
import { Decimal } from "decimal.js";
import {
  UNISWAP_FACTORY_ADDRESS,
  POOL_INIT_CODE_HASH,
  WETH_ADDRESS,
  c1e18,
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V3_FACTORY_ABI,
  EULER_VIEW_ADDRESS,
  EULER_CONTRACT_ADDRESS,
  MIN_TICK_PRICE,
  MAX_TICK_PRICE,
} from "./constants";

import eulerViewArtifacts from "../artifacts/EulerGeneralView.json";

export const provider = new providers.JsonRpcProvider(
  process.env.REACT_APP_ETHEREUM_NETWORK_HTTP
);

const factoryContract = new Contract(
  UNISWAP_FACTORY_ADDRESS,
  UNISWAP_V3_FACTORY_ABI,
  provider
);
const eulerViewContract = new Contract(
  EULER_VIEW_ADDRESS,
  eulerViewArtifacts.abi,
  provider
);

Decimal.set({ precision: 50 });

export const sqrtPriceX96ToPrice = (a, invert) => {
  const scale = BigNumber.from(2)
    .pow(96 * 2)
    .div(c1e18);
  a = BigNumber.from(a);
  a = a.mul(a).div(scale);

  if (invert && a.eq(0)) return BigNumber.from(MAX_TICK_PRICE.toFixed(0)).mul(c1e18);

  if (invert) a = c1e18.mul(c1e18).div(a);
  return a;
};

// a is decimal
export const priceToSqrtX96Price = (a) => {
  a = new Decimal(a);
  return a
    .mul(Decimal.pow(2, 2 * 96))
    .sqrt()
    .floor();
};

export const isInverted = (address) => BigNumber.from(address).gt(WETH_ADDRESS);

export const getSlot0 = async (token, fee) => {
  if (token.address.toLowerCase() === WETH_ADDRESS) return BigNumber.from(1);
  try {
    const inverted = isInverted(token.address);
    const pool = new Contract(
      computeUniV3PoolAddress(token.address, WETH_ADDRESS, fee),
      UNISWAP_V3_POOL_ABI,
      provider
    );

    const res = await pool.slot0();
    return {
      ...res,
      price: sqrtPriceX96ToPrice(res.sqrtPriceX96, inverted),
    };
  } catch (e) {
    console.log("current price Error: ", token.symbol, e);
  }
};

export const getPoolFees = async (address) => {
  const [token0, token1] = BigNumber.from(address).gt(WETH_ADDRESS)
    ? [WETH_ADDRESS, address]
    : [address, WETH_ADDRESS];

  const pools = await Promise.all(
    [100, 500, 3000, 10000].map(async (fee) => {
      const pool = await factoryContract.getPool(token0, token1, fee);
      if (pool !== constants.AddressZero) return fee;
    })
  );

  return pools.filter(Boolean);
};

export const getTwapTargetRatio = (
  targetEthTwap,
  token,
  currPrice,
  window,
  attackBlocks
) => {
  const inverted = isInverted(token.address);
  let target = targetEthTwap;

  if (inverted) {
    target = Decimal.div(1, target);
    currPrice = Decimal.div(1, currPrice);
  }

  target = target
    .pow(window)
    .div(currPrice.pow(window - attackBlocks))
    .pow(Decimal.div(1, attackBlocks));

  return priceToSqrtX96Price(target).add(2);
};

export const getTwapAfterAttack = (
  manipulatedSpotPrice,
  currPrice,
  window,
  attackBlocks
) =>
  manipulatedSpotPrice
    .pow(attackBlocks)
    .mul(Decimal.pow(currPrice, window - attackBlocks))
    .pow(Decimal.div(1, window));

export const numberFormatText = (num, noAbbrev = false) => {
  if (Number(num) === 0) {
    return 0;
  } else if (Number.parseFloat(num) < 1) {
    return Number.parseFloat(num).toFixed(6);
  } else if (Number.parseFloat(num) < 1) {
    return Number.parseFloat(num).toPrecision(6);
  } else if (num < 1000 || noAbbrev) {
    return Number.parseFloat(num).toFixed(2);
  } else {
    const si = [
      { value: 1, symbol: "" },
      { value: 1e3, symbol: "k" },
      { value: 1e6, symbol: "M" },
      { value: 1e9, symbol: "B" },
    ];
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;

    let i;
    for (i = si.length - 1; i > 0; i--) {
      if (num >= si[i].value) {
        break;
      }
    }

    return (num / si[i].value).toFixed(2).replace(rx, "$1") + si[i].symbol;
  }
};

export const formatPrice = (price, token) => {
  return utils.formatEther(
    BigNumber.from(price).div(BigNumber.from(10).pow(18 - token.decimals))
  );
};

export const computeUniV3PoolAddress = (tokenA, tokenB, fee) => {
  const [token0, token1] = BigNumber.from(tokenA).lt(tokenB)
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  return utils.getCreate2Address(
    UNISWAP_FACTORY_ADDRESS,
    utils.solidityKeccak256(
      ["bytes"],
      [
        utils.defaultAbiCoder.encode(
          ["address", "address", "uint24"],
          [token0, token1, fee]
        ),
      ]
    ),
    POOL_INIT_CODE_HASH
  );
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
  };
};

export const getMinMaxTargetTwapSpot = (currPrice, attackBlocks, window, token) => {
  const p = utils.formatEther(currPrice);

  let maxTargetTwapSpot = getTwapAfterAttack(
    MAX_TICK_PRICE,
    p,
    window,
    attackBlocks
  );

  let minTargetTwapSpot = getTwapAfterAttack(
    MIN_TICK_PRICE,
    p,
    window,
    attackBlocks
  );
 
  let minTargetTwapSpotPercentage = Decimal.sub(minTargetTwapSpot, p)
    .div(p)
    .mul(100)
    .round()
    .toFixed(0);
  let maxTargetTwapSpotPercentage = Decimal.sub(maxTargetTwapSpot, p)
    .div(p)
    .mul(100)
    .round()
    .toFixed(0);

  maxTargetTwapSpot = maxTargetTwapSpot.div(
    Decimal.pow(10, 18 - token.decimals)
  );
  minTargetTwapSpot = minTargetTwapSpot.div(
    Decimal.pow(10, 18 - token.decimals)
  );

  return {
    maxTargetTwapSpot,
    minTargetTwapSpot,
    maxTargetTwapSpotPercentage,
    minTargetTwapSpotPercentage,
  }
};

export const getCostOfAttack = (trade, currPrice, ethPrice, token) => {
  return trade.tokenOut === WETH_ADDRESS
    ? trade.value - utils.formatEther(trade.amountOut) * ethPrice
    : trade.value -
        utils.formatUnits(trade.amountOut, token.decimals) *
          formatPrice(currPrice, token) *
          ethPrice;
};