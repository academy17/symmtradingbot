const { makeHttpRequest } = require("../utils/http");

class MuonClient {
  constructor(options) {
    this.APP_METHOD = options.APP_METHOD;
  }

  async _sendRequest(baseUrl, appName, requestParams) {
    const MuonURL = new URL(baseUrl);
    MuonURL.searchParams.set("app", appName);
    MuonURL.searchParams.append("method", this.APP_METHOD);
    requestParams.forEach((param) => {
      MuonURL.searchParams.append(`params[${param[0]}]`, param[1]);
    });
    //console.log('Request URL:', MuonURL.href);

    try {
      const response = await makeHttpRequest(MuonURL.href);
      return { result: response, success: true }; 
    } catch (error) {
      console.error(`Error during request to ${baseUrl}:`, error);
      return { success: false, error }; 
    }
  }
}

module.exports = { MuonClient };
