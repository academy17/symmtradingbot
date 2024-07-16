const depositFunctionAbi = {
    name: 'deposit',
    type: 'function',
    inputs: [
      {
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
};
  
module.exports = { depositFunctionAbi };