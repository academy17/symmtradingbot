require('dotenv').config();
const { Web3 } = require('web3');
const WebSocket = require('ws');

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
      const gas = await mintTx.estimateGas({from: account.address});
      const gasPrice = await web3.eth.getGasPrice();

      const data = mintTx.encodeABI();
      const nonce = await web3.eth.getTransactionCount(account.address);

      const tx = {
          from: account.address,
          to: config.COLLATERAL_ADDRESS,
          gas,
          gasPrice,
          data,
          nonce,
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, process.env.WALLET_PRIVATE_KEY);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log("200 FUSD Minted.");
  } catch (error) {
      console.error("Error minting FUSD: ", error);
  }
}
async function depositAndAllocateForAccount(accountAddress, amount) {  
  try {
      let nonce = await web3.eth.getTransactionCount(account.address, 'latest');
      console.log(`Approving ${userConfig.DEPOSIT_AMOUNT} tokens for the multiaccount contract...`);
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
      nonce += BigInt(1);
      const depositTx = multiAccountContract.methods.depositAndAllocateForAccount(accountAddress, amount);
      const depositGas = await depositTx.estimateGas({ from: account.address });
      const depositGasPrice = await web3.eth.getGasPrice();

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
          autoSlippage: 60 / market.max_leverage / 100 + 1,
      }));
    const errorMessages = errorMessagesResponse.data;
    //console.log({ filteredMarkets });
    return { markets: filteredMarkets, errorMessages };
  } catch (error) {
    console.error("Error fetching market symbols:", error);
  }
}

async function executeSendQuoteMarket(botAddress, symbolId, positionType) {
  const signatureResult = await getMuonSigImplementation(botAddress);

  if (signatureResult.success) {
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

    console.log("Muon Request successful, forwarding formatted signature to contract... ", upnlSigFormatted);
    const partyBsWhiteList = [config.PARTY_B_WHITELIST];
    const symbolId = 4;
    const positionType = 1; // Assuming 1 represents the correct position type in your contract's enum
    const orderType = 1; // MARKET order
    // Assuming these values are meant to be in ether for conversion purposes
    const quantity = web3.utils.toWei('161.5', 'ether'); // Example conversion, adjust according to actual unit
    const cva = web3.utils.toWei('0.77055849', 'ether'); // Adjusted for example purposes
    const lf = web3.utils.toWei('0.51370566', 'ether'); // Adjusted for example purposes
    const partyAmm = web3.utils.toWei('97.50528585', 'ether'); // Adjusted for example purposes
    const partyBmm = '0'; // No conversion needed
    const maxFundingRate = web3.utils.toWei('200', 'ether'); // Assuming this was meant as a conversion from Ether to Wei
    const deadline = (Math.floor(Date.now() / 1000) + 120).toString(); // Deadline adjusted for example
    

    const sendQuoteParameters = [
      partyBsWhiteList,
      symbolId,
      positionType,
      orderType,
      price.toString(), 
      quantity.toString(),
      cva.toString(), 
      lf.toString(),
      partyAmm.toString(),
      partyBmm.toString(), 
      maxFundingRate.toString(), 
      deadline.toString(),
      upnlSigFormatted
  ];

  //console.log("sendQuoteParameters: ", sendQuoteParameters);
  const encodedSendQuoteData = web3.eth.abi.encodeFunctionCall(sendQuoteFunctionAbi, sendQuoteParameters);
  //console.log("encoded data: ", [encodedSendQuoteData]);

  const _callData = [
    botAddress,
    [ encodedSendQuoteData ]
  ];
  
  console.log("Calldata: ", _callData);

    try {
      const bufferPercentage = 0.20; // 20% buffer
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100)); // Convert 20% to BigInt, and use 100 as base to avoid floating point.
      
      // Calculate the adjustedGasLimit as a BigInt
      const sendQuoteGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
      console.log("Estimated Gas: ", sendQuoteGasEstimate);
      
      // Adjust the gas limit by adding a buffer, making sure to convert everything involved to BigInt.
      const adjustedGasLimit = sendQuoteGasEstimate + (sendQuoteGasEstimate * bufferFactor / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);
      
      const sendQuotePrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", sendQuotePrice);
      
      // When using the adjusted values, ensure they are passed in a format accepted by your methods (likely as strings for web3)
      const sendQuoteReceipt = await multiAccountContract.methods._call(..._callData).send({
        from: account.address,
        gas: adjustedGasLimit.toString(), // Convert BigInt to string for web3
        gasPrice: sendQuotePrice.toString() // Convert BigInt to string for web3
      });
      
  console.log('Transaction receipt:', sendQuoteReceipt);

    } catch (error) {
        console.error('Error sending quote:', error);
    }
  } else {
    console.error('Failed to obtain signature:', signatureResult.error);
  }
}

