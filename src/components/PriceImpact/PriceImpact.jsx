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

import { CSVLink } from "react-csv";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, } from 'recharts';
import { DefaultTooltipContent } from 'recharts/lib/component/DefaultTooltipContent';
import { sortBy } from "lodash";
import { matchSorter } from "match-sorter";

import { getCurrPrice, getPumpAndDump, numberFormatText, binarySearchTradeValues, formatPrice, getPoolFees } from '../../utils';



export const PriceImpact = () => {
  const [tokenList, setTokenList] = useState([]);
  const [symbol, setSymbol] = useState('USDC');
  const [fee, setFee] = useState(3000);
  const [ethPrice, setEthPrice] = useState(0);
  const [trades, setTrades] = useState();
  const [currPrice, setCurrPrice] = useState();
  const [poolFees, setPoolFees] = useState([]);

  const [targetPriceImpact, setTargetPriceImpact] = useState(90);
  const [targetPriceImpactLoading, setTargetPriceImpactLoading] = useState(false);
  const [targetPriceImpactValue, setTargetPriceImpactValue] = useState();

  const [targetETHPrice, setTargetETHPrice] = useState('');
  const [targetUSDPrice, setTargetUSDPrice] = useState('');
  const [targetPriceLoading, setTargetPriceLoading] = useState(false);
  const [targetPriceValue, setTargetPriceValue] = useState();



  const cancelPriceImpactSearch = useRef(() => {});
  const cancelPriceSearch = useRef(() => {});
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
  }

  useEffect(() => {
    Promise.all([
      axios.get('https://raw.githubusercontent.com/euler-xyz/euler-tokenlist/master/euler-tokenlist.json'),
      axios.get('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD'),
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

    getCurrPrice(market, fee).then(price => {
      setCurrPrice(price);
      setTargetETHPrice(formatPrice(price, getToken()));
      setTargetUSDPrice(formatPrice(price, getToken()) * ethPrice);
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
      console.log('res: ', res);
      setTrades({
        pump: res.map(r => r.pump),
        dump: res.map(r => r.dump),
      });
    }
    exec();
  }, [symbol, fee, poolFees, tokenList, ethPrice, currPrice && currPrice.toString()]);

  const onTargetPriceImpact = () => {
    cancelPriceImpactSearch.current();

    setTargetPriceImpactValue(null);
    setTargetPriceImpactLoading(true);
    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }
    const { promise, cancel } = binarySearchTradeValues(currPrice, market, fee, ethPrice, targetPriceImpact, 'priceImpact');
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
        if (e !== 'cancelled') throw e;
      })
    return () => cancelPriceImpactSearch.current();
  };

  const onTargetPrice = () => {
    cancelPriceSearch.current();

    setTargetPriceValue(null);
    setTargetPriceLoading(true);
    const token = getToken();
    const market = {
      symbol,
      underlying: token.address,
      decimals: token.decimals,
    }
    const { promise, cancel } = binarySearchTradeValues(currPrice, market, fee, ethPrice, targetETHPrice, 'price');
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
        if (e !== 'cancelled') throw e;
      })

    return () => cancelPriceSearch.current();
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

  const handleDownload = () => {
    csvLink.current.link.click();
  }

  const handleTargetPriceImpact = (event) => {
    setTargetPriceImpact(event.target.value);
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
      ];
  
      return <DefaultTooltipContent {...props} payload={newPayload} />;
    }
  
    // we just render the default
    return <DefaultTooltipContent {...props} />;
  };

  const filterOptions = (options, { inputValue }) => {
    return matchSorter(options, inputValue, { keys: ["name", "symbol", "address"] })
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
              label="Target Price ETH"
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
              id="target-price-usd"
              label="Target Price USD"
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
        <Button
          sx={{ minWidth: 120, width: 200, margin: 1, }}
          disabled={!trades}
          variant="contained"
          endIcon={<DownloadIcon />}
          onClick={handleDownload}
        >
          Download csv
        </Button>
        {trades && (
          <CSVLink
            headers={['VALUE', 'PUMP PRICE IMPACT', 'PUMP PRICE', 'DUMP PRICE IMPACT', 'DUMP PRICE']}
            data={getStandardTrades().map(({ pump, dump }) => [pump.value, pump.priceImpact, pump.price, dump.priceImpact, dump.price])}
            target="_blank"
            filename={`${symbol}_${fee}.csv`}
            ref={csvLink}
          />
        )}
      </Box>
      {trades
        ? (
          <>
            <Box display="flex" flexDirection="column">
              <Box display="flex" mt={1} mb={1}>
                {getToken().address}
                <br/>
                Price USD: {formatPrice(currPrice, getToken()) * ethPrice}
                <br/>
                Price ETH: {formatPrice(currPrice, getToken())}
              </Box>
              <Box display="flex" >
                <TableContainer component={Paper}>
                  <Table sx={{ width: 400 }} size="small" aria-label="simple table">
                    <TableHead>
                      <TableRow>
                        <TableCell>USD VALUE</TableCell>
                        <TableCell align="right">PUMP PERCENTAGE</TableCell>
                        <TableCell align="right">DUMP PERCENTAGE</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getStandardTrades().map((row) => (
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
            </Box>
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
                {targetPriceImpactValue && <ReferenceLine x={targetPriceImpactValue.pump.value} stroke="red" label="Target Price Impact" />}
                {targetPriceValue && targetPriceValue.pump && <ReferenceLine x={targetPriceValue.pump.value} stroke="violet" label="Target Price" />}
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
                {targetPriceImpactValue && <ReferenceLine x={targetPriceImpactValue.dump.value} stroke="red" label="Target Price Impact" />}
                {targetPriceValue && targetPriceValue.dump && <ReferenceLine x={targetPriceValue.dump.value} stroke="violet" label="Target Price" />}
                <Line name="price impact" type="monotone" dataKey="priceImpact" stroke="#82ca9d" activeDot={{ r: 8 }} />
              </LineChart>
            </Box>
          </>
          
        )
        : (
          <Box sx={{width: '100%', height: '100%'}} display="flex" justifyContent="center" alignItems="center">
            <CircularProgress />
          </Box>
        )}
    </Box>
  );
};
