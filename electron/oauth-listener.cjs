const http = require("node:http");

function getLoopbackRedirectUri(server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("OAuth loopback listener address is unavailable.");
  }
  return "http://127.0.0.1:" + address.port;
}

async function createOAuthCodeListener(expectedState, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90_000;
  let settled = false;
  let timeout = null;
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((request, response) => {
    try {
      const redirectUri = getLoopbackRedirectUri(server);
      const requestUrl = new URL(request.url, redirectUri);
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      response.shouldKeepAlive = false;

      if (error) {
        response.writeHead(400, {
          "Content-Type": "text/html; charset=utf-8",
          Connection: "close"
        });
        response.end("<h1>Google Drive login failed</h1><p>You can close this window.</p>");
        settle(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        response.writeHead(400, {
          "Content-Type": "text/html; charset=utf-8",
          Connection: "close"
        });
        response.end("<h1>Invalid login response</h1><p>You can close this window.</p>");
        return;
      }

      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        Connection: "close"
      });
      response.end("<h1>Google Drive connected</h1><p>You can return to the study card app.</p>");
      settle(null, code);
    } catch (error) {
      settle(error);
    }
  });

  function closeServer() {
    if (!server.listening) return;
    server.close();
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
  }

  function settle(error, code) {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (error) rejectCode(error);
    else resolveCode(code);
    closeServer();
  }

  function cancel(reason = "Google Drive \u767b\u5f55\u5df2\u53d6\u6d88\u3002") {
    settle(new Error(reason));
  }

  server.on("error", (error) => settle(error));

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const redirectUri = getLoopbackRedirectUri(server);
  timeout = setTimeout(() => {
    settle(new Error("Google Drive \u767b\u5f55\u7b49\u5f85\u8d85\u65f6\uff0c\u8bf7\u91cd\u65b0\u53d1\u8d77\u767b\u5f55\u3002"));
  }, timeoutMs);
  if (typeof timeout.unref === "function") timeout.unref();

  return { redirectUri, codePromise, cancel };
}

module.exports = { createOAuthCodeListener };