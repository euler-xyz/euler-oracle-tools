import React from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { numberFormatText, getCostOfAttack } from "../../utils";

export const LiquidityReport = ({
  loading,
  progress,
  data,
  collateralFactor,
  borrowFactor,
  usdcMarketConfig,
  currPrice,
  ethPrice,
  token,
  window,
}) => {
  return (
    <>
      {loading && (
        <Box
          sx={{ width: "100%", height: "100%" }}
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <CircularProgress variant="determinate" value={progress} />
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: "absolute",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
            >
              {`${Math.round(progress)}%`}
            </Typography>
          </Box>
        </Box>
      )}
      {!loading && (
        <Box display="flex" sx={{ height: "100%" }}>
          <Box display="flex" flexDirection="column">
            <Grid container sx={{ maxWidth: 500 }} mb={2}>
              <Grid item xs={8}>
                TWAP Window:
              </Grid>
              <Grid item xs={4}>
                {window}
              </Grid>
              <Grid item xs={8}>
                Collateral Factor:
              </Grid>
              <Grid item xs={4}>
                {collateralFactor}
              </Grid>
              <Grid item xs={8}>
                Borrow Factor:
              </Grid>
              <Grid item xs={4}>
                {borrowFactor}
              </Grid>
              <Grid item xs={8}>
                TWAP Pump Impact Target:
              </Grid>
              <Grid item xs={4}>
                {numberFormatText(
                  (1 / (collateralFactor * usdcMarketConfig.borrowFactor) - 1) *
                    100
                )}
                %
              </Grid>
              <Grid item xs={8}>
                TWAP Dump Impact Target:
              </Grid>
              <Grid item xs={4}>
                {numberFormatText(
                  (1 / (collateralFactor * usdcMarketConfig.borrowFactor) - 1) *
                    100
                )}
                %
              </Grid>
            </Grid>
            <TableContainer component={Paper}>
              <Table sx={{ width: 800 }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>BLOCKS</TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8657)} VALUE USD
                    </TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8657)} COST USD
                    </TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8657)} TOTAL COST USD
                    </TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8659)} VALUE USD
                    </TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8659)} COST USD
                    </TableCell>
                    <TableCell align="right">
                      {String.fromCharCode(8659)} TOTAL COST USD
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((row, i) => (
                    <TableRow
                      key={`report-row-${i}`}
                      sx={{
                        "&:last-child td, &:last-child th": { border: 0 },
                      }}
                    >
                      <TableCell component="th" scope="row" key={Math.random()}>
                        {i + 1}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.pump.best
                          ? numberFormatText(row.pump.best.value)
                          : row.pump}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.pump.best
                          ? numberFormatText(
                              getCostOfAttack(
                                row.pump.best,
                                currPrice,
                                ethPrice,
                                token
                              )
                            )
                          : row.pump}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.pump.best
                          ? numberFormatText(
                              getCostOfAttack(
                                row.pump.best,
                                currPrice,
                                ethPrice,
                                token
                              ) *
                                (i + 1)
                            )
                          : row.pump}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.dump.best
                          ? numberFormatText(row.dump.best.value)
                          : row.dump}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.dump.best
                          ? numberFormatText(
                              getCostOfAttack(
                                row.dump.best,
                                currPrice,
                                ethPrice,
                                token
                              )
                            )
                          : row.dump}
                      </TableCell>
                      <TableCell align="right" key={Math.random()}>
                        {row.dump.best
                          ? numberFormatText(
                              getCostOfAttack(
                                row.dump.best,
                                currPrice,
                                ethPrice,
                                token
                              ) *
                                (i + 1)
                            )
                          : row.dump}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
          <Box display="flex" flexDirection="column">
            <BarChart
              width={700}
              height={350}
              data={data.map((row, i) => ({
                blocks: i + 1,
                "total pump value": row.pump.best
                  ? row.pump.best.value * (i + 1)
                  : 0,
                "total pump cost": row.pump.best
                  ? getCostOfAttack(row.pump.best, currPrice, ethPrice, token) *
                    (i + 1)
                  : 0,
              }))}
              margin={{
                top: 5,
                right: 30,
                left: 40,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                tick={false}
                dataKey="blocks"
                type="number"
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <YAxis
                scale="log"
                type="number"
                domain={["dataMin", (dataMax) => dataMax * 2]}
                tickFormatter={(tick) => {
                  return numberFormatText(tick);
                }}
              />
              <Tooltip
                labelFormatter={(v) => v + " Blocks"}
                formatter={(value, name) => [numberFormatText(value), name]}
              />
              <Legend />
              <Bar dataKey="total pump value" fill="#8884d8" />
              <Bar dataKey="total pump cost" fill="#82ca9d" />
            </BarChart>
            <BarChart
              width={700}
              height={350}
              data={data
                .filter((row) => row.dump.best)
                .map((row, i) => ({
                  blocks: row.blocks,
                  "total dump value": row.dump.best
                    ? row.dump.best.value * (i + 1)
                    : 0,
                  "total dump cost": row.dump.best
                    ? getCostOfAttack(
                        row.dump.best,
                        currPrice,
                        ethPrice,
                        token
                      ) *
                      (i + 1)
                    : 0,
                }))}
              margin={{
                top: 5,
                right: 30,
                left: 40,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                tick={false}
                dataKey="blocks"
                type="number"
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <YAxis
                scale="log"
                type="number"
                domain={["dataMin", (dataMax) => dataMax * 2]}
                tickFormatter={(tick) => {
                  return numberFormatText(tick);
                }}
              />
              <Tooltip
                labelFormatter={(v) => v + " Blocks"}
                formatter={(value, name) => [numberFormatText(value), name]}
              />
              <Legend />
              <Bar dataKey="total dump value" fill="#8884d8" />
              <Bar dataKey="total dump cost" fill="#82ca9d" />
            </BarChart>
            {/* <LiquidityChart
          tick={currTick}
          data={liquidityChartData}
          tickSpacing={TICK_SPACINGS[fee]}
          width={700}
          height= {260}
        /> */}
          </Box>
        </Box>
      )}
    </>
  );
};
