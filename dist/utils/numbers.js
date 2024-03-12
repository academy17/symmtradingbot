"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromWei = exports.toWeiBN = exports.toWei = exports.formatDollarAmount = exports.formatCurrency = exports.formatAmount = exports.formatPrice = exports.removeTrailingZeros = exports.RoundMode = exports.BN_TEN = exports.BN_ZERO = exports.toBN = void 0;
const bignumber_js_1 = require("../../node_modules/bignumber.js/bignumber.js");
bignumber_js_1.BigNumber.config({ EXPONENTIAL_AT: 30 });
function toBN(number) {
    return new bignumber_js_1.BigNumber(number);
}
exports.toBN = toBN;
exports.BN_ZERO = toBN("0");
exports.BN_TEN = toBN("10");
var RoundMode;
(function (RoundMode) {
    RoundMode[RoundMode["ROUND_UP"] = 0] = "ROUND_UP";
    RoundMode[RoundMode["ROUND_DOWN"] = 1] = "ROUND_DOWN";
})(RoundMode || (exports.RoundMode = RoundMode = {}));
function removeTrailingZeros(number) {
    return toBN(number).toString();
}
exports.removeTrailingZeros = removeTrailingZeros;
function formatPrice(number, pricePrecision = 2, separator = false, roundMode = RoundMode.ROUND_DOWN) {
    const toFixed = toBN(number).toFixed(pricePrecision, roundMode);
    return separator ? toBN(toFixed).toFormat() : removeTrailingZeros(toFixed);
}
exports.formatPrice = formatPrice;
const formatAmount = (amount, fixed = 6, separator = false) => {
    if (amount === null || amount === undefined)
        return "";
    const bnAmount = toBN(amount);
    if (exports.BN_TEN.pow(fixed - 1).lte(bnAmount)) {
        return separator
            ? toBN(amount).toFormat(0, bignumber_js_1.BigNumber.ROUND_DOWN)
            : bnAmount.toFixed(0, bignumber_js_1.BigNumber.ROUND_DOWN);
    }
    const rounded = bnAmount.sd(fixed, bignumber_js_1.BigNumber.ROUND_DOWN);
    return separator ? toBN(rounded.toFixed()).toFormat() : rounded.toFixed();
};
exports.formatAmount = formatAmount;
const formatCurrency = (amount, fixed = 6, separator = false) => {
    if (amount === undefined || amount === null || amount === "")
        return "-";
    const bnAmount = toBN(amount);
    if (bnAmount.isZero()) {
        return "0";
    }
    if (bnAmount.lt(0.001)) {
        return "< 0.001";
    }
    if (bnAmount.gte(1e6)) {
        return (0, exports.formatAmount)(bnAmount.div(1e6), fixed, separator) + "m";
    }
    if (bnAmount.gte(1e3)) {
        return (0, exports.formatAmount)(bnAmount.div(1e3), fixed, separator) + "k";
    }
    return (0, exports.formatAmount)(bnAmount, fixed, separator);
};
exports.formatCurrency = formatCurrency;
const formatDollarAmount = (amount) => {
    const formattedAmount = (0, exports.formatCurrency)(amount, 4, true);
    if (formattedAmount === "< 0.001") {
        return "< $0.001";
    }
    return formattedAmount !== "-" ? `$${formattedAmount}` : "-";
};
exports.formatDollarAmount = formatDollarAmount;
function toWei(amount, decimals = 18) {
    return BigInt(toWeiBN((amount === null || amount === void 0 ? void 0 : amount.toString()) || "0", decimals).toFixed(0));
}
exports.toWei = toWei;
function toWeiBN(amount, decimals = 18) {
    if (amount === undefined || amount === null || amount === "")
        return exports.BN_ZERO;
    if (typeof amount === "string" && isNaN(Number(amount))) {
        return exports.BN_ZERO;
    }
    return toBN(amount).times(exports.BN_TEN.pow(decimals));
}
exports.toWeiBN = toWeiBN;
function fromWei(amount, decimals = 18, defaultOutput) {
    if (amount === undefined || amount === null || amount === "")
        return "0";
    if (typeof amount === "string" && isNaN(Number(amount))) {
        return defaultOutput !== null && defaultOutput !== void 0 ? defaultOutput : "0";
    }
    return toBN(amount).div(exports.BN_TEN.pow(decimals)).toString();
}
exports.fromWei = fromWei;
