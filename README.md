# 🔀 Canvas Branch Chat

> **对话即地图，地图即笔记。**
>
> *Conversation is a map. The map is your notes.*

在 Obsidian Canvas 上实现 Flowith 式的分叉对话——从任意节点拉线分叉、标注方向、每个分支独立对话、自动继承上下文，最终自然形成一张可回溯的思维地形图。

Flowith-style branching AI conversations on Obsidian Canvas. Fork from any node, label the direction, and watch your thinking evolve into a navigable map of ideas.

---

## 📌 语言 / Language

- [简体中文](#简体中文) ← 当前
- [English](#english)

---

## 简体中文

### 这是什么？

这不是"又一个 AI 聊天插件"——Obsidian 已经有 Text Generator、Copilot 等。这个插件的真正价值是**把对话变成可浏览的思维地图**：

- 每次分叉都是在地图上开一条新路
- 最终你得到的不只是一段对话，而是一张完整的思考地形图
- 可以回溯、可以导出、可以嵌入你的笔记体系

### 核心功能

| 功能 | 说明 | 状态 |
|------|------|:---:|
| 🔀 从节点分叉 | 右键任意对话节点 → 输入方向 → 在右侧创建新的 AI 对话分支 | ✅ |
| 🏷️ 方向标注 | 分叉时输入方向（如"从成本角度分析"），标注在连接线上 | ✅ |
| 🔗 上下文继承 | 沿直系祖先链自动收集对话历史，新分支自带完整上下文 | ✅ |
| 💬 继续追问 | 在当前分支链上追加对话，直线延续 | ✅ |
| 🤖 单次问答 | 不带历史上下文，快速问一句 | ✅ |
| 🎨 多模型配置 | 每个模型独立配置：别名、Provider、Base URL、颜色、图标、系统提示词、Temperature | 🔜 |
| 🔬 连通性测试 | 配置时一键测试 API 连通性，远端获取模型列表 | 🔜 |
| 🎭 模型预设组 | 保存常用角色组合（"辩论赛"、"代码评审"），一键加载 | 🔜 |
| 👁️ 节点视觉区分 | 用户/AI/分支节点用不同颜色和图标区分 | 📋 |
| 📤 导出 Markdown | 将整棵对话树导出为带层级缩进的 Markdown 文件 | 📋 |

### 效果示意

```
                    ┌──[成本角度]──→ [AI回答: 成本...] ──→ [追问] ──→ ...
[问题: 这个方案如何?] ──┼──[安全角度]──→ [AI回答: 安全...] ──→ [追问] ──→ ...
                    └──[换个思路]──→ [AI回答: 换个...] ──→ [追问] ──→ ...
```

### 安装

#### 方式一：手动安装

1. 下载 [最新 Release](https://github.com/HinxCorporation/obsidian-canvas-branch-chat/releases)
2. 解压得到 `main.js`、`manifest.json`、`styles.css`
3. 放到你的 Obsidian vault 插件目录：
   ```
   <你的vault>/.obsidian/plugins/canvas-branch-chat/
   ```
4. Obsidian → 设置 → 第三方插件 → 启用「Canvas Branch Chat」

#### 方式二：从源码构建

```bash
git clone https://github.com/HinxCorporation/obsidian-canvas-branch-chat.git
cd obsidian-canvas-branch-chat
npm install
npm run build
```

将生成的 `main.js`、`manifest.json`、`styles.css` 复制到插件目录。

### 配置

#### API Key（安全方案）

插件**不存储明文密钥**。在设置页填入操作系统环境变量名称，插件从 `process.env` 中读取实际值：

```bash
# 在你的 shell 配置文件中设置（~/.bashrc / ~/.zshrc / 系统环境变量）
export DEEPSEEK_API_KEY=sk-your-actual-key-here
```

然后在插件设置中填入 `DEEPSEEK_API_KEY` 即可。

#### 模型配置

手动输入模型名称（如 `deepseek-chat`、`gpt-4o-mini`）。后续版本将支持从远端自动获取模型列表。

### 使用

1. 在 Obsidian 中打开一个 Canvas
2. 创建文本节点，输入你的问题
3. 右键节点 → 选择操作：
   - **🔀 从此处分叉** — 输入方向，AI 从该角度回答
   - **💬 继续追问** — 在当前分支链上继续对话
   - **🤖 提交到 AI** — 单次问答，不带历史
4. AI 回答实时流式显示在 Canvas 节点中

### 技术栈

- **平台**: Obsidian Plugin API (Canvas)
- **语言**: TypeScript
- **构建**: esbuild
- **API 协议**: OpenAI 兼容（支持 DeepSeek、OpenAI 等任意兼容端点）
- **基于**: [HinxCorporation/obsidian-canvas-ai](https://github.com/HinxCorporation/obsidian-canvas-ai) (MIT)

---

## English

### What is this?

This is not "yet another AI chat plugin" — Obsidian already has Text Generator and Copilot. The real value of this plugin is **turning conversations into navigable thinking maps**:

- Each fork opens a new path on the map
- What you get is not just a conversation, but a complete topography of your thinking
- Traceable, exportable, and embeddable in your note system

### Core Features

| Feature | Description | Status |
|---------|-------------|:------:|
| 🔀 Branch from node | Right-click any node → enter direction → create a new AI branch | ✅ |
| 🏷️ Direction labels | Label each fork with its exploration direction (e.g., "cost analysis") | ✅ |
| 🔗 Context inheritance | Automatically collect conversation history along the ancestor chain | ✅ |
| 💬 Continue chat | Append dialogue on the current branch chain | ✅ |
| 🤖 Quick ask | Single Q&A without history context | ✅ |
| 🎨 Multi-model config | Per-model config: alias, provider, base URL, color, icon, system prompt, temperature | 🔜 |
| 🔬 Connectivity test | One-click API test + fetch remote model list | 🔜 |
| 🎭 Model presets | Save role combinations ("debate team", "code review") for instant loading | 🔜 |
| 👁️ Visual differentiation | Color/icon coding for user vs AI vs branch nodes | 📋 |
| 📤 Export Markdown | Export the entire conversation tree as hierarchical Markdown | 📋 |

### Example

```
                       ┌──[Cost]──→ [AI: Cost analysis...] ──→ [Follow-up] ──→ ...
[Q: How about this?] ──┼──[Security]──→ [AI: Security...] ──→ [Follow-up] ──→ ...
                       └──[Alt approach]──→ [AI: Alternative...] ──→ [Follow-up] ──→ ...
```

### Installation

#### Option 1: Manual install

1. Download the [latest release](https://github.com/HinxCorporation/obsidian-canvas-branch-chat/releases)
2. Extract `main.js`, `manifest.json`, `styles.css`
3. Place them in your vault's plugin directory:
   ```
   <your-vault>/.obsidian/plugins/canvas-branch-chat/
   ```
4. Obsidian → Settings → Community plugins → Enable "Canvas Branch Chat"

#### Option 2: Build from source

```bash
git clone https://github.com/HinxCorporation/obsidian-canvas-branch-chat.git
cd obsidian-canvas-branch-chat
npm install
npm run build
```

Copy the generated `main.js`, `manifest.json`, `styles.css` to the plugin directory.

### Configuration

#### API Key (Secure)

The plugin **does not store plaintext keys**. Enter an OS environment variable name in settings; the plugin reads the actual value from `process.env`:

```bash
# Set in your shell profile (~/.bashrc / ~/.zshrc / system env vars)
export DEEPSEEK_API_KEY=sk-your-actual-key-here
```

Then enter `DEEPSEEK_API_KEY` in the plugin settings.

#### Model

Enter the model name manually (e.g., `deepseek-chat`, `gpt-4o-mini`). Future versions will support fetching model lists from the API endpoint.

### Usage

1. Open a Canvas in Obsidian
2. Create a text node and type your question
3. Right-click the node → choose an action:
   - **🔀 Branch from here** — Enter a direction, AI responds from that angle
   - **💬 Continue chat** — Continue the conversation on the current chain
   - **🤖 Ask AI** — Single Q&A, no history
4. AI responses stream into Canvas nodes in real time

### Tech Stack

- **Platform**: Obsidian Plugin API (Canvas)
- **Language**: TypeScript
- **Build**: esbuild
- **API Protocol**: OpenAI-compatible (supports DeepSeek, OpenAI, or any compatible endpoint)
- **Based on**: [HinxCorporation/obsidian-canvas-ai](https://github.com/HinxCorporation/obsidian-canvas-ai) (MIT)

---

## License

MIT

## Roadmap

See [PLAN.md](./PLAN.md) for the full development roadmap.

## Contributing

Issues and PRs welcome. This is a community project built on top of the MIT-licensed [obsidian-canvas-ai](https://github.com/HinxCorporation/obsidian-canvas-ai).

---

<p align="center">
  <sub>Built with 🧚‍♀️ by Zhang Bin</sub>
</p>
