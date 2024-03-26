require('dotenv').config();
const { Web3 } = require('web3');
const WebSocket = require('ws');
const { toWei, toWeiBN } = require('./src/utils/numbers');
const BigNumber = require('bignumber.js');
const axios = require('axios');
const config = require('./symmconfig');
const userConfig = require('./userconfig');
const diamondABI = require('./abi/Diamond');
const collateralABI = require('./abi/FakeStableCoinABI');
const { multiAccountABI } = require('./abi/MultiAccount');
const { addAccount } = require('./addAccount'); 
const { sendQuoteFunctionAbi, _callAbi } = require('./abi/SendQuote');
const QuotesClient = require('./src/muon/quotes');
const userconfig = require('./userconfig');
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL));
const collateralContract = new web3.eth.Contract(collateralABI, config.COLLATERAL_ADDRESS);
const diamondContract = new web3.eth.Contract(diamondABI, config.DIAMOND_ADDRESS);
const multiAccountContract = new web3.eth.Contract(multiAccountABI, config.MULTI_ACCOUNT_ADDRESS);
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);

web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);


let accountSetup = false;
function readyToTrade() {
  accountSetup = true;
}



async function mintCollateralTokens(amount) {
  try {
      const mintTx = collateralContract.methods.mint(process.env.WALLET_ADDRESS, amount);
      let gas = await mintTx.estimateGas({from: account.address});
      let gasPrice = await web3.eth.getGasPrice();

      const gasBigInt = BigInt(gas);
      const gasPriceBigInt = BigInt(gasPrice);
      const increasedGasPrice = gasPriceBigInt * BigInt(120) / BigInt(100);
      const gasWithBuffer = gasBigInt + (gasBigInt * BigInt(20) / BigInt(100));

      const data = mintTx.encodeABI();
      const nonce = await web3.eth.getTransactionCount(account.address);

      const tx = {
          from: account.address,
          to: config.COLLATERAL_ADDRESS,
          gas: gasWithBuffer.toString(), 
          gasPrice: increasedGasPrice.toString(), 
          data,
          nonce,
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.WALLET_PRIVATE_KEY);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log("Tokens minted successfully. Transaction hash: ", receipt.transactionHash);
  } catch (error) {
      console.error("Error minting tokens: ", error);
  }
}


async function depositAndAllocateForAccount(accountAddress, amount) {
  try {
      let nonce = await web3.eth.getTransactionCount(account.address, 'latest');
      
      console.log(`Approving ${amount} tokens for the multi-account contract...`);
      const approveTx = collateralContract.methods.approve(config.MULTI_ACCOUNT_ADDRESS, amount);
      const approveGas = await approveTx.estimateGas({ from: account.address });
      const approveGasPrice = await web3.eth.getGasPrice(); 

      await approveTx.send({
          from: account.address,
          gas: approveGas,
          gasPrice: approveGasPrice,
          nonce: nonce
      });

      console.log(`Approval successful. Proceeding to deposit and allocate for account ${accountAddress}...`);
      nonce++;

      const depositTx = multiAccountContract.methods.depositAndAllocateForAccount(accountAddress, amount);
      const depositGas = await depositTx.estimateGas({ from: account.address });
      let depositGasPrice = await web3.eth.getGasPrice();
      const depositReceipt = await depositTx.send({
          from: account.address,
          gas: depositGas,
          gasPrice: depositGasPrice,
          nonce: nonce 
      });

      console.log("Deposit and allocation successful!");
  } catch (error) {
      console.error("An error occurred during the deposit and allocation process:", error);
  }
}

