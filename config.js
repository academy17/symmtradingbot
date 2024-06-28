const ConfigTypes = require('./configs/chains/configTypes.js');
const BaseConfig = require('./configs/chains/baseconfig.js');
const PolygonConfig = require('./configs/chains/polygonconfig.js');
const AccountManagementConfig = require('./configs/accountconfig.js');
const TradeManagementConfig = require('./configs/tradeconfig.js');

const configType = ConfigTypes.BASE; // Change this value to switch configurations

let chainConfig;

switch (configType) {
  case ConfigTypes.BASE:
    chainConfig = BaseConfig;
    break;
  case ConfigTypes.POLYGON:
    chainConfig = PolygonConfig;
    break;
  default:
    throw new Error('Invalid config type');
}

const config = {
  ...chainConfig,
  ...AccountManagementConfig,
  ...TradeManagementConfig
};

module.exports = config;