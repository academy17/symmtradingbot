require('dotenv').config()

//CONFIG
const config = {

  // SYMM Config values
  COLLATERAL_SYMBOL: "",
  COLLATERAL_DECIMALS: 0,
  COLLATERAL_ADDRESS: "",

  DIAMOND_ADDRESS: "",
  MULTI_ACCOUNT_ADDRESS: "",
  PARTY_B_WHITELIST: "",
  SIGNATURE_STORE_ADDRESS: "",

  MULTICALL3_ADDRESS: "",
  USDC_ADDRESS: "",
  WRAPPED_NATIVE_ADDRESS: "",
  ANALYTICS_SUBGRAPH_ADDRESS: "",
  ORDER_HISTORY_SUBGRAPH_ADDRESS: "",
  HEDGER_URL: '',

// User Config values
ACCOUNT_NAME: "",
DEPOSIT_AMOUNT: 0, // Amount of Tokens
LOWER_THRESHOLD_PRICE: 0, // Lower Price (float)
UPPER_THRESHOLD_PRICE: 0, // Upper Price (float)
SYMBOL: '', // 'ETH'
QUANTITY: 0, // Units of Requested Quantity
LEVERAGE: 0, // Leverage
ORDERTYPE: 0//
}


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

//Trade-ready
let accountSetup = false;
function readyToTrade() {
  accountSetup = true;
}

//Adding a Sub-account
async function addAccount(accountName) {
  if (!accountName) {
    console.error("Account name is not provided.");
    return;
  }

  try {
    const currentGasPrice = await web3.eth.getGasPrice();
    const increasedGasPriceBigInt = BigInt(currentGasPrice) * BigInt(120) / BigInt(100);
    const gasEstimate = await multiAccountContract.methods.addAccount(accountName).estimateGas();
    const gasEstimateBigInt = BigInt(gasEstimate);
    const gasLimitWithBuffer = gasEstimateBigInt + (gasEstimateBigInt * BigInt(20) / BigInt(100));
    console.log("Gas estimate with buffer: ", gasLimitWithBuffer.toString());

    const receipt = await multiAccountContract.methods.addAccount(accountName).send({
      from: account.address,
      gas: gasLimitWithBuffer.toString(), 
      gasPrice: increasedGasPriceBigInt.toString()
    });


    if (receipt.events.AddAccount) {
      const event = receipt.events.AddAccount.returnValues;
      console.log("Account Created. Address: ", event.account);
      return event.account;
    } else {
      console.log("No AddAccount event found.");
    }
  } catch (error) {
    console.error("Failed to add account:", error);
  }
}


//Minting Collateral (for test purposes)
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

async function getLatestNonce() {
  return await web3.eth.getTransactionCount(process.env.WALLET_ADDRESS, 'latest');
}

// Deposit and allocate
async function depositAndAllocateForAccount(accountAddress, amount) {
  try {
      let txNonce = await getLatestNonce();

      console.log(`Approving ${amount} tokens for the multi-account contract...`);
      const approveTx = collateralContract.methods.approve(config.MULTI_ACCOUNT_ADDRESS, amount);
      const approveGas = await approveTx.estimateGas({ from: process.env.WALLET_ADDRESS });
      const approveGasPrice = await web3.eth.getGasPrice();

      const bufferPercentage = 1;
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
      const adjustedApproveGasLimit = approveGas + (approveGas * bufferFactor / BigInt(100));

      await approveTx.send({
          from: process.env.WALLET_ADDRESS,
          gas: adjustedApproveGasLimit.toString(),
          gasPrice: approveGasPrice,
          nonce: txNonce
      });

      console.log(`Approval successful. Depositing for Account: ${accountAddress}...`);

      let txNonceDeposit = await getLatestNonce();

    const depositTx = multiAccountContract.methods.depositAndAllocateForAccount(accountAddress, amount);
    const depositGas = await depositTx.estimateGas({ from: process.env.WALLET_ADDRESS });
    const depositGasPrice = await web3.eth.getGasPrice();

    const adjustedDepositGasLimit = depositGas + (depositGas * bufferFactor / BigInt(100));

    const depositReceipt = await depositTx.send({
      from: process.env.WALLET_ADDRESS,
      gas: adjustedDepositGasLimit.toString(),
      gasPrice: depositGasPrice,
      nonce: txNonceDeposit
    });

    console.log("Deposit and allocation successful!");
  } catch (error) {
    console.error("An error occurred during the deposit and allocation process:", error);
  }
}

