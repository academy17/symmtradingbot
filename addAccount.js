require('dotenv').config();
const { Web3 } = require('web3');
const config = require('./symmconfig');
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
    const gasPriceBigInt = web3.utils.toBigInt(currentGasPrice); 
    const gasEstimate = await multiAccount.methods.addAccount(accountName).estimateGas({ from: account.address });
    console.log("Gas estimate: ", gasEstimate);
    const receipt = await multiAccount.methods.addAccount(accountName).send({
      from: account.address,
      gas: gasEstimate,
      gasPrice: gasPriceBigInt.toString()
    });

    console.log("Account Creation Successful. Transaction hash: ", receipt.transactionHash);
    console.log("Gas Cost: ", gasPriceBigInt.toString());

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

module.exports = { addAccount };