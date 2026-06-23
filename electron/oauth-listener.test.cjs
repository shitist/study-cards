const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createOAuthCodeListener } = require("./oauth-listener.cjs");

test("OAuth callback resolves without waiting for the browser connection to close", async () => {
  const state = "expected-state";
  const { redirectUri, codePromise } = await createOAuthCodeListener(state, { timeoutMs: 1_000 });
  const agent = new http.Agent({ keepAlive: true });
  let guardTimeout;

  try {
    const responsePromise = new Promise((resolve, reject) => {
      const requestUrl = redirectUri + "/?code=authorization-code&state=" + state;
      const request = http.get(requestUrl, { agent }, (response) => {
        response.resume();
        response.on("end", () => resolve(response));
      });
      request.on("error", reject);
    });

    const guardPromise = new Promise((_, reject) => {
      guardTimeout = setTimeout(() => reject(new Error("OAuth callback remained blocked by the client connection.")), 500);
    });
    const code = await Promise.race([codePromise, guardPromise]);
    const response = await responsePromise;

    assert.equal(code, "authorization-code");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.connection, "close");
  } finally {
    if (guardTimeout) clearTimeout(guardTimeout);
    agent.destroy();
  }
});

test("OAuth callback rejects an invalid state", async () => {
  const { redirectUri, codePromise } = await createOAuthCodeListener("expected-state", { timeoutMs: 1_000 });
  const responsePromise = new Promise((resolve, reject) => {
    const requestUrl = redirectUri + "/?code=authorization-code&state=wrong-state";
    const request = http.get(requestUrl, (response) => {
      response.resume();
      response.on("end", () => resolve(response));
    });
    request.on("error", reject);
  });

  await assert.rejects(codePromise, /invalid state/);
  const response = await responsePromise;
  assert.equal(response.statusCode, 400);
});