//Deallocate
async function deallocateForAccount(accountAddress, amount) {
  console.log("Deallocating...");
  const deallocateClient = DeallocateClient.createInstance(true);

  if (!deallocateClient) {
    console.log('DeallocateClient is not enabled or failed to instantiate.');
    return { success: false, error: 'DeallocateClient initialization failed' };
  }

  const account = accountAddress;
  const appName = 'symmio';
  const urls = [process.env.MUON_URL];
  const chainId = 137;
  const contractAddress = config.DIAMOND_ADDRESS;

  try {
    const signatureResult = await deallocateClient.getMuonSig(account, appName, urls, chainId, contractAddress);

    if (signatureResult.success) {
      const { reqId, timestamp, upnl, gatewaySignature, sigs } = signatureResult.signature;

      const upnlSigFormatted = {
        reqId: web3.utils.hexToBytes(reqId),
        timestamp: timestamp.toString(),
        upnl: upnl.toString(),
        gatewaySignature: web3.utils.hexToBytes(gatewaySignature),
        sigs: {
          signature: sigs.signature.toString(),
          owner: sigs.owner,
          nonce: sigs.nonce,
        }
      };

      console.log(`Deallocating ${amount} tokens for account ${accountAddress}...`);

      const deallocateParameters = [BigInt(amount), upnlSigFormatted];
      const encodedDeallocateData = web3.eth.abi.encodeFunctionCall(deallocateFunctionAbi, deallocateParameters);

      const _callData = [accountAddress, [encodedDeallocateData]];

      // Estimate gas for the _call method
      const deallocateGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
      console.log("Estimated Gas: ", deallocateGasEstimate);

      const bufferPercentage = 0.50;
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
      const adjustedGasLimit = deallocateGasEstimate + (deallocateGasEstimate * bufferFactor / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);

      const deallocateGasPrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", deallocateGasPrice);

      const deallocateReceipt = await multiAccountContract.methods._call(..._callData).send({
        from: process.env.WALLET_ADDRESS,
        gas: adjustedGasLimit.toString(),
        gasPrice: deallocateGasPrice.toString()
      });

      console.log("Deallocate successful!");
      return { success: true, receipt: deallocateReceipt };
    } else {
      throw new Error(signatureResult.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error during deallocation:', error);
    return { success: false, error: error.toString() };
  }
}

async function withdrawFromAccount(accountAddress, amount) {
  try {
    console.log(`Withdrawing ${amount} tokens from account ${accountAddress}...`);

    // Retrieve the latest nonce dynamically before sending the transaction
    let txNonce = await getLatestNonce();

    // Estimate gas for the withdrawFromAccount method
    const withdrawTx = multiAccountContract.methods.withdrawFromAccount(accountAddress, amount);
    const withdrawGasEstimate = await withdrawTx.estimateGas({ from: process.env.WALLET_ADDRESS });
    console.log("Estimated Gas: ", withdrawGasEstimate);

    const bufferPercentage = 0.20;
    const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
    const adjustedGasLimit = withdrawGasEstimate + (withdrawGasEstimate * bufferFactor / BigInt(100));
    console.log("Adjusted Gas Limit: ", adjustedGasLimit);

    const withdrawGasPrice = await web3.eth.getGasPrice();
    console.log("Current Gas Price: ", withdrawGasPrice);

    // Send the withdrawFromAccount transaction
    const withdrawReceipt = await withdrawTx.send({
      from: account.address,
      gas: adjustedGasLimit.toString(),
      gasPrice: withdrawGasPrice.toString(),
      nonce: txNonce
    });

    console.log("Withdraw successful!", withdrawReceipt);
    return { success: true, receipt: withdrawReceipt };
  } catch (error) {
    console.error('Error during withdrawal:', error);
    return { success: false, error: error.toString() };
  }
}


//Get a signature for a sendQuote
async function getMuonSigImplementation(subAccountAddress) {
  const quotesClient = QuotesClient.createInstance(true);

  if (!quotesClient) {
      console.log('QuotesClient is not enabled or failed to instantiate.');
      return { success: false, error: 'QuotesClient initialization failed' };
  }

  const account = subAccountAddress;
  const appName = 'symmio';
  const urls = [process.env.MUON_URL];
  const chainId = 137;
  const contractAddress = config.DIAMOND_ADDRESS;
  const marketId = 4;

  try {
    const result = await quotesClient.getMuonSig(account, appName, urls, chainId, contractAddress, marketId);

    if (result.success) {
      console.log('Successfully retrieved Muon signature:', result.signature);
      return { success: true, signature: result.signature };
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error getting Muon signature:', error);
    return { success: false, error: error.toString() };
  }
}

//Helper Function to fetch the market by symbol (e.g. BTC)
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

//Helper function to fetch locked params (required for a sendquote)
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

async function executeSendQuoteMarket(subAccountAddress, positionType, quantity, slippage) {
  const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, config.SYMBOL);
  const lockedParams = await fetchLockedParams(markets[0].name, config.LEVERAGE);
  const autoSlippage = markets[0].autoSlippage;
  //const pricePrecision = markets[0].pricePrecision;

  const signatureResult = await getMuonSigImplementation(subAccountAddress);
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
  
  
    //console.log("partyAmm: ", partyAmmWei);
  
    
    //console.log("partyAmm: ", partyAmmWei);
  
    const partyBmmWei = notionalValue
    * (new BigNumber(lockedParams.partyBmm * 100))
    / (new BigNumber(10000)) 
    / (new BigNumber(lockedParams.leverage))
    / (new BigNumber(1e18));
  
  
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
    subAccountAddress,
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
      
  //console.log('Transaction receipt:', sendQuoteReceipt);

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

async function startPriceMonitoring(subAccountAddress) {
  let binanceWs; 
  try {
      const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, config.SYMBOL);
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
          handleMessage(message, subAccountAddress, marketId, binanceWs); // Pass WebSocket instance for handling
      });
  } catch (error) {
      console.error("Error setting up price monitoring:", error);
      closeAndExit(binanceWs, error); 
  }
}