async function getMuonSigImplementation(botAddress) {
  const quotesClient = QuotesClient.createInstance(true);

  if (!quotesClient) {
      console.log('QuotesClient is not enabled or failed to instantiate.');
      return { success: false, error: 'QuotesClient initialization failed' };
  }
  const account = botAddress;
  const appName = 'symmio';
  const urls = [ process.env.MUON_URL ];
  const chainId = 137;
  const contractAddress = config.DIAMOND_ADDRESS;
  const marketId = 4;
  try {
      const requestParams = quotesClient._getRequestParams(account, chainId, contractAddress, marketId);
      //console.info("Requesting data from Muon with params: ", requestParams);
      let response = null; 
      for (const url of urls) {
          try {
              const res = await quotesClient._sendRequest(url, appName, requestParams);
              if (res && res.success) {
                  response = res.result; 
                  //console.log("Full response from Muon:", response);
                  break;
              }
          } catch (error) {
              console.log("Retrying with the next URL...");
          }
      }

      if (!response) {
          throw new Error("Muon request unsuccessful or result is missing");
      }
      const muonResponse = response.result; 

      const { reqId, data, signatures } = muonResponse;
      if (!signatures || signatures.length === 0) {
          throw new Error("Signatures missing in the Muon response");
      }
      const signatureData = signatures[0];
      const generatedSignature = {
          reqId: reqId,
          timestamp: BigInt(data.timestamp),
          upnl: BigInt(data.result.uPnl),
          price: BigInt(data.result.price),
          gatewaySignature: response.result.nodeSignature,
          sigs: {
              signature: BigInt(signatureData.signature),
              owner: signatureData.owner,
              nonce: data.init.nonceAddress, 
          }
      };

      //console.log("Generated Signature: ", generatedSignature);
      return { success: true, signature: generatedSignature };
  } catch (error) {
      console.error('Error getting Muon signature:', error);
      return { success: false, error: error.toString() };
  }
}
async function fetchMarketSymbolId(url, symbol) {
  if (!url) {
    throw new Error("hedgerUrl is empty");
  }
  const marketsUrl = new URL('contract-symbols', url).href;
  const errorMessagesUrl = new URL('error_codes', url).href;

  try {
    const [marketsResponse, errorMessagesResponse] = await Promise.all([
      axios.get(marketsUrl),
      axios.get(errorMessagesUrl),
    ]);
      const filteredMarkets = marketsResponse.data.symbols
      .filter(market => market.symbol === symbol)
      .map(market => ({
          id: market.symbol_id,
          name: market.name,
          symbol: market.symbol,
          asset: market.asset,
          pricePrecision: market.price_precision,
          quantityPrecision: market.quantity_precision,
          isValid: market.is_valid,
          minAcceptableQuoteValue: market.min_acceptable_quote_value,
          minAcceptablePortionLF: market.min_acceptable_portion_lf,
          tradingFee: market.trading_fee,
          maxLeverage: market.max_leverage,
          maxNotionalValue: market.max_notional_value,
          maxFundingRate: market.max_funding_rate,
          rfqAllowed: market.rfq_allowed,
          hedgerFeeOpen: market.hedger_fee_open,
          hedgerFeeClose: market.hedger_fee_close,
          autoSlippage: (60 / market.max_leverage / 100) + 1,
      }));
    const errorMessages = errorMessagesResponse.data;
    return { markets: filteredMarkets, errorMessages };
  } catch (error) {
    console.error("Error fetching market symbols:", error);
  }
}

async function fetchLockedParams(pair, leverage) {
  const url = `${config.HEDGER_URL}get_locked_params/${pair}?leverage=${leverage}`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    const output = {
      cva: data.cva,
      partyAmm: data.partyAmm,
      lf: data.lf,
      leverage: data.leverage,
      partyBmm: data.partyBmm
    };

    return output;
  } catch (error) {
    console.error('Error fetching data:', error);
  }

}

