import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import DownloadIcon from "@mui/icons-material/Download";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CircularProgress from "@mui/material/CircularProgress";
import Autocomplete from "@mui/material/Autocomplete";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Divider from "@mui/material/Divider";

import { CSVLink } from "react-csv";

import { sortBy } from "lodash";
import { matchSorter } from "match-sorter";
import { Decimal } from "decimal.js";
import { utils } from "ethers";

import reportJson from '../../report.json'

import { PriceImpactChart } from "../PriceImpactChart";
import { LiquidityReport } from "../LiquidityReport";

import {
  getSlot0,
  numberFormatText,
  formatPrice,
  getPoolFees,
  computeUniV3PoolAddress,
  sqrtPriceX96ToPrice,
  isInverted,
  getMarketConfig,
  getTwapTargetRatio,
  getTwapAfterAttack,
  getMinMaxTargetTwapSpot,
  getCostOfAttack,
} from "../../utils";
import { getPumpAndDump, binarySearchTradeValues } from "../../utils/trades";
import {
  MAX_TICK_PRICE,
  MIN_TICK_PRICE,
  USDC_ADDRESS,
  WETH_ADDRESS,
} from "../../utils/constants";

// import {
//   getLiquidityProfile,
//   getLiquidityStats,
//   parseLiquidityRange,
// } from "../../utils/liquidityProfile";
// import { LiquidityChart } from './LiquidityChart/LiquidityChart';

