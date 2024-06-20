require('dotenv').config();
const { Web3 } = require('web3');

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

const { multiAccountABI } = require('./abi/MultiAccount');
const multiAccountAddress = config.MULTI_ACCOUNT_ADDRESS;
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.PROVIDER_URL));
const multiAccount = new web3.eth.Contract(multiAccountABI, multiAccountAddress);
const account = web3.eth.accounts.privateKeyToAccount(process.env.WALLET_PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);


async function addAccount(accountName) {
  if (!accountName) {
    console.error("Account name is not provided.");
    return;
  }

  try {
    const currentGasPrice = await web3.eth.getGasPrice();
    const increasedGasPriceBigInt = BigInt(currentGasPrice) * BigInt(120) / BigInt(100);
    const gasEstimate = await multiAccount.methods.addAccount(accountName).estimateGas({ from: account.address });
    const gasEstimateBigInt = BigInt(gasEstimate);
    const gasLimitWithBuffer = gasEstimateBigInt + (gasEstimateBigInt * BigInt(20) / BigInt(100));
    console.log("Gas estimate with buffer: ", gasLimitWithBuffer.toString());

    const receipt = await multiAccount.methods.addAccount(accountName).send({
      from: account.address,
      gas: gasLimitWithBuffer.toString(), 
      gasPrice: increasedGasPriceBigInt.toString()
    });

    console.log("Account Creation Successful. Transaction hash: ", receipt.transactionHash);
    console.log("Gas Cost: ", increasedGasPriceBigInt.toString());

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

addAccount("test");