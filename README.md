# Antigrivity Memory

[中文](#中文) | [English](#english)

---

## 中文

为 **Google Antigravity** 打造的 **本地热记忆 + Supermemory 云端长尾记忆** 双层记忆系统与可视化管理面板（MCP App Plugin）。

### 核心特性

- **双层记忆架构**：
  - **本地热记忆**：通过 `SessionStart` Hook 自动将全局摘要与当前项目的 `memory_summary.md` 注入会话上下文，零额外模型调用开销。
  - **离线增量整理**：通过 `Stop` Hook 将变更会话入队，由整理流水线定期或手动提炼 `rollout_summaries/` 并合并热记忆摘要。
  - **云端长尾检索**：与 Supermemory MCP 协同，自动双写高价值长期事实，支持跨项目语义检索与画像回流。
- **Memory Dashboard MCP App**：
  - 支持左侧边栏（`global`）与右侧辅助面板（`aux_pane`）双入口；所有数据工具均标记 `visibility: ["app"]`，不占用对话上下文 Token。
  - 提供 **概览（KPI + 趋势图 + 热力图）**、**热记忆（Markdown 预览/编辑 + 预算环）**、**历史记录（Rollouts 双栏独立滚动）**、**快捷便签（ad_hoc_notes）**、**设置** 五大视图。
  - 内置 **热重载** 按钮与 **自动检查/一键更新**（基于 GitHub Releases）。

### 一键安装

前置要求：**Node.js >= 18**。

```powershell
# Windows (PowerShell)
.\install.ps1
```

```bash
# Linux / macOS
chmod +x install.sh && ./install.sh
```

```bash
# 任意平台通用
node install.mjs
```

支持参数：
- `--force` / `-y`：检测到已有文件时直接覆盖更新。
- `--skip-existing`：跳过已存在的文件，仅补充缺失项（交互模式下默认也会询问 `覆盖 / 跳过 / 取消`）。
- `--dry-run`：仅预览安装步骤，不实际写入。
- `--skip-npm`：跳过 `npm install`。
- *安全保障*：安装脚本**永远不会覆盖** `~/.gemini/config/memories/` 下已有的记忆数据。

### 开发、热重载与发布（Tag 规范）

- **本地开发同步**：修改代码后运行 `node sync.mjs`，随后点击 Memory 面板右上角 **「热重载」** 即可原地刷新界面。
- **发布新版本（自动打 Tag + Release）**：每次发布必须提供清晰的中文/双语更新说明，供插件内「检查更新」展示：
  ```bash
  node release.mjs v1.1.0 "- 新增插件内自动更新功能\n- 更新双语 README"
  ```

---

## English

A hybrid **Local Hot Memory + Supermemory Cloud Long-Tail Memory** system and visual MCP App dashboard plugin for **Google Antigravity**.

### Key Features

- **Hybrid Two-Layer Memory**:
  - **Local Hot Memory**: Injects global and per-project `memory_summary.md` via `SessionStart` hook with zero extra model calls.
  - **Offline Incremental Consolidation**: Queues active sessions on `Stop` hook and distills `rollout_summaries/` into compact hot summaries.
  - **Cloud Long-Tail Recall**: Dual-writes durable facts to Supermemory MCP for cross-project semantic search and profile synthesis.
- **Memory Dashboard MCP App**:
  - Dual entrypoints (`global` sidebar + `aux_pane`); all data tools use `visibility: ["app"]` for zero context token overhead.
  - Five views: **Overview (KPIs + Sparklines + Heatmap)**, **Hot Memory (Markdown Preview/Edit + Budget Ring)**, **Rollouts (Independent Split Scroll)**, **Ad-Hoc Notes**, and **Settings**.
  - Built-in **Hot Reload** button and **Auto-Update** via GitHub Releases.

### One-Click Installation

Prerequisite: **Node.js >= 18**.

```powershell
# Windows (PowerShell)
.\install.ps1
```

```bash
# Linux / macOS
chmod +x install.sh && ./install.sh
```

```bash
# Cross-platform
node install.mjs
```

Flags:
- `--force` / `-y`: Overwrite existing installed files without prompting.
- `--skip-existing`: Keep existing files and only install missing ones (interactive mode prompts by default).
- `--dry-run`: Preview actions without modifying any files.
- `--skip-npm`: Skip `npm install`.
- *Safety*: Existing memory data under `~/.gemini/config/memories/` is **never** overwritten.

### Development, Hot Reload & Releases

- **Sync & Hot Reload**: Run `node sync.mjs` after editing, then click **Hot Reload (热重载)** in the Memory panel.
- **Tagging & Releasing**: Always include clear release notes when tagging so the in-app updater can display what changed:
  ```bash
  node release.mjs v1.1.0 "- Add in-app auto-update\n- Add bilingual README"
  ```
