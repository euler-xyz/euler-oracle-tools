import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { DefaultTooltipContent } from "recharts/lib/component/DefaultTooltipContent";
import { utils } from "ethers";

import { WETH_ADDRESS } from "../../utils/constants";
import { numberFormatText, getCostOfAttack } from "../../utils";

export const PriceImpactChart = ({
  width,
  height,
  stroke,
  data,
  targetPriceImpact,
  targetPrice,
  targetTwap,
  token,
  ethPrice,
  currPrice,
}) => {
  const CustomTooltip = (props) => {
    if (props.payload[0] != null) {
      const payload = props.payload[0].payload;
      const amountIn = utils.formatUnits(
        payload.amountIn,
        payload.tokenOut === WETH_ADDRESS ? token.decimals : 18
      );
      const amountOut = utils.formatUnits(
        payload.amountOut,
        payload.tokenOut === WETH_ADDRESS ? 18 : token.decimals
      );
      const newPayload = [
        ...props.payload,
        {
          name: "price ETH",
          value: payload.price,
        },
        {
          name: "price USD",
          value: payload.price * ethPrice,
        },
        {
          name: "amount in",
          value: `${amountIn} ${
            payload.tokenOut === WETH_ADDRESS ? token.symbol : "WETH"
          }`,
        },
        {
          name: "amount out",
          value: `${amountOut} ${
            payload.tokenOut === WETH_ADDRESS ? "WETH" : token.symbol
          }`,
        },
        {
          name: "cost",
          value:
            getCostOfAttack(
              payload,
              currPrice,
              ethPrice,
              token
            ).toLocaleString() + " USD",
        },
      ];

      return <DefaultTooltipContent {...props} payload={newPayload} />;
    }

    // we just render the default
    return <DefaultTooltipContent {...props} />;
  };

  return (
    <LineChart
      width={width}
      height={height}
      data={data}
      margin={{
        top: 5,
        right: 30,
        left: 40,
        bottom: 5,
      }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="value"
        domain={["dataMin", "dataMax"]}
        type="number"
        tickFormatter={(tick) => {
          return numberFormatText(tick);
        }}
      />
      <YAxis type="number" />
      <Tooltip
        content={CustomTooltip}
        labelFormatter={(v) => v.toLocaleString() + " USD"}
        formatter={(value, name) => [
          name === "price impact" ? `${value}%` : value,
          name,
        ]}
      />
      <Legend />
      {targetPriceImpact && (
        <ReferenceLine
          x={targetPriceImpact.value}
          stroke="red"
          label="Target Impact"
        />
      )}
      {targetPrice && (
        <ReferenceLine
          x={targetPrice.value}
          stroke="violet"
          label="Target Spot"
        />
      )}
      {targetTwap && (
        <ReferenceLine
          x={targetTwap.value}
          stroke="green"
          label="Target TWAP"
        />
      )}
      <Line
        name="price impact"
        type="monotone"
        dataKey="priceImpact"
        stroke={stroke}
        activeDot={{ r: 8 }}
      />
    </LineChart>
  );
};
