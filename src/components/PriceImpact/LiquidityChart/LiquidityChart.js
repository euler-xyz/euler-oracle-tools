import React from 'react';
import { XAxis, YAxis, Tooltip, ReferenceLine, BarChart, Bar } from 'recharts';
import { DefaultTooltipContent } from 'recharts/lib/component/DefaultTooltipContent';
import { Decimal } from 'decimal.js';

import { numberFormatText } from '../../../utils';
const CustomTooltip = props => {
  if (props.payload[0] != null) {
    const payload = props.payload[0].payload;
    const newPayload = [
      // ...props.payload,
      {
        name: 'token amount',
        value: payload.tokenAmount + ' ' + payload.symbol,
      },
      {
        name: 'USD value',
        value: numberFormatText(payload.usdValue),
      },
    ];

    return <DefaultTooltipContent {...props} payload={newPayload} />;
  }

  // we just render the default
  return <DefaultTooltipContent {...props} />;
};

export const LiquidityChart = ({ data, tick, tickSpacing, width, height }) => (
  <BarChart
    width={width}
    height={height}
    data={data}
    margin={{
      top: 0,
      right: 30,
      left: 40,
      bottom: 5,
    }}
  >
    <XAxis tick={false} reversed={true} dataKey="tick"/>
    <YAxis
      tickFormatter={(tick) => {
        return numberFormatText(tick)
      }}
      // label={{ value: 'USD', angle: -90, position: 'insideLeft' }}
    />
    <Tooltip 
      wrapperStyle={{opacity: 0.6}}
      content={CustomTooltip}
      labelFormatter={v => 'Tick ' + v}
      formatter={(value, name) => [name === 'liquidity' ? new Decimal(value).toFixed() : value, name]}
    />
    <Bar dataKey="usdValue" fill="#8884d8" />
    <ReferenceLine x={Math.round(tick / tickSpacing) * tickSpacing} stroke="red" />
  </BarChart>
)