async function startPriceMonitoring(botAddress) {
  try {
      const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, userConfig.SYMBOL);
      if (markets.length === 0) {
          console.error("No markets found for the specified symbol.");
          return;
      }
      const binanceId = markets[0].name;
      const marketId = markets[0].id;
      //console.log("marketId: ", marketId);
      const binanceWs = new WebSocket('wss://fstream.binance.com/stream?streams=' + binanceId.toLowerCase() + '@ticker');
      binanceWs.on('open', function open() {
          console.log('Connected to Binance WebSocket');
      });

      binanceWs.on('message', (message) => {
          handleMessage(message, botAddress, marketId);
      });
  } catch (error) {
      console.error("Error setting up price monitoring:", error);
  }
}

async function handleMessage(message, botAddress, marketId) {
  const data = JSON.parse(message);
  const price = parseFloat(data.data.c);
  console.log("Current Price of ETH: ", price, "Lower:", userConfig.LOWER_THRESHOLD_PRICE, "Upper:", userConfig.UPPER_THRESHOLD_PRICE);
  
  // Function to cleanly close resources and exit
  function closeAndExit(error) {
    if (error) {
      console.error("Failed to execute quote:", error);
    }
    if (binanceWs && binanceWs.close) {
      binanceWs.close();
    }
    console.log("Bot Closed");
    process.exit(0);
  }

  if (price > userConfig.UPPER_THRESHOLD_PRICE && accountSetup) {
    console.log(`Price over threshold: ${price}`);
    try {
      console.log("Shorting...");
      await executeSendQuoteMarket(botAddress, marketId, 1); // Market shorting if price goes above a certain threshold
      closeAndExit();
    } catch (error) {
      closeAndExit(error);
    }
  } else if (price < userConfig.LOWER_THRESHOLD_PRICE && accountSetup) {
    console.log(`Price under threshold: ${price}`);
    try {
      console.log("Longing...");
      await executeSendQuoteMarket(botAddress, marketId, 0); // Market longing if price goes below a certain threshold
      closeAndExit();
    } catch (error) {
      closeAndExit(error);
    }
  }
}

async function run() {
try {

    //const tradingBotAddress = await addAccount(userConfig.ACCOUNT_NAME);
    const tradingBotAddress = '0xd4BF55F4c75ebcD11E99AB55babe869bd0D5d3c9';
    //const amountToMint = web3.utils.toWei(userConfig.DEPOSIT_AMOUNT, 'ether'); 
    //await mintCollateralTokens(amountToMint);
    //await depositAndAllocateForAccount(tradingBotAddress, amountToMint);
    console.log(tradingBotAddress);
    readyToTrade(); //Trading is now allowed...
    console.log("Bot setup successful. ");
    await startPriceMonitoring(tradingBotAddress);
  } catch (error) {
      console.error("Error in bot setup:", error);
  }
}

run().then(() => console.log("Bot is now monitoring prices for trading signals...")).catch(console.error);
