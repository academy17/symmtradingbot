const { MuonClient } = require("./base");
const viem = require("viem");

class OpenPositionClient extends MuonClient {
  constructor() {
    super({ APP_METHOD: "uPnlWithSymbolPrice" });
  }

  static createInstance(isEnabled) {
    if (isEnabled) {
      return new OpenPositionClient();
    }
    return null;
  }

  async getPairUpnlAndPriceSig(account, partyA, symbolId, appName, urls, chainId, contractAddress) {
    try {
      const requestParams = this._getRequestParams(account, partyA, chainId, symbolId, contractAddress);
      if (requestParams instanceof Error) throw requestParams;
      let result, success;

      for (const url of urls) {
        try {
          const res = await this._sendRequest(url, appName, requestParams);
          if (res && res.success) {
            result = res.result;
            //console.log("Full Signature: ", result);
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
        const uPnlA = result.result.data.result.uPnlA ? BigInt(result.result.data.result.uPnlA) : BigInt(0);
        const uPnlB = result.result.data.result.uPnlB ? BigInt(result.result.data.result.uPnlB) : BigInt(0);
        const price = result.result.data.result.price ? BigInt(result.result.data.result.price) : BigInt(0);
        const gatewaySignature = result.result.nodeSignature;
        const signature = result.result.signatures[0].signature;
        const owner = result.result.signatures[0].owner;
        const nonce = result.result.data.init.nonceAddress;

        console.log("UpnlA from client: ", uPnlA);
        console.log("UpnlB from client: ", uPnlB);

        const generatedSignature = {
          reqId,
          timestamp,
          uPnlA,
          uPnlB,
          price,
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

  _getRequestParams(account, partyA, chainId, symbolId, contractAddress) {
    if (!account) return new Error("Param `account` is missing.");
    if (!partyA) return new Error("Param `partyA` is missing.");
    if (!chainId) return new Error("Param `chainId` is missing.");
    if (!symbolId) return new Error("Param `symbolId` is missing.");
    if (!contractAddress) return new Error("Param `contractAddress` is missing.");

    return [
      ["partyB", account],
      ["partyA", partyA],
      ["chainId", chainId.toString()],
      ["symbolId", symbolId.toString()],
      ["symmio", contractAddress],
    ];
  }
}

module.exports = OpenPositionClient;
