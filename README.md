# 学习卡片

一个面向结构化学习笔记的 Windows 桌面应用。它把一个概念拆成固定的学习卡片字段，方便记录“是什么、为什么遇到、解决什么、不解决什么、如何验证”，并支持本地保存、Google Drive 私有同步、主题切换和拖拽导出到文本文档类应用。

## 主要功能

- 结构化卡片：概念、定义、遇到原因、解决范围、边界、验证方法、备注。
- 分类目录：内置 `AI/LLM`、`历史`、`地理`，其中 `AI/LLM` 支持细分子类和自定义子类。
- 标题搜索：搜索只匹配卡片标题，避免正文内容误命中过多结果。
- 本地持久化：卡片保存为用户数据目录里的 JSON 文件。
- 数据保护：写入采用临时文件加 rename；如果本地数据 JSON 损坏，会备份坏文件并暂停写入，避免空数据覆盖原文件。
- Google Drive 多设备同步：使用 `appDataFolder` 私有空间、PKCE OAuth、系统加密 token 存储、每设备独立快照、删除墓碑和冲突副本保留。
- 桌面交互：卡片可复制 Markdown，也可拖拽到 Word、Notepad++ 等文本文档类应用。
- 主题：浅色、深色、跟随系统。

## 技术栈

- Electron 42
- React 19
- TypeScript
- Vite 7
- Node.js 内置 `node:test`

## 本地开发

```powershell
npm install
npm run dev
```

开发脚本会启动 Vite 和 Electron。默认端口是 `5173`，并使用严格端口模式，避免 Vite 自动切换端口后 Electron 仍连接旧地址。需要换端口时可以设置：

```powershell
$env:VITE_PORT="5174"
npm run dev
```

## 测试与构建

```powershell
npm test
npm run typecheck
npm run build
npm run package:win
```

`npm test` 覆盖核心数据逻辑，包括 schema 校验、稳定序列化、数据库归一化、OAuth 回调、构建配置和多设备快照冲突合并。

生产构建会输出到 `dist/`。Electron 通过相对资源路径加载构建产物，适合 `loadFile()` 场景。`npm run package:win` 会使用 electron-builder 生成 Windows x64 安装包，并保留 `win-unpacked/` 目录用于快速测试，产物输出到 `release/`。不再默认生成 portable 单文件 exe，因为它每次启动都要自解压，冷启动明显更慢。

## Google Drive 同步设置

OAuth 客户端配置不在普通用户界面中显示。开发或生成正式构建前，通过环境变量生成本地构建配置：

```powershell
$env:STUDY_CARDS_GOOGLE_CLIENT_ID="你的客户端 ID"
$env:STUDY_CARDS_GOOGLE_CLIENT_SECRET="你的客户端密钥"
npm run oauth:configure
```

命令会生成 `electron/oauth-config.generated.cjs`。正式构建内置该配置后，用户只需点击“登录”，并在系统浏览器中完成 Google OAuth 授权。为兼容当前开发数据，旧版保存在本机设置中的加密 OAuth 配置仍可继续使用。

登录后可点击“立即同步”手动同步；应用保持打开时每 5 分钟会在后台检查一次其他设备的更新。新建、保存和删除不会立即触发 Google Drive 同步，以免编辑时被后台同步打断。

同步数据保存在 Google Drive 的 `appDataFolder` 私有空间，不会出现在普通 Drive 文件列表里。旧版 `study-cards-data.json` 会作为只读迁移来源保留；新版为每个设备创建独立的 `study-cards-device-*.json` 快照。不同设备不会覆盖同一个远端文件，后续同步会合并所有设备快照，并通过删除墓碑和冲突副本避免静默丢失内容。

OAuth client ID 和 client secret 会被内置进桌面客户端，不能当作真正的秘密保护；asar、压缩或混淆都只能增加提取门槛，不能从根本上阻止提取。当前安全边界依赖最小权限 `drive.appdata`、Google OAuth 用户授权和测试用户/发布限制。真正需要本机保护的是用户的 refresh token，这部分使用 Electron `safeStorage` 加密保存。系统凭据加密不可用时，应用会拒绝明文保存并显示中文处理提示。

## 数据位置与可靠性

应用会在界面中显示本地数据路径，通常位于：

```text
%APPDATA%\study-cards\cards.json
```

如果 `cards.json` 损坏，应用会创建类似下面的备份文件，并阻止继续保存：

```text
cards.corrupt-2026-06-19T12-00-00-000Z.json
```

这样可以避免“读取失败后显示空库，再误保存覆盖原数据”的风险。数据库会自动从旧版结构迁移到 `schemaVersion: 2`；删除操作记录为同步墓碑，因此其他设备上的旧副本不会在后续同步中直接复活。

## 本地私有文件

`local-notes/` 是本地计划和临时说明目录，已在 `.gitignore` 中忽略，不会上传到 GitHub。`node_modules/`、`dist/`、`release/`、`.env*` 也不会进入版本管理。`electron/oauth-config.generated.cjs` 当前用于内置 OAuth 配置；如果以后准备公开仓库，公开前应移出版本管理并轮换 Google OAuth 客户端配置。

## 当前状态

这是一个本地优先的桌面学习卡片工具。核心数据、OAuth 回调和多设备快照合并已有单元测试；正式发布前仍需在两台真实设备上完成并发编辑与断网恢复验收。
