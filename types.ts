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
}

/** Canvas .canvas 文件数据结构 */
export interface CanvasData {
  nodes: CanvasTextData[];
  edges: CanvasEdgeData[];
  [key: string]: any;
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
