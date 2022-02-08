import { BigNumber } from "ethers";
import { Decimal } from "decimal.js";

export const UNISWAP_QUOTERV2_ADDRESS =
  "0x0209c4Dc18B2A1439fD2427E34E7cF3c6B91cFB9";
export const UNISWAP_FACTORY_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const POOL_INIT_CODE_HASH =
  "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
export const EULER_VIEW_ADDRESS = "0x9D2B3052f5A3c156A34FC32cD08E9F5501720ea4";
export const EULER_CONTRACT_ADDRESS =
  "0x27182842E098f60e3D576794A5bFFb0777E025d3";
export const USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
export const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const MAX_TICK_PRICE = Decimal.pow(1.0001, 887272);
export const MIN_TICK_PRICE = Decimal.pow(1.0001, -887272);
export const c1e18 = BigNumber.from(10).pow(18);
export const QUOTER_ABI = [
  "function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) public returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];
export const UNISWAP_V3_POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];
export const UNISWAP_V3_FACTORY_ABI = [
  "function getPool(address token0, address token1, uint24 fee) public view returns (address)",
];
export const TICK_SPACINGS = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};
