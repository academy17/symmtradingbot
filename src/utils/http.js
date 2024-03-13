
const axios = require('axios');

const makeHttpRequest = async function(url, options = {}) {
  try {
    const response = await axios.get(url, {
      headers: {
        'Cache-Control': 'no-cache',
      }
    });
    return response.data; 
  } catch (err) {
    console.error(`Error fetching ${url}: `, err.message); 
    return null; 
  }
};

module.exports = { makeHttpRequest };