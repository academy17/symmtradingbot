const BigNumber = require('bignumber.js');

BigNumber.config({ EXPONENTIAL_AT: 30 });
const BN_ZERO = new BigNumber(0);
const BN_TEN = new BigNumber(10);

function toBN(amount) {
  return new BigNumber(amount);
}

function toWeiBN(amount, decimals = 18) {
  if (amount === undefined || amount === null || amount === "") {
    return BN_ZERO;
  }
  if (typeof amount === "string" && isNaN(Number(amount))) {
    return BN_ZERO;
  }
  return toBN(amount).times(BN_TEN.pow(decimals));
}

function toWei(amount, decimals = 18) {
  const amountStr = (amount === null || amount === undefined) ? "0" : amount.toString();
  return BigInt(toWeiBN(amountStr, decimals).toFixed(0));
}

module.exports = { toWei, toWeiBN };