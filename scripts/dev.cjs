const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const binDir = path.join(root, "node_modules", ".bin");
const viteBin = path.join(binDir, isWindows ? "vite.cmd" : "vite");
const electronBin = path.join(binDir, isWindows ? "electron.cmd" : "electron");
const port = process.env.VITE_PORT || "5173";
const url = `http://127.0.0.1:${port}`;
let electronProcess = null;
let shuttingDown = false;

function spawnChild(command, args, env = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: isWindows
  });
}

function waitForServer(targetUrl, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = async () => {
      try {
        const response = await fetch(targetUrl);
        if (response.ok || response.status < 500) {
          resolve();
          return;
        }
      } catch {
        // Keep probing while Vite starts.
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${targetUrl}`));
        return;
      }

      setTimeout(probe, 250);
    };

    probe();
  });
}

const vite = spawnChild(viteBin, ["--host", "127.0.0.1", "--port", port, "--strictPort"]);

waitForServer(url)
  .then(() => {
    electronProcess = spawnChild(electronBin, ["."], { VITE_DEV_SERVER_URL: url });

    electronProcess.on("exit", (code) => {
      if (!shuttingDown) {
        shuttingDown = true;
        vite.kill();
        process.exit(code ?? 0);
      }
    });
  })
  .catch((error) => {
    console.error(error);
    shuttingDown = true;
    vite.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  if (!shuttingDown) {
    shuttingDown = true;
    if (electronProcess) electronProcess.kill();
    vite.kill();
  }
  process.exit(0);
});
