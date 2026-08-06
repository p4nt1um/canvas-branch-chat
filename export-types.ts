/**
 * 导出交互式 HTML 的数据结构
 */

export interface ExportNode {
  id: string;
  type: 'user' | 'ai';
  content: string;
  role?: string;  // 分析师/魔鬼代言人
  color?: string;
  icon?: string;
  direction?: string;  // 分支方向标签
  children: ExportNode[];
  model?: string;  // deepseek-chat / gpt-4
  timestamp?: number;
  isBranchPoint: boolean;  // 是否分叉点
  parentId?: string;
}

export interface ExportMetadata {
  title: string;
  exportTime: Date;
  models: string[];
  nodeCount: number;
  branchCount: number;
  rootContent: string;  // 根节点第一句话（用于文件名）
}

export interface ExportContext {
  nodes: ExportNode[];
  metadata: ExportMetadata;
}

export interface ExportConfig {
  viewMode: 'flow' | 'tree';  // 流式视图 / 分支树视图
  includeMarkdown: boolean;  // Markdown 渲染
  includeToggle: boolean;    // 展开/收起
  includeReplay: boolean;    // 对话回放
  includeSearch: boolean;    // 搜索功能
  theme: 'light' | 'dark' | 'auto';  // 主题
}

export const DEFAULT_CONFIG: ExportConfig = {
  viewMode: 'flow',
  includeMarkdown: true,
  includeToggle: true,
  includeReplay: true,
  includeSearch: true,
  theme: 'auto',
};