export const Main = () => {
  const [tokenList, setTokenList] = useState([]);
  const [tokenName, setTokenName] = useState("USD Coin");

  const [fee, setFee] = useState(3000);
  const [ethPrice, setEthPrice] = useState(0);
  const [trades, setTrades] = useState();
  const [currPrice, setCurrPrice] = useState();
  const [currSqrtPriceX96, setCurrSqrtPriceX96] = useState();
  const [currTick, setCurrTick] = useState();
  const [cardinality, setCardinality] = useState();
  const [poolFees, setPoolFees] = useState([]);

  const [targetPriceImpact, setTargetPriceImpact] = useState(90);
  const [targetPriceImpactLoading, setTargetPriceImpactLoading] =
    useState(false);
  const [targetPriceImpactValue, setTargetPriceImpactValue] = useState();

  const [targetEthPrice, setTargetEthPrice] = useState("");
  const [targetUsdPrice, setTargetUsdPrice] = useState("");
  const [targetPriceLoading, setTargetPriceLoading] = useState(false);
  const [targetPriceValue, setTargetPriceValue] = useState();

  const [window, setWindow] = useState(144);
  const [attackBlocks, setAttackBlocks] = useState(1);
  const [targetEthTwap, setTargetEthTwap] = useState("");
  const [targetUsdTwap, setTargetUsdTwap] = useState("");
  const [targetTwapLoading, setTargetTwapLoading] = useState(false);
  const [targetTwapValue, setTargetTwapValue] = useState();
  const [targetTwapSpot, setTargetTwapSpot] = useState("");

  const [reportBorrowFactor, setReportBorrowFactor] = useState(0.91);
  const [reportCollateralFactor, setReportCollateralFactor] = useState(0.88);

  const [error, setError] = useState();
  const [errorOpen, setErrorOpen] = useState(false);

  const [usdcMarketConfig, setUsdcMarketConfig] = useState();
  const [marketConfig, setMarketConfig] = useState();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportData, setReportData] = useState();
  const [reportLoading, setReportLoading] = useState(true);
  const [reportProgress, setReportProgress] = useState(0);

  const [liquidityProfile, setLiquidityProfile] = useState();
  const [liquidityChartData, setLiquidityChartData] = useState();
  const [liquidityStats, setLiquidityStats] = useState();

  // todo fix canceling
  const cancelPriceImpactSearch = useRef(() => {});
  const cancelPriceSearch = useRef(() => {});
  const cancelTwapSearch = useRef(() => {});
  const csvLink = useRef();

  const token =
    tokenList.length > 0 && tokenList.find((t) => t.name === tokenName);

  const amountsUSD = [
    100_000, 200_000, 300_000, 400_000, 500_000, 600_000, 700_000, 800_000,
    900_000, 1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 6_000_000,
    7_000_000, 8_000_000, 9_000_000, 10_000_000,
  ];

  let minTargetTwapSpotPercentage = "-";
  let maxTargetTwapSpotPercentage = "-";
  let maxTargetTwapSpot;
  let minTargetTwapSpot;
  let twapTargetExceedsMax = false;

  if (currPrice && ethPrice && currTick && attackBlocks && window) {
    ({
      minTargetTwapSpot,
      maxTargetTwapSpot,
      minTargetTwapSpotPercentage,
      maxTargetTwapSpotPercentage,
    } = getMinMaxTargetTwapSpot(currPrice, attackBlocks, window, token));

    if (targetEthTwap) {
      const t = new Decimal(targetEthTwap);
      twapTargetExceedsMax = t.lt(minTargetTwapSpot) || t.gt(maxTargetTwapSpot);
    }
  }

  const getStandardTradesTable = () => {
    return amountsUSD.map((a) => {
      const pump = trades.pump.find((t) => t.value === a);
      const dump = trades.dump.find((t) => t.value === a);
      return { pump, dump };
    });
  };

  const getStandardTrades = () => {
    return getStandardTradesTable().reduce(
      (accu, t) => {
        accu.pump.push(t.pump);
        accu.dump.push(t.dump);
        return accu;
      },
      { pump: [], dump: [] }
    );
  };

  useEffect(() => {
    Promise.all([
      axios.get(
        "https://raw.githubusercontent.com/euler-xyz/euler-tokenlist/master/euler-tokenlist.json"
      ),
      axios.get(
        `https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD`
      ),
      getMarketConfig(USDC_ADDRESS),
    ]).then(([result1, result2, result3]) => {
      result1.data.tokens.push({
        "name": "Vader",
        "address": "0x2602278EE1882889B946eb11DC0E810075650983",
        "symbol": "VADER",
        "decimals": 18,
        "chainId": 1,
        "logoURI": "https://assets.coingecko.com/coins/images/21975/small/gamma-token-200.png?1640566576"
      },)
      setTokenList(sortBy(result1.data.tokens, "symbol"));
      setEthPrice(Number(result2.data.USD));
      setUsdcMarketConfig(result3);
    });
  }, []);

  useEffect(() => {
    if (!tokenList.length || !ethPrice) return;

    getPoolFees(token.address).then((fees) => {
      setPoolFees(fees);
      setFee(fees.includes(3000) ? 3000 : fees[0]);
    });
  }, [tokenName, tokenList, ethPrice]);

  useEffect(() => {
    if (!tokenList.length || !ethPrice || !poolFees.includes(fee)) return;

    const getMarket = async () => {
      const [{ price, sqrtPriceX96, tick, observationCardinality }, config] =
        await Promise.all([
          getSlot0(token, fee),
          // getMarketConfig(token.address),
        ]);

      // const profile = await getLiquidityProfile(token, fee);

      setCurrPrice(price);
      setCurrSqrtPriceX96(sqrtPriceX96.toString());
      setCurrTick(tick);
      setCardinality(observationCardinality);
      setTargetEthPrice(formatPrice(price, token));
      setTargetUsdPrice(formatPrice(price, token) * ethPrice);
      setTargetEthTwap(formatPrice(price, token));
      setTargetUsdTwap(formatPrice(price, token) * ethPrice);
      // setMarketConfig(config);

      // setLiquidityProfile(profile);
      // setLiquidityChartData(parseLiquidityRange(profile, currTick, token, ethPrice, price, 300, 300));
    };
    getMarket();
  }, [tokenName, fee, poolFees, tokenList, ethPrice]);

  useEffect(() => {
    if (!tokenList.length || !ethPrice || !currPrice || !poolFees.includes(fee))
      return;

    setTrades(null);
    Promise.all(
      amountsUSD.map((a) => getPumpAndDump(currPrice, token, fee, ethPrice, a))
    )
      .then((res) => {
        setTrades({
          pump: res.map((r) => r.pump),
          dump: res.map((r) => r.dump),
        });
      })
      .catch((e) => {
        handleError("Failed to fetch quotes");
      });
  }, [
    tokenName,
    fee,
    poolFees,
    tokenList,
    ethPrice,
    currPrice && currPrice.toString(),
  ]);

  const onTargetPriceImpact = () => {
    cancelPriceImpactSearch.current();

    setTargetPriceImpactLoading(true);

    const targetDecimal = new Decimal(targetPriceImpact);
    const { promise, cancel } = binarySearchTradeValues(
      currPrice,
      currSqrtPriceX96,
      token,
      fee,
      ethPrice,
      targetDecimal,
      "priceImpact"
    );
    cancelPriceImpactSearch.current = cancel;

    promise
      .then(([pump, dump]) => {
        resetResults();
        setTargetPriceImpactValue({ pump: pump.best, dump: dump.best });

        const standardTrades = getStandardTrades();
        setTrades({
          pump: sortBy(standardTrades.pump.concat(pump.trades), "value"),
          dump: sortBy(standardTrades.dump.concat(dump.trades), "value"),
        });
        setTargetPriceImpactLoading(false);
      })
      .catch((e) => {
        handleError(e);
      });
    return () => cancelPriceImpactSearch.current();
  };

  const onTargetPrice = () => {
    cancelPriceSearch.current();

    if (targetEthPrice === formatPrice(currPrice, token)) {
      handleError(
        "Please enter a target spot price which is different from current price."
      );
      return;
    }

    setTargetPriceLoading(true);
    const targetDecimal = new Decimal(targetEthPrice);
    const { promise, cancel } = binarySearchTradeValues(
      currPrice,
      currSqrtPriceX96,
      token,
      fee,
      ethPrice,
      targetDecimal,
      "price"
    );
    cancelPriceSearch.current = cancel;

    promise
      .then(([pump, dump]) => {
        resetResults();
        setTargetPriceValue({
          pump: pump && pump.best,
          dump: dump && dump.best,
        });

        const standardTrades = getStandardTrades();
        setTrades({
          pump: sortBy(
            standardTrades.pump.concat(pump ? pump.trades : []),
            "value"
          ),
          dump: sortBy(
            standardTrades.dump.concat(dump ? dump.trades : []),
            "value"
          ),
        });
        setTargetPriceLoading(false);
      })
      .catch((e) => {
        setTargetPriceLoading(false);
        handleError(e);
      });

    return () => cancelPriceSearch.current();
  };

  const onTargetTwap = () => {
    cancelTwapSearch.current();

    // TODO helper
    let currPriceDecimal = new Decimal(utils.formatEther(currPrice.toString()));
    const inverted = isInverted(token.address);
    const targetEthTwapScaled = Decimal.mul(
      targetEthTwap,
      Decimal.pow(10, 18 - token.decimals)
    );

    const target = getTwapTargetRatio(
      targetEthTwapScaled,
      token,
      currPriceDecimal,
      window,
      attackBlocks
    );

    setTargetTwapSpot(
      formatPrice(sqrtPriceX96ToPrice(target.toFixed(), inverted), token)
    );
    // console.log("target sqrtPrice: ", target.toFixed());
    // console.log(
    //   "target price ETH:",
    //   formatPrice(sqrtPriceX96ToPrice(target.toFixed(), inverted), token)
    // );
    // console.log(
    //   "target price USD:",
    //   formatPrice(sqrtPriceX96ToPrice(target.toFixed(), inverted), token) *
    //     ethPrice
    // );

    const { promise, cancel } = binarySearchTradeValues(
      currPrice,
      currSqrtPriceX96,
      token,
      fee,
      ethPrice,
      target,
      "sqrtPriceX96After"
    );
    cancelPriceSearch.current = cancel;
    setTargetTwapLoading(true);
    promise
      .then(([pump, dump]) => {
        resetResults();
        setTargetTwapValue({
          pump: pump && pump.best,
          dump: dump && dump.best,
        });

        const standardTrades = getStandardTrades();
        setTrades({
          pump: sortBy(
            standardTrades.pump.concat(pump ? pump.trades : []),
            "value"
          ),
          dump: sortBy(
            standardTrades.dump.concat(dump ? dump.trades : []),
            "value"
          ),
        });
      })
      .catch((e) => {
        console.log("e: ", e);
        handleError(e);
      })
      .finally(() => {
        setTargetTwapLoading(false);
      });

    return () => cancelTwapSearch.current();
  };

  const onReport = () => {
    setReportOpen(true);
    setReportLoading(true);

    const runReport = async () => {
      const currPriceDecimal = new Decimal(
        utils.formatEther(currPrice.toString())
      );
      const breakEvenPumpTwapChange =
        1 / (reportCollateralFactor * usdcMarketConfig.borrowFactor) - 1;
      const breakEvenDumpTwapChange = breakEvenPumpTwapChange; // 1 / (reportBorrowFactor * usdcMarketConfig.collateralFactor) - 1;

      const inverted = isInverted(token.address);

      let progress = 0;
      const attackBlocksReport = async (attackB) => {
        const p = utils.formatEther(currPrice);
        const maxTwapPump = getTwapAfterAttack(
          MAX_TICK_PRICE,
          p,
          window,
          attackB
        );
        const maxTwapDump = getTwapAfterAttack(
          MIN_TICK_PRICE,
          p,
          window,
          attackB
        );
        const targetTwapPump = currPriceDecimal.mul(
          1 + breakEvenPumpTwapChange
        );
        const targetTwapDump = currPriceDecimal.mul(
          1 - breakEvenDumpTwapChange
        );

        let pumpAction;
        let dumpAction;
        if (targetTwapPump.gt(maxTwapPump)) {
          pumpAction = Promise.reject("max_target");
        } else {
          const targetRatioPump = getTwapTargetRatio(
            targetTwapPump,
            token,
            currPriceDecimal,
            window,
            attackB
          );
          const { promise, cancel: cancelPump } = binarySearchTradeValues(
            currPrice,
            currSqrtPriceX96,
            token,
            fee,
            ethPrice,
            targetRatioPump,
            "sqrtPriceX96After"
          );
          pumpAction = promise;

          // console.log("PUMP target sqrtPrice: ", targetRatioPump.toFixed());
          // console.log(
          //   "PUMP target price ETH:",
          //   formatPrice(
          //     sqrtPriceX96ToPrice(targetRatioPump.toFixed(), inverted),
          //     token
          //   )
          // );
          // console.log(
          //   "PUMP target price USD:",
          //   formatPrice(
          //     sqrtPriceX96ToPrice(targetRatioPump.toFixed(), inverted),
          //     token
          //   ) * ethPrice
          // );
        }

        if (targetTwapDump.lt(maxTwapDump)) {
          dumpAction = Promise.reject("max_target");
        } else {
          const targetRatioDump = getTwapTargetRatio(
            targetTwapDump,
            token,
            currPriceDecimal,
            window,
            attackB
          );
          let { promise, cancel: cancelDump } = binarySearchTradeValues(
            currPrice,
            currSqrtPriceX96,
            token,
            fee,
            ethPrice,
            targetRatioDump,
            "sqrtPriceX96After"
          );
          dumpAction = promise;
          // console.log("DUMP target sqrtPrice: ", targetRatioDump.toFixed());
          // console.log(
          //   "DUMP target price ETH:",
          //   formatPrice(
          //     sqrtPriceX96ToPrice(targetRatioDump.toFixed(), inverted),
          //     token
          //   )
          // );
          // console.log(
          //   "DUMP target price USD:",
          //   formatPrice(
          //     sqrtPriceX96ToPrice(targetRatioDump.toFixed(), inverted),
          //     token
          //   ) * ethPrice
          // );
        }

        // todo handle cancel, improve search direction
        const res = await Promise.allSettled([pumpAction, dumpAction]);

        progress += 10;
        setReportProgress(progress);
        return res;
      };
      try {
        let res = [];

        // more than 2-3 parallel searches cause timeouts
        res.push(
          ...(await Promise.all([attackBlocksReport(1), attackBlocksReport(2)]))
        );
        res.push(
          ...(await Promise.all([attackBlocksReport(3), attackBlocksReport(4)]))
        );
        res.push(
          ...(await Promise.all([attackBlocksReport(5), attackBlocksReport(6)]))
        );
        res.push(
          ...(await Promise.all([attackBlocksReport(7), attackBlocksReport(8)]))
        );
        res.push(
          ...(await Promise.all([
            attackBlocksReport(9),
            attackBlocksReport(10),
          ]))
        );

        res = res.map(([pump, dump], i) => {
          const getSettled = (r, valIndex) => {
            if (r.status !== "fulfilled") {
              if (r.reason === "max_target") return r.reason;
              if (r.reason.message.includes("Max trade value exceeded"))
                return "max_trade";
              throw r.reason;
            }
            return r.value[valIndex];
          };
          return {
            blocks: i + 1,
            pump: getSettled(pump, 0),
            dump: getSettled(dump, 1),
          };
        });
        setReportData(res);
        // console.log('allResults: ', JSON.stringify(res, null, 2));
      } catch (e) {
        handleError(
          e.message.includes("context deadline exceeded")
            ? "Provider timeout. Try again..."
            : e
        );
        setReportOpen(false);
      } finally {
        console.timeEnd("report");
        setReportLoading(false);
        setReportProgress(0);
      }
    };
    // setTimeout(() => {
    //   const stats = getLiquidityStats(liquidityProfile, currTick, token, fee, currPrice, ethPrice);
    //   console.log('stats: ', JSON.stringify(stats, null, 2));
    //   setLiquidityStats(stats);
    // })

    // console.time("report");
    // runReport();
    setReportLoading(false);
    setReportData(reportJson);
  };

  const onMaxTwapTarget = (direction) => () => {
    if (direction === "pump") {
      setTargetEthTwap(maxTargetTwapSpot);
      setTargetUsdTwap(maxTargetTwapSpot * ethPrice);
    } else {
      setTargetEthTwap(minTargetTwapSpot);
      setTargetUsdTwap(minTargetTwapSpot * ethPrice);
    }
  };

  const resetResults = () => {
    setTargetPriceImpactValue(null);
    setTargetPriceValue(null);
    setTargetTwapValue(null);
  };

  const resetMarket = () => {
    setCurrPrice(null);
    setTrades(null);
    setTargetPriceImpactValue(null);
    setTargetPriceValue(null);
    setTargetTwapValue(null);
    setFee(3000);
    setLiquidityProfile(null);
    setLiquidityChartData(null);
    setLiquidityStats(null);
    setPoolFees([]);
  };

  const handleToken = (option) => {
    if (!option) return;
    resetMarket();
    setTokenName(option.name);
  };

  const handleFee = (event) => {
    resetMarket();
    setFee(event.target.value);
  };

  const handleEthPrice = (event) => {
    setEthPrice(event.target.value);
  };

  const handleTargetPrice = (currency) => (event) => {
    if (currency === "eth") {
      setTargetEthPrice(event.target.value);
      setTargetUsdPrice(event.target.value * ethPrice);
    } else {
      setTargetUsdPrice(event.target.value);
      setTargetEthPrice(event.target.value / ethPrice);
    }
  };

  const handleTargetTWAP = (currency) => (event) => {
    if (currency === "eth") {
      setTargetEthTwap(event.target.value);
      setTargetUsdTwap(event.target.value * ethPrice);
    } else {
      setTargetUsdTwap(event.target.value);
      setTargetEthTwap(event.target.value / ethPrice);
    }
  };

  const handleWindow = (event) => {
    setWindow(event.target.value);
  };

  const handleAttackBlocks = (event) => {
    setAttackBlocks(event.target.value);
  };

  const handleDownload = () => {
    csvLink.current.link.click();
  };

  const handleTargetPriceImpact = (event) => {
    setTargetPriceImpact(event.target.value);
  };

  const handleReportBorrowFactor = (event) => {
    setReportBorrowFactor(event.target.value);
  };

  const handleReportCollateralFactor = (event) => {
    setReportCollateralFactor(event.target.value);
  };

  const handleReportClose = () => {
    setReportOpen(false);
  };

  const handleErrorClose = () => {
    setErrorOpen(false);
  };

  const handleError = (e) => {
    if (e.message !== "cancelled") {
      setError(e.message || e);
      setErrorOpen(true);
    }
  };
  // todo here
  const stringToFixed = (val, precision) => {
    const i = val.indexOf(".");
    return Number(i === -1 ? val : val.slice(0, i + precision + 1));
  };
  let pumpChartData =
    (trades &&
      trades.pump.map((s) => ({
        ...s,
        priceImpact: stringToFixed(s.priceImpact, 3),
      }))) ||
    [];
  let dumpChartData =
    (trades &&
      trades.dump.map((s) => ({
        ...s,
        priceImpact: stringToFixed(s.priceImpact, 3),
      }))) ||
    [];

  const tokenSelectOptions = tokenList.map((t, i) => ({
    ...t,
    label:
      tokenList.filter((a) => a.symbol === t.symbol).length > 1
        ? `${t.symbol} ${t.name}`
        : t.symbol,
  }));
  const tokenSelectValue = tokenSelectOptions.find(
    (o) => o.name === tokenName
  ) || { label: "" };

  const SearchResult = ({ result }) => {
    return (
      <Grid container sx={{ maxWidth: 500 }}>
        <Grid item xs={4}>
          Value:
        </Grid>
        <Grid item xs={8} mb={1}>
          ${result.value.toLocaleString()}
        </Grid>
        {result.targetSpot && (
          <>
            <Grid item xs={4}>
              Target Spot ETH:
            </Grid>
            <Grid item xs={8}>
              {result.targetSpot}
            </Grid>
            <Grid item xs={4}>
              Target Spot USD:
            </Grid>
            <Grid item xs={8} mb={1}>
              {(result.targetSpot * ethPrice).toLocaleString()}
            </Grid>
          </>
        )}
        <Grid item xs={4}>
          Price Impact:
        </Grid>
        <Grid item xs={8}>
          {Number(result.priceImpact).toLocaleString()} %
        </Grid>
        <Grid item xs={4}>
          Price ETH:
        </Grid>
        <Grid item xs={8}>
          {result.price}
        </Grid>
        <Grid item xs={4}>
          Price USD:
        </Grid>
        <Grid item xs={8} mb={1}>
          {(result.price * ethPrice).toLocaleString()}
        </Grid>
        <Grid item xs={4}>
          Cost USD:
        </Grid>
        <Grid item xs={8}>
          $
          {getCostOfAttack(result, currPrice, ethPrice, token).toLocaleString()}
        </Grid>
      </Grid>
    );
  };
  const filterOptions = (options, { inputValue }) => {
    return matchSorter(options, inputValue, {
      keys: ["name", "symbol", "address"],
    });
  };

  return (
    <Box display="flex" sx={{ height: "100vh" }}>
      <Box display="flex" flexDirection="column">
        <Box sx={{ width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <Autocomplete
              disablePortal
              id="combo-box-demo"
              options={tokenSelectOptions}
              filterOptions={filterOptions}
              renderInput={(params) => <TextField {...params} label="Token" />}
              value={tokenSelectValue}
              isOptionEqualToValue={(a, b) => a.name === b.name}
              onChange={(event, option) => handleToken(option)}
            />
          </FormControl>
        </Box>
        <Box sx={{ width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="demo-simple-select-label2">Fee</InputLabel>
            <Select
              labelId="demo-simple-select-label-fee"
              id="demo-simple-select-fee"
              value={fee}
              label="Fee"
              onChange={handleFee}
            >
              <MenuItem
                value={100}
                key={100}
                disabled={!poolFees.includes(100)}
              >
                0.01%
              </MenuItem>
              <MenuItem
                value={500}
                key={500}
                disabled={!poolFees.includes(500)}
              >
                0.05%
              </MenuItem>
              <MenuItem
                value={3000}
                key={3000}
                disabled={!poolFees.includes(3000)}
              >
                0.3%
              </MenuItem>
              <MenuItem
                value={10000}
                key={10000}
                disabled={!poolFees.includes(10000)}
              >
                1%
              </MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="eth-price"
              label="ETH Price"
              variant="outlined"
              value={ethPrice}
              onChange={handleEthPrice}
              InputProps={{
                endAdornment: <>USD</>,
              }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-priceImpact"
              label="Target Price Impact"
              variant="outlined"
              value={targetPriceImpact}
              onChange={handleTargetPriceImpact}
              InputProps={{
                endAdornment: (
                  <>
                    %
                    <IconButton
                      disabled={
                        !tokenList.length ||
                        !ethPrice ||
                        isNaN(targetPriceImpact) ||
                        !currPrice ||
                        targetPriceImpactLoading
                      }
                      color="primary"
                      onClick={onTargetPriceImpact}
                      sx={{ marginLeft: 1 }}
                    >
                      <PlayArrowIcon />
                    </IconButton>
                  </>
                ),
              }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-price-eth"
              label="Target Spot ETH"
              variant="outlined"
              value={targetEthPrice}
              onChange={handleTargetPrice("eth")}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={
                      !tokenList.length ||
                      !ethPrice ||
                      isNaN(targetPriceImpact) ||
                      !currPrice ||
                      targetPriceLoading
                    }
                    color="primary"
                    onClick={onTargetPrice}
                    sx={{ marginLeft: 1 }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                ),
              }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-twap-usd"
              label="Target Spot USD"
              variant="outlined"
              value={targetUsdPrice}
              onChange={handleTargetPrice("usd")}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={
                      !tokenList.length ||
                      !ethPrice ||
                      isNaN(targetPriceImpact) ||
                      !currPrice ||
                      targetPriceLoading
                    }
                    color="primary"
                    onClick={onTargetPrice}
                    sx={{ marginLeft: 1 }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                ),
              }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-twap-window"
              label="TWAP window"
              variant="outlined"
              value={window}
              onChange={handleWindow}
              InputLabelProps={{ shrink: true }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-twap-blocks"
              label="Attack Blocks"
              variant="outlined"
              value={attackBlocks}
              onChange={handleAttackBlocks}
              InputLabelProps={{ shrink: true }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-twap-eth"
              label="Target TWAP ETH"
              variant="outlined"
              value={targetEthTwap}
              onChange={handleTargetTWAP("eth")}
              error={twapTargetExceedsMax}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={
                      !tokenList.length ||
                      !ethPrice ||
                      !currPrice ||
                      targetTwapLoading ||
                      twapTargetExceedsMax
                    }
                    color="primary"
                    onClick={onTargetTwap}
                    sx={{ marginLeft: 1 }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                ),
              }}
            />
          </FormControl>
        </Box>
        <Box sx={{ minWidth: 120, width: 200, margin: 1 }}>
          <FormControl fullWidth>
            <TextField
              id="target-price-usd"
              label="Target TWAP USD"
              variant="outlined"
              value={targetUsdTwap}
              error={twapTargetExceedsMax}
              onChange={handleTargetTWAP("usd")}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={
                      !tokenList.length ||
                      !ethPrice ||
                      !currPrice ||
                      targetTwapLoading ||
                      twapTargetExceedsMax
                    }
                    color="primary"
                    onClick={onTargetTwap}
                    sx={{ marginLeft: 1 }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                ),
              }}
            />
          </FormControl>
        </Box>
        <Button
          sx={{ minWidth: 120, width: 200, margin: 1 }}
          disabled={!trades}
          variant="contained"
          endIcon={<DownloadIcon />}
          onClick={handleDownload}
        >
          Download csv
        </Button>
        {trades && trades.pump.length > 0 && (
          <CSVLink
            headers={[
              "VALUE",
              "PUMP PRICE IMPACT",
              "PUMP PRICE",
              "DUMP PRICE IMPACT",
              "DUMP PRICE",
            ]}
            data={getStandardTradesTable().map(
              ({ pump, dump }) =>
                pump &&
                dump && [
                  pump.value,
                  pump.priceImpact,
                  pump.price,
                  dump.priceImpact,
                  dump.price,
                ]
            )}
            target="_blank"
            filename={`${tokenName}_${fee}.csv`}
            ref={csvLink}
          />
        )}
        <Grid container sx={{ width: 200, margin: 1, marginTop: 1 }}>
          <Grid item xs={6}>
            <FormControl>
              <TextField
                id="report-bf"
                label="BF"
                variant="outlined"
                value={reportBorrowFactor}
                error={reportBorrowFactor > 1}
                onChange={handleReportBorrowFactor}
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl>
              <TextField
                id="report-cf"
                label="CF"
                variant="outlined"
                value={reportCollateralFactor}
                error={reportCollateralFactor > 1}
                onChange={handleReportCollateralFactor}
                InputLabelProps={{ shrink: true }}
              />
            </FormControl>
          </Grid>
          <Grid item xs={12} mt={1}>
            <Button
              sx={{ width: "100%" }}
              variant="contained"
              onClick={onReport}
            >
              Generate Report
            </Button>
          </Grid>
        </Grid>
      </Box>
      {trades ? (
        <>
          <Box display="flex" flexDirection="column" mt={1}>
            <Box sx={{ width: "100%" }} mb={1}>
              <Card>
                <CardContent>
                  <Box display="flex">
                    <Link
                      target="_blank"
                      href={`https://etherscan.io/token/${token.address}`}
                    >
                      Token
                    </Link>
                    <Link
                      ml={1}
                      target="_blank"
                      href={`https://info.uniswap.org/#/pools/${computeUniV3PoolAddress(
                        token.address,
                        WETH_ADDRESS,
                        fee
                      ).toLowerCase()}`}
                    >
                      Pool
                    </Link>
                    <Box display="flex" ml={1}>
                      Tick: {currTick}
                    </Box>
                    <Box display="flex" ml={1}>
                      Cardinality: {cardinality}
                    </Box>
                  </Box>
                  <Box display="flex" mb={1}>
                    <Box display="flex">
                      Price USD: {formatPrice(currPrice, token) * ethPrice}
                    </Box>
                    <Box display="flex" ml={1}>
                      Price ETH: {formatPrice(currPrice, token)}
                    </Box>
                  </Box>
                  <Box display="flex" flexDirection="column">
                    <Box display="flex" mb={1}>
                      Max TWAP targets USD (given window, attack blocks and tick
                      pricing limits)
                    </Box>
                    <Box display="flex" flexDirection="column">
                      <Box
                        sx={{ cursor: "pointer" }}
                        onClick={onMaxTwapTarget("pump")}
                      >
                        Pump: {maxTargetTwapSpot * ethPrice} (
                        {maxTargetTwapSpotPercentage}%)
                      </Box>
                      <Box
                        sx={{ cursor: "pointer" }}
                        onClick={onMaxTwapTarget("dump")}
                      >
                        Dump: {minTargetTwapSpot * ethPrice} (
                        {minTargetTwapSpotPercentage}%)
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
            {targetPriceImpactValue && (
              <Box mb={1} sx={{ width: "100%" }}>
                <Card mt={1}>
                  <CardContent>
                    <Box mb={1}>
                      <b>Target Price Impact</b>
                    </Box>
                    <SearchResult result={targetPriceImpactValue.pump} />
                    <Divider sx={{ marginTop: 1, marginBottom: 1 }} />
                    <SearchResult result={targetPriceImpactValue.dump} />
                  </CardContent>
                </Card>
              </Box>
            )}
            {targetPriceValue && (
              <Box mb={1} sx={{ width: "100%" }}>
                <Card mt={1}>
                  <CardContent>
                    <Box mb={1}>
                      <b>Target Spot</b>
                    </Box>
                    <SearchResult
                      result={targetPriceValue.pump || targetPriceValue.dump}
                    />
                  </CardContent>
                </Card>
              </Box>
            )}
            {targetTwapValue && (
              <Box mb={1} sx={{ width: "100%" }}>
                <Card mt={1}>
                  <CardContent>
                    <Box mb={1}>
                      <b>Target TWAP</b>
                    </Box>
                    <SearchResult
                      result={{
                        ...(targetTwapValue.pump || targetTwapValue.dump),
                        targetSpot: targetTwapSpot,
                      }}
                    />
                  </CardContent>
                </Card>
              </Box>
            )}
            <Box display="flex" mt={1}>
              <TableContainer component={Paper}>
                <Table
                  sx={{ minWidth: 400 }}
                  size="small"
                  aria-label="simple table"
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>USD VALUE</TableCell>
                      <TableCell align="right">PUMP SPOT IMPACT</TableCell>
                      <TableCell align="right">DUMP SPOT IMPACT</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getStandardTradesTable().map(
                      (row) =>
                        row.pump && (
                          <TableRow
                            key={row.pump.value}
                            sx={{
                              "&:last-child td, &:last-child th": { border: 0 },
                            }}
                          >
                            <TableCell
                              component="th"
                              scope="row"
                              key={Math.random()}
                            >
                              {numberFormatText(row.pump.value)}
                            </TableCell>
                            <TableCell align="right" key={Math.random()}>
                              {row.pump.priceImpact}%
                            </TableCell>
                            <TableCell align="right" key={Math.random()}>
                              {row.dump.priceImpact}%
                            </TableCell>
                          </TableRow>
                        )
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            {/* todo here */}
            {trades && trades.pump.length === 0 && (
              <Box display="flex" mt={1} mb={1} sx={{ color: "red" }} flex>
                NO LIQUIDITY
              </Box>
            )}
          </Box>
          {trades && trades.pump.length > 0 && (
            <Box display="flex" flexDirection="column" ml={1} mt={1}>
              <PriceImpactChart
                width={900}
                height={450}
                stroke="#8884d8"
                data={pumpChartData}
                targetPriceImpact={
                  targetPriceImpactValue && targetPriceImpactValue.pump
                }
                targetPrice={targetPriceValue && targetPriceValue.pump}
                targetTwap={targetTwapValue && targetTwapValue.pump}
                token={token}
                ethPrice={ethPrice}
                currPrice={currPrice}
              />
              <PriceImpactChart
                width={900}
                height={450}
                stroke="#82ca9d"
                data={dumpChartData}
                targetPriceImpact={
                  targetPriceImpactValue && targetPriceImpactValue.dump
                }
                targetPrice={targetPriceValue && targetPriceValue.dump}
                targetTwap={targetTwapValue && targetTwapValue.dump}
                token={token}
                ethPrice={ethPrice}
                currPrice={currPrice}
              />
              {/* {liquidityProfile && (
                  <LiquidityChart
                    tick={currTick}
                    data={liquidityChartData}
                    tickSpacing={TICK_SPACINGS[fee]}
                    width={900}
                    height= {300}
                  />
                )} */}
            </Box>
          )}
        </>
      ) : (
        <Box
          sx={{ width: "100%", height: "100%" }}
          display="flex"
          justifyContent="center"
          alignItems="center"
        >
          <CircularProgress />
        </Box>
      )}
      <Dialog open={errorOpen} onClose={handleErrorClose}>
        <DialogTitle id="alert-dialog-title">ERROR</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            {error}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleErrorClose}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={reportOpen}
        onClose={handleErrorClose}
        fullScreen
        maxWidth="lg"
      >
        <DialogTitle id="report-dialog-title">
          <b>
            {token.symbol} / WETH {fee / 10000}%
          </b>
        </DialogTitle>
        <DialogContent>
          <LiquidityReport
            loading={reportLoading}
            progress={reportProgress}
            collateralFactor={reportCollateralFactor}
            borrowFactor={reportBorrowFactor}
            usdcMarketConfig={usdcMarketConfig}
            data={reportData}
            currPrice={currPrice}
            ethPrice={ethPrice}
            token={token}
            window={window}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleReportClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
