/**
 * types.ts — Obsidian Canvas Branch Chat
 * 
 * 类型定义，覆盖：
 * 1. Obsidian Canvas 内部运行时类型（公开 API 未暴露）
 * 2. 分支对话数据结构
 * 3. LLM API provider 抽象
 * 4. 多模型配置（P1 #5）
 */

import { CanvasEdgeData, CanvasTextData } from 'obsidian/canvas';

// ============================================================
// Canvas 节点数据扩展（角色元数据）
// ============================================================

/** Canvas 文本节点的对话元数据扩展字段 */
export interface ChatNodeData extends CanvasTextData {
  /** 节点对话角色 */
  chatRole?: 'user' | 'assistant' | 'branch-point';
  /** 所属分支 ID */
  chatBranchId?: string;
  /** 使用的模型配置 ID（assistant 节点记录用哪个模型生成的） */
  modelConfigId?: string;
  /** P1 #8: 分支颜色（视觉编码） */
  chatBranchColor?: string;
  /** P1 #10: 节点摘要标题 */
  chatSummary?: string;
  /** P2 #14: 创建时间戳（用于回放排序） */
  createdAt?: number;
}

// ============================================================
// Canvas 内部运行时类型（canvas:node-menu 回调参数）
// ============================================================

/** Obsidian Canvas 内部运行时节点对象 */
export interface CanvasRuntimeNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  /** 所属 Canvas 视图 */
  canvas: CanvasRuntimeView;
  
  getData(): CanvasTextData;
  setData(data: Partial<CanvasTextData>): void;
  setText(text: string): void;
  
  /** DOM 容器，用于获取实际渲染高度 */
  contentEl: HTMLElement;
}

/** 矩形区域 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Obsidian Canvas 内部运行时视图对象 */
export interface CanvasRuntimeView {
  /** 创建新文本节点 */
  createTextNode(opts: {
    pos: { x: number; y: number };
    text: string;
    size?: { width: number; height: number };
    focus?: boolean;
  }): CanvasRuntimeNode;

  /** 获取 Canvas 持久化数据 */
  getData(): CanvasData;
  
  /** 写入 Canvas 持久化数据 */
  setData(data: CanvasData): void;
  
  /** 触发自动保存 */
  requestSave(): void;

  /** 缩放至全部内容 */
  zoomToFit?(): void;

  /** 缩放至指定区域 */
  zoomToBbox?(bbox: BBox): void;

  /** 获取当前视口区域 */
  getViewportBBox?(): BBox;
}

/** Canvas .canvas 文件数据结构 */
export interface CanvasData {
  nodes: CanvasTextData[];
  edges: CanvasEdgeData[];
  [key: string]: unknown;
}

// ============================================================
// 分支对话数据结构
// ============================================================

/** 分支方向标注 */
export interface BranchLabel {
  /** 分支方向文字，如"从成本角度分析" */
  text: string;
  /** 标注在 edge 上的标签 */
  edgeLabel: string;
}

/** 对话节点元数据（存储在 CanvasTextData 的扩展字段中） */
export interface ChatNodeMeta {
  /** 节点角色 */
  role: 'user' | 'assistant' | 'branch-point';
  /** 所属分支 ID */
  branchId: string;
  /** 父节点 ID */
  parentNodeId: string | null;
  /** 分支方向（仅 branch-point 节点有值） */
  branchDirection?: string;
}

/** 分支记录 */
export interface Branch {
  /** 分支唯一 ID */
  id: string;
  /** 分支方向标注 */
  label: string;
  /** 该分支的根节点 ID */
  rootNodeId: string;
  /** 角色预设（P2 用到） */
  rolePreset?: string;
}

// ============================================================
// LLM API Provider 抽象
// ============================================================

/** 支持的消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant';

/** 对话消息 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** LLM 请求参数 */
export interface ChatRequest {
  messages: ChatMessage[];
  stream: boolean;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

/** ChatProvider 接口：统一 LLM 调用抽象，P2 Provider 重构引入 */
export interface ChatProvider {
  /** 流式对话 */
  streamChat(
    messages: ChatMessage[],
    onToken?: StreamCallback,
    signal?: AbortSignal
  ): Promise<string>;

