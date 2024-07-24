//CONFIGS
require('dotenv').config()
const config = require('./configB');

const { Web3 } = require('web3');
const WebSocket = require('ws');
const { toWei, toWeiBN } = require('./src/utils/numbers');
const BigNumber = require('bignumber.js');
const axios = require('axios');

//ABIs
const diamondABI = require('./abi/Diamond');
const collateralABI = require('./abi/FakeStableCoinABI');
const { multiAccountABI } = require('./abi/MultiAccount');
const { lockQuoteFunctionAbi } = require('./abi/lockQuote');
const { depositABI } = require('./abi/DepositPartyB');


//MUON
const LockQuoteClient = require('./src/muon/lockquote');
const OpenPositionClient = require('./src/muon/openposition');

//WEB3 Contracts
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL));
const collateralContract = new web3.eth.Contract(collateralABI, config.COLLATERAL_ADDRESS);
const diamondContract = new web3.eth.Contract(diamondABI, config.DIAMOND_ADDRESS);
const multiAccountContract = new web3.eth.Contract(multiAccountABI, config.MULTI_ACCOUNT_ADDRESS);

//WEB3 Account
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);

async function getLatestNonce() {
  return await web3.eth.getTransactionCount(process.env.WALLET_ADDRESS, 'latest');
}

async function checkAllowance(accountAddress, spenderAddress) {
  const allowance = await collateralContract.methods.allowance(accountAddress, spenderAddress).call();
  //console.log(`Allowance for ${spenderAddress} from ${accountAddress}: ${allowance}`);
  return allowance;
}

async function fetchQuoteDetails(quoteId) {
  try {
    const quote = await diamondContract.methods.getQuote(quoteId).call();
    console.log("Quote fetched successfully:");
    const partyA = quote.partyA;
    const quantity = quote.quantity;
    const price = quote.requestedOpenPrice;
    const symbolId = quote.symbolId;
     
    return { partyA, quantity, price, symbolId };
  } catch (error) {
    console.error('Error fetching quote:', error);
    return null; 
  }
}


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

async function depositForAccount(accountAddress, diamondContractAddress, amount) {
  try {
    let txNonce = await getLatestNonce();

    console.log(`Approving ${amount} tokens for the diamond contract...`);
    const approveTx = collateralContract.methods.approve(diamondContractAddress, amount);
    const approveGas = await approveTx.estimateGas({ from: accountAddress });
    const approveGasPrice = await web3.eth.getGasPrice();

    const bufferPercentage = 20;
    const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
    const adjustedApproveGasLimit = approveGas + (approveGas * bufferFactor / BigInt(100));

    await approveTx.send({
      from: accountAddress,
      gas: adjustedApproveGasLimit.toString(),
      gasPrice: approveGasPrice,
      nonce: txNonce++
    });

    console.log(`Approval successful. Depositing for Account: ${accountAddress}...`);

    const allowance = await checkAllowance(accountAddress, diamondContractAddress);

    if (BigInt(allowance) < BigInt(amount)) {
      throw new Error(`Insufficient allowance: ${allowance}`);
    }

    let txNonceDeposit = await getLatestNonce();

    const depositTx = diamondContract.methods.deposit(amount);
    const depositGas = await depositTx.estimateGas({ from: accountAddress });
    const depositGasPrice = await web3.eth.getGasPrice();

    const adjustedDepositGasLimit = depositGas + (depositGas * bufferFactor / BigInt(100));

    console.log(`Sending deposit transaction with gas limit: ${adjustedDepositGasLimit} and gas price: ${depositGasPrice}`);

    const depositReceipt = await depositTx.send({
      from: accountAddress,
      gas: adjustedDepositGasLimit.toString(),
      gasPrice: depositGasPrice,
      nonce: txNonceDeposit
    });

    console.log("Deposit successful!");
  } catch (error) {
    console.error("An error occurred during the deposit process:", error);
  }
}

async function allocateForPartyB(amount, partyB, partyA) {
  try {

    console.log(`Allocating ${amount} tokens for PartyB with address ${partyA} from ${partyB}...`);

    const allocateGasEstimate = await diamondContract.methods.allocateForPartyB(amount, partyA).estimateGas({ from: partyB });
    console.log("Estimated Gas: ", allocateGasEstimate);

    const allocateGasPrice = await web3.eth.getGasPrice();
    console.log("Current Gas Price: ", allocateGasPrice);

    const receipt = await diamondContract.methods.allocateForPartyB(amount, partyA).send({
      from: partyB,
      gas: allocateGasEstimate,
      gasPrice: allocateGasPrice
    });

    console.log("Allocation successful!");
    return { success: true, receipt: receipt };
  } catch (error) {
    console.error('Error during allocation:', error);
    return { success: false, error: error.toString() };
  }
}

async function lockQuote(accountAddress, partyA, quoteId, increaseNonce, muonUrls, chainId, diamondAddress) {
  console.log("Locking quote...");
  const lockQuoteClient = LockQuoteClient.createInstance(true);

  if (!lockQuoteClient) {
    console.log('LockQuoteClient is not enabled or failed to instantiate.');
    return { success: false, error: 'LockQuoteClient initialization failed' };
  }

  const appName = 'symmio';
  const urls = [muonUrls];

  try {
    const signatureResult = await lockQuoteClient.getMuonSig(accountAddress, partyA, appName, urls, chainId, diamondAddress);

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

      console.log(`Locking quote ${quoteId} for account ${accountAddress}...`);

      const lockQuoteGasEstimate = await diamondContract.methods.lockQuote(quoteId, upnlSigFormatted, increaseNonce).estimateGas({ from: process.env.WALLET_ADDRESS });
      console.log("Estimated Gas: ", lockQuoteGasEstimate);

      const bufferPercentage = 0.50;
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
      const adjustedGasLimit = lockQuoteGasEstimate + (lockQuoteGasEstimate * bufferFactor / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);

      const lockQuoteGasPrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", lockQuoteGasPrice);

      const lockQuoteReceipt = await diamondContract.methods.lockQuote(quoteId, upnlSigFormatted, increaseNonce).send({
        from: process.env.WALLET_ADDRESS,
        gas: adjustedGasLimit,
        gasPrice: lockQuoteGasPrice
      });

      console.log("Lock quote successful!");
      return { success: true, receipt: lockQuoteReceipt };
    } else {
      throw new Error(signatureResult.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error during lock quote:', error);
    return { success: false, error: error.toString() };
  }
}

async function openPosition(accountAddress, partyA, quoteId, filledAmount, openedPrice, symbolId, muonUrls, chainId, diamondAddress) {
  console.log("Opening position...");
  const openPositionClient = OpenPositionClient.createInstance(true);

  if (!openPositionClient) {
    console.log('OpenPositionClient is not enabled or failed to instantiate.');
    return { success: false, error: 'OpenPositionClient initialization failed' };
  }

  const appName = 'symmio';
  const urls = [muonUrls];

  try {
    const signatureResult = await openPositionClient.getPairUpnlAndPriceSig(accountAddress, partyA, symbolId, appName, urls, chainId, diamondAddress);

    if (signatureResult.success) {
      const { reqId, timestamp, uPnlA, uPnlB, price, gatewaySignature, sigs } = signatureResult.signature;
      //console.log("SignatureResult: ", signatureResult);


      const upnlSigFormatted = {
        reqId: web3.utils.hexToBytes(reqId),
        timestamp: timestamp.toString(),
        upnlPartyA: uPnlA.toString(),
        upnlPartyB: uPnlB.toString(),
        price: price.toString(),
        gatewaySignature: web3.utils.hexToBytes(gatewaySignature),
        sigs: {
          signature: sigs.signature.toString(),
          owner: sigs.owner,
          nonce: sigs.nonce,
        }
        
      };

      //console.log("SIGNATURE FORMATTED: ", upnlSigFormatted);

      console.log(`Opening position for quote ${quoteId} for account ${accountAddress}...`);

      const openPositionGasEstimate = await diamondContract.methods.openPosition(quoteId, filledAmount, openedPrice, upnlSigFormatted).estimateGas({ from: process.env.WALLET_ADDRESS });
      console.log("Estimated Gas: ", openPositionGasEstimate);

      const bufferPercentage = 0.50;  
      const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
      const adjustedGasLimit = openPositionGasEstimate + (openPositionGasEstimate * bufferFactor / BigInt(100));
      console.log("Adjusted Gas Limit: ", adjustedGasLimit);

      const openPositionGasPrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", openPositionGasPrice);

      const openPositionReceipt = await diamondContract.methods.openPosition(quoteId, filledAmount, openedPrice, upnlSigFormatted).send({
        from: process.env.WALLET_ADDRESS,
        gas: adjustedGasLimit,
        gasPrice: openPositionGasPrice
      });

      console.log("Open position successful!");
      return { success: true, receipt: openPositionReceipt };
    } else {
      throw new Error(signatureResult.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error during open position:', error);
    return { success: false, error: error.toString() };
  }
}



async function run() {
  const quoteId = 991;
  const quoteDetails = await fetchQuoteDetails(quoteId);
  console.log("quoteDetails: ", quoteDetails);
  const accountAddress = process.env.WALLET_ADDRESS;
  const depositAmountWei = web3.utils.toWei(config.DEPOSIT_AMOUNT, 'ether'); 
  await mintCollateralTokens(depositAmountWei, config.COLLATERAL_ADDRESS);
  await depositForAccount(accountAddress, config.DIAMOND_ADDRESS, depositAmountWei);
  await checkAllowance(accountAddress, config.DIAMOND_ADDRESS);
  await allocateForPartyB(depositAmountWei, process.env.WALLET_ADDRESS, quoteDetails.partyA);
  await lockQuote(accountAddress, quoteDetails.partyA, quoteId, 'false', process.env.MUON_URL, config.CHAIN_ID, config.DIAMOND_ADDRESS);
  await openPosition(accountAddress, quoteDetails.partyA, quoteId, quoteDetails.quantity, quoteDetails.price, quoteDetails.symbolId, process.env.MUON_URL, config.CHAIN_ID, config.DIAMOND_ADDRESS);
}

run();