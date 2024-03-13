require('dotenv').config();
const { Web3 } = require('web3');
const WebSocket = require('ws');
const axios = require('axios');
const config = require('./config');
const collateralABI = require('./abi/FakeStableCoinABI');
const { multiAccountABI } = require('./abi/MultiAccount');
const diamondABI = require('./abi/Diamond');
const { sendQuoteFunctionAbi, _callAbi } = require('./abi/SendQuote');
const QuotesClient = require('./src/muon/quotes');

const providerURL = process.env.PROVIDER_URL;  // url string
const web3 = new Web3(new Web3.providers.HttpProvider(providerURL));
const privateKey = process.env.WALLET_PRIVATE_KEY;
const tradingBotAccountAddress = process.env.TRADING_BOT_ADDRESS;
const myAddress = process.env.WALLET_ADDRESS;
const mintCollateralAddress = config.COLLATERAL_ADDRESS;
const diamondAddress = config.DIAMOND_ADDRESS;
const collateralContract = new web3.eth.Contract(collateralABI, mintCollateralAddress);
const diamondContract = new web3.eth.Contract(diamondABI, diamondAddress);
const multiAccountAddress = config.MULTI_ACCOUNT_ADDRESS; // The MultiAccount contract address
const multiAccountContract = new web3.eth.Contract(multiAccountABI, multiAccountAddress);
const muonURL = process.env.MUON_URL;
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);
const hedgerUrl = config.HEDGER_URL; 
const binanceSymbol = 'ethusdt'; 
const hedgerSymbol = 'ETH'; 
const binanceWs = new WebSocket('wss://fstream.binance.com/stream?streams=' + binanceSymbol.toLowerCase() + '@ticker');
let binancePrice = null;
let hedgerSpread = null;

let tradingConditionMet = false;

function tradingSignal() {
    tradingConditionMet = true;
}

//TODO: Send MARKET Order at threshold price
binanceWs.on('message', (message) => {
    const data = JSON.parse(message);
    const price = parseFloat(data.data.c); 
    binancePrice = price;
    //console.log("ETH PRICE: ", price);
    //updateQuotePrice();
});

const accountName = "TradingBotAccount"; 

const amountToMint = web3.utils.toWei('200', 'ether'); //200FUSD
async function mintCollateralTokens() {
  try {
      const mintTx = collateralContract.methods.mint(myAddress, amountToMint);
      const gas = await mintTx.estimateGas({from: account.address});
      const gasPrice = await web3.eth.getGasPrice();

      const data = mintTx.encodeABI();
      const nonce = await web3.eth.getTransactionCount(account.address);

      const tx = {
          from: account.address,
          to: mintCollateralAddress,
          gas,
          gasPrice,
          data,
          nonce,
      };

      const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log("200 FUSD Minted.");
  } catch (error) {
      console.error("Error minting FUSD: ", error);
  }
}
const depositAmount = web3.utils.toWei('200', 'ether'); //can't depositandallocate more
async function depositAndAllocateForAccount(accountAddress, amount) {  
  try {
      let nonce = await web3.eth.getTransactionCount(account.address, 'latest');
      console.log(`Approving ${amount} tokens for the multiaccount contract...`);
      const approveTx = collateralContract.methods.approve(multiAccountAddress, amount);
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

      console.log("Deposit and allocation successful!", depositReceipt);
  } catch (error) {
      console.error("An error occurred during the deposit and allocation process:", error);
  }
}

async function getMuonSigImplementation() {
  const quotesClient = QuotesClient.createInstance(true);

  if (!quotesClient) {
      console.log('QuotesClient is not enabled or failed to instantiate.');
      return { success: false, error: 'QuotesClient initialization failed' };
  }
  const account = tradingBotAccountAddress;
  const appName = 'symmio';
  const urls = [ muonURL ];
  const chainId = 137;
  const contractAddress = config.DIAMOND_ADDRESS;
  const marketId = 2;
  try {
      const requestParams = quotesClient._getRequestParams(account, chainId, contractAddress, marketId);
      console.info("Requesting data from Muon with params: ", requestParams);
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
  
async function executeSendQuote() {
  const signatureResult = await getMuonSigImplementation();

  if (signatureResult.success) {
    const { reqId, timestamp, upnl, price, gatewaySignature, sigs } = signatureResult.signature;
    if (typeof reqId === 'undefined' || !reqId.startsWith('0x')) {
      console.error("reqId is undefined or not a hex string:", reqId);
    }
    if (typeof gatewaySignature === 'undefined' || !gatewaySignature.startsWith('0x')) {
      console.error("gatewaySignature is undefined or not a hex string:", gatewaySignature);
    }
    
    const upnlSigFormatted = {
        reqId: reqId,
        timestamp: timestamp.toString(),
        upnl: upnl.toString(),
        price: price.toString(),
        gatewaySignature: gatewaySignature,
        sigs: {
            signature: sigs.signature.toString(),
            owner: sigs.owner,
            nonce: sigs.nonce,
        }
    };

    console.log("upnlsigformat: ", upnlSigFormatted);
    const partyBsWhiteList = [config.PARTY_B_WHITELIST];
    const symbolId = 2; //ETH
    const positionType = 0; 
    const orderType = 1; 
        const quantity = web3.utils.toWei('1000', 'ether').toString(); 
    const cva = web3.utils.toWei('1', 'ether').toString();
    const lf = web3.utils.toWei('1', 'ether').toString(); 
    const partyAmm = web3.utils.toWei('1', 'ether').toString(); 
    const partyBmm = web3.utils.toWei('1', 'ether').toString(); 
    const maxFundingRateScaled = web3.utils.toWei('0.02', 'ether').toString(); 
    const deadline = (Math.floor(Date.now() / 1000) + 120).toString();

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
      maxFundingRateScaled.toString(), 
      deadline.toString(),
      upnlSigFormatted
  ];

  console.log("sendQuoteParameters: ", sendQuoteParameters);
  const encodedSendQuoteData = web3.eth.abi.encodeFunctionCall(sendQuoteFunctionAbi, sendQuoteParameters);
  console.log("encoded data: ", [encodedSendQuoteData]);

  const _callData = [
    tradingBotAccountAddress,
    [ encodedSendQuoteData ]
  ];
  
  console.log("Calldata: ", _callData);

    try {
      const sendQuoteGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: myAddress });
      console.log("Estimated Gas: ", sendQuoteGasEstimate);
    
      const sendQuotePrice = await web3.eth.getGasPrice();
      console.log("Current Gas Price: ", sendQuotePrice);
    
    const sendQuoteReceipt = await multiAccountContract.methods._call(..._callData).send({
    from: myAddress,
    gas: adjustedGasLimit,
    gasPrice: sendQuotePrice
    });

  console.log('Transaction receipt:', sendQuoteReceipt);

    } catch (error) {
        console.error('Error sending quote:', error);
    }
  } else {
    console.error('Failed to obtain signature:', signatureResult.error);
  }
}

async function main() {
  //await depositAndAllocateForAccount(tradingBotAccountAddress, depositAmount).catch(console.error);
  //const res = await fetchMarketSymbols(hedgerUrl, hedgerSymbol);
  //console.log(res);
  //await getMuonSigImplementation();  //await addAccount(yourAccountName);
  await executeSendQuote();//await mintCollateralTokens().catch(console.error);
  //await estimateGasPeriodically('addAccount', 5000);
}

main().catch(console.error);

