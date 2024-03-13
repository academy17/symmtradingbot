
const axios = require('axios');

const makeHttpRequest = async function(url, options = {}) {
  try {
    // Note: axios.get(url, {params: {...}}) if you have query parameters
    const response = await axios.get(url, {
      headers: {
        'Cache-Control': 'no-cache',
        // Any other headers
      }
    });
    console.log("Response data received:", response.data);

    return response.data; // Directly return the data part of the response
  } catch (err) {
    console.error(`Error fetching ${url}: `, err.message); // err.message for error details
    return null; // Or throw err; to propagate the error up
  }
};

module.exports = { makeHttpRequest };