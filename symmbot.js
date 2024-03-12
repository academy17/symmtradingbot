require('dotenv').config();
const { Web3 } = require('web3');
const WebSocket = require('ws');
const axios = require('axios');
const config = require('./config');
const collateralABI = require('./abi/FakeStableCoinABI');
const { multiAccountABI } = require('./abi/MultiAccount');
//import { QuotesClient } from './path/to/QuotesClient';

//const diamondABI = require('./Diamond')


const providerURL = process.env.providerURL;  // url string
const web3 = new Web3(new Web3.providers.HttpProvider(providerURL));
const privateKey = process.env.WALLET_PRIVATE_KEY;
const tradingBotAccountAddress = process.env.TRADING_BOT_ADDRESS;
const myAddress = process.env.WALLET_ADDRESS;
const mintCollateralAddress = config.COLLATERAL_ADDRESS;
const diamondAddress = config.DIAMOND_ADDRESS;
const collateralContract = new web3.eth.Contract(collateralABI, mintCollateralAddress);
//const diamondContract = new web3.eth.Contract(collateralABI, diamondAddress);

const multiAccountAddress = config.MULTI_ACCOUNT_ADDRESS; // The MultiAccount contract address
const multiAccountContract = new web3.eth.Contract(multiAccountABI, multiAccountAddress);


const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);
console.log("Account address:", account.address);



const binanceSymbol = 'xrpusdt'; 
const hedgerSymbol = 'XRP'; 
const binanceWs = new WebSocket('wss://fstream.binance.com/stream?streams=' + binanceSymbol.toLowerCase() + '@ticker');
let binancePrice = null;
let hedgerSpread = null;

let tradingConditionMet = false;

function tradingSignal() {
    tradingConditionMet = true;
}

binanceWs.on('message', (message) => {
    const data = JSON.parse(message);
    const price = parseFloat(data.data.c); 
    binancePrice = price;
    //console.log("BTC PRICE: ", price);
    //updateQuotePrice();
});


const yourAccountName = "TradingBotAccount"; 

const amountToMint = web3.utils.toWei('1000', 'ether'); //1000FUSD
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
      console.log("1000 FAKETOKENS Minted!!");
  } catch (error) {
      console.error("Error minting FAKETOKENS: ", error);
  }
}
const depositAmount = web3.utils.toWei('50', 'ether'); //can't depositandallocate


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

      console.log("Deposit and allocation successful!");
  } catch (error) {
      console.error("An error occurred during the deposit and allocation process:", error);
  }
}


depositAndAllocateForAccount(tradingBotAccountAddress, depositAmount).catch(console.error);

 
//todo: sendquote
/*
function sendQuote(
  address[] memory partyBsWhiteList,
  uint256 symbolId,
  PositionType positionType,
  OrderType orderType,
  uint256 price,
  uint256 quantity,
  uint256 cva,
  uint256 mm,
  uint256 lf,
  uint256 maxFundingRate,
  uint256 deadline,
  SingleUpnlAndPriceSig memory upnlSig
);
*/

//const isEnabled = true; 
//const quotesClient = QuotesClient.createInstance(isEnabled);

async function fetchMarketSymbols(hedgerUrl, hedgerSymbol) {
  if (!hedgerUrl) {
    throw new Error("hedgerUrl is empty");
  }
  const marketsUrl = new URL('contract-symbols', hedgerUrl).href;
  const errorMessagesUrl = new URL('error_codes', hedgerUrl).href;

  try {
    const [marketsResponse, errorMessagesResponse] = await Promise.all([
      axios.get(marketsUrl),
      axios.get(errorMessagesUrl),
      
    ]);

    if (!marketsResponse.data || !errorMessagesResponse.data) {
      throw new Error("Failed to fetch data from one or more endpoints.");
  }
      const filteredMarkets = marketsResponse.data.symbols
      .filter(market => market.symbol === hedgerSymbol)
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
    return { markets: filteredMarkets };
  } catch (error) {
    console.error("Error fetching market symbols:", error);
  }
}

const hedgerUrl = config.HEDGER_URL; 


/*
async function sendQuote() {

}


//sendQuote();


*/
async function main() {
  const res = await fetchMarketSymbols(hedgerUrl, hedgerSymbol);
  console.log(res);
  //await addAccount(yourAccountName);
  //await mintCollateralTokens().catch(console.error);
  //await estimateGasPeriodically('addAccount', 5000);
}



main().catch(console.error);

