"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotesClient = void 0;
const base_1 = require("./base");
const numbers_1 = require("../utils/numbers");
class QuotesClient extends base_1.MuonClient {
    constructor() {
        super({ APP_METHOD: "uPnl_A_withSymbolPrice" });
    }
    static createInstance(isEnabled) {
        if (isEnabled) {
            return new QuotesClient();
        }
        return null;
    }
    _getRequestParams(account, chainId, contractAddress, marketId) {
        if (!account)
            return new Error("Param `account` is missing.");
        if (!chainId)
            return new Error("Param `chainId` is missing.");
        if (!contractAddress)
            return new Error("Param `contractAddress` is missing.");
        if (!marketId)
            return new Error("Param `marketId` is missing.");
        return [
            ["partyA", account],
            ["chainId", chainId.toString()],
            ["symmio", contractAddress],
            ["symbolId", marketId.toString()],
        ];
    }
    getMuonSig(account, appName, urls, chainId, contractAddress, marketId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const requestParams = this._getRequestParams(account, chainId, contractAddress, marketId);
                if (requestParams instanceof Error)
                    throw new Error(requestParams.message);
                console.info("Requesting data from Muon: ", requestParams);
                let result, success;
                for (const url of urls) {
                    try {
                        const res = yield this._sendRequest(url, appName, requestParams);
                        if (res) {
                            result = res.result;
                            success = res.success;
                        }
                        break; // Exit the loop if successful
                    }
                    catch (error) {
                        console.log("Retrying with the next URL...");
                    }
                }
                console.info("Response from Muon: ", result);
                if (!success) {
                    throw new Error("");
                }
                const reqId = result["reqId"];
                const timestamp = BigInt(result["data"]["timestamp"]);
                const upnl = BigInt(result["data"]["result"]["uPnl"]);
                const price = BigInt(result["data"]["result"]["price"]);
                const gatewaySignature = result["nodeSignature"];
                const signature = BigInt(result["signatures"][0]["signature"]);
                const owner = result["signatures"][0]["owner"];
                const nonce = result["data"]["init"]["nonceAddress"];
                const generatedSignature = {
                    reqId,
                    timestamp,
                    upnl,
                    price: price ? price : (0, numbers_1.toWei)(0),
                    gatewaySignature,
                    sigs: { signature, owner, nonce },
                };
                return { success: true, signature: generatedSignature };
            }
            catch (error) {
                console.error(error);
                return { success: false, error };
            }
        });
    }
}
exports.QuotesClient = QuotesClient;