async function executeSendQuoteMarket(botAddress, positionType, quantity, slippage) {
  const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, userConfig.SYMBOL);
  const lockedParams = await fetchLockedParams(markets[0].name, userConfig.LEVERAGE);
  const autoSlippage = markets[0].autoSlippage;
  //const pricePrecision = markets[0].pricePrecision;

  const signatureResult = await getMuonSigImplementation(botAddress);
  let adjustedPrice = BigInt(signatureResult.signature.price);
  let numericSlippage;

  if (signatureResult.success) {
    if (slippage === "auto") {
      const autoSlippageNumerator = BigInt(Math.floor(autoSlippage * 1000));
      const autoSlippageDenominator = BigInt(1000); 
      adjustedPrice = positionType === 1
        ? (adjustedPrice * autoSlippageDenominator) / autoSlippageNumerator
        : (adjustedPrice * autoSlippageNumerator) / autoSlippageDenominator;
    } else {
      numericSlippage = Number(slippage); 
      if (isNaN(numericSlippage)) {
        console.error("Slippage must be a number or 'auto'");
        return;
      }
      const spSigned = positionType === 1 ? numericSlippage : -numericSlippage;
      const slippageFactored = (100 - spSigned) / 100;
      const slippageFactorBigInt = BigInt(Math.floor(slippageFactored * 100));
      adjustedPrice = (adjustedPrice * slippageFactorBigInt) / BigInt(100);
    }
  
    const requestedPrice = adjustedPrice;

    const { reqId, timestamp, upnl, price, gatewaySignature, sigs } = signatureResult.signature;
    console.log("Price of asset: ", price);
    if (typeof reqId === 'undefined' || !reqId.startsWith('0x')) {
      console.error("reqId is undefined or not a hex string:", reqId);
    }
    if (typeof gatewaySignature === 'undefined' || !gatewaySignature.startsWith('0x')) {
      console.error("gatewaySignature is undefined or not a hex string:", gatewaySignature);
    }


    const upnlSigFormatted = {
        reqId: web3.utils.hexToBytes(reqId),
        timestamp: timestamp.toString(),
        upnl: upnl.toString(),
        price: price.toString(),
        gatewaySignature: web3.utils.hexToBytes(gatewaySignature),
        sigs: {
            signature: sigs.signature.toString(),
            owner: sigs.owner,
            nonce: sigs.nonce,
        }
    };

    const partyBsWhiteList = [config.PARTY_B_WHITELIST];
    const symbolId = markets[0].id;
    const orderType = 1; // MARKET order


    //QUANTITY
    const requestedQuantityWei = web3.utils.toWei(quantity.toString(), 'ether');
    console.log("requestedQuantityWei:", requestedQuantityWei);
    const adjustedPriceStr = adjustedPrice.toString();

    const notionalValue = new BigNumber(requestedQuantityWei).multipliedBy(new BigNumber(adjustedPriceStr));
    console.log("notionalValue:", notionalValue.toString());
  
    
    //CVA
    const cvaWei = notionalValue
    * (new BigNumber(lockedParams.cva * 100))
    / (new BigNumber(10000)) 
    / (new BigNumber(lockedParams.leverage))
    / (new BigNumber(1e18));

    console.log("cvaWei: ", cvaWei);


    //LF
    const lfWei = notionalValue
    * (new BigNumber(lockedParams.lf * 100))
    / (new BigNumber(10000)) 
    / (new BigNumber(lockedParams.leverage))
    / (new BigNumber(1e18));
  
    console.log("lfWei: ", lfWei);

    const partyAmmWei = notionalValue
    * (new BigNumber(lockedParams.partyAmm * 100))
    / (new BigNumber(10000)) 
    / (new BigNumber(lockedParams.leverage))
    / (new BigNumber(1e18));
  
    console.log("partyAmm: ", partyAmmWei);
  
    const partyBmmWei = notionalValue
    * (new BigNumber(lockedParams.partyBmm * 100))
    / (new BigNumber(10000)) 
    / (new BigNumber(lockedParams.leverage))
    / (new BigNumber(1e18));
  
    console.log("partyBmm: ", partyBmmWei);
  
    //Max funding and deadline
    const maxFundingRate = web3.utils.toWei('200', 'ether'); 
    const deadline = (Math.floor(Date.now() / 1000) + 120).toString();
    const sendQuoteParameters = [
      partyBsWhiteList,
      symbolId,
      positionType,
      orderType,
      requestedPrice.toString(), 
      requestedQuantityWei.toString(),
      cvaWei.toString(), 
      lfWei.toString(),
      partyAmmWei.toString(),
      partyBmmWei.toString(), 
      maxFundingRate.toString(), 
      deadline.toString(),
      upnlSigFormatted
  ];

  const encodedSendQuoteData = web3.eth.abi.encodeFunctionCall(sendQuoteFunctionAbi, sendQuoteParameters);

  const _callData = [
    botAddress,
    [ encodedSendQuoteData ]
  ];


    try {
      const bufferPercentage = 0.20;
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
      const sendQuoteGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
      console.log("Estimated Gas: ", sendQuoteGasEstimate);
            const adjustedGasLimit = sendQuoteGasEstimate + (sendQuoteGasEstimate * bufferFactor / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);
      const sendQuotePrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", sendQuotePrice);
            const sendQuoteReceipt = await multiAccountContract.methods._call(..._callData).send({
        from: account.address,
        gas: adjustedGasLimit.toString(), 
        gasPrice: sendQuotePrice.toString() 
      });
      
  console.log('Transaction receipt:', sendQuoteReceipt);

    } catch (error) {
        console.error('Error sending quote:', error);
    }
  } else {
    console.error('Failed to obtain signature:', signatureResult.error);
  }
}

function closeAndExit(binanceWs, error = null) {
  if (error) {
      console.error("Failed to execute quote:", error);
  }
  if (binanceWs && binanceWs.close) {
      binanceWs.close();
      console.log("WebSocket Closed");
  }
  console.log("Bot Closed");
  process.exit(0);
}

async function startPriceMonitoring(botAddress) {
  let binanceWs; 
  try {
      const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, userConfig.SYMBOL);
      if (markets.length === 0) {
          console.error("No markets found for the specified symbol.");
          return;
      }
      const binanceId = markets[0].name;
      console.log("Market Name:", binanceId);
      const marketId = markets[0].id;
      console.log("Market ID:", marketId);
      binanceWs = new WebSocket('wss://fstream.binance.com/stream?streams=' + binanceId.toLowerCase() + '@ticker');
      binanceWs.on('open', function open() {
          console.log('Connected to Binance WebSocket');
      });
      binanceWs.on('message', (message) => {
          handleMessage(message, botAddress, marketId, binanceWs); // Pass WebSocket instance for handling
      });
  } catch (error) {
      console.error("Error setting up price monitoring:", error);
      closeAndExit(binanceWs, error); 
  }
}

