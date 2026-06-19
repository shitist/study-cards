# 学习卡片

一个面向结构化学习笔记的 Windows 桌面应用。它把一个概念拆成固定的学习卡片字段，方便记录“是什么、为什么遇到、解决什么、不解决什么、如何验证”，并支持本地保存、Google Drive 私有同步、主题切换和拖拽导出到文本文档类应用。

## 主要功能

- 结构化卡片：概念、定义、遇到原因、解决范围、边界、验证方法。
- 分类目录：内置 `AI/LLM`、`历史`、`地理`，其中 `AI/LLM` 支持细分子类和自定义子类。
- 标题搜索：搜索只匹配卡片标题，避免正文内容误命中过多结果。
- 本地持久化：卡片保存为用户数据目录里的 JSON 文件。
- 数据保护：写入采用临时文件加 rename；如果本地数据 JSON 损坏，会备份坏文件并暂停写入，避免空数据覆盖原文件。
- Google Drive 同步：使用 `appDataFolder` 私有空间、PKCE OAuth、系统加密 token 存储和冲突副本保留。
- 桌面交互：卡片可复制 Markdown，也可拖拽到 Word、Notepad++ 等文本文档类应用。
- 主题：浅色、深色、跟随系统。

## 技术栈

- Electron 38
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
```

`npm test` 覆盖核心数据逻辑，包括 schema 校验、稳定序列化、数据库归一化和同步冲突合并。

生产构建会输出到 `dist/`。Electron 通过相对资源路径加载构建产物，适合 `loadFile()` 场景。

## Google Drive 同步设置

1. 在 Google Cloud Console 创建 OAuth Client ID，应用类型选择 Desktop app。
2. 在应用的同步设置里填写 Client ID。
3. 点击登录并完成浏览器授权。

同步数据保存在 Google Drive 的 `appDataFolder` 私有空间，不会出现在普通 Drive 文件列表里。OAuth refresh token 使用 Electron `safeStorage` 加密保存；旧版明文 token 会在读取时自动迁移为加密格式。

## 数据位置与可靠性

应用会在界面中显示本地数据路径，通常位于：

```text
%APPDATA%\study-cards\cards.json
```

如果 `cards.json` 损坏，应用会创建类似下面的备份文件，并阻止继续保存：

```text
cards.corrupt-2026-06-19T12-00-00-000Z.json
```

这样可以避免“读取失败后显示空库，再误保存覆盖原数据”的风险。

## 本地私有文件

`local-notes/` 是本地计划和临时说明目录，已在 `.gitignore` 中忽略，不会上传到 GitHub。`node_modules/`、`dist/`、`release/`、`.env*` 也不会进入版本管理。

## 当前状态

这是一个本地优先的桌面学习卡片工具。核心数据逻辑已有单元测试，Google Drive OAuth 需要使用真实 Client ID 手动验证授权流程。
