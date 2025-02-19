const fs = require("fs");
const axios = require("axios");
const { Wallet } = require("ethers");
const HttpsProxyAgent = require("https-proxy-agent"); // Using version 5 (CommonJS)
const config = require("./config");

// Read proxies from proxy.txt (one per line)
let proxies = [];
try {
  const proxyData = fs.readFileSync("proxy.txt", "utf8");
  proxies = proxyData
    .split("\n")
    .map(line => line.trim())
    .filter(line => line);
} catch (err) {
  console.warn("proxy.txt not found or empty. Using direct connection.");
}

// Read private keys from privatekey.txt (one per line)
let privateKeys = [];
try {
  const pkData = fs.readFileSync("privatekey.txt", "utf8");
  privateKeys = pkData
    .split("\n")
    .map(line => line.trim())
    .filter(line => line);
} catch (err) {
  console.error("privatekey.txt not found or empty. Exiting.");
  process.exit(1);
}

if (privateKeys.length === 0) {
  console.error("No private keys found! Check privatekey.txt.");
  process.exit(1);
}

// Faucet API endpoint
const apiUrl = "https://hub.nexus.xyz/api/trpc/faucet.requestFaucetFunds?batch=1";

/**
 * Solves a Cloudflare Turnstile captcha using 2Captcha.
 * It submits a request to 2Captcha and then polls for the solution.
 */
async function solveTurnstile(apiKey, siteKey, pageUrl, pollingInterval = 5000, maxRetries = 20) {
  const inUrl = 'http://2captcha.com/in.php';
  const params = new URLSearchParams();
  params.append('key', apiKey);
  params.append('method', 'turnstile');
  params.append('sitekey', siteKey);
  params.append('pageurl', pageUrl);
  params.append('json', '1');

  let inResponse;
  try {
    inResponse = await axios.post(inUrl, params);
  } catch (error) {
    throw new Error('Error submitting captcha: ' + error.message);
  }

  if (inResponse.data.status !== 1) {
    throw new Error('2Captcha in.php error: ' + inResponse.data.request);
  }

  const requestId = inResponse.data.request;
  const resUrl = 'http://2captcha.com/res.php';
  let token = null;

  console.log("Captcha submitted, waiting for solution...");
  for (let i = 0; i < maxRetries; i++) {
    // Wait for the polling interval
    await new Promise(resolve => setTimeout(resolve, pollingInterval));
    try {
      const resResponse = await axios.get(resUrl, {
        params: {
          key: apiKey,
          action: 'get',
          id: requestId,
          json: 1
        }
      });
      if (resResponse.data.status === 1) {
        token = resResponse.data.request;
        break;
      } else if (resResponse.data.request === 'CAPCHA_NOT_READY') {
        console.log("Captcha not ready yet, retrying...");
      } else {
        throw new Error('2Captcha res.php error: ' + resResponse.data.request);
      }
    } catch (error) {
      throw new Error('Error polling captcha: ' + error.message);
    }
  }

  if (!token) {
    throw new Error('Captcha solution not obtained within retry limit.');
  }

  return token;
}

/**
 * Requests faucet funds (or a new trustline) after solving the captcha.
 */
async function requestFaucet(privateKey, keyIndex) {
  // Create a wallet to derive the recipient address
  const wallet = new Wallet(privateKey);
  const recipientAddress = wallet.address;

  // Solve the Turnstile captcha using 2Captcha with parameters from config.js
  let turnstileToken;
  try {
    console.log(`[Key ${keyIndex}] Solving Turnstile captcha via 2Captcha...`);
    turnstileToken = await solveTurnstile(
      config.twoCaptchaApiKey,
      config.turnstileSiteKey,
      config.pageUrl
    );
    console.log(`[Key ${keyIndex}] Captcha solved: ${turnstileToken}`);
  } catch (error) {
    console.error(`[Key ${keyIndex}] Failed to solve captcha: ${error.message}`);
    return;
  }

  // Build the payload with the solved token
  const payload = {
    "0": {
      "json": {
        "rollupSubdomain": "nexus",
        "recipientAddress": recipientAddress,
        "turnstileToken": turnstileToken,
        "tokenRollupAddress": null
      },
      "meta": {
        "values": {
          "tokenRollupAddress": ["undefined"]
        }
      }
    }
  };

  // Configure axios request options
  let axiosConfig = {
    method: 'post',
    url: apiUrl,
    headers: {
      'Content-Type': 'application/json'
    },
    data: payload,
    timeout: 10000 // 10 seconds timeout
  };

  // Use a fixed proxy from config.js if provided; otherwise, choose one from proxy.txt if available.
  let proxyToUse = config.fixedProxy;
  if (!proxyToUse && proxies.length > 0) {
    proxyToUse = proxies[Math.floor(Math.random() * proxies.length)];
  }
  if (proxyToUse) {
    if (!proxyToUse.startsWith("http://") && !proxyToUse.startsWith("https://")) {
      proxyToUse = "http://" + proxyToUse;
    }
    console.log(`[Key ${keyIndex}] Using proxy: ${proxyToUse}`);
    axiosConfig.httpsAgent = new HttpsProxyAgent(proxyToUse);
    axiosConfig.proxy = false; // disable axios's built-in proxy handling
  } else {
    console.log(`[Key ${keyIndex}] No proxy available. Using direct connection.`);
  }

  try {
    console.log(`[Key ${keyIndex}] Sending faucet request for ${recipientAddress}`);
    const response = await axios(axiosConfig);
    console.log(`[Key ${keyIndex}] Response:`, JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error(`[Key ${keyIndex}] Error response:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`[Key ${keyIndex}] Request error:`, error.message);
    }
  }
}

async function runFaucetRequests() {
  for (let i = 0; i < privateKeys.length; i++) {
    await requestFaucet(privateKeys[i], i + 1);
  }
}

runFaucetRequests();
