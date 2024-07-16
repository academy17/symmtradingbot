const { Web3 } = require('web3');
require('dotenv').config()
const config = require('./configB');


// Initialize web3 instance
const web3 = new Web3(process.env.PROVIDER_URL);

// Define contract instance
const diamondContractAddress = config.DIAMOND_ADDRESS;
const diamondContractAbi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "quoteId",
        "type": "uint256"
      }
    ],
    "name": "getQuote",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "address[]",
            "name": "partyBsWhiteList",
            "type": "address[]"
          },
          {
            "internalType": "uint256",
            "name": "symbolId",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "positionType",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "orderType",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "openedPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "initialOpenedPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "requestedOpenPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "marketPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "quantity",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "closedAmount",
            "type": "uint256"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "cva",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "lf",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "partyAmm",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "partyBmm",
                "type": "uint256"
              }
            ],
            "internalType": "struct LockedValues",
            "name": "initialLockedValues",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "cva",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "lf",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "partyAmm",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "partyBmm",
                "type": "uint256"
              }
            ],
            "internalType": "struct LockedValues",
            "name": "lockedValues",
            "type": "tuple"
          },
          {
            "internalType": "uint256",
            "name": "maxFundingRate",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "partyA",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "partyB",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "quoteStatus",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "avgClosedPrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "requestedClosePrice",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "quantityToClose",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "parentId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "createTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "statusModifyTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastFundingPaymentTimestamp",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "deadline",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "tradingFee",
            "type": "uint256"
          }
        ],
        "internalType": "struct Quote",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Define contract instance
const diamondContract = new web3.eth.Contract(diamondContractAbi, diamondContractAddress);

async function getQuote(quoteId) {
  try {
    console.log(`Fetching quote with ID ${quoteId}...`);

    const quote = await diamondContract.methods.getQuote(quoteId).call();

    console.log("Quote fetched successfully:", quote);
    return { success: true, quote: quote };
  } catch (error) {
    console.error('Error fetching quote:', error);
    return { success: false, error: error.toString() };
  }
}

async function checkSyncStatus() {
    const syncStatus = await web3.eth.isSyncing();
    if (syncStatus) {
      console.log('Node is syncing:', syncStatus);
    } else {
      console.log('Node is fully synced');
    }
  }
  
  checkSyncStatus();
/*
// Example usage
const quoteId = 903; // Example quote ID

getQuote(quoteId).then(result => {
  if (result.success) {
    console.log('Quote details:', result.quote);
  } else {
    console.error('Error:', result.error);
  }
});
*/