# Antigrivity Memory

[中文](#中文) | [English](#english)

---

## 中文

为 **Google Antigravity** 打造的 **本地热记忆 + Supermemory 云端长尾记忆** 双层记忆系统与可视化管理面板。

### 核心特性

- **开场自动注入热记忆**：新会话启动时自动注入全局偏好与当前项目的精炼记忆摘要，无需手动提醒。
- **离线自动增量整理**：每日定时将近期会话提炼为结构化历史摘要（Rollouts）并合并更新热记忆，保持长期记忆整洁有序。
- **云端长尾检索**：与 Supermemory MCP 无缝协同，自动双写高价值长期事实，支持跨项目语义检索。
- **内置 Memory 可视化面板**：
  - 支持左侧边栏与右侧辅助面板打开，不占用对话上下文 Token。
  - 提供 **概览（指标、趋势图与热力图）**、**热记忆（预览与编辑）**、**历史记录**、**快捷便签**、**设置** 五大视图。
  - 支持面板内 **检查更新与一键在线更新**。

### 一键安装

前置要求：**Node.js >= 18**。安装过程**不会覆盖**已有的本地记忆数据；如检测到已有配置会提示选择覆盖或跳过。

#### 方式一：AI 一键安装（推荐）

直接复制以下提示词发送给 Antigravity：

> 请帮我从 GitHub 仓库 `https://github.com/Nefelibata-D/Antrigrivity-Codex-Memory` 下载最新 Release，并运行其中的一键安装脚本为我安装 Antigrivity Memory（保留我现有的记忆数据不要覆盖），安装完成后告诉我是否需要重启插件。

#### 方式二：Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Nefelibata-D/Antrigrivity-Codex-Memory/main/install.ps1 | iex
```

#### 方式三：Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Nefelibata-D/Antrigrivity-Codex-Memory/main/install.sh | bash
```

安装完成后，重启 Antigravity（或在 Plugins Manager 中重新启用 **Memory** 插件），即可在侧边栏打开 **Memory** 面板。

### 常用配置

在 Memory 面板的 **「设置」** 标签页中可直接调整：
- **Supermemory 云端双写开关**
- **每日自动整理时间与整理模型**
- **开场注入总上限（Bytes）与 Global / Project 预算比例**
- **版本检查与一键更新**

---

## English

A hybrid **Local Hot Memory + Supermemory Cloud Long-Tail Memory** system with a visual management dashboard for **Google Antigravity**.

### Key Features

- **Automatic Session Hot Memory**: Automatically injects global preferences and project-specific memory summaries at the start of every session.
- **Scheduled Offline Consolidation**: Distills recent conversations into structured rollout summaries and keeps hot memory concise automatically.
- **Cloud Long-Tail Recall**: Works seamlessly with Supermemory MCP for cross-project semantic search and durable fact retention.
- **Built-in Memory Dashboard**:
  - Accessible from both the left sidebar and right auxiliary pane with zero context token overhead.
  - Five views: **Overview (KPIs, Sparklines & Heatmap)**, **Hot Memory (Preview & Edit)**, **History (Rollouts)**, **Quick Notes**, and **Settings**.
  - Built-in **update checker & one-click auto-updater**.

### One-Click Installation

Prerequisite: **Node.js >= 18**. Existing local memory data is **never** overwritten; if existing config files are detected, you will be prompted to overwrite or skip.

#### Option 1: One-Click AI Install (Recommended)

Copy and send this prompt directly to Antigravity:

> Please download the latest release from `https://github.com/Nefelibata-D/Antrigrivity-Codex-Memory` and run its installer to set up Antigrivity Memory for me (keep my existing memory data untouched). Let me know once it's done and whether I should reload the plugin.

#### Option 2: Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Nefelibata-D/Antrigrivity-Codex-Memory/main/install.ps1 | iex
```

#### Option 3: Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Nefelibata-D/Antrigrivity-Codex-Memory/main/install.sh | bash
```

After installation, restart Antigravity (or toggle the **Memory** plugin in Plugins Manager) to open the **Memory** panel from the sidebar.

### Configuration

All settings can be adjusted directly in the **Settings** tab of the Memory dashboard:
- **Supermemory Cloud Sync toggle**
- **Daily consolidation schedule & model**
- **Session injection byte budget & Global / Project split ratio**
- **Version check & one-click update**
