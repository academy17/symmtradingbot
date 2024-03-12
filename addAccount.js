require('dotenv').config();
const { Web3 } = require('web3');
const config = require('./config');
const { multiAccountABI } = require('./abi/MultiAccount');
 
const multiAccountAddress = config.MULTI_ACCOUNT_ADDRESS; // The MultiAccount contract address
const multiAccountABI = multiAccountABI; // The ABI for your MultiAccount contract
const multiAccount = new web3.eth.Contract(multiAccountABI, multiAccountAddress);

if ('addAccount' in multiAccount.methods) {
    console.log("addAccount method is available.");
} else {
    console.log("addAccount method is NOT available. Check ABI and contract address.");
}


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
      console.log("Sender: ", event.user); // The sender's address
      console.log("Account Address: ", event.account); // The new account's address
      console.log("Account Name: ", event.name); // The name of the new account
      } else {
          console.log("No AddAccount event found.");
        }

  } catch (error) {
    console.error("Failed to add account:", error);
  }
}



async function main() {
  addAccount(accountName)
  //await addAccount(yourAccountName);
  //await estimateGasPeriodically('addAccount', 5000);
}



main().catch(console.error);