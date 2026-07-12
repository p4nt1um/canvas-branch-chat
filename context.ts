/**
 * context.ts — 对话树遍历 + 上下文构建
 *
 * 核心能力：
 * 1. 沿直系祖先链向上遍历（从当前节点沿 edge 逐级追溯父节点）
 * 2. 收集祖先链上的对话内容，按时间顺序构建 messages 数组
 *
 * MVP 策略：只走直系祖先链，不处理跨分支交汇。
 */

import { CanvasRuntimeNode, CanvasRuntimeView, ChatMessage, CanvasData, ChatNodeData } from './types';
import type { CanvasTextData } from 'obsidian/canvas';

// ============================================================
// Canvas 边查找
// ============================================================

/**
 * 查找给定节点的父节点 ID
 *
 * 当节点有多条入边时，按以下优先级选择"对话父节点"：
 * 1. 角色交替正确（user←assistant, assistant←user）
 * 2. 都不匹配时 fallback 到第一个入边
 */
export function findParentNodeId(
  canvas: CanvasRuntimeView,
  nodeId: string
): string | null {
  const data: CanvasData = canvas.getData();

  // 收集所有入边的 fromNode
  const parentIds: string[] = [];
  for (const edge of data.edges) {
    if (edge.toNode === nodeId) {
      parentIds.push(edge.fromNode);
    }
  }

  if (parentIds.length === 0) return null;
  if (parentIds.length === 1) return parentIds[0];

  // 多入边：优先选角色交替正确的父节点
  const childRole = getNodeRole(findNodeById(canvas, nodeId)!);
  for (const pid of parentIds) {
    const parentNode = findNodeById(canvas, pid);
    if (!parentNode) continue;
    const parentRole = getNodeRole(parentNode);
    // user 的父应为 assistant，assistant 的父应为 user
    if (childRole === 'user' && parentRole === 'assistant') return pid;
    if (childRole === 'assistant' && parentRole === 'user') return pid;
  }

  // fallback: 第一个入边
  return parentIds[0];
}

/**
 * 查找给定节点的所有直接子节点 ID
 */
export function findChildNodeIds(
  canvas: CanvasRuntimeView,
  nodeId: string
): string[] {
  const data: CanvasData = canvas.getData();
  return data.edges
    .filter((e) => e.fromNode === nodeId)
    .map((e) => e.toNode);
}

// ============================================================
// 节点查找
// ============================================================

/**
 * 在 Canvas 中按 ID 查找节点（运行时对象）
 *
 * Obsidian Canvas 内部维护 nodes 字典，
 * 但公开 API 没有 getById。我们通过 nodes 属性访问。
 */
export function findNodeById(
  canvas: CanvasRuntimeView,
  nodeId: string
): CanvasRuntimeNode | null {
  // Obsidian Canvas 内部有 nodes 字典（Map 或对象）
  const internalCanvas = canvas as unknown as {
    nodes?: Map<string, CanvasRuntimeNode> | Record<string, CanvasRuntimeNode>;
    _nodes?: Map<string, CanvasRuntimeNode> | Record<string, CanvasRuntimeNode>;
  };
  
  // 尝试多种可能的内部属性名
  const nodesMap = internalCanvas.nodes ?? internalCanvas._nodes;
  if (!nodesMap) return null;

  // Map 或 Object
  if (nodesMap instanceof Map) {
    return nodesMap.get(nodeId) ?? null;
  }
  return nodesMap[nodeId] ?? null;
}

/**
 * 获取节点的文本内容
 */
export function getNodeText(node: CanvasRuntimeNode): string {
  if (typeof node.text === 'string') return node.text;
  
  // 通过 getData 获取
  const data = node.getData?.();
  return data?.text ?? '';
}

// ============================================================
// 角色元数据读写
// ============================================================

/**
 * 从节点读取对话角色
 *
 * 优先从 canvas 数据层读取（可靠持久化），
 * fallback 到节点 getData（运行时可能未同步）
 */
