
const BaseConfig = {
    COLLATERAL_SYMBOL: "USDC",
    COLLATERAL_DECIMALS: 6,
    COLLATERAL_ADDRESS: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  
    DIAMOND_ADDRESS: "0x8F06459f184553e5d04F07F868720BDaCAB39395",
    MULTI_ACCOUNT_ADDRESS: "0x1c03B6480a4efC2d4123ba90d7857f0e1878B780", //todo: change
    PARTY_B_WHITELIST: "0x0EB92F476A9a74B15A9fdcc6C252b2013AFc2deC",
    SIGNATURE_STORE_ADDRESS: "0x94eEa58De1C8945c342dB4bE9670301638E403e2",
  
    MULTICALL3_ADDRESS: "0xcA11bde05977b3631167028862bE2a173976CA11",
    USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    WRAPPED_NATIVE_ADDRESS: "0x4200000000000000000000000000000000000006",
  
    ANALYTICS_SUBGRAPH_ADDRESS:
      "https://api.thegraph.com/subgraphs/name/symmiograph/symmioanalytics_base_8_2",
    ORDER_HISTORY_SUBGRAPH_ADDRESS:
      "https://api.studio.thegraph.com/query/62454/main_base_8_2/version/latest",
      HEDGER_URL: 'https://base-hedger82.rasa.capital/',
      CHAIN_ID: 8453,
};

module.exports = BaseConfig;
