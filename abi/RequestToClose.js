const requestToClosePositionFunctionAbi = {
    name: 'requestToClosePosition',
    type: 'function',
    inputs: [
        {
            internalType: "uint256",
            name: "quoteId",
            type: "uint256",
        },
        {
            internalType: "uint256",
            name: "closePrice",
            type: "uint256",
        },
        {
            internalType: "uint256",
            name: "quantityToClose",
            type: "uint256",
        },
        {
            internalType: "enum OrderType",
            name: "orderType",
            type: "uint8",
        },
        {
            internalType: "uint256",
            name: "deadline",
            type: "uint256",
        },
    ],
    outputs: [],
    stateMutability: "nonpayable"
};

module.exports = { requestToClosePositionFunctionAbi };