export function getNodeRole(node: CanvasRuntimeNode): 'user' | 'assistant' | 'branch-point' | null {
  try {
    // 方式1：从 canvas 数据层读取（最可靠）
    const canvas = node.canvas;
    if (canvas) {
      const canvasData = canvas.getData();
      const nodeData = canvasData.nodes.find((n: CanvasTextData) => n.id === node.id) as ChatNodeData | undefined;
      if (nodeData && nodeData.chatRole) {
        return nodeData.chatRole;
      }
    }
    // 方式2：从节点 getData 读取
    const data = node.getData() as Partial<ChatNodeData>;
    return data?.chatRole ?? null;
  } catch {
    return null;
  }
}

/**
 * P2 #14: 获取节点创建时间戳
 * fallback: null（旧节点可能没有）
 */
export function getNodeCreatedAt(node: CanvasRuntimeNode): number | null {
  try {
    const canvas = node.canvas;
    if (canvas) {
      const canvasData = canvas.getData();
      const nodeData = canvasData.nodes.find((n: CanvasTextData) => n.id === node.id) as ChatNodeData | undefined;
      if (nodeData?.createdAt) return nodeData.createdAt;
    }
    const data = node.getData() as ChatNodeData;
    return data?.createdAt ?? null;
  } catch {
    return null;
  }
}

/**
 * 在节点上写入对话角色元数据
 *
 * 同时写入 canvas 数据层（持久化）和节点运行时
 * P2 #14: 同时写入 createdAt 时间戳
 */
export function setNodeRole(node: CanvasRuntimeNode, role: 'user' | 'assistant' | 'branch-point'): void {
  setNodeMetadata(node, { chatRole: role, createdAt: Date.now() });
}

/**
 * P1 #6: 设置节点颜色（角色视觉区分）
 */
export function setNodeColor(node: CanvasRuntimeNode, color: string): void {
  setNodeMetadata(node, { color });
}

/**
 * P1 #8/#10: 批量写入节点元数据
 *
 * 同时写入 canvas 数据层（持久化）和节点运行时
 */
export function setNodeMetadata(node: CanvasRuntimeNode, metadata: Record<string, unknown>): void {
  try {
    const canvas = node.canvas;
    if (canvas) {
      const canvasData = canvas.getData();
      const nodeData = canvasData.nodes.find((n: CanvasTextData) => n.id === node.id);
      if (nodeData) {
        Object.assign(nodeData, metadata);
        canvas.setData(canvasData);
        canvas.requestSave();
      }
    }
    // 同时写入节点运行时
    const data = node.getData();
    node.setData({ ...data, ...metadata });
  } catch {
    // 忽略
  }
}

// ============================================================
// 直系祖先链遍历
// ============================================================

/**
 * 从指定节点向上遍历所有可达祖先（多父 DAG 感知），返回节点 ID 列表（从根到当前）
 *
 * P2 #13 修复：原版只走单条父链，多入边节点丢失上下文。
 * 现在用 DFS 收集所有可达祖先，再按 y 坐标排序（对话从上到下）。
 *
 * 防御：
 * - 环检测（visited 集合）
 * - 深度限制（maxDepth）
 */
export function getAncestorChain(
  canvas: CanvasRuntimeView,
  startNodeId: string,
  maxDepth: number = 50
): string[] {
  const visited = new Set<string>();
  const collected: { id: string; y: number }[] = [];

  const collect = (nodeId: string) => {
    if (visited.has(nodeId) || collected.length >= maxDepth) return;
    visited.add(nodeId);

    const node = findNodeById(canvas, nodeId);
    if (!node) return;

    collected.push({ id: nodeId, y: node.y });

    // 遍历所有入边的父节点（多父感知）
    const data = canvas.getData();
    for (const edge of data.edges) {
      if (edge.toNode === nodeId) {
        collect(edge.fromNode);
      }
    }
  };

  collect(startNodeId);

  // 按 y 坐标排序（从上到下 = 时间顺序）
  collected.sort((a, b) => a.y - b.y);

  return collected.map(c => c.id);
}

// ============================================================
// 上下文构建
// ============================================================

/**
 * 从祖先链构建对话消息列表
 *
 * 角色推断优先级：
 * 1. 节点元数据 chatRole（准确，创建时写入）
 * 2. 奇偶交替 fallback（兼容无元数据的老节点）
 *
 * P2 #15: 分级压缩
 * - user 节点：永远发全文
 * - assistant 节点：最近 N 个发全文，更远截取前 M 字
 * - N 和 M 由设置控制
 */
