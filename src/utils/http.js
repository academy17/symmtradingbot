const axios = require('axios');

const makeHttpRequest = async function(url, options = { cache: "no-cache" }) {
  try {
    const response = await axios (url, options);
    if (response.ok) {
      return await response.json();
    } else {
      throw new Error(response.statusText);
    }
  } catch (err) {
    console.error(`Error fetching ${url}: `, err);
    return null;
  }
};

module.exports = { makeHttpRequest };
