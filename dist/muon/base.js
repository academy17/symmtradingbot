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
exports.MuonClient = void 0;
const http_1 = require("../utils/http");
class MuonClient {
    constructor({ APP_METHOD }) {
        this.APP_METHOD = APP_METHOD;
    }
    _sendRequest(baseUrl, appName, requestParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const MuonURL = new URL(baseUrl);
            MuonURL.searchParams.set("app", appName);
            MuonURL.searchParams.append("method", this.APP_METHOD);
            requestParams.forEach((param) => {
                MuonURL.searchParams.append(`params[${param[0]}]`, param[1]);
            });
            try {
                const response = yield (0, http_1.makeHttpRequest)(MuonURL.href);
                return response;
            }
            catch (error) {
                console.error(`Error during request to ${baseUrl}:`, error);
                throw error;
            }
        });
    }
}
exports.MuonClient = MuonClient;
