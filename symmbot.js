//CONFIGS
require('dotenv').config()
const config = require('./config');

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
async function mintCollateralTokens(amount, collateralAddress) {
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
          to: collateralAddress,
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
//Helper function for retrieving the latest nonce
async function getLatestNonce() {
  return await web3.eth.getTransactionCount(process.env.WALLET_ADDRESS, 'latest');
}
// Deposit and allocate
async function depositAndAllocateForAccount(accountAddress, amount, multiAccountAddress) {
  try {
      let txNonce = await getLatestNonce();

      console.log(`Approving ${amount} tokens for the multi-account contract...`);
      const approveTx = collateralContract.methods.approve(multiAccountAddress, amount);
      const approveGas = await approveTx.estimateGas({ from: process.env.WALLET_ADDRESS });
      const approveGasPrice = await web3.eth.getGasPrice();

      const bufferPercentage = 20;
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
async function deallocateForAccount(accountAddress, amount, diamondAddress) {
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
  const contractAddress = diamondAddress;

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
//Withdraw
async function withdrawFromAccount(accountAddress, amount) {
  try {
    console.log(`Withdrawing ${amount} tokens from account ${accountAddress}...`);

    let txNonce = await getLatestNonce();

    const withdrawTx = multiAccountContract.methods.withdrawFromAccount(accountAddress, amount);
    const withdrawGasEstimate = await withdrawTx.estimateGas({ from: process.env.WALLET_ADDRESS });
    console.log("Estimated Gas: ", withdrawGasEstimate);

    const bufferPercentage = 0.20;
    const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
    const adjustedGasLimit = withdrawGasEstimate + (withdrawGasEstimate * bufferFactor / BigInt(100));

    const withdrawGasPrice = await web3.eth.getGasPrice();
    console.log("Current Gas Price: ", withdrawGasPrice);

    const withdrawReceipt = await withdrawTx.send({
      from: account.address,
      gas: adjustedGasLimit.toString(),
      gasPrice: withdrawGasPrice.toString(),
      nonce: txNonce
    });

    console.log("Withdraw successful!");
    return { success: true, receipt: withdrawReceipt };
  } catch (error) {
    console.error('Error during withdrawal:', error);
    return { success: false, error: error.toString() };
  }
}

//Get a signature for a sendQuote
async function getMuonSigImplementation(subAccountAddress, diamondAddress) {
  const quotesClient = QuotesClient.createInstance(true);

  if (!quotesClient) {
      console.log('QuotesClient is not enabled or failed to instantiate.');
      return { success: false, error: 'QuotesClient initialization failed' };
  }

  const account = subAccountAddress;
  const appName = 'symmio';
  const urls = [process.env.MUON_URL];
  const chainId = 137;
  const contractAddress = diamondAddress;
  const marketId = 4;

  try {
    const result = await quotesClient.getMuonSig(account, appName, urls, chainId, contractAddress, marketId);

    if (result.success) {
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
async function executeSendQuote(subAccountAddress, positionType, orderType, quantity, slippage, diamondAddress, partyBWhitelist) {
  const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, config.SYMBOL);
  const lockedParams = await fetchLockedParams(markets[0].name, config.LEVERAGE, config.HEDGER_URL);
  const autoSlippage = markets[0].autoSlippage;
  //const pricePrecision = markets[0].pricePrecision;

  const signatureResult = await getMuonSigImplementation(subAccountAddress, diamondAddress);
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

  const calldataEncoded = web3.eth.abi.encodeFunctionCall(_callAbi, _callData);
  console.log("callDataEncoded: ", calldataEncoded);
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
        sendQuoteLogs.forEach(log => {
            const decodedData = web3.eth.abi.decodeParameters(['address', 'uint256', 'address[]', 'uint256', 'uint8', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'], log.data);
            console.log("SendQuote ID: ", decodedData[1]); // Assuming quoteId is the second parameter
        });
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

//Function to sendQuote with zero partyAmm  (minimal locked collateral required)
async function executeSendQuoteZeroMM(subAccountAddress, positionType, orderType, quantity, slippage, diamondAddress, partyBWhitelist) {
  const { markets } = await fetchMarketSymbolId(config.HEDGER_URL, config.SYMBOL);
  const lockedParams = await fetchLockedParams(markets[0].name, config.LEVERAGE, config.HEDGER_URL);
  const autoSlippage = markets[0].autoSlippage;
  //const pricePrecision = markets[0].pricePrecision;

  const signatureResult = await getMuonSigImplementation(subAccountAddress, diamondAddress);
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
    * (new BigNumber(0))

    
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

  const calldataEncoded = web3.eth.abi.encodeFunctionCall(_callAbi, _callData);
  console.log("callDataEncoded: ", calldataEncoded);
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
        sendQuoteLogs.forEach(log => {
            const decodedData = web3.eth.abi.decodeParameters(['address', 'uint256', 'address[]', 'uint256', 'uint8', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'], log.data);
            console.log("SendQuote ID: ", decodedData[1]); // Assuming quoteId is the second parameter
        });
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
//Closing a position
async function closePosition(accountAddress, quoteId, closePrice, quantityToClose, orderType, deadline) {
  console.log("Requesting to close position...");
  
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const deadlineInSeconds = nowInSeconds + deadline;
  
  try {
        const closePositionParameters = [
          quoteId.toString(), 
          closePrice.toString(), 
          quantityToClose.toString(), 
          orderType, 
          deadlineInSeconds.toString()
      ];

      const encodedClosePositionData = web3.eth.abi.encodeFunctionCall(requestToClosePositionFunctionAbi, closePositionParameters);
      
      const _callData = [accountAddress, [encodedClosePositionData]];
      const gasPrice = await web3.eth.getGasPrice();
      const gasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
      const gasEstimateBigInt = BigInt(gasEstimate);
      console.log("Estimated Gas: ", gasEstimate);
      const bufferPercentage = 0.20; // Smaller buffer as transaction might be less complex
      const adjustedGasLimit = gasEstimateBigInt + (gasEstimateBigInt * BigInt(20) / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);
      console.log("Current Gas Price: ", gasPrice);

      // Sending the transaction
      const transactionReceipt = await multiAccountContract.methods._call(..._callData).send({
          from: process.env.WALLET_ADDRESS,
          gas: adjustedGasLimit.toString(),
          gasPrice: gasPrice.toString()
      });

      console.log("Transaction Receipt: ", transactionReceipt);
      console.log("Position close request successful!");
      return { success: true, receipt: transactionReceipt };
  } catch (error) {
      console.error('Error during position close request:', error);
      return { success: false, error: error.toString() };
  }
}
//Stopping the binance webSocket
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
//Starting price monitoring with binance websocket
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
          handleMessage(message, subAccountAddress, marketId, binanceWs, config.LOWER_THRESHOLD_PRICE, config.UPPER_THRESHOLD_PRICE); // Pass WebSocket instance for handling
      });
  } catch (error) {
      console.error("Error setting up price monitoring:", error);
      closeAndExit(binanceWs, error); 
  }
}

let actionTaken = false;
let debouncer;

//Function for Executing orders based on price received by Binance WS
async function handleMessage(message, subAccountAddress, marketId, binanceWs, lowerThresholdPrice, upperThresholdPrice) {
    if (actionTaken) return;

    const data = JSON.parse(message);
    const price = parseFloat(data.data.c);
    console.log(`Current Price of ${config.SYMBOL}: `, price, "Lower:", config.LOWER_THRESHOLD_PRICE, "Upper:", config.UPPER_THRESHOLD_PRICE);

    if (price > upperThresholdPrice && accountSetup && !actionTaken) {
        console.log(`Price over threshold: ${price}`);
        actionTaken = true;  
        try {
            console.log("Shorting...");
            const quoteId = await executeSendQuoteMarket(subAccountAddress, 1, config.ORDERTYPE, config.QUANTITY, "auto", config.DIAMOND_ADDRESS, config.PARTY_B_WHITELIST);
            console.log("Short Successful! Quote Id: ", quoteId);
            closeAndExit(binanceWs);
        } catch (error) {
            console.error("Error during short:", error);
            closeAndExit(binanceWs);
        }
    } else if (price < lowerThresholdPrice && accountSetup && !actionTaken) {
        console.log(`Price under threshold: ${price}`);
        actionTaken = true;  
        try {
            console.log("Longing...");
            const quoteId = await executeSendQuoteMarket(subAccountAddress, 0, config.ORDERTYPE, config.QUANTITY, "auto", config.DIAMOND_ADDRESS, config.PARTY_B_WHITELIST);
            console.log("Long Successful! Quote Id: ", quoteId);
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

async function run() {
  try {
    const subAccountAddress = await addAccount(config.ACCOUNT_NAME);
    const depositAmountWei = web3.utils.toWei(config.DEPOSIT_AMOUNT, 'ether'); 
    await mintCollateralTokens(depositAmountWei, config.COLLATERAL_ADDRESS);
    await depositAndAllocateForAccount(subAccountAddress, depositAmountWei, config.MULTI_ACCOUNT_ADDRESS);
    readyToTrade(); //Trading is now allowed...
    console.log("Bot setup successful. ");
    await startPriceMonitoring(subAccountAddress);
  } catch (error) {
    console.error("Error in bot setup:", error);
  }
}

run().then(() => console.log("Bot is now monitoring prices for trading signals...")).catch(console.error);
