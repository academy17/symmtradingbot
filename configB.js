const ConfigTypes = require('./configs/chains/configTypes.js');
const PolygonConfig = require('./configs/chains/polygonconfig.js');
const BaseConfig = require('./configs/chains/baseconfig.js');
const ArbitrumConfig = require('./configs/chains/arbitrumconfig.js');
const HedgerConfig = require('./configs/hedgerconfig.js');

const configType = ConfigTypes.POLYGON; // Change this value to switch configurations

let chainConfig;

switch (configType) {
  case ConfigTypes.BASE:
    chainConfig = BaseConfig;
    break;
  case ConfigTypes.POLYGON:
    chainConfig = PolygonConfig;
    break;
  case ConfigTypes.ARBITRUM:
      chainConfig = ArbitrumConfig;
  default:
    throw new Error('Invalid config type');
}

const config = {
  ...chainConfig,
  ...HedgerConfig,
};

module.exports = config;