# Antigrivity Memory

为 **Google Antigravity** 打造的 **Codex v2 本地热记忆 + Supermemory 云端长尾记忆** 双层记忆系统与可视化管理面板（MCP App Plugin）。

## 核心特性

- **双层记忆架构**：
  - **本地热记忆**：通过 `SessionStart` Hook 自动将全局摘要与当前项目的 `memory_summary.md` 注入会话上下文，零额外模型调用开销。
  - **离线增量整理**：通过 `Stop` Hook 将变更会话入队，由 `codex-memory-pipeline` 技能定期（或手动触发）提炼 `rollout_summaries/` 并合并热记忆摘要。
  - **云端长尾检索**：与 Supermemory MCP 协同，自动双写高价值长期事实，支持跨项目语义检索与画像回流。
- **Memory Dashboard MCP App**：
  - 支持左侧边栏（`global`）与右侧辅助面板（`aux_pane`）双入口。
  - 所有数据工具均标记 `visibility: ["app"]`，不占用对话上下文 Token。
  - 提供 **概览（KPI + 趋势图 + 活动热力图）**、**热记忆（Markdown 预览/编辑 + 字节预算环）**、**历史记录（Rollouts 双栏独立滚动）**、**快捷便签（ad_hoc_notes）**、**设置** 五大视图。
  - 内置顶部 **热重载** 按钮，开发调试时可原地拉取最新构建的界面。

## 目录结构

```text
Antigrivity Memory/
├── install.mjs                        # 跨平台一键安装脚本 (Windows / Linux / macOS)
├── install.ps1                        # Windows PowerShell 安装入口
├── install.sh                         # Linux / macOS Bash 安装入口
├── sync.mjs                           # 开发同步与构建脚本
├── plugin/                            # memory-dashboard MCP App 插件源码
│   ├── plugin.json
│   ├── mcp_config.json
│   ├── package.json
│   ├── server.mjs                     # MCP Server (含热重载工具 memory_reload_ui)
│   ├── build.mjs                      # 单文件 HTML 打包脚本 (esbuild)
│   ├── src/app.js                     # 前端交互逻辑
│   └── assets/logo.png
├── scripts/
│   └── memory-engine.mjs              # 本地记忆引擎 (session-start / enqueue / scan / commit)
├── skills/
│   └── codex-memory-pipeline/SKILL.md # 离线整理流水线技能定义
└── rules/
    └── supermemory.md                 # 全局双层记忆读写规范
```

## 一键安装

前置要求：**Node.js >= 18**。

### Windows (PowerShell)

```powershell
.\install.ps1
```

### Linux / macOS

```bash
chmod +x install.sh
./install.sh
```

### 通用方式（任意平台）

```bash
node install.mjs
```

支持参数：
- `--force`（或 `-y`）：检测到已有文件时直接覆盖更新。
- `--skip-existing`：跳过已存在的文件，仅补充缺失项（交互模式下默认也会询问 `覆盖 / 跳过 / 取消`）。
- `--dry-run`：仅预览将要复制的文件和修改的钩子，不实际写入。
- `--skip-npm`：跳过 `npm install`（适用于已安装依赖的覆盖更新）。
- *安全保障*：安装脚本**永远不会覆盖** `~/.gemini/config/memories/` 下已有的记忆数据（`memory_summary.md`、`rollout_summaries/`、`state.json`、`config.json` 等）。

安装脚本会自动完成以下操作：
1. 将插件、记忆引擎、技能与规则安装到 `~/.gemini/config/`（Windows 为 `C:\Users\<用户名>\.gemini\config\`）。
2. 初始化 `~/.gemini/config/memories/` 目录结构。
3. 安全合并 `SessionStart` 与 `Stop` 钩子到 `~/.gemini/config/hooks.json`（保留你原有的其他钩子）。
4. 自动安装插件依赖并构建 `dist/dashboard.html`。

安装完成后，在 Antigravity 中重启或重新加载插件即可在侧边栏看到 **Memory** 面板。

## 开发与热重载工作流

修改本仓库中的代码后，运行以下命令同步到 `~/.gemini/config/` 并重新打包前端：

```bash
node sync.mjs
```

随后直接点击 Antigravity 侧边栏 **Memory** 面板右上角的 **「热重载」** 按钮，即可在当前面板内无感加载最新界面（无需关闭重开面板）。
> 注：仅在修改了 `plugin/server.mjs` 的 MCP 工具定义时，需要重新加载一次插件 MCP 服务。

## 配置说明

在 Memory 面板的 **「设置」** 标签页中可直接调整并保存到 `~/.gemini/config/memories/config.json`：
- **Supermemory 云端双写开关**：控制是否同步写入 Supermemory MCP。
- **每日自动整理时间 & 整理模型**：配置定时/补跑任务的触发窗口与模型。
- **开场拼装总上限（Bytes）与 Global / Project 比例**：控制 `SessionStart` 注入的 UTF-8 字节预算分配（默认 `8900 B`，Global `33%` / Project `67%`）。
