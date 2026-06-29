# 学习卡片

一个面向结构化学习笔记的桌面应用。它把每个概念拆成固定字段，适合记录 AI/LLM、历史、地理等主题下的学习卡片，并支持本地保存、Google Drive 多设备同步、主题切换、搜索筛选和 Markdown 拖拽/复制。

## 主要功能

- 结构化卡片：概念、定义、遇到原因、解决什么、不解决什么、验证方法、备注。
- 分类目录：内置 AI/LLM、历史、地理三个大类，AI/LLM 支持子分类和自定义子分类。
- 搜索与筛选：搜索仅匹配标题，分类支持左侧分级目录筛选。
- 本地保存：数据保存到用户数据目录中的 JSON 文件，写入采用临时文件加 rename 的方式降低损坏风险。
- Google Drive 同步：使用 appDataFolder 私有空间、PKCE OAuth、多设备快照合并和删除墓碑。
- 编辑保护：切换词条或新建词条前会先保存当前草稿，避免未保存内容丢失。
- 桌面交互：支持复制 Markdown，也支持将卡片拖拽到兼容的文本类应用。
- 自动更新：安装版可检查 GitHub Release，发现新版本后询问是否下载和安装。

## 本地开发

```powershell
npm install
npm run dev
```

开发脚本会同时启动 Vite 和 Electron。默认端口为 5173；如需指定端口：

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

- `npm test` 运行核心数据、同步、OAuth 回调和更新服务测试。
- `npm run typecheck` 检查前端 TypeScript 和 Electron 主进程 checkJs。
- `npm run package:win` 使用 electron-builder 生成 Windows x64 安装包到 `release/`。

## Google Drive OAuth 配置

公库不会包含 Google OAuth 客户端 ID 和客户端密钥。自用或二次分发前，需要自己创建 Desktop OAuth Client，并在本地生成配置文件：

```powershell
$env:STUDY_CARDS_GOOGLE_CLIENT_ID="你的 OAuth 客户端 ID"
$env:STUDY_CARDS_GOOGLE_CLIENT_SECRET="你的 OAuth 客户端密钥"
npm run oauth:configure
```

该命令会生成 `electron/oauth-config.generated.cjs`。这个文件已被 `.gitignore` 忽略，不应提交到公开仓库。
