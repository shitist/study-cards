const http = require("node:http");

function getLoopbackRedirectUri(server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("OAuth loopback listener address is unavailable.");
  }
  return "http://127.0.0.1:" + address.port;
}

async function createOAuthCodeListener(expectedState, options = {}) {
  const timeoutMs = options.timeoutMs ?? 180_000;
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
        settle(new Error("OAuth response was missing code or had invalid state."));
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
    settle(new Error("Google Drive 登录等待超时，请重新发起登录。"));
  }, timeoutMs);
  if (typeof timeout.unref === "function") timeout.unref();

  return { redirectUri, codePromise };
}

module.exports = { createOAuthCodeListener };