  /** 连通性测试 */
  testConnection(): Promise<{ ok: boolean; models?: string[]; error?: string }>;
}

/** Provider 执行模式 */
export type ProviderType = 'openai' | 'claude-cli';

/** Skills 集成：解析后的 SKILL.md 信息 */
export interface SkillInfo {
  /** 技能名（SKILL.md frontmatter name） */
  name: string;
  /** 技能描述（SKILL.md frontmatter description） */
  description: string;
  /** SKILL.md body（不含 frontmatter） */
  body: string;
  /** 文件路径 */
  path: string;
  /** 来源 */
  source: 'global' | 'project';
}

/** Provider 配置 */
export interface ProviderConfig {
  /** Provider 名称（如 'deepseek', 'openai', 'custom'） */
  name: string;
  /** API endpoint */
  baseUrl: string;
  /** API key */
  apiKey: string;
  /** 默认模型 */
  defaultModel: string;
  /** 可用模型列表 */
  models: string[];
}

/** LLM streaming 回调 */
export type StreamCallback = (token: string) => void;

// ============================================================
// 上下文构建
// ============================================================

/** 语境遍历节点 */
export interface ContextNode {
  nodeId: string;
  role: MessageRole;
  content: string;
  branchId: string;
}

// ============================================================
// P1 #5: 多模型配置体系
// ============================================================

/** 单个模型配置 */
export interface ModelConfig {
  /** 唯一标识 */
  id: string;
  /** 显示别名（"分析师"、"魔鬼代言人"） */
  alias: string;
  /** Provider 类型 */
  provider: 'deepseek' | 'openai' | 'custom';
  /** API endpoint */
  baseUrl: string;
  /** API Key 环境变量名 */
  apiKeyEnvVar: string;
  /** 模型名称 */
  model: string;
  /** Canvas 节点颜色 */
  color: string;
  /** 图标 emoji */
  icon?: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 温度（0-2，默认 0.7） */
  temperature?: number;
  /** Max tokens（默认 4096） */
  maxTokens?: number;
  /** Provider 执行模式：'openai' = OpenAI 兼容 HTTP API（默认），'claude-cli' = 本地 Claude Code CLI */
  providerType?: ProviderType;
  /** 测试连接后拉取到的可用模型列表（运行时缓存，不持久化） */
  _availableModels?: string[];
}

/** 模型预设组 */
export interface PresetGroup {
  /** 预设组名称 */
  name: string;
  /** 包含的模型配置列表 */
  models: ModelConfig[];
}

/** P1 #12: 分支方向快捷模板 */
export interface BranchTemplate {
  id: string;
  text: string;
  text_en?: string;
  builtin: boolean;
}

/** P2 #16: 分叉框架预设 */
export interface BranchFramework {
  /** 唯一标识 */
  id: string;
  /** 框架名称 */
  name: string;
  /** 框架名称（英文） */
  name_en?: string;
  /** 图标 emoji */
  icon?: string;
  /** 方向列表 */
  directions: string[];
  /** 方向列表（英文） */
  directions_en?: string[];
  /** 说明 */
  description: string;
  /** 说明（英文） */
  description_en?: string;
  /** 内置 vs 用户自定义 */
  builtin: boolean;
}

/** 内置默认模板 */
export const DEFAULT_BRANCH_TEMPLATES: BranchTemplate[] = [
  { id: 'bt1', text: '从「____」角度分析', text_en: 'Analyze from "____" perspective', builtin: true },
  { id: 'bt2', text: '换个思路继续', text_en: 'Try a different angle', builtin: true },
  { id: 'bt3', text: '深入探讨：____', text_en: 'Dive deeper: ____', builtin: true },
  { id: 'bt4', text: '假设____不成立呢', text_en: 'What if "____" is not true?', builtin: true },
  { id: 'bt5', text: '补充一个角度', text_en: 'Add another perspective', builtin: true },
];

/** P2 #16: 内置框架预设（前 8 个优先级更高） */
export const DEFAULT_FRAMEWORKS: BranchFramework[] = [
  { id: 'fw1', name: '正反合', name_en: 'Thesis-Antithesis-Synthesis', icon: '⚖️', directions: ['正方观点', '反方观点', '综合以上正反'], directions_en: ['Thesis: arguments for', 'Antithesis: arguments against', 'Synthesis: combine both sides'], description: '快速辩证，正反综合', description_en: 'Quick dialectical debate, synthesize pros and cons', builtin: true },
  { id: 'fw2', name: '多角度分析', name_en: 'Multi-Perspective', icon: '🔍', directions: ['从技术角度', '从成本角度', '从用户体验角度', '从风险角度'], directions_en: ['From a technical perspective', 'From a cost perspective', 'From a UX perspective', 'From a risk perspective'], description: '全面评估问题的多个维度', description_en: 'Evaluate the problem from multiple dimensions', builtin: true },
  { id: 'fw3', name: '六顶思考帽', name_en: 'Six Thinking Hats', icon: '🎩', directions: ['白帽：客观事实和数据', '红帽：直觉、情感和预感', '黑帽：风险、批判和问题', '黄帽：积极价值和利益', '绿帽：创新和可能性', '蓝帽：全局总结和流程控制'], directions_en: ['White Hat: facts and data', 'Red Hat: intuition and feelings', 'Black Hat: risks and criticism', 'Yellow Hat: benefits and value', 'Green Hat: creativity and possibilities', 'Blue Hat: process and summary'], description: '团队讨论，六种思维模式', description_en: 'Team discussion with six thinking modes', builtin: true },
  { id: 'fw4', name: '渐进细化', name_en: 'Progressive Refinement', icon: '🔬', directions: ['概述这个问题', '深入分析关键细节', '提出具体执行方案'], directions_en: ['Overview of the problem', 'Deep dive into key details', 'Propose actionable solutions'], description: '从概到深，逐步聚焦', description_en: 'From overview to deep dive, progressively focus', builtin: true },
  { id: 'fw5', name: 'SWOT', name_en: 'SWOT', icon: '📊', directions: ['优势 (Strengths)', '劣势 (Weaknesses)', '机会 (Opportunities)', '威胁 (Threats)'], directions_en: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'], description: '战略分析经典框架', description_en: 'Classic strategic analysis framework', builtin: true },
  { id: 'fw6', name: '5W2H', name_en: '5W2H', icon: '📋', directions: ['What：是什么', 'Why：为什么做', 'Who：谁负责', 'When：时间节点', 'Where：在哪做', 'How：怎么做', 'How much：预算多少'], directions_en: ['What: define the objective', 'Why: the reason behind it', 'Who: responsible person', 'When: timeline', 'Where: location/context', 'How: execution plan', 'How much: budget/resources'], description: '项目规划全景分析', description_en: 'Comprehensive project planning analysis', builtin: true },
  { id: 'fw7', name: '利弊得失', name_en: 'Pros & Cons', icon: '💰', directions: ['做的收益', '不做的风险', '折中方案'], directions_en: ['Benefits of doing it', 'Risks of not doing it', 'Compromise/middle ground'], description: '决策权衡利弊', description_en: 'Weigh pros and cons for decision-making', builtin: true },
  { id: 'fw8', name: '复盘四步', name_en: 'Retrospective (4 Steps)', icon: '🔄', directions: ['目标是什么', '实际怎样', '差距原因', '下次怎么改'], directions_en: ['What was the goal?', 'What actually happened?', 'Why the gap?', 'How to improve next time?'], description: '经验总结与改进', description_en: 'Reflect on experience and improve', builtin: true },
  { id: 'fw9', name: 'MECE 互斥穷尽', name_en: 'MECE (Mutually Exclusive, Collectively Exhaustive)', icon: '🧩', directions: ['按维度 A 分类分析', '按维度 B 分类分析（与 A 互斥）', '检查是否有遗漏'], directions_en: ['Classify by dimension A', 'Classify by dimension B (mutually exclusive with A)', 'Check for gaps (collectively exhaustive)'], description: '不重不漏地拆解问题', description_en: 'Decompose without overlap or gaps', builtin: true },
  { id: 'fw10', name: 'Past-Present-Future', name_en: 'Past-Present-Future', icon: '⏳', directions: ['过去怎么做的（历史经验）', '现在的情况（现状盘点）', '未来怎么走（趋势预判）'], directions_en: ['Past: historical experience', 'Present: current situation', 'Future: trend and direction'], description: '时间线视角分析', description_en: 'Timeline perspective analysis', builtin: true },
  { id: 'fw11', name: '假设-验证-结论', name_en: 'Hypothesis-Test-Conclusion', icon: '💡', directions: ['提出假设', '设计验证方法', '预判可能结论'], directions_en: ['Propose a hypothesis', 'Design a verification method', 'Anticipate possible conclusions'], description: '科学推理方法论', description_en: 'Scientific reasoning methodology', builtin: true },
  { id: 'fw12', name: '用户旅程', name_en: 'User Journey', icon: '🛤️', directions: ['发现阶段（用户怎么知道）', '决策阶段（为什么选你）', '使用阶段（体验如何）', '流失阶段（为什么离开）'], directions_en: ['Discovery: how users find you', 'Decision: why they choose you', 'Usage: the experience', 'Churn: why they leave'], description: '产品视角用户全链路', description_en: 'Full user journey from a product perspective', builtin: true },
  { id: 'fw13', name: '技术选型对比', name_en: 'Tech Stack Comparison', icon: '⚙️', directions: ['方案 A 优劣', '方案 B 优劣', '综合推荐'], directions_en: ['Option A: pros & cons', 'Option B: pros & cons', 'Recommendation & summary'], description: '技术方案对比决策', description_en: 'Compare technical solutions for decision-making', builtin: true },
];

/** P1 #8: 分支颜色调色板 */
export const BRANCH_COLOR_PALETTE = [
  '#4A90D9', '#E74C3C', '#27AE60', '#F39C12',
  '#9B59B6', '#E67E22', '#1ABC9C', '#34495E',
];

/** 插件设置（多模型版本） */
export interface PluginSettingsV2 {
  /** 模型配置列表 */
  models: ModelConfig[];
  /** 默认模型 ID（指向 models 中的某一项） */
  defaultModelId: string;
  /** 全局自定义指令（兼容旧版，可作为默认 system prompt） */
  customInstructions: string;
  /** 预设组 */
  presetGroups?: PresetGroup[];
  /** P1 #12: 用户自定义快捷模板（undefined = 使用内置默认） */
  branchTemplates?: BranchTemplate[];
  /** P2 #16: 用户自定义分叉框架预设（undefined = 使用内置默认） */
  frameworks?: BranchFramework[];
  /** P2 #15: 最近 N 个 assistant 节点发全文 */
  contextRecentFull?: number;
  /** P2 #15: 更远的节点截取前 M 字 */
  contextTruncateChars?: number;
  /** P2 #15: system prompt 摘要引导开关 */
  summaryGuidance?: boolean;

  /** 界面语言（'auto' = 跟随系统） */
  language?: 'auto' | 'zh' | 'en';
}

/** Provider 默认配置 */
export const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string; models: string[] }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1-mini'],
  },
  custom: {
    baseUrl: '',
    model: '',
    models: [],
  },
};

/** 颜色预设 */
export const COLOR_PRESETS = [
  { label: '🔵 蓝', value: '#4A90D9' },
  { label: '🔴 红', value: '#E74C3C' },
  { label: '🟢 绿', value: '#27AE60' },
  { label: '🟡 黄', value: '#F39C12' },
  { label: '🟣 紫', value: '#9B59B6' },
  { label: '🟠 橙', value: '#E67E22' },
  { label: '⚫ 黑', value: '#2C3E50' },
  { label: '⚫ 灰', value: '#95A5A6' },
];
