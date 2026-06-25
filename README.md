# 学习卡片

一个面向结构化学习笔记的 Windows 桌面应用。它把一个概念拆成固定的学习卡片字段，方便记录"是什么、为什么遇到、解决什么、不解决什么、如何验证"，并支持本地保存、Google Drive 私有同步、主题切换和拖拽导出到文本文档类应用。
目前功能比较简陋，只是一个适合本人工作流的小工具。

## 主要功能

- 结构化卡片：概念、定义、遇到原因、解决范围、边界、验证方法、备注。
- 分类目录：内置 `AI/LLM`、`历史`、`地理`，其中 `AI/LLM` 支持细分子类和自定义子类。
- 标题搜索：搜索只匹配卡片标题，避免正文内容误命中过多结果。
- 本地持久化：卡片保存为用户数据目录里的 JSON 文件。
- 数据保护：写入采用临时文件加 rename；本地数据损坏时自动备份并暂停写入，避免空数据覆盖原文件。
- Google Drive 多设备同步：使用 `appDataFolder` 私有空间、PKCE OAuth、系统加密 token 存储。
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

生产构建会输出到 `dist/`。`npm run package:win` 会使用 electron-builder 生成 Windows x64 安装包，产物输出到 `release/`。

## Google Drive 同步设置

OAuth 客户端配置不在普通用户界面中显示。开发或生成正式构建前，通过环境变量生成本地构建配置：

```powershell
$env:STUDY_CARDS_GOOGLE_CLIENT_ID="你的客户端 ID"
$env:STUDY_CARDS_GOOGLE_CLIENT_SECRET="***"
npm run oauth:configure
```

命令会生成 `electron/oauth-config.generated.cjs`，该文件已被 `.gitignore` 忽略。正式构建内置本地生成的配置后，用户只需点击"登录"，并在系统浏览器中完成 Google OAuth 授权。

登录后可点击"立即同步"手动同步；应用保持打开时每 5 分钟后台自动检查更新。编辑操作不会立即触发同步，以免打断输入。数据存储在 Drive 私有空间，不会出现在普通文件列表中。
