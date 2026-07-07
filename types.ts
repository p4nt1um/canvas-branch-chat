/**
 * types.ts — Obsidian Canvas Branch Chat
 * 
 * 类型定义，覆盖：
 * 1. Obsidian Canvas 内部运行时类型（公开 API 未暴露）
 * 2. 分支对话数据结构
 * 3. LLM API provider 抽象
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
