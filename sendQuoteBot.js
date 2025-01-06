//CONFIGS
require('dotenv').config()
const config = require('./configA');
const { Web3 } = require('web3');
const WebSocket = require('ws');
const { toWei, toWeiBN } = require('./src/utils/numbers');
const BigNumber = require('bignumber.js');
const axios = require('axios');

//ABIs
const diamondABI = require('./abi/Diamond');
const collateralABI = require('./abi/FakeStableCoinABI');
const { multiAccountABI } = require('./abi/MultiAccount');
const { sendQuoteFunctionAbi, _callAbi } = require('./abi/SendQuote');
const { deallocateFunctionAbi} = require('./abi/Deallocate');
const { requestToClosePositionFunctionAbi } = require('./abi/RequestToClose');

//MUON
const QuotesClient = require('./src/muon/quotes');
const DeallocateClient = require('./src/muon/deallocate');

//WEB3 Contracts
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL));
const collateralContract = new web3.eth.Contract(collateralABI, config.COLLATERAL_ADDRESS);
const diamondContract = new web3.eth.Contract(diamondABI, config.DIAMOND_ADDRESS);
const multiAccountContract = new web3.eth.Contract(multiAccountABI, config.MULTI_ACCOUNT_ADDRESS);

//WEB3 Account
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);

//Helper Function to fetch the market information by symbol (e.g. BTC)
async function fetchMarketSymbolId(url, symbol) {
    if (!url) {
      throw new Error("hedgerUrl is empty");
    }
    const marketsUrl = new URL('contract-symbols', url).href;
    //const errorMessagesUrl = new URL('error_codes', url).href;
  
    try {
      const [marketsResponse] = await Promise.all([
        axios.get(marketsUrl),
        //axios.get(errorMessagesUrl),
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
      //const errorMessages = errorMessagesResponse.data;
      return { markets: filteredMarkets };
    } catch (error) {
      console.error("Error fetching market symbols:", error);
    }
  }
  
  //Helper function to fetch locked params (required for a sendquote)
  async function fetchLockedParams(pair, leverage, hedgerUrl) {
    const url = `${hedgerUrl}get_locked_params/${pair}?leverage=${leverage}`;
  
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
  

//Function to send a Quote
async function executeSendQuote(
    subAccountAddress, 
    positionType, 
    orderType, 
    quantity, 
    slippage, 
    diamondAddress, 
    partyBWhitelist, 
    leverage, 
    hedgerUrl, 
    muonUrls,
    symbol, 
    deadline,
    chainId,
    maxFundingRate) { 
    const { markets } = await fetchMarketSymbolId(hedgerUrl, symbol);
    const marketId = markets[0].id;
    const lockedParams = await fetchLockedParams(markets[0].name, leverage, hedgerUrl); 
    const autoSlippage = markets[0].autoSlippage;
  
    const quotesClient = QuotesClient.createInstance(true);
    const appName = 'symmio';
    const urls = [muonUrls];
  
    //const signatureResult = await getMuonSigImplementation(subAccountAddress, diamondAddress, marketId);
    const signatureResult = await quotesClient.getMuonSig(subAccountAddress, appName, urls, chainId, diamondAddress, marketId);
  
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
    
      const requestPrice = adjustedPrice; 
  
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
  
      const partyBsWhiteList = [partyBWhitelist];
      const symbolId = markets[0].id;
  
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
  
      //LF
      const lfWei = notionalValue
      * (new BigNumber(lockedParams.lf * 100))
      / (new BigNumber(10000)) 
      / (new BigNumber(lockedParams.leverage))
      / (new BigNumber(1e18));
    
      //Maintenance Margins
      const partyAmmWei = notionalValue
      * (new BigNumber(lockedParams.partyAmm * 100))
      / (new BigNumber(10000)) 
      / (new BigNumber(lockedParams.leverage))
      / (new BigNumber(1e18));
    
    
      const partyBmmWei = notionalValue
      * (new BigNumber(lockedParams.partyBmm * 100))
      / (new BigNumber(10000)) 
      / (new BigNumber(lockedParams.leverage))
      / (new BigNumber(1e18));
    
    
      //Max funding and deadline
      const sendQuoteParameters = [
        partyBsWhiteList,
        symbolId,
        positionType,
        orderType,
        requestPrice.toString(), 
        requestedQuantityWei.toString(),
        cvaWei.toString(), 
        lfWei.toString(),
        partyAmmWei.toString(),
        partyBmmWei.toString(), 
        maxFundingRate.toString(), 
        deadline.toString(),
        upnlSigFormatted
    ];

    console.log(sendQuoteParameters);
  
    const encodedSendQuoteData = web3.eth.abi.encodeFunctionCall(sendQuoteFunctionAbi, sendQuoteParameters);
  
    const _callData = [
      subAccountAddress,
      [ encodedSendQuoteData ]
    ];
  
    //const calldataEncoded = web3.eth.abi.encodeFunctionCall(_callAbi, _callData);
    //console.log("callDataEncoded: ", calldataEncoded);
    console.log("Calldata: ", _callData);
  
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
  
        const sendQuoteContractAddress = diamondAddress.toLowerCase();
        const sendQuoteEventSignatureHash = '0x8a17f103c77224ce4d9bab74dad3bd002cd24cf88d2e191e86d18272c8f135dd';
  
        const sendQuoteLogs = sendQuoteReceipt.logs.filter(log => 
          log.address.toLowerCase() === sendQuoteContractAddress &&
          log.topics[0] === sendQuoteEventSignatureHash
        );
  
        if (sendQuoteLogs.length > 0) {
          const quoteIds = sendQuoteLogs.map(log => {
            const decodedData = web3.eth.abi.decodeParameters(['address', 'uint256', 'address[]', 'uint256', 'uint8', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'], log.data);
            console.log("SendQuote ID: ", decodedData[1]); // Assuming quoteId is the second parameter
            return decodedData[1]; // Return the quoteId
          });
          return quoteIds; // Return all the quoteIds found
        } else {
          console.log("No SendQuote event found.");
        }
      } catch (error) {
        console.error('Error sending quote:', error);
      }
  
    } else {
      console.error('Failed to obtain signature:', signatureResult.error);
    }
  }
  

  async function run() {
    const subAccountAddress = '0x33D689034225A67454980c9D91E35C03a4765B30'; //Change this to your sub-account address from addAccount() or made via a frontend
    const quoteDeadline = (Math.floor(Date.now() / 1000) + 86400).toString(); //Deadline is 24 hours after partyA sends a Quote
    const maxFundingRate = web3.utils.toWei('200', 'ether'); //Max Funding Rate
        try {

            console.log("Longing...");
            //Default Config is Arbitrum, change these as necessary in /configs
            const quoteId = await executeSendQuote(
              subAccountAddress, 
              0, // LONG
              1, 
              config.QUANTITY, 
              config.SLIPPAGE, 
              config.DIAMOND_ADDRESS, 
              config.PARTY_B_WHITELIST, 
              config.LEVERAGE, 
              config.HEDGER_URL, 
              process.env.MUON_URL,
              config.SYMBOL, 
              quoteDeadline,
              config.CHAIN_ID,
              maxFundingRate
            );
            console.log("Long Successful! Quote Id: ", quoteId);

        
    } catch (error) {
        console.log("an error occurred");
    }
  }

  run();