let actionTaken = false;
let debouncer;

async function handleMessage(message, subAccountAddress, marketId, binanceWs) {
    if (actionTaken) return;

    const data = JSON.parse(message);
    const price = parseFloat(data.data.c);
    console.log(`Current Price of ${config.SYMBOL}: `, price, "Lower:", config.LOWER_THRESHOLD_PRICE, "Upper:", config.UPPER_THRESHOLD_PRICE);

    if (price > config.UPPER_THRESHOLD_PRICE && accountSetup && !actionTaken) {
        console.log(`Price over threshold: ${price}`);
        actionTaken = true;  // Set actionTaken true immediately before the async operation
        try {
            console.log("Shorting...");
            await executeSendQuoteMarket(subAccountAddress, 1, config.QUANTITY, "auto");
            closeAndExit(binanceWs);
        } catch (error) {
            console.error("Error during short:", error);
            closeAndExit(binanceWs);
        }
    } else if (price < config.LOWER_THRESHOLD_PRICE && accountSetup && !actionTaken) {
        console.log(`Price under threshold: ${price}`);
        actionTaken = true;  // Set actionTaken true immediately before the async operation
        try {
            console.log("Longing...");
            await executeSendQuoteMarket(subAccountAddress, 0, config.QUANTITY, "auto");
            console.log("Long Successful!")
            closeAndExit(binanceWs);
        } catch (error) {
            console.error("Error during long:", error);
            closeAndExit(binanceWs);
        }
    }

    clearTimeout(debouncer);
    debouncer = setTimeout(() => {
        actionTaken = false;
    }, 30000);
}

function closeAndExit(binanceWs, error) {
    if (error) console.error("Exiting due to error:", error);
    binanceWs.close();
    console.log("WebSocket closed.");
}

async function run() {
try {
    const subAccountAddress = await addAccount(config.ACCOUNT_NAME);
    const amountToMint = web3.utils.toWei(config.DEPOSIT_AMOUNT, 'ether'); 
    await mintCollateralTokens(amountToMint);
    await depositAndAllocateForAccount(subAccountAddress, amountToMint);
    await deallocateForAccount(subAccountAddress, amountToMint);
    await withdrawFromAccount('0xFD2a852A6D5aA733a64F3a10Ba163cF8CCd3D6F7', amountToMint);
    console.log(subAccountAddress);
    readyToTrade(); //Trading is now allowed...
    console.log("Bot setup successful. ");
    await startPriceMonitoring(subAccountAddress);
  } catch (error) {
      console.error("Error in bot setup:", error);
  }
}

run();
