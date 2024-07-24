
const BaseConfig = {
    COLLATERAL_SYMBOL: "USDC",
    COLLATERAL_DECIMALS: 6,
    COLLATERAL_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  
    DIAMOND_ADDRESS: "0x91Cf2D8Ed503EC52768999aA6D8DBeA6e52dbe43",
    MULTI_ACCOUNT_ADDRESS: "0x1c03B6480a4efC2d4123ba90d7857f0e1878B780", //BASE
    PARTY_B_WHITELIST: "0x9206D9d8F7F1B212A4183827D20De32AF3A23c59",
    SIGNATURE_STORE_ADDRESS: "0x6B6f6A6CCdB4Df5cc462096bEAdFd609D8e281d1",
  
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
