const deallocateFunctionAbi = {
    name: 'deallocate',
    type: 'function',
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        components: [
          {
            internalType: "bytes",
            name: "reqId",
            type: "bytes",
          },
          {
            internalType: "uint256",
            name: "timestamp",
            type: "uint256",
          },
          {
            internalType: "int256",
            name: "upnl",
            type: "int256",
          },
          {
            internalType: "bytes",
            name: "gatewaySignature",
            type: "bytes",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "signature",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "owner",
                type: "address",
              },
              {
                internalType: "address",
                name: "nonce",
                type: "address",
              },
            ],
            internalType: "struct SchnorrSign",
            name: "sigs",
            type: "tuple",
          },
        ],
        internalType: "struct SingleUpnlSig",
        name: "upnlSig",
        type: "tuple",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  };
  
  module.exports = { deallocateFunctionAbi };
