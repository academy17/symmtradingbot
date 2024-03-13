const sendQuoteFunctionAbi = {
    name: 'sendQuote',
    type: 'function',
    inputs: [
        { internalType: "address[]", name: "partyBsWhiteList", type: "address[]" },
        { internalType: "uint256", name: "symbolId", type: "uint256" },
        { internalType: "enum PositionType", name: "positionType", type: "uint8" },
        { internalType: "enum OrderType", name: "orderType", type: "uint8" },
        { internalType: "uint256", name: "price", type: "uint256" },
        { internalType: "uint256", name: "quantity", type: "uint256" },
        { internalType: "uint256", name: "cva", type: "uint256" },
        { internalType: "uint256", name: "lf", type: "uint256" },
        { internalType: "uint256", name: "partyAmm", type: "uint256" },
        { internalType: "uint256", name: "partyBmm", type: "uint256" },
        { internalType: "uint256", name: "maxFundingRate", type: "uint256" },
        { internalType: "uint256", name: "deadline", type: "uint256" },
        {
            components: [
                { internalType: "bytes", name: "reqId", type: "bytes" },
                { internalType: "uint256", name: "timestamp", type: "uint256" },
                { internalType: "int256", name: "upnl", type: "int256" },
                { internalType: "uint256", name: "price", type: "uint256" },
                { internalType: "bytes", name: "gatewaySignature", type: "bytes" },
                {
                    components: [
                        { internalType: "uint256", name: "signature", type: "uint256" },
                        { internalType: "address", name: "owner", type: "address" },
                        { internalType: "address", name: "nonce", type: "address" },
                    ],
                    internalType: "struct SchnorrSign",
                    name: "sigs",
                    type: "tuple",
                },
            ],
            internalType: "struct SingleUpnlAndPriceSig",
            name: "upnlSig",
            type: "tuple",
        }
    ]
};

const _callAbi = {
    name: '_call',
    type: 'function',
    inputs: [
        {
          internalType: "address",
          name: "account",
          type: "address",
        },
        {
          internalType: "bytes[]",
          name: "_callDatas",
          type: "bytes[]",
        },
    ],
};


module.exports = { sendQuoteFunctionAbi, _callAbi };
