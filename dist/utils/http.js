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
exports.makeHttpRequest = void 0;
const makeHttpRequest = function (url_1) {
    return __awaiter(this, arguments, void 0, function* (url, options = {
        cache: "no-cache",
    }) {
        try {
            const response = yield fetch(url, options);
            if (response.ok) {
                return yield response.json();
            }
            else {
                throw new Error(response.statusText);
            }
        }
        catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                throw err;
            }
            else {
                console.error(`Error fetching ${url}: `, err);
            }
            return null;
        }
    });
};
exports.makeHttpRequest = makeHttpRequest;
