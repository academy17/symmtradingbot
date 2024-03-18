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
const multiAccountContract = new web3.eth.Contract(multiAccountABI, config.MULTI_ACCOUNT_ADDRESS)
const diamondContract = new web3.eth.Contract(diamondABI, config.DIAMOND_ADDRESS);;
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);

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
        console.info("Requesting data from Muon with params: ", requestParams);
        let response = null; 
        for (const url of urls) {
            try {
                const res = await quotesClient._sendRequest(url, appName, requestParams);
                if (res && res.success) {
                    response = res.result; 
                    console.log("Full response from Muon:", response);
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
            reqId: web3.utils.hexToBytes(reqId),
            timestamp: BigInt(data.timestamp),
            upnl: BigInt(data.result.uPnl),
            price: BigInt(data.result.price),
            gatewaySignature: web3.utils.hexToBytes(response.result.nodeSignature),
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
  

async function executeSendQuoteMarket(botAddress, symbolId, positionType) {
    const signatureResult = await getMuonSigImplementation(botAddress);
    if (signatureResult.success) {
        const { reqId, timestamp, upnl, price, gatewaySignature, sigs } = signatureResult.signature;
    
    /*
    if (signatureResult.success) {
      const { reqId, timestamp, upnl, price, gatewaySignature, sigs } = signatureResult.signature;
      if (typeof reqId === 'undefined' || !reqId.startsWith('0x')) {
        console.error("reqId is undefined or not a hex string:", reqId);
      }
      if (typeof gatewaySignature === 'undefined' || !gatewaySignature.startsWith('0x')) {
        console.error("gatewaySignature is undefined or not a hex string:", gatewaySignature);
      }
    */
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
  
      console.log("Muon Request successful, forwarding formatted signature to contract... ", upnlSigFormatted);
      const partyBsWhiteList = [config.PARTY_B_WHITELIST];
        //const symbolId = 4; // Example symbolId, adjust as needed
        //const positionType = 1; // Assuming 1 represents the correct position type in your contract's enum
        const orderType = 1; // MARKET order
        const quantity = web3.utils.toWei('302.6', 'ether').toString(); // Adjusted to match provided input
        const cva = web3.utils.toWei('1.539846672', 'ether').toString(); // Adjusted to match provided input
        const lf = web3.utils.toWei('1.026564448', 'ether').toString(); // Adjusted to match provided input
        const partyAmm = web3.utils.toWei('194.84982888', 'ether').toString(); // Adjusted to match provided input
        const partyBmm = '0'; // Assuming no partyBmm for this example
        const maxFundingRate = web3.utils.toWei('200', 'ether').toString(); // Adjusted to match provided input
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
    const encodedSendQuoteData = diamondContract.methods.sendQuote(...sendQuoteParameters).encodeABI();
    const _callData = [
      botAddress,
      [ encodedSendQuoteData ]
    ];
    const jsonPayload = JSON.stringify(sendQuoteParameters);
    console.log("JSON Payload for API or Simulation:", jsonPayload);
    console.log("Calldata: ", _callData);

      try {
        /*
        const sendQuoteGasEstimate = await multiAccountContract.methods._call(..._callData).estimateGas({ from: process.env.WALLET_ADDRESS });
        console.log("Estimated Gas: ", sendQuoteGasEstimate);
      
        const sendQuotePrice = await web3.eth.getGasPrice();
        console.log("Current Gas Price: ", sendQuotePrice);
        */
      const sendQuoteReceipt = await multiAccountContract.methods._call(_callData[0], _callData[1]).send({
      from: account.address
      });
  
    console.log('Transaction receipt:', sendQuoteReceipt);
  
      } catch (error) {
          console.error('Error sending quote:', error);
      }

    } else {
      console.error('Failed to obtain signature:', signatureResult.error);
    }

  }
  

async function run() {
    botAddress = process.env.BOT_ADDRESS;
    console.log("Bot: ", botAddress);
    symbolId = 4; //XRP
    positionType = 0; //long
    await executeSendQuoteMarket(botAddress, symbolId, 0); //SHORT
}

run().catch(console.error);

