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

// ============================================================
// Canvas 边查找
// ============================================================

/**
 * 查找给定节点的父节点 ID（通过 edge 的 toNode == nodeId 反查 fromNode）
 * 
 * Canvas edge 方向：fromNode → toNode（从上到下）
 * 所以一个节点的"父节点"就是 edge.toNode == nodeId 的那条边的 fromNode
 */
export function findParentNodeId(
  canvas: CanvasRuntimeView,
  nodeId: string
): string | null {
  const data: CanvasData = canvas.getData();

  for (const edge of data.edges) {
    if (edge.toNode === nodeId) {
      return edge.fromNode;
    }
  }

  return null;
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
  const internalCanvas = canvas as any;
  
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
      const nodeData = canvasData.nodes.find((n: any) => n.id === node.id);
      if (nodeData && nodeData.chatRole) {
        return nodeData.chatRole;
      }
    }
    // 方式2：从节点 getData 读取
    const data = node.getData() as ChatNodeData;
    return data?.chatRole ?? null;
  } catch {
    return null;
  }
}

/**
 * 在节点上写入对话角色元数据
 *
 * 同时写入 canvas 数据层（持久化）和节点运行时
 */
export function setNodeRole(node: CanvasRuntimeNode, role: 'user' | 'assistant' | 'branch-point'): void {
  try {
    const canvas = node.canvas;
    if (canvas) {
      // 直接修改 canvas 数据层（确保持久化）
      const canvasData = canvas.getData();
      const nodeData = canvasData.nodes.find((n: any) => n.id === node.id);
      if (nodeData) {
        nodeData.chatRole = role;
        canvas.setData(canvasData);
        canvas.requestSave();
      }
    }
    // 同时写入节点运行时（确保当前会话立即可读）
    const data = node.getData();
    node.setData({ ...data, chatRole: role } as any);
  } catch {
    // 忽略
  }
}

// ============================================================
// 直系祖先链遍历
// ============================================================

/**
 * 从指定节点向上遍历直系祖先链，返回节点 ID 列表（从根到当前）
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
  const chain: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = startNodeId;

  while (currentId && !visited.has(currentId) && chain.length < maxDepth) {
    visited.add(currentId);
    chain.unshift(currentId); // 从前往后是 root → start
    currentId = findParentNodeId(canvas, currentId);
  }

  return chain;
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
 */
export function buildContextFromChain(
  canvas: CanvasRuntimeView,
  chainNodeIds: string[]
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (let i = 0; i < chainNodeIds.length; i++) {
    const node = findNodeById(canvas, chainNodeIds[i]);
    if (!node) continue;

    const text = getNodeText(node).trim();
    if (!text) continue;
    if (text === 'Loading...' || text === '思考中...') continue;

    // 从元数据读取角色（纯元数据驱动，无 fallback）
    const metaRole = getNodeRole(node);
    if (metaRole !== 'user' && metaRole !== 'assistant') {
      // 未标记角色的节点跳过（不参与上下文）
      continue;
    }

    messages.push({ role: metaRole, content: text });
  }

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
  systemPrompt?: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // 1. 系统提示
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 2. 追加分支方向引导
  if (branchDirection) {
    messages.push({
      role: 'system',
      content: branchDirection,
    });
  }

  // 3. 祖先链对话历史
  const chain = getAncestorChain(canvas, sourceNodeId);
  const historyMessages = buildContextFromChain(canvas, chain);
  messages.push(...historyMessages);

  return messages;
}
