import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';

import { CSVLink } from "react-csv";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, } from 'recharts';
import { DefaultTooltipContent } from 'recharts/lib/component/DefaultTooltipContent';
import { sortBy } from "lodash";
import { matchSorter } from "match-sorter";
import { Decimal } from 'decimal.js'
import { utils } from 'ethers'

import {
  getCurrPrice,
  getPumpAndDump,
  numberFormatText,
  binarySearchTradeValues,
  formatPrice,
  getPoolFees,
  MAX_TICK_PRICE,
  WETH_ADDRESS,
  computeUniV3PoolAddress,
} from "../../utils";



export const PriceImpact = () => {
  const [tokenList, setTokenList] = useState([]);
  const [symbol, setSymbol] = useState('USDC');
  const [fee, setFee] = useState(3000);
  const [ethPrice, setEthPrice] = useState(0);
  const [trades, setTrades] = useState();
  const [currPrice, setCurrPrice] = useState();
  const [marketPriceUSD, setMarketPriceUSD] = useState();
  const [poolFees, setPoolFees] = useState([]);

  const [targetPriceImpact, setTargetPriceImpact] = useState(90);
  const [targetPriceImpactLoading, setTargetPriceImpactLoading] = useState(false);
  const [targetPriceImpactValue, setTargetPriceImpactValue] = useState();
  
  const [targetETHPrice, setTargetETHPrice] = useState('');
  const [targetUSDPrice, setTargetUSDPrice] = useState('');
  const [targetPriceLoading, setTargetPriceLoading] = useState(false);
  const [targetPriceValue, setTargetPriceValue] = useState();
  
  const [window, setWindow] = useState(144);
  const [attackBlocks, setAttackBlocks] = useState(1);
  const [targetETHTWAP, setTargetETHTWAP] = useState('');
  const [targetUSDTWAP, setTargetUSDTWAP] = useState('');
  const [targetTWAPLoading, setTargetTWAPLoading] = useState(false);
  const [targetTWAPValue, setTargetTWAPValue] = useState();
  const [targetTWAPSpot, setTargetTWAPSpot] = useState('');
  const [minTargetTWAPSpot, setMinTargetTWAPSpot] = useState('');
  const [maxTargetTWAPSpot, setMaxTargetTWAPSpot] = useState('');

  const [error, setError] = useState();
  const [errorOpen, setErrorOpen] = useState(false);

  const cancelPriceImpactSearch = useRef(() => {});
  const cancelPriceSearch = useRef(() => {});
  const cancelTWAPSearch = useRef(() => {});
  const csvLink = useRef();

  const amountsUSD = [
    100_000,
    200_000,
    300_000,
    400_000,
    500_000,
    600_000,
    700_000,
    800_000,
    900_000,
    1_000_000,
    2_000_000,
    3_000_000,
    4_000_000,
    5_000_000,
    6_000_000,
    7_000_000,
    8_000_000,
    9_000_000,
    10_000_000,
  ];
  
  const getToken = () => tokenList.find(t => t.symbol === symbol);

  const getStandardTrades = () => {
    return amountsUSD.map(a => {
      const pump = trades.pump.find(t => t.value === a);
      const dump = trades.dump.find(t => t.value === a);
      return { pump, dump };
    })
  };
  
  const getCostOfAttack = trade => {
    return trade.tokenOut === WETH_ADDRESS
      ? trade.value - utils.formatEther(trade.amountOut) * ethPrice
      : trade.value - utils.formatUnits(trade.amountOut, getToken().decimals) * marketPriceUSD
  };

  const getMarketPriceUSD = tokenSymbol => axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${tokenSymbol}&tsyms=USD`);

  const setMinMaxTargetTWAPSpot = () => {
    const market = getToken();
    const currPriceDecimal = new Decimal(formatPrice(currPrice, market));
    const maxPrice = new Decimal(formatPrice(MAX_TICK_PRICE, market));
    const minPrice = Decimal.pow(10, -18);

    let maxTarget = maxPrice.pow(attackBlocks).mul(currPriceDecimal.pow(window - attackBlocks)).pow(Decimal.div(1, window));
    let minTarget = minPrice.pow(attackBlocks).mul(currPriceDecimal.pow(window - attackBlocks)).pow(Decimal.div(1, window));

    // some precision is lost, adjusting
    const precision = Decimal.pow(10, 8);
    maxTarget = maxTarget.mul(precision).floor().div(precision);
    setMaxTargetTWAPSpot(maxTarget.toFixed(18));
    setMinTargetTWAPSpot(minTarget.toFixed(18));
  }

  useEffect(() => {
    Promise.all([
      axios.get('https://raw.githubusercontent.com/euler-xyz/euler-tokenlist/master/euler-tokenlist.json'),
      getMarketPriceUSD('ETH'),
    ])
    .then(([result1, result2]) => {
      setTokenList(sortBy(result1.data.tokens, 'symbol'));
      setEthPrice(Number(result2.data.USD));
    });
  }, []);


  useEffect(() => {
    if (!tokenList.length || !ethPrice) return;
    const token = getToken();

    getPoolFees(token.address).then(fees => {
      setPoolFees(fees);
      setFee(fees.includes(3000) ? 3000 : fees[0]);
    });
  }, [symbol, tokenList, ethPrice]);

  useEffect(() => {
    if (!tokenList.length || !ethPrice || !poolFees.includes(fee)) return;
    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }

    Promise.all([
      getCurrPrice(market, fee),
      getMarketPriceUSD(symbol),
    ]).then(([price, marketPrice]) => {
      setCurrPrice(price);
      setTargetETHPrice(formatPrice(price, getToken()));
      setTargetUSDPrice(formatPrice(price, getToken()) * ethPrice);
      setTargetETHTWAP(formatPrice(price, getToken()));
      setTargetUSDTWAP(formatPrice(price, getToken()) * ethPrice);

      setMarketPriceUSD(marketPrice.data.USD)
    });
  }, [symbol, fee, poolFees, tokenList, ethPrice]);

  useEffect(() => {
    if (!tokenList.length || !ethPrice || !currPrice || !poolFees.includes(fee)) return;
    const exec = async () => {
      setTrades();
      const token = getToken();
      const market = {
        symbol,
        underlying: token.address,
        decimals: token.decimals,
      }
      let res = await Promise.allSettled(amountsUSD.map(a => getPumpAndDump(currPrice, market, fee, ethPrice, a)));
      res = res.filter(r => r.status === 'fulfilled').map(r => r.value);

      setTrades({
        pump: res.map(r => r.pump),
        dump: res.map(r => r.dump),
      });
    };
    exec();
  }, [symbol, fee, poolFees, tokenList, ethPrice, currPrice && currPrice.toString()]);

  useEffect(() => {
    if (!tokenList.length || !ethPrice || !currPrice || !poolFees.includes(fee) || !window || !attackBlocks) return;
    setMinMaxTargetTWAPSpot();
  }, [symbol, fee, poolFees, tokenList, ethPrice, currPrice && currPrice.toString(), window, attackBlocks]);

  const onTargetPriceImpact = () => {
    cancelPriceImpactSearch.current();

    // setTargetPriceImpactValue(null);
    setTargetPriceImpactLoading(true);
    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }

    const targetDecimal = new Decimal(targetPriceImpact);
    const { promise, cancel } = binarySearchTradeValues(currPrice, market, fee, ethPrice, targetDecimal, 'priceImpact');
    cancelPriceImpactSearch.current = cancel;

    promise
      .then(([pump, dump]) => {
        setTargetPriceImpactValue({pump: pump.best, dump: dump.best});
        setTrades({
          pump: sortBy(trades.pump.concat(pump.trades), 'value'), 
          dump: sortBy(trades.dump.concat(dump.trades), 'value'), 
        })
        setTargetPriceImpactLoading(false);
      })
      .catch(e => {
        handleError(e)
      });
    return () => cancelPriceImpactSearch.current();
  };

  const onTargetPrice = () => {
    cancelPriceSearch.current();

    setTargetPriceLoading(true);
    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }
    const targetDecimal = new Decimal(targetETHPrice);
    const { promise, cancel } = binarySearchTradeValues(currPrice, market, fee, ethPrice, targetDecimal, 'price');
    cancelPriceSearch.current = cancel;

    promise
      .then(([pump, dump]) => {
        setTargetPriceValue({pump: pump && pump.best, dump: dump && dump.best});
        setTrades({
          pump: sortBy(trades.pump.concat(pump ? pump.trades : []), 'value'), 
          dump: sortBy(trades.dump.concat(dump ? dump.trades : []), 'value'), 
        })
        setTargetPriceLoading(false);
      })
      .catch(e => {
        setTargetPriceLoading(false);
        handleError(e)
      })

    return () => cancelPriceSearch.current();
  };

  const onTargetTWAP = () => {
    cancelTWAPSearch.current();

    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }

    let currPriceDecimal = new Decimal(formatPrice(currPrice, market));
    let target = new Decimal(targetETHTWAP);

    target = target.pow(window).div(currPriceDecimal.pow(window - attackBlocks)).pow(Decimal.div(1, attackBlocks));

    target = target.mul(Decimal.pow(10, 18)).round().div(Decimal.pow(10, 18));

    if (target.lt(Decimal.pow(10, -18))) {
      handleError('Target spot price is lower than min supported price')
      return;
    }

    if (target.gt(formatPrice(MAX_TICK_PRICE, market))) {
      handleError('Target spot price is higher than max supported price');
      return;
    }

    setTargetTWAPSpot(target.toString());
    const { promise, cancel } = binarySearchTradeValues(currPrice, market, fee, ethPrice, target, 'price');
    cancelPriceSearch.current = cancel;
    setTargetTWAPLoading(true);
    promise
      .then(([pump, dump]) => {
        setTargetTWAPValue({pump: pump && pump.best, dump: dump && dump.best});
        const standardTrades = getStandardTrades().reduce((accu, t) => {
          accu.pump.push(t.pump);
          accu.dump.push(t.dump);
          return accu
        }, { pump: [], dump: []})
        setTrades({
          pump: sortBy(standardTrades.pump.concat(pump ? pump.trades : []), 'value'), 
          dump: sortBy(standardTrades.dump.concat(dump ? dump.trades : []), 'value'), 
        })
        setTargetTWAPLoading(false);
      })
      .catch(e => {
        setTargetTWAPLoading(false);
        handleError(e);
      })

    return () => cancelTWAPSearch.current();
  };

  const resetMarket = () => {
    setCurrPrice(null);
    setTrades();
    setTargetPriceImpactValue(null);
    setTargetPriceValue(null);
    setFee(3000);
    setPoolFees([]);
  }
  const handleToken = (option) => {
    if (!option) return;
    resetMarket();
    setSymbol(option.symbol);
  };

  const handleFee = (event) => {
    resetMarket();
    setFee(event.target.value);
  };

  const handleEthPrice = (event) => {
    setEthPrice(event.target.value);
  };

  const handleTargetPrice = (currency) => (event) => {
    if (currency === 'eth') {
      setTargetETHPrice(event.target.value);
      setTargetUSDPrice(numberFormatText(event.target.value * ethPrice, true));
    } else {
      setTargetUSDPrice(event.target.value);
      setTargetETHPrice(numberFormatText(event.target.value / ethPrice, true));
    }
  };

  const handleTargetTWAP = (currency) => (event) => {
    if (currency === 'eth') {
      setTargetETHTWAP(event.target.value);
      setTargetUSDTWAP(numberFormatText(event.target.value * ethPrice, true));
    } else {
      setTargetUSDTWAP(event.target.value);
      setTargetETHTWAP(numberFormatText(event.target.value / ethPrice, true));
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
  }

  const handleTargetPriceImpact = (event) => {
    setTargetPriceImpact(event.target.value);
  }

  const handleErrorClose = () => {
    setErrorOpen(false)
  }

  const handleError = (e) => {
    if (e.message !== 'cancelled') {
      setError(e.message || e)
      setErrorOpen(true)
    };
  } 

  const stringToFixed = (val, precision) => {
    const i = val.indexOf('.')
    return Number(i === -1 ? val : val.slice(0, i + precision + 1))
  }
  let pumpChartData = trades && trades.pump.map(s => ({...s, priceImpact: stringToFixed(s.priceImpact, 3) })) || [];
  let dumpChartData = trades && trades.dump.map(s => ({...s, priceImpact: stringToFixed(s.priceImpact, 3) })) || [];

  const tokenSelectOptions = tokenList.map((t, i) => ({
    ...t,
    label: tokenList.filter(a => a.symbol === t.symbol).length > 1 ? `${t.symbol} ${t.name}` : t.symbol,
  }));
  const tokenSelectValue = tokenSelectOptions.find(o => o.symbol === symbol) || {label: ""};

  const CustomTooltip = props => {
    if (props.payload[0] != null) {
      const newPayload = [
        ...props.payload,
        {
          name: 'price ETH',
          value: props.payload[0].payload.price,
        },
        {
          name: 'price USD',
          value: props.payload[0].payload.price * ethPrice,
        },
        {
          name: 'amount out',
          value: utils.formatUnits(
            props.payload[0].payload.amountOut,
            props.payload[0].payload.tokenOut === WETH_ADDRESS ? 18 : getToken().decimals,
          ),
        },
        {
          name: 'cost',
          value: getCostOfAttack(props.payload[0].payload).toLocaleString() + ' USD',
        },
      ];
  
      return <DefaultTooltipContent {...props} payload={newPayload} />;
    }
  
    // we just render the default
    return <DefaultTooltipContent {...props} />;
  };

  const SearchResult = ({ result }) => {
    return (
      <Grid container >
        {result.targetSpot && (
          <>
            <Grid item xs={4}>
              Target Spot ETH:
            </Grid>
            <Grid item xs={8}>
              {result.targetSpot}
            </Grid>
          </>
        )}
        <Grid item xs={4}>
          Value:
        </Grid>
        <Grid item xs={8}>
          ${result.value.toLocaleString()}
        </Grid>
        <Grid item xs={4}>
          Price Impact:
        </Grid>
        <Grid item xs={8}>
          {result.priceImpact} %
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
        <Grid item xs={8}>
          {result.price * ethPrice}
        </Grid>
        <Grid item xs={4}>
          Cost USD:
        </Grid>
        <Grid item xs={8}>
          ${getCostOfAttack(result).toLocaleString()}
        </Grid>
      </Grid>
    )
  }
  const filterOptions = (options, { inputValue }) => {
    return matchSorter(options, inputValue, { keys: ["name", "symbol", "address"] })
  }

  let minTargetTwapSpotPercentage = '-';
  let maxTargetTwapSpotPercentage = '-';
  let twapTargetExceedsMax = false;

  if (currPrice && ethPrice && minTargetTWAPSpot && maxTargetTWAPSpot) {
    const currPriceFormatted = formatPrice(currPrice, getToken());
    minTargetTwapSpotPercentage = Decimal.sub(minTargetTWAPSpot, currPriceFormatted).div(currPriceFormatted).mul(100).round().toString();
    maxTargetTwapSpotPercentage = Decimal.sub(maxTargetTWAPSpot, currPriceFormatted).div(currPriceFormatted).mul(100).round().toString();
    
    if (targetETHTWAP) {
      const t = new Decimal(targetETHTWAP);
      twapTargetExceedsMax = t.lt(minTargetTWAPSpot) || t.gt(maxTargetTWAPSpot);
    }
  }

  return (
    <Box display="flex" sx={{height: '100vh'}}>
      <Box display="flex" flexDirection="column">
        <Box sx={{ width: 200, margin: 1, }}>
          <FormControl fullWidth> 
              <Autocomplete
                disablePortal
                id="combo-box-demo"
                options={tokenSelectOptions}
                filterOptions={filterOptions}
                renderInput={(params) => <TextField {...params} label="Token" />}
                value={tokenSelectValue}
                isOptionEqualToValue={(a, b) => a.symbol === b.symbol}
                onChange={(event, option) => handleToken(option)}
              />
            </FormControl>
          </Box>
          <Box sx={{ width: 200, margin: 1, }}>
            <FormControl fullWidth> 
              <InputLabel id="demo-simple-select-label2">Fee</InputLabel>
              <Select
                labelId="demo-simple-select-label-fee"
                id="demo-simple-select-fee"
                value={fee}
                label="Fee"
                onChange={handleFee}
              >
                <MenuItem value={100} key={100} disabled={!poolFees.includes(100)}>0.01%</MenuItem>
                <MenuItem value={500} key={500} disabled={!poolFees.includes(500)}>0.05%</MenuItem>
                <MenuItem value={3000} key={3000} disabled={!poolFees.includes(3000)}>0.3%</MenuItem>
                <MenuItem value={10000} key={10000} disabled={!poolFees.includes(10000)}>1%</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
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
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
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
                    disabled={!tokenList.length || !ethPrice || isNaN(targetPriceImpact) || !currPrice || targetPriceImpactLoading}
                    color="primary"
                    onClick={onTargetPriceImpact}
                    sx={{marginLeft: 1}}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                </>
                )
              }}
            />
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
            <FormControl fullWidth>
            <TextField
              id="target-price-eth"
              label="Target Spot ETH"
              variant="outlined"
              value={targetETHPrice}
              onChange={handleTargetPrice('eth')}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={!tokenList.length || !ethPrice || isNaN(targetPriceImpact) || !currPrice || targetPriceLoading}
                    color="primary"
                    onClick={onTargetPrice}
                    sx={{marginLeft: 1}}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                )
              }}
            />
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
            <FormControl fullWidth>
            <TextField
              id="target-twap-usd"
              label="Target Spot USD"
              variant="outlined"
              value={targetUSDPrice}
              onChange={handleTargetPrice('usd')}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={!tokenList.length || !ethPrice || isNaN(targetPriceImpact) || !currPrice || targetPriceLoading}
                    color="primary"
                    onClick={onTargetPrice}
                    sx={{marginLeft: 1}}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                )
              }}
            />
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
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
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
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
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
            <FormControl fullWidth>
            <TextField
              id="target-twap-eth"
              label="Target TWAP ETH"
              variant="outlined"
              value={targetETHTWAP}
              onChange={handleTargetTWAP('eth')}
              error={twapTargetExceedsMax}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={!tokenList.length || !ethPrice ||  !currPrice || targetTWAPLoading || twapTargetExceedsMax}
                    color="primary"
                    onClick={onTargetTWAP}
                    sx={{marginLeft: 1}}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                )
              }}
            />
            </FormControl>
          </Box>
          {/* <Box ml={1} mb={1} sx={{ minWidth: 120, width: 200,  fontSize: 12}}>
            MIN: {minTargetTWAPSpot} ({minTargetTwapSpotPercentage}%)
            <br/>
            MAX: {maxTargetTWAPSpot} ({maxTargetTwapSpotPercentage}%)
          </Box> */}
          <Box sx={{ minWidth: 120, width: 200, margin: 1, }}>
            <FormControl fullWidth>
            <TextField
              id="target-price-usd"
              label="Target TWAP USD"
              variant="outlined"
              value={targetUSDTWAP}
              error={twapTargetExceedsMax}
              onChange={handleTargetTWAP('usd')}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    disabled={!tokenList.length || !ethPrice ||  !currPrice || targetTWAPLoading || twapTargetExceedsMax}
                    color="primary"
                    onClick={onTargetTWAP}
                    sx={{marginLeft: 1}}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                )
              }}
            />
            </FormControl>
          </Box>
          {/* <Box ml={1} mb={1} sx={{ minWidth: 120, width: 200,  fontSize: 12}}>
            MIN: {minTargetTWAPSpot * ethPrice} ({minTargetTwapSpotPercentage}%)
            <br/>
            MAX: {maxTargetTWAPSpot * ethPrice} ({maxTargetTwapSpotPercentage}%)
          </Box> */}
        <Button
          sx={{ minWidth: 120, width: 200, margin: 1, }}
          disabled={!trades}
          variant="contained"
          endIcon={<DownloadIcon />}
          onClick={handleDownload}
        >
          Download csv
        </Button>
        {trades && trades.pump.length > 0 && (
          <CSVLink
            headers={['VALUE', 'PUMP PRICE IMPACT', 'PUMP PRICE', 'DUMP PRICE IMPACT', 'DUMP PRICE']}
            data={getStandardTrades().map(({ pump, dump }) => pump && dump &&[pump.value, pump.priceImpact, pump.price, dump.priceImpact, dump.price])}
            target="_blank"
            filename={`${symbol}_${fee}.csv`}
            ref={csvLink}
          />
        )}
      </Box>
      {trades
        ? (
          <>
            <Box display="flex" flexDirection="column" mt={1}>
              <Box sx={{width: '100%'}} mb={1}>
                <Card>
                  <CardContent>
                    <Box display="flex" mb={1}>
                      <Link target="_blank" href={`https://etherscan.io/token/${getToken().address}`}>
                        Token
                      </Link>
                      <Link ml={1} target="_blank" href={`https://info.uniswap.org/#/pools/${computeUniV3PoolAddress(getToken().address, WETH_ADDRESS, fee).toLowerCase()}`}>
                        Pool
                      </Link>
                      <Box display="flex" ml={1}>
                        Price USD: {formatPrice(currPrice, getToken()) * ethPrice}
                      </Box>
                      <Box display="flex" ml={1}>
                        Price ETH: {formatPrice(currPrice, getToken())}
                      </Box>
                    </Box>
                    <Box display="flex" flexDirection="column">
                      <Box display="flex" mb={1}>
                        Max TWAP targets USD (tick pricing limits)
                      </Box>
                      <Box display="flex">
                        Pump: {maxTargetTWAPSpot * ethPrice} ({maxTargetTwapSpotPercentage}%)
                        <br/>
                        Dump: {minTargetTWAPSpot * ethPrice} ({minTargetTwapSpotPercentage}%)
                      </Box>
                    </Box>
                    {/* <Box display="flex" >
                      Price USD: {formatPrice(currPrice, getToken()) * ethPrice}
                      <br/>
                      Price ETH: {formatPrice(currPrice, getToken())}
                    </Box> */}
                  </CardContent>
                </Card>
              </Box>
              {targetPriceImpactValue && (
                <Box mb={1} sx={{width: '100%'}}>
                  <Card mt={1}>
                    <CardContent>
                      <Box mb={1}>
                        <b>Target Price Impact</b>
                      </Box>
                      <SearchResult result={targetPriceImpactValue.pump} />
                      <Divider sx={{marginTop: 1, marginBottom: 1}}/>
                      <SearchResult result={targetPriceImpactValue.dump} />
                    </CardContent>
                  </Card>
                </Box>
              )}
              {targetPriceValue && (
                <Box mb={1} sx={{width: '100%'}}>
                  <Card mt={1}>
                    <CardContent>
                      <Box mb={1}>
                        <b>Target Spot</b>
                      </Box>
                      <SearchResult result={targetPriceValue.pump || targetPriceValue.pump} />
                    </CardContent>
                  </Card>
                </Box>
              )}
              {targetTWAPValue && (
                <Box mb={1} sx={{width: '100%'}}>
                  <Card mt={1}>
                    <CardContent>
                      <Box mb={1}>
                        <b>Target TWAP</b>
                      </Box>
                      <SearchResult result={{
                        ...(targetTWAPValue.pump || targetTWAPValue.dump),
                        targetSpot: targetTWAPSpot
                      }} />
                    </CardContent>
                  </Card>
                </Box>
              )}
              <Box display="flex" mt={1}>
                <TableContainer component={Paper}>
                  <Table sx={{ minWidth: 400 }} size="small" aria-label="simple table">
                    <TableHead>
                      <TableRow>
                        <TableCell>USD VALUE</TableCell>
                        <TableCell align="right">PUMP PERCENTAGE</TableCell>
                        <TableCell align="right">DUMP PERCENTAGE</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getStandardTrades().map((row) => row.pump && (
                        <TableRow
                          key={row.pump.value}
                          sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                        >
                          <TableCell component="th" scope="row" key={Math.random()}>
                            {numberFormatText(row.pump.value)}
                          </TableCell>
                          <TableCell align="right" key={Math.random()}>{row.pump.priceImpact}%</TableCell>
                          <TableCell align="right" key={Math.random()}>{row.dump.priceImpact}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              {trades && trades.pump.length ===0 && (
                <Box display="flex" mt={1} mb={1} sx={{color: "red"}} flex>
                  NO LIQUIDITY
                </Box>
              )}
            </Box>
            {trades && trades.pump.length > 0 && (
              <Box display="flex" flexDirection="column" ml={1} mt={1}>
                <LineChart
                  width={900}
                  height={450}
                  data={pumpChartData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 40,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="value" domain={['dataMin', 'dataMax']} type="number" tickFormatter={(tick) => {
                    return numberFormatText(tick)
                  }}/>
                  <YAxis type="number" />
                  <Tooltip 
                    content={CustomTooltip} 
                    labelFormatter={v => v.toLocaleString() + ' USD'} 
                    formatter={(value, name) => [name === 'price impact' ? `${value}%` : value, name]}
                  />
                  <Legend />
                  {targetPriceImpactValue && <ReferenceLine x={targetPriceImpactValue.pump.value} stroke="red" label="Target Impact" />}
                  {targetPriceValue && targetPriceValue.pump && <ReferenceLine x={targetPriceValue.pump.value} stroke="violet" label="Target Spot" />}
                  {targetTWAPValue && targetTWAPValue.pump && <ReferenceLine x={targetTWAPValue.pump.value} stroke="green" label="Target TWAP" />}
                  <Line name="price impact" type="monotone" dataKey="priceImpact" stroke="#8884d8" activeDot={{ r: 8 }} />
                </LineChart>
                <LineChart
                  width={900}
                  height={450}
                  data={dumpChartData}
                  margin={{
                    top: 5,
                    right: 30,
                    left: 40,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="value" domain={['dataMin', 'dataMax']} type="number" tickFormatter={(tick) => {
                    return numberFormatText(tick)
                  }}/>
                  <YAxis type="number" />
                  <Tooltip
                    content={CustomTooltip}
                    labelFormatter={v => v.toLocaleString() + ' USD'}
                    formatter={(value, name) => [name === 'price impact' ? `${value}%` : value, name]}
                  />
                  <Legend />
                  {targetPriceImpactValue && <ReferenceLine x={targetPriceImpactValue.dump.value} stroke="red" label="Target Impact" />}
                  {targetPriceValue && targetPriceValue.dump && <ReferenceLine x={targetPriceValue.dump.value} stroke="violet" label="Target Spot" />}
                  {targetTWAPValue && targetTWAPValue.dump && <ReferenceLine x={targetTWAPValue.dump.value} stroke="green" label="Target TWAP" />}
                  <Line name="price impact" type="monotone" dataKey="priceImpact" stroke="#82ca9d" activeDot={{ r: 8 }} />
                </LineChart>
              </Box>
            )}
          </>
          
        )
        : (
          <Box sx={{width: '100%', height: '100%'}} display="flex" justifyContent="center" alignItems="center">
            <CircularProgress />
          </Box>
        )}
      <Dialog
        open={errorOpen}
        onClose={handleErrorClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          ERROR
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            {error}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleErrorClose}>OK</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
