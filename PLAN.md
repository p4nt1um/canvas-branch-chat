# 🔀 Obsidian Canvas Branch Chat 插件 — 开发规划

> **创建时间**: 2026-07-06
 > **更新时间**: 2026-07-12 (v11 — 砍掉 #17)
 > **状态**: ✅ v0.1.0 已发布（P0/P1/M3.5/M4 全部完成）→ 🚧 P2 开发中
> **基于 fork**: HinxCorporation/obsidian-canvas-ai (MIT 协议)
>
> **v3→v4 微调**:
> - P2 #16 改名「分叉框架预设」，P3 #17 改名「行业场景模板」，消除重叠
> - 「不做什么」第 4 条加脚注说明 P0/P1 分期
> - M1 清单增加 #6：封装 scrollHeight 读取 + null-check 兜底

---

## 核心定位：对话即地图

这不是"又一个 AI 聊天插件"——Obsidian 已经有 Text Generator、Copilot 等。这个插件的真正价值是**把对话变成可浏览的思维地图**：每次分叉都是在地图上开一条新路，最终你得到的不只是一段对话，而是一张完整的思考地形图，可以回溯、可以导出、可以嵌入笔记体系。

Flowith 式的分叉对话 + Obsidian Canvas 的本地知识库 = **对话即地图，地图即笔记**。

P2 的分支合并、P3 的知识库挂载不是远期锦上添花，而是这个定位的必然延伸——它们让地图从"一棵树"变成"一张网"。

---

## P0 — 核心 MVP（必须实现）

| # | 功能 | 说明 | 用户操作 |
|------|------|------|------|
| 1 | 从节点分叉对话 | 右键任意对话节点 → "从此处分叉"，在右侧创建新的 AI 对话分支，不干扰原有对话链 | 右键 → 分叉 |
| 2 | 分支方向标注 | 分叉时弹出输入框，用户填写分支方向（如"从成本角度分析"），标注在连接边上 | 弹窗输入 |
| 3 | 上下文自动继承（直系祖先链） | 分叉时沿**当前分支的直系祖先链**收集对话历史作为上下文。MVP 只做直系祖先，不处理跨分支交汇 | 自动，无需操作 |
| 4 | 边标签显示 | 连线上显示分支方向文字（见下方"边标签渲染方案"） | 自动渲染 |

> **历史**：原 P0 #5（多模型支持）在评审时降级到 P1，MVP 先绑单一供应商。

### MVP 效果示意

```
                    ┌──[成本角度]──→ [AI回答: 成本...] ──→ [追问] ──→ ...
[问题: 这个方案如何?] ──┼──[安全角度]──→ [AI回答: 安全...] ──→ [追问] ──→ ...
                    └──[换个思路]──→ [AI回答: 换个...] ──→ [追问] ──→ ...
```

### 边标签渲染方案（P0 #4 专项）

Obsidian Canvas 的 `edge.label` 属性存在但**渲染位置和样式不可控**（官方还没有 API 支持自定义 label 样式），可能存在标签位置偏移或字体太小的问题。

**策略**：
1. **首选**：使用原生 `edge.label`，简单直接
2. **备选**：如果原生 label 渲染效果差，在连线中间额外生成一个只读的小型文本节点作为"标签容器"节点
3. M2 阶段先实现首选方案，若实际体验不达标则切换备选方案

---

## P1 — 体验增强

| # | 功能 | 说明 |
|------|------|------|
| 5 | **多模型配置体系** | 见下方「P1 #5 专项」 | ✅ 完成 |
| 6 | 节点视觉区分 | 用户问题节点 / AI 回答节点 / 分支标注节点用不同颜色/图标区分 | ✅ 完成 |
| 7 | 追问快捷操作 | 在 AI 回答节点上右键"继续追问"，在当前分支链上追加新对话 | ✅ 完成 |
| 8 | 分支颜色编码 | 不同分支自动分配不同颜色，一眼看出讨论的分叉结构 | ✅ 完成 |
| 9 | 一键导出 Markdown | 将整棵对话树导出为带层级缩进、双链的 Markdown 文件 | ✅ 完成 |
| 10 | 对话节点自动命名 | 节点标题自动取前 50 字作为摘要，Canvas 上不用打开就能看到内容梗概 | ✅ 完成 |
| 11 | 流式刷新 | **已实现** token 级流式更新到 Canvas 节点 | ✅ 完成 |
| 12 | 分支方向快捷模板 | BranchModal 输入框下方显示可点击的模板 chips | ✅ 完成 |

### P1 #12 专项：分支方向快捷模板

**设计原则：模板不是默认值，而是快捷插入。** 输入框保持空白，用户零障碍直接打字；需要时点模板 chip 一键填入。

**交互方案：**

```
┌─────────────────────────────────────┐
│ 方向 1  [                    ] 🗑     │  ← 空白，placeholder 灰色提示
│ 方向 2  [                    ] 🗑     │
│                                       │
│         [+ 添加方向]                  │
│                                       │
│ ── 快捷模板 ──────────────────────    │
│ 「从「__」角度分析」 「换个思路继续」   │  ← 点击 = 插入当前聚焦输入框
│ 「深入探讨：__」 「假设__不成立」       │
│ 「补充一个角度」                       │
└─────────────────────────────────────┘
```

**内置预设模板：**

| 模板 | 说明 |
|------|------|
| 从「____」角度分析 | 带占位符，插入后光标落位 |
| 换个思路继续 | 直接可用 |
| 深入探讨：____ | 带占位符 |
| 假设____不成立呢 | 带占位符 |
| 补充一个角度 | 直接可用 |

**关键设计决策：**
- 不预填——避免"先删再改"的糟糕体验
- 占位符 `____` 插入后自动选中，用户直接打字替换
- 用户可在 Settings 中增删自定义模板
- 模板 chips 单行横排，不占太多弹窗空间

**数据结构：**

```typescript
interface BranchTemplate {
  id: string;
  text: string;       // "从「____」角度分析"
  builtin: boolean;    // 内置 vs 用户自定义
}
```

---

### P1 #5 专项：多模型配置体系

> 原规划 P2 #16「角色扮演分叉」已并入此项。模型配置即角色定义——别名是人设名，系统提示词是角色指令，颜色是视觉标识。

#### 配置界面重设计

从「全局单一配置」改为「模型配置列表」，每个模型/角色独立配置：

```
模型配置列表
┌────────────────────────────────────────────┐
│ 📋 模型 1: DeepSeek 分析师                     │
│ ├ 别名: 分析师                                │
│ ├ Provider: DeepSeek                          │
│ ├ Base URL: https://api.deepseek.com/v1/...   │
│ ├ API Key 环境变量: DEEPSEEK_API_KEY         │
│ ├ 模型: [deepseek-chat ▾] ← 远端获取          │
│ ├ 颜色: 🔵 蓝色                                │
│ ├ 图标: 🔬                                    │
│ ├ 系统提示词: 你是一个严谨的分析师...           │
│ ├ Temperature: 0.7                            │
│ └ Max Tokens: 4096                           │
├────────────────────────────────────────────┤
│ 📋 模型 2: GPT-4 魔鬼代言人                    │
│ └ ...（同样结构）                              │
├────────────────────────────────────────────┤
│ [+ 添加模型]                                  │
└────────────────────────────────────────────┘
```

#### 每个模型可配置的字段

| 字段 | 说明 |
|------|------|
| 别名 | 显示名（"分析师"、"魔鬼代言人"），比 provider+model 直观 |
| Provider | deepseek / openai / custom |
| Base URL | API endpoint，支持 OpenAI 兼容协议的任意端点 |
| API Key 环境变量 | 从操作系统环境变量中安全读取，不明文存储 |
| 模型名称 | 手动输入或从远端获取模型列表选择 |
| 颜色 | Canvas 节点边框/背景色，一眼区分谁说的 |
| 图标/Avatar | Canvas 节点上的小标识（🔬分析师 🔴魔鬼 🔵工程师） |
| 系统提示词 | 每个模型独立人设，支持多角色讨论/辩论 |
| Temperature | 创造性 vs 严谨，不同角色不同值（默认 0.7） |
| Max Tokens | 不同模型 token 上限不同（默认 4096） |

#### 连通性测试

配置时点「测试」按钮 → GET `/v1/models` 拉取远端模型列表 + 验证 API Key + endpoint + 网络连通性。

- 成功：显示可选模型列表供用户选择
- 失败：显示错误原因（Key 无效 / endpoint 不通 / 网络超时）

#### 模型预设组

保存常用模型组合，一键加载：

```
预设组: "辩论赛"
├── 🔵 DeepSeek 分析师 (temperature: 0.3, 严谨)
├── 🔴 GPT-4 魔鬼代言人 (temperature: 0.9, 犀利)
└── 🟢 Claude 裁判 (temperature: 0.5, 中立)

预设组: "代码评审"
├── 前端专家
├── 后端专家
└── 测试专家
```

#### 玩法示例：多角色辩论

```
[问题: 该不该用微服务?]
     ├──🔵[分析师 DeepSeek]: 从架构角度...
     ├──🔴[魔鬼代言人 GPT-4]: 反驳分析师的...
     └──🟢[工程师 Claude]: 实际落地建议...
```

右键选模型分叉 → 每个分支一个角色，颜色区分，系统提示词定义人设。

#### 数据结构

```typescript
interface ModelConfig {
  id: string;              // 唯一标识
  alias: string;           // "分析师"
  provider: string;        // deepseek | openai | custom
  baseUrl: string;         // API endpoint
  apiKeyEnvVar: string;    // 环境变量名
  model: string;           // deepseek-chat / gpt-4o
  color: string;           // "#4A90D9"
  icon?: string;           // "🔬"
  systemPrompt: string;    // 系统提示词
  temperature?: number;    // 0-2，默认 0.7
  maxTokens?: number;      // 默认 4096
}

interface PresetGroup {
  name: string;            // "辩论赛"
  models: ModelConfig[];   // 预设的模型组合
}
```

#### 开发拆分

| 子任务 | 说明 | 优先级 |
|--------|------|--------|
| 数据结构改造 | PluginSettings 从单模型改为 ModelConfig[] | 🔴 先做 |
| 配置 UI | 动态列表，增删改，每项完整字段编辑 | 🔴 | 
| 连通性测试 | 调 /v1/models 验证 + 拉取模型列表 | 🟡 |
| 分叉时选模型 | 右键菜单二级选择，显示别名+颜色 | 🟡 |
| 模型预设组 | 保存/加载常用模型组合 | 🟢 最后 |

---

## M3.5 用户实测修复记录（2026-07-11 凌晨）

用户在实际 Canvas 对话测试中发现并修复的问题，共 7 个 commit：

| Commit | 问题 | 修复 |
|--------|------|------|
| `923ee33` | 颜色改了用户输入节点和源节点 | 颜色只作用于 AI 生成的回答节点 |
| `5f1215d` | 导出截断内容、格式被 `>` 修改、文件节点无双链 | 全文导出 + 保留原文格式 + `[[文件名]]` 双链 |
| `1acb12f` | AI 回答后自动生成空节点干扰布局 | 移除所有自动创建空节点逻辑 |
| `1acb12f` | 空节点点「提交到 AI」无提示 | 空内容时弹框拦截 |
| `50a2b4e` | 分叉方向被当作 system 消息，AI 不当回事 | 改为 user 消息放在对话历史最后 |
| `50a2b4e` | AI 回答被加 `> 🤖` 前缀污染上下文 | setNodeSummary 只写元数据不改文本 |
| `430b513` | **多入边选错父节点导致上下文串台**（核心 bug） | findParentNodeId 按角色交替优先级选择 |

### 核心案例分析

用户提供了一个 Canvas 文件，暴露了多入边 bug：

```
user "镜头语言" → assistant(A) ──┬── [分叉] assistant(B) "蒙太奇"
                                  └── user "一镜到底" → assistant(C)
```

节点 "一镜到底" 有两条入边（来自 A 和 B），旧代码取第一个匹配（B），
导致 AI 收到连续两个 assistant 消息，完全跑题。

修复后：user 节点优先选 assistant 父 → 正确选到 A。

---

## P2 — 体验增强

### P2 技术前置：Provider 抽象重构

> **触发原因**：Skills 功能（#21）需要 Provider 抽象作为基础。借此机会把 api.ts 的 LLMClient 重构为 Provider 接口，让后续功能（MCP、分支合并等）都受益。

**当前架构问题**：
- `api.ts` 的 `LLMClient` 直接绑定了 OpenAI 兼容协议（fetch + SSE）
- `canvas-extension.ts` 直接调 `client.streamChat()`，没有 Provider 中间层
- 添加 Claude CLI / MCP 等新 Provider 需要改核心管线

**重构目标**：

```typescript
// 新增 Provider 接口
interface ChatProvider {
  streamChat(
    messages: ChatMessage[],
    onToken?: StreamCallback,
    signal?: AbortSignal
  ): Promise<string>;

  testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }>;
}

// OpenAI 兼容 Provider（现有逻辑搬迁）
class OpenAIProvider implements ChatProvider { ... }

// 未来: Claude CLI Provider（方案 A）
// class ClaudeCLIProvider implements ChatProvider { ... }
```

**重构范围**：

| 文件 | 改动 | 工作量 |
|------|------|--------|
| `types.ts` | 新增 `ChatProvider` 接口 | 1h |
| `api.ts` → `providers/openai-provider.ts` | LLMClient 改名为 OpenAIProvider，实现 ChatProvider 接口 | 1h |
| `canvas-extension.ts` | `client.streamChat` → `provider.streamChat`（类型变了，调用不变） | 0.5h |
| `settings.ts` | ModelConfig 新增 `providerType` 字段（向后兼容） | 0.5h |
| 测试 | 确保现有功能完全不受影响 | 1h |
| **合计** | | **~4h** |

**关键原则**：
- ✅ 向后兼容——现有 OpenAI 兼容模型配置不受影响
- ✅ 零功能损失——所有 P1 功能正常工作
- ✅ 为 Skills（#21）和 MCP（#18）铺路

---

### P2 功能列表

| # | 功能 | 说明 | 状态 |
|------|------|------|:----:|
| ~~13~~ | ~~分支合并~~ | ~~多分支合并到汇总节点，AI 自动整合~~ | ✅ 完成 |
| 14 | 对话回放 | 按时间顺序逐步高亮节点，回放对话树演变 | ⬜ |
| 15 | 上下文裁剪（分级压缩） | assistant 近全远摘，user 全发；金字塔摘要引导 | ⬜ 下一个 |
| ~~16~~ | ~~分叉框架预设~~ | ~~13 个内置框架，下拉框选择~~ | ✅ 完成 |
| ~~21-1~~ | ~~Skills 阶段 1~~ | ~~`/skill-name` + SKILL.md 注入~~ | ✅ 完成 |
| 21-2 | Skills 阶段 2：Claude CLI Provider | spawn `claude` CLI，完整 skill 执行 | ⬜ 需先装 CLI |
| 22 | 智能追问 | 追问弹窗内提取候选问题，取并集提交 | ⬜ 新增 |
| ~~16~~ | ~~角色扮演分叉~~ | 已并入 P1 #5 | — |

### P2 #15 专项：上下文分级压缩

**方案：近全远摘 + 金字塔摘要引导**

| 设置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| 最近 N 个节点发全文 | 3 | 1-10 | user 节点始终全发，N 只控制 assistant |
| 更远节点截取前 M 字 | 500 | 100-2000 | 配合金字塔摘要不丢信息 |
| system prompt 摘要引导 | 开启 | 开/关 | "开头先概括，再展开" |

**实现要点：**
1. `buildContextFromChain` 接收 `recentFullCount` + `truncateChars` 参数
2. 从 chain 尾部往前数，最近 N 个 assistant 用全文
3. 更远的 assistant 用原文前 M 字
4. user 节点永远全文
5. `chatSummary`（50字）继续用于 hover，不参与压缩

### P2 #22 专项：智能追问

**目标**：追问弹窗内提取候选问题，批量深挖

**交互流程：**
1. 右键 → 💬 继续追问（复用现有菜单项）
2. 弹窗内加「✨ 智能追问」按钮
3. 从 AI 回答提取候选问题：
   - 先正则提取（`###` / `1.` / `-`）
   - fallback 到 AI 生成
4. 候选列表可编辑/删除/添加
5. 发送时取并集：输入框 + 候选列表，合并去重
6. 每个问题各建一组 user+AI 节点（并行请求）

**原型：**
```
┌─────────────────────────────────────────┐
│  💬 继续追问                               │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐ │
│  │ 输入追问内容...                      │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ ✨ 智能追问                          │ │
│  └─────────────────────────────────────┘ │
│  ─ ─ ─ 点击后展开 ─ ─ ─                  │
│  从 AI 回答中提取了 N 个候选问题：        │
│  ┌─────────────────────────────────────┐ │
│  │ ✏️ 问题 1                       [×]  │ │
│  ├─────────────────────────────────────┤ │
│  │ ✏️ 问题 2                       [×]  │ │
│  └─────────────────────────────────────┘ │
│  ＋ 添加问题                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─              │
│  模型   [🤖 deepseek ▾]                   │
│              [发送]    [取消]             │
└─────────────────────────────────────────┘
```

---

### P2 #21 专项：Claude Code Skills 集成

> **目标**：在 Canvas 节点中用 `/skill-name` 调用 Claude Code Skills

#### 技术方案三选一

| 方案 | 原理 | 可行性 | 兼容性 | 简洁性 | 功能完整度 |
|------|------|:------:|:------:|:------:|:---------:|
| **B: SKILL.md 注入** | 读取 `~/.claude/skills/*/SKILL.md`，解析为 prompt，注入 system prompt | ⭐⭐⭐ | 所有模型 | **最高** | ~40%（仅 prompt） |
| **A: CLI Spawn** | spawn `claude` CLI 进程，传入 `/skill-name`，捕获 stdout | ⭐⭐⭐ 已验证 | 仅 Claude | 中等 | **100%** |
| C: MCP 桥接 | 通过 MCP 协议调用 skills | ⭐⭐ | 取决于 server | 最低 | ~80% |

#### 决策：B 先行，A 可选增强

**阶段 1（B）：SKILL.md Prompt 注入**

**前置条件**：Provider 抽象重构完成

**实现**：
1. 扫描 `~/.claude/skills/` 和 `<vault>/.claude/skills/`，解析 `SKILL.md` frontmatter
2. BranchModal 输入框识别 `/` 前缀 → 弹出 skill 列表自动补全
3. 选中 skill 后，将 `SKILL.md` body 拼入 system prompt
4. 正常调用现有 OpenAI 兼容 API

**能力边界**：
- ✅ 纯 prompt 型 skills（代码审查模板、分析框架、文档生成指令等）
- ✅ Skills 的 `description` 用于自动补全提示
- ❌ `!` 动态上下文注入（如 `` !`git diff` ``）不执行
- ❌ 依赖 tool use 的 skills（文件读写、bash 执行）不工作

**估计工作量**：~8h（1-1.5 天）

| 子任务 | 工作量 |
|--------|--------|
| SkillScanner：扫描 + 解析 SKILL.md | 2h |
| SkillSuggestModal：`/` 触发自动补全弹窗 | 3h |
| system prompt 注入逻辑 | 1h |
| 设置页：Skill 目录配置 + 开关 | 1h |
| 测试 | 1h |

**阶段 2（A）：Claude CLI Provider（可选增强）**

**前置条件**：
- 阶段 1 完成并验证
- 用户本地安装了 Claude Code CLI

**实现**：新增 `ClaudeCLIProvider implements ChatProvider`

```typescript
class ClaudeCLIProvider implements ChatProvider {
  async streamChat(messages, onToken, signal) {
    // 1. 将 messages 序列化为 claude --print 输入
    // 2. spawn claude 进程
    // 3. 流式读取 stdout → onToken 回调
    // 4. 处理退出码 / 超时 / 错误
  }
}
```

**与阶段 1 的关系**：
- 阶段 1 的 SkillScanner 和 `/` 自动补全 **完全复用**
- 阶段 2 只是多了一个 Provider 选择
- ModelConfig 加 `providerType: 'openai' | 'claude-cli'`
- 选了 `claude-cli` 时，skills 不仅注入 prompt，还由 Claude Code 完整执行（含 tool use、动态上下文等）

**估计工作量**：~14h（2 天）

| 子任务 | 工作量 |
|--------|--------|
| ClaudeCLIProvider 实现（spawn + 流式解析） | 5h |
| 进程管理（超时、取消、错误恢复） | 3h |
| Settings：CLI 路径配置 + 认证方式 | 2h |
| 安全：权限沙箱确认 | 1h |
| 测试（含边界情况） | 3h |

**B→A 升级增量**：因为 Provider 抽象，**不改任何现有代码**，纯新增一个 Provider 类。

#### Skills 集成对其他 P2 功能的影响

| P2 功能 | 影响 | 说明 |
|---------|------|------|
| #13 分支合并 | 🟢 无影响 | 合并逻辑独立于 Provider，Skills 只是丰富了分叉能力 |
| #14 对话回放 | 🟢 无影响 | 回放是 Canvas 节点遍历，与 Provider 无关 |
| #15 上下文裁剪 | 🟢 无影响 | 裁剪发生在 context.ts 层，在 Provider 调用之前 |
| #16 分叉框架预设 | 🟡 正向协同 | 框架预设可以引用 Skills 作为每个分支的 prompt 模板 |
| Provider 抽象重构 | 🔴 **前置依赖** | 必须先做，Skills 集成依赖它 |

#### 安全考量

| 阶段 | 风险 | 措施 |
|------|------|------|
| B（Prompt 注入） | 低 | 纯文本操作，无文件系统/bash 权限。SKILL.md 内容可审查 |
| A（CLI Spawn） | **高** | Claude Code 有 bash + 文件读写权限。需：①用户显式开启 ②每次调用前确认 ③限制工作目录 |

---

## P3 — 远期愿景

| # | 功能 | 说明 |
|------|------|------|
| ~~17~~ | ~~行业场景模板~~ | ~~已砍掉：#16 框架预设 + #5 模型配置已覆盖需求，三层预设体系过度设计~~ |
| 18 | MCP 工具调用 | 分叉节点可调用外部工具（搜索、代码执行等） |
| 19 | 知识库挂载 | 整个对话树可关联本地笔记库作为 RAG 知识源 |
| 20 | 协作分享 | 导出为只读的交互式 HTML，分享给没有 Obsidian 的人查看讨论过程 |

### ~~三层预设体系~~（已简化）

> 2026-07-12 决策：砍掉 #17 行业场景模板。#16 框架预设 + #5 模型配置两层已足够，第三层属于过度设计，维护成本高、使用频率低。

---

## 不做什么（明确边界）

- ❌ 不做独立 AI 聊天面板（Obsidian 已有 Text Generator / Copilot 等插件）
- ❌ 不做 Agent 自动执行（那是另一个产品方向）
- ❌ 不做实时协作（Obsidian Canvas 本身不支持）
- ❌ 不依赖特定模型供应商（API 层抽象，保持模型无关）*[注：P0 先绑 DeepSeek，P1 再做多 provider 抽象]*

---

## 技术路线

```
基于 fork: HinxCorporation/obsidian-canvas-ai (MIT 协议)

实际代码结构 (v0.1.0):
├── main.ts              ── 插件入口
├── settings.ts          ── 设置管理 + 设置页 UI (P1 #5 多模型配置体系)
├── canvas-extension.ts  ── Canvas 右键菜单 + 分叉/追问/提交逻辑
├── api.ts               ── LLM Provider 层 (OpenAI 兼容，P2 将重构为 Provider 接口)
├── context.ts           ── 对话树遍历 + 上下文构建
├── branch-modal.ts      ── 分叉方向输入弹窗 (多方向批量 + 快捷模板)
├── export.ts            ── 对话树导出 Markdown
├── types.ts             ── 类型定义
├── utils.ts             ── 工具函数 (ID生成、高度自适应等)
├── styles.css           ── 样式
├── manifest.json        ── Obsidian 插件清单
├── versions.json        ── 版本兼容映射
└── LICENSE              ── MIT

P2 已完成新增:
├── providers/
│   ├── index.ts               ── Provider 工厂函数
│   └── openai-provider.ts     ── OpenAI 兼容 Provider
├── skill-scanner.ts           ── Skills 扫描 + 解析 ✅
├── skill-suggest-modal.ts     ── / 触发自动补全 ✅
├── merge-modal.ts             ── 合并分支弹窗 ✅
└── follow-up-modal.ts         ── 追问弹窗 ✅

P2 待新增:
└── (上下文裁剪 + 智能追问 改动现有文件)
```

---

## 开发计划

**建议先做到 P1（#1-#11），2-3 周出第一个可用版本。**

### 里程碑

| 阶段 | 内容 | 预计时间 |
|------|------|---------|
| M1 | Fork 仓库 + 环境搭建 + **代码清理**（审计已完成，fork 可用） | 1-1.5 天 | ✅ 完成 |
| M2 | P0 核心 MVP (#1-#4) — 分叉对话 + 直系上下文继承 + 边标签 | 5-7 天 | ✅ 完成 |
| M3 | P1 体验增强 (#5-#12) — 含多模型 + 视觉增强 + 导出 | 5-8 天 | ✅ 完成 |
| M3.5 | 用户实测修复（5 个 commit，见下方实测记录） | 1 天 | ✅ 完成 |
| M4 | 测试 + 发布 v0.1.0 | 2-3 天 | ✅ 完成 |

### 基础缺陷修复（M3 前置）

以下 3 项在 P0 测试中发现，需在 P1 #5 之前修复：

| # | 缺陷 | 说明 |
|------|------|------|
| A | 角色推断改为元数据驱动 | 当前按节点位置奇偶交替判断 user/assistant，不可靠。改为创建节点时写入 ChatNodeMeta.role |
| B | 追问交互修复 | 在 AI 回答节点上右键追问时，应弹输入框而非直接发送 |
| C | 多方向批量分叉 | BranchModal 改为动态输入框列表，支持一次输入多个方向并行生成分支 |

**总工期：2-3 周**

### 评审决策记录（2026-07-06）

| 问题 | 决策 |
|------|------|
| P0/P1 范围 | ✅ 合理。P0 裁剪多模型到 P1，MVP 更聚焦 |
| 首选模型供应商 | ✅ DeepSeek（便宜、上下文长、OpenAI API 兼容） |
| 流式响应 | ✅ Fork 已实现 token 级流式，直接复用；若性能有问题降级为段落级 |
| 上下文继承策略 | ✅ MVP 只做直系祖先链 |
| 工期 | ✅ 放宽到 2-3 周（原 1-2 周不现实） |
| Fork 代码质量 | ✅ 审计完成，可用作基础，不从零写 |
| 边标签渲染 | ✅ 首选 `edge.label`，备选标签节点方案 |
| 产品定位 | ✅ "对话即地图"——从 README 起就讲清楚这个故事 |

### 最大风险（审计后更新）

~~**Obsidian Canvas API 对实时更新的限制**~~ → ✅ **已消除**：Fork 审计发现 token 级流式更新已通过 `setText()` + DOM scrollHeight 实现并正常工作。

**当前主要风险调整为：**

1. **上下文继承的图遍历复杂度**（P0 #3）—— Canvas 是图结构非树结构，一个节点可能有多个父节点。MVP 策略：只走直系祖先链（从当前节点沿 `edge.fromNode` 逐级向上），不做跨分支交汇。若后续需要更复杂策略，考虑 BFS/DFS + 分支标记。

2. **边标签渲染位置**（P0 #4）—— Canvas `edge.label` 渲染位置/样式不可控。已有备选方案（标签节点），M2 阶段验证效果。

3. **多模型 API 差异**（P1 #5）—— 不同供应商的 message format、stream 格式、错误码有差异。MVP 只接 DeepSeek（OpenAI 兼容），M3 再抽象。

---

## 🔍 Fork 代码审计报告（2026-07-06）

**仓库**: HinxCorporation/obsidian-canvas-ai | ⭐4 | 🍴0 | MIT | v0.1.0

### 代码规模

| 文件 | 大小 | 内容 |
|------|------|------|
| `main.ts` | 3.2K | 插件入口（含大量样板垃圾代码） |
| `chat.ts` | 6.1K | 核心对话逻辑 |
| `settings.ts` | 3.3K | 设置管理 |
| 依赖 | — | axios（~1000+ 传递依赖，实际未使用） |

### 已有能力（可复用）

| 能力 | 状态 | 说明 |
|------|------|------|
| Canvas 节点右键菜单 | ✅ | `canvas:node-menu` 事件 + "提交到Ai" 菜单项 |
| AI 回答节点创建 | ✅ | `createTextNode` 在问题节点下方创建答案节点 |
| Edge 连线 | ✅ | 自动连接 Q&A 节点，底部→顶部 |
| **流式 token 更新到 Canvas** | ✅ | `setText(token)` 逐 token 写入 + DOM scrollHeight 计算高度 |
| DeepSeek API 对接 | ✅ | Fetch + SSE 流 |
| 设置页 | ✅ | API Key / 模型 / 自定义指令 |

### 质量问题（需修复 / 重写）

| 问题 | 严重度 | 详情 |
|------|--------|------|
| main.ts 样板垃圾 | 🔴 | ribbon icon、status bar、sample modal/command 等官方示例代码未清理 |
| 只支持 DeepSeek | 🟡 | API endpoint 硬编码，需抽象为多 provider |
| 无多轮对话 | 🔴 | 当前只是单次 Q&A |
| 无分支概念 | 🔴 | 整个分支逻辑需要从零构建 |
| 无上下文继承 | 🔴 | 每次请求只带当前节点文本 + system prompt |
| 错误处理弱 | 🟡 | 仅 try/catch + throw，无重试/降级/超时 |
| DOM 直接操作 | 🟡 | `contentEl.firstChild.firstChild.scrollHeight`，脆弱 |
| `randomUUID` from crypto | 🟡 | 非标准 API（Electron 可用但不够稳妥） |
| axios 冗余依赖 | 🟠 | chat.ts 实际用 Fetch API，axios 未使用 |
| 定时器/事件噪音 | 🟡 | 每 5 分钟 log、全局 click 监听 |

### 审计结论

**✅ 可用作基础，不建议从零写。**

1. Canvas 节点创建 + edge 管理 + 流式更新这三大核心能力已跑通，代码量少（6K），改起来快
2. 垃圾主要在 main.ts 和细节处理，属于"清垃圾"而非"改架构"
3. 分支逻辑需要从零构建，但可复用现有的 Canvas API 集成模式

**M1 改造清单：**
1. 清理 main.ts 样板代码（30min）
2. 移除 axios 依赖，换轻量 fetch wrapper（30min）
3. 抽象 API 层 → provider 抽象（DeepSeek 先，接口兼容 OpenAI）（2h）
4. 建立分支数据结构（branch tree）和 Canvas edge label 映射（2h）
5. 清理定时器、全局事件等噪音代码（15min）
6. 封装 `scrollHeight` 读取方法，加 null-check 兜底，替换脆弱的 DOM 链式访问（15min）
