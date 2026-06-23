const fs = require("node:fs");
const path = require("node:path");
const { normalizeOAuthConfig } = require("../electron/oauth-config.cjs");

const config = normalizeOAuthConfig({
  clientId: process.env.STUDY_CARDS_GOOGLE_CLIENT_ID,
  clientSecret: process.env.STUDY_CARDS_GOOGLE_CLIENT_SECRET
});

if (!config.configured) {
  console.error(
    "请先设置 STUDY_CARDS_GOOGLE_CLIENT_ID 和 STUDY_CARDS_GOOGLE_CLIENT_SECRET，再运行 npm run oauth:configure。"
  );
  process.exit(1);
}

const outputPath = path.join(__dirname, "..", "electron", "oauth-config.generated.cjs");
const tempPath = outputPath + "." + process.pid + ".tmp";
const output =
  "module.exports = " +
  JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret }, null, 2) +
  ";\n";

fs.writeFileSync(tempPath, output, "utf8");
fs.renameSync(tempPath, outputPath);
console.log("已生成本地 OAuth 构建配置：" + outputPath);
