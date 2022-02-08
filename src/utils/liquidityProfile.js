import { utils } from "ethers";
import { Decimal } from "decimals.js";

import { WETH_ADDRESS, TICK_SPACINGS } from "./constants";
import { computeUniV3PoolAddress, formatPrice } from ".";
import {
  getSqrtRatioAtTick,
  getAmount0ForLiquidity,
  getAmount1ForLiquidity,
} from "./tickMath";

export const getLiquidityProfile = async (token, fee) => {
  const lpUrl = process.env.REACT_APP_LIQUIDITY_PROFILE_HTTP;
  if (!lpUrl) return;
  const pool = computeUniV3PoolAddress(token.address, WETH_ADDRESS, fee);
  // console.log('`${lpUrl}?contract_address=${pool}`: ', `${lpUrl}?contract_address=${pool.toLowerCase()}`);
  // let  p = await axios.get(`${lpUrl}?contract_address=${pool.toLowerCase()}`);
  // p = p.data.split('\n').slice(1, p.length - 1);
  // p = p.map(tick => {
  //   const [ iterator, amount, initialised ] = tick.split(',');
  //   return { iterator, amount, initialised };
  // });
  // return lp;
};

export const processLiquidityRange = (
  liquidityProfile,
  currTick,
  token,
  ethPrice,
  price,
  rangeLeft,
  rangeRight
) => {
  price = formatPrice(price, token);
  const tickIndex =
    liquidityProfile.findIndex((l) => l.iterator > currTick) - 1;
  const range =
    rangeLeft || rangeRight
      ? liquidityProfile.slice(tickIndex - rangeLeft, tickIndex + rangeRight)
      : liquidityProfile;
  return range.map((l, i, arr) => {
    const tokenAmount =
      i === arr.length - 1
        ? "0"
        : l.iterator < currTick
        ? utils.formatEther(
            getAmount1ForLiquidity(
              getSqrtRatioAtTick(l.iterator),
              getSqrtRatioAtTick(arr[i + 1].iterator),
              new Decimal(l.amount).toFixed()
            )
          )
        : utils.formatUnits(
            getAmount0ForLiquidity(
              getSqrtRatioAtTick(l.iterator),
              getSqrtRatioAtTick(arr[i + 1].iterator),
              new Decimal(l.amount).toFixed()
            ),
            token.decimals
          );

    return {
      tick: l.iterator,
      liquidity: l.amount,
      tokenAmount,
      usdValue:
        l.iterator < currTick
          ? tokenAmount * ethPrice
          : tokenAmount * ethPrice * price,
      symbol: l.iterator < currTick ? "WETH" : token.symbol,
    };
  });
};

export const getLiquidityStats = (
  liquidityProfile,
  currTick,
  token,
  fee,
  price,
  ethPrice
) => {
  const liquidityLevelsUsd = [0, 10, 100, 1000, 100000];

  let tickLiquidityStats = Object.fromEntries(
    liquidityLevelsUsd.map((l) => [
      l,
      {
        count: 0,
      },
    ])
  );
  const fullRange = processLiquidityRange(
    liquidityProfile,
    currTick,
    token,
    ethPrice,
    price
  );
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
    });
  });

  Object.entries(tickLiquidityStats).forEach(([level, stats]) => {
    tickLiquidityStats[level].percentage =
      (stats.count / Math.floor((887272 * 2 + 1) / TICK_SPACINGS[fee])) * 100;
  });

  return tickLiquidityStats;
};
