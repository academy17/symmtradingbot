const { MuonClient } = require("./base");
const viem = require("viem");

class DeallocateClient extends MuonClient {
  constructor() {
    super({ APP_METHOD: "uPnl_A" });
  }

  static createInstance(isEnabled) {
    if (isEnabled) {
      return new DeallocateClient();
    }
    return null;
  }

  async getMuonSig(account, appName, urls, chainId, contractAddress) {
    try {
      const requestParams = this._getRequestParams(account, chainId, contractAddress);
      if (requestParams instanceof Error) throw requestParams;
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
        const upnl = result.result.data.result.uPnl ? BigInt(result.result.data.result.uPnl) : BigInt(0);
        const gatewaySignature = result.result.nodeSignature;
        const signature = result.result.signatures[0].signature;
        const owner = result.result.signatures[0].owner;
        const nonce = result.result.data.init.nonceAddress;

        const generatedSignature = {
          reqId,
          timestamp,
          upnl,
          gatewaySignature,
          sigs: { signature, owner, nonce },
        };
        console.log("Generated Signature: ", generatedSignature);
        return { success: true, signature: generatedSignature };
      } else {
        throw new Error("Muon request unsuccessful");
      }
    } catch (error) {
      console.error(error);
      return { success: false, error };
    }
  }

  _getRequestParams(account, chainId, contractAddress) {
    if (!account) return new Error("Param `account` is missing.");
    if (!chainId) return new Error("Param `chainId` is missing.");
    if (!contractAddress) return new Error("Param `contractAddress` is missing.");

    return [
      ["partyA", account],
      ["chainId", chainId.toString()],
      ["symmio", contractAddress],
    ];
  }
}

module.exports = DeallocateClient;