export function buildContextFromChain(
  canvas: CanvasRuntimeView,
  chainNodeIds: string[],
  recentFullCount: number = 3,
  truncateChars: number = 500,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 从尾部（最近）往前数 assistant 节点
  let assistantSeen = 0;

  for (let i = chainNodeIds.length - 1; i >= 0; i--) {
    const node = findNodeById(canvas, chainNodeIds[i]);
    if (!node) continue;

    const text = getNodeText(node).trim();
    if (!text) continue;
    if (text === 'Loading...' || text === '思考中...') continue;

    // 从元数据读取角色
    const metaRole = getNodeRole(node);
    if (metaRole !== 'user' && metaRole !== 'assistant') {
      // 未标记角色的节点跳过
      continue;
    }

    // 清理 assistant 节点中可能存在的模型标注前缀
    let cleanText = text;
    if (metaRole === 'assistant') {
      cleanText = cleanText.replace(/^>\s*[^\n]*\**[^\n]*\*\*\s*\n\n/, '').trim();
      assistantSeen++;
      // P2 #15: 超过最近 N 个的 assistant 节点截取前 M 字
      if (assistantSeen > recentFullCount && cleanText.length > truncateChars) {
        cleanText = cleanText.substring(0, truncateChars) + '\n\n[... 已截取 ...]';
      }
    }

    messages.push({ role: metaRole, content: cleanText });
  }

  // messages 是倒序的，反转为正序（从根到当前）
  messages.reverse();

  return messages;
}

/**
 * 构建带分支方向的完整上下文
 *
 * @param canvas Canvas 视图
 * @param sourceNodeId 分叉源节点 ID
 * @param branchDirection 分支方向标注
 * @param systemPrompt 系统提示词（来自设置）
 */
export function buildBranchContext(
  canvas: CanvasRuntimeView,
  sourceNodeId: string,
  branchDirection: string,
  systemPrompt?: string,
  recentFullCount?: number,
  truncateChars?: number,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 1. 系统提示
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 2. 祖先链对话历史（P2 #15: 分级压缩）
  const chain = getAncestorChain(canvas, sourceNodeId);
  const historyMessages = buildContextFromChain(canvas, chain, recentFullCount, truncateChars);
  messages.push(...historyMessages);

  // 3. 分支方向作为最后的 user 消息（而不是 system）
  //    这样 AI 明确知道这是用户的新提问，不会被忽略
  if (branchDirection) {
    messages.push({
      role: 'user',
      content: branchDirection,
    });
  }

  return messages;
}

// ============================================================
// 多节点合并上下文构建
// ============================================================

/** 查找节点入边的标签（分支方向标注） */
export function findEdgeLabel(
  canvas: CanvasRuntimeView,
  toNodeId: string,
): string | null {
  const data = canvas.getData();
  for (const edge of data.edges) {
    if (edge.toNode === toNodeId && edge.label) {
      return edge.label;
    }
  }
  return null;
}

/**
 * 构建合并上下文：收集多个节点内容 + 用户提示
 *
 * 每个节点作为独立分支呈现，附带入边标签（如果有）
 */
export function buildMergeContext(
  canvas: CanvasRuntimeView,
  sourceNodeIds: string[],
  userPrompt: string,
  systemPrompt?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 收集所有节点内容
  const branches: string[] = [];
  for (let i = 0; i < sourceNodeIds.length; i++) {
    const node = findNodeById(canvas, sourceNodeIds[i]);
    if (!node) continue;
    const text = getNodeText(node).trim();
    if (!text || text === '思考中...' || text === 'Loading...') continue;

    const edgeLabel = findEdgeLabel(canvas, sourceNodeIds[i]);
    const label = edgeLabel ? `（${edgeLabel}）` : '';
    branches.push(`--- 分支 ${i + 1}${label} ---\n${text}`);
  }

  messages.push({
    role: 'user',
    content: `${branches.join('\n\n')}\n\n${userPrompt}`,
  });

  return messages;
}