let actionTaken = false;
async function handleMessage(message, botAddress, marketId, binanceWs) {
  if (actionTaken) return; /
  const data = JSON.parse(message);
  const price = parseFloat(data.data.c);
  console.log(`Current Price of ${userConfig.SYMBOL}: `, price, "Lower:", userConfig.LOWER_THRESHOLD_PRICE, "Upper:", userConfig.UPPER_THRESHOLD_PRICE);

  if (price > userConfig.UPPER_THRESHOLD_PRICE && accountSetup) {
      console.log(`Price over threshold: ${price}`);
      try {
          console.log("Shorting...");
          await executeSendQuoteMarket(botAddress, 1, userConfig.QUANTITY, "auto");
          actionTaken = true; // Prevent further actions
          closeAndExit(binanceWs);
      } catch (error) {
          closeAndExit(binanceWs, error);
      }
  } else if (price < userConfig.LOWER_THRESHOLD_PRICE && accountSetup) {
      console.log(`Price under threshold: ${price}`);
      try {
          console.log("Longing...");
          await executeSendQuoteMarket(botAddress, 0, userConfig.QUANTITY, "auto"); 
          actionTaken = true; 
          closeAndExit(binanceWs);
      } catch (error) {
          closeAndExit(binanceWs, error);
      }
  }
}

async function testFunction(slippage, positionType) {
  const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, userConfig.SYMBOL);
  const lockedParams = await fetchLockedParams(markets[0].name, userConfig.LEVERAGE);
  console.log(markets[0].name);
  console.log(markets[0].symbol);
  const autoSlippage = markets[0].autoSlippage;
  let adjustedPrice = BigInt(651569270000000000);
  let numericSlippage; 
  console.log(autoSlippage);
  if (slippage === "auto") {
    const autoSlippageNumerator = BigInt(Math.floor(autoSlippage * 1000)); 
    const autoSlippageDenominator = BigInt(1000);
    adjustedPrice = positionType === 1
      ? (adjustedPrice * autoSlippageDenominator) / autoSlippageNumerator
      : (adjustedPrice * autoSlippageNumerator) / autoSlippageDenominator;
  } else {
    numericSlippage = Number(slippage); 
    if (isNaN(numericSlippage)) {
      console.error("Slippage must be a number or 'auto'");
      return;
    }
    const spSigned = positionType === 1 ? numericSlippage : -numericSlippage;
    const slippageFactored = (100 - spSigned) / 100;
    const slippageFactorBigInt = BigInt(Math.floor(slippageFactored * 100));
    adjustedPrice = (adjustedPrice * slippageFactorBigInt) / BigInt(100);
  }

  const requestedPrice = adjustedPrice;
  console.log( requestedPrice.toString());
  const testPrice = 636100000000000000;
  const testQuantity = 163.1;
  const requestedQuantityWei = web3.utils.toWei(testQuantity.toString(), 'ether');
  const notionalValue = new BigNumber(requestedQuantityWei * testPrice);

  const cvaWei = notionalValue
  * (new BigNumber(lockedParams.cva * 100))
  / (new BigNumber(10000)) 
  / (new BigNumber(lockedParams.leverage))
  / (new BigNumber(1e18));

  console.log("cvaWei: ", cvaWei);

  const lfWei = notionalValue
  * (new BigNumber(lockedParams.lf * 100))
  / (new BigNumber(10000)) 
  / (new BigNumber(lockedParams.leverage))
  / (new BigNumber(1e18));

  console.log("lfWei: ", lfWei);

  
  const partyAmmWei = notionalValue
  * (new BigNumber(lockedParams.partyAmm * 100))
  / (new BigNumber(10000)) 
  / (new BigNumber(lockedParams.leverage))
  / (new BigNumber(1e18));

  console.log("partyAmm: ", partyAmmWei);

  const partyBmmWei = notionalValue
  * (new BigNumber(lockedParams.partyBmm * 100))
  / (new BigNumber(10000)) 
  / (new BigNumber(lockedParams.leverage))
  / (new BigNumber(1e18));

  console.log("partyBmm: ", partyBmmWei);
}

async function run() {
try {
    const tradingBotAddress = await addAccount(userConfig.ACCOUNT_NAME);
    const amountToMint = web3.utils.toWei(userConfig.DEPOSIT_AMOUNT, 'ether'); 
    await mintCollateralTokens(amountToMint);
    await depositAndAllocateForAccount(tradingBotAddress, amountToMint);
    console.log(tradingBotAddress);
    readyToTrade(); //Trading is now allowed...
    console.log("Bot setup successful. ");
    await startPriceMonitoring(tradingBotAddress);
    //await testFunction("auto", 1);
  } catch (error) {
      console.error("Error in bot setup:", error);
  }
}

run().then(() => console.log("Bot is now monitoring prices for trading signals...")).catch(console.error);
