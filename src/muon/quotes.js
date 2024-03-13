const { MuonClient } = require("./base"); 
const viem = require("viem");

class QuotesClient extends MuonClient {
  constructor() {
    super({ APP_METHOD: "uPnl_A_withSymbolPrice" });
  }

  static createInstance(isEnabled) {
    if (isEnabled) {
      return new QuotesClient();
    }
    return null;
  }

  async getMuonSig(
    account, 
    appName, 
    urls, 
    chainId, 
    contractAddress, 
    marketId) {
    try {
      const requestParams = this._getRequestParams(account, chainId, contractAddress, marketId);
      if (requestParams instanceof Error) throw requestParams;

      //console.info("Requesting data from Muon: ", requestParams);
      let result, success;

      for (const url of urls) {
        try {
          const res = await this._sendRequest(url, appName, requestParams);
          if (res && res.success) {
            result = res.result;
            success = true;
            break; // Exit the loop if successful
          }
        } catch (error) {
          console.log("Retrying with the next URL...");
        }
      }

      if (success) {
        const reqId = result.result.reqId;
        const timestamp = result.result.data.timestamp ? BigInt(result.result.data.timestamp) : BigInt(0);
        console.log("timestamp: ", timestamp);
        const upnl = result.result.data.result.uPnl ? BigInt(result.result.data.result.uPnl) : BigInt(0);
        const price = result.result.data.result.price ? BigInt(result.result.data.result.price) : BigInt(0);
        
        const gatewaySignature = result.result.nodeSignature;

        const signature = result.result.signatures[0].signature ? BigInt(result.result.signatures[0].signature) : BigInt(0);
        const owner = result.result.signatures[0].owner;
        const nonce = result.result.data.init.nonceAddress;

        const generatedSignature = {
          reqId,
          timestamp,
          upnl,
          price: price ? price : toWei(0),
          gatewaySignature,
          sigs: { signature, owner, nonce },
        };

        return { success: true, signature: generatedSignature };
        
      } else {
        throw new Error("Muon request unsuccessful");
      }
    } catch (error) {
      console.error(error);
      return { success: false, error };
    }
  }

  _getRequestParams(account, chainId, contractAddress, marketId) {
    if (!account) return new Error("Param `account` is missing.");
    if (!chainId) return new Error("Param `chainId` is missing.");
    if (!contractAddress) return new Error("Param `contractAddress` is missing.");
    if (!marketId) return new Error("Param `marketId` is missing.");

    return [
      ["partyA", account],
      ["chainId", chainId.toString()],
      ["symmio", contractAddress],
      ["symbolId", marketId.toString()],
    ];
  }
}

module.exports = QuotesClient;
