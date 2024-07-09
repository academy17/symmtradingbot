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

//MUON
const LockQuoteClient = require('./src/muon/lockquote');

//WEB3 Contracts
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL));
const collateralContract = new web3.eth.Contract(collateralABI, config.COLLATERAL_ADDRESS);
const diamondContract = new web3.eth.Contract(diamondABI, config.DIAMOND_ADDRESS);
const multiAccountContract = new web3.eth.Contract(multiAccountABI, config.MULTI_ACCOUNT_ADDRESS);

//WEB3 Account
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);

async function lockQuote(accountAddress, quoteId, increaseNonce, diamondAddress) {
    console.log("Locking quote...");
    const lockQuoteClient = LockQuoteClient.createInstance(true);
  
    if (!lockQuoteClient) {
      console.log('LockQuoteClient is not enabled or failed to instantiate.');
      return { success: false, error: 'LockQuoteClient initialization failed' };
    }
  
    const account = accountAddress;
    const appName = 'symmio';
    const urls = [process.env.MUON_URL];
    const chainId = 137; //TODO: Fetch from config
    const contractAddress = diamondAddress;
  
    try {
      const signatureResult = await lockQuoteClient.getMuonSig(account, appName, urls, chainId, contractAddress);
  
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
  
        const lockQuoteParameters = [BigInt(quoteId), upnlSigFormatted, increaseNonce];
        const encodedLockQuoteData = web3.eth.abi.encodeFunctionCall(lockQuoteFunctionAbi, lockQuoteParameters);
  
        const _callData = [accountAddress, [encodedLockQuoteData]];
  
        const lockQuoteGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
        console.log("Estimated Gas: ", lockQuoteGasEstimate);
  
        const bufferPercentage = 0.50;
        const bufferFactor = BigInt(Math.floor(bufferPercentage * 100));
        const adjustedGasLimit = lockQuoteGasEstimate + (lockQuoteGasEstimate * bufferFactor / BigInt(100));
        console.log("Adjusted Gas Limit: ", adjustedGasLimit);
  
        const lockQuoteGasPrice = await web3.eth.getGasPrice();
        console.log("Current Gas Price: ", lockQuoteGasPrice);
  
        const lockQuoteReceipt = await multiAccountContract.methods._call(..._callData).send({
          from: process.env.WALLET_ADDRESS,
          gas: adjustedGasLimit.toString(),
          gasPrice: lockQuoteGasPrice.toString()
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
  

async function run() {
    console.log("Locking Quote.. ");
    await lockQuote();

}

run();