/**
 * Canvas → ExportNode 转换器
 * 将 Obsidian Canvas 的对话树转换为导出用的数据结构
 */

import type { ExportNode, ExportMetadata, ExportContext } from './export-types';

// Canvas 节点元数据接口（Obsidian Canvas 内部格式）
interface CanvasNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  text: string;
  color?: string;
  file?: string;
}

interface CanvasEdgeData {
  id: string;
  fromNode: string;
  fromSide: string;
  toNode: string;
  toSide: string;
  label?: string;
  color?: string;
}

interface ChatNodeMeta {
  role: 'user' | 'assistant';
  messageId?: string;
  summary?: string;
  model?: string;
  modelAlias?: string;
  modelIcon?: string;
  modelColor?: string;
  timestamp?: number;
}

/**
 * 从 Canvas JSON 数据转换为导出数据结构
 */
export function convertCanvasData(
  canvasData: { nodes: CanvasNodeData[]; edges: CanvasEdgeData[] }
): ExportContext {
  const { nodes, edges } = canvasData;

  // 1. 构建邻接表：fromNode → [{ toNode, edge }]
  const outgoingMap = new Map<string, Array<{ toNode: string; edge: CanvasEdgeData }>>();
  const incomingMap = new Map<string, string[]>(); // toNode → [fromNode, ...]

  for (const edge of edges) {
    // 添加到 outgoingMap
    if (!outgoingMap.has(edge.fromNode)) {
      outgoingMap.set(edge.fromNode, []);
    }
    outgoingMap.get(edge.fromNode)!.push({ toNode: edge.toNode, edge });

    // 添加到 incomingMap
    if (!incomingMap.has(edge.toNode)) {
      incomingMap.set(edge.toNode, []);
    }
    incomingMap.get(edge.toNode)!.push(edge.fromNode);
  }

  // 2. 找到根节点（没有入边的文本节点）
  const rootNodes = nodes.filter(
    n => n.type === 'text' && (!incomingMap.has(n.id) || incomingMap.get(n.id)!.length === 0)
  );

  // 节点映射表
  const nodeMap = new Map<string, CanvasNodeData>();
  for (const node of nodes) {
    if (node.type === 'text') {
      nodeMap.set(node.id, node);
    }
  }

  // 3. 从根节点开始 DFS 构建树
  const visited = new Set<string>();
  const allNodes: ExportNode[] = [];

  for (const rootNode of rootNodes) {
    const tree = buildTree(rootNode, nodeMap, outgoingMap, visited);
    if (tree) {
      allNodes.push(tree);
    }
  }

  // 4. 收集所有模型信息
  const models = new Set<string>();
  const countNodes = (n: ExportNode) => {
    if (n.model) models.add(n.model);
    n.children.forEach(countNodes);
  };
  allNodes.forEach(countNodes);

  // 5. 统计分支数
  let branchCount = 0;
  const countBranches = (n: ExportNode) => {
    if (n.children.length > 1) branchCount += n.children.length - 1;
    n.children.forEach(countBranches);
  };
  allNodes.forEach(countBranches);

  // 6. 获取根节点第一句话作为默认文件名
  const rootContent = allNodes.length > 0
    ? extractFirstSentence(allNodes[0].content)
    : '对话树';

  // 7. 构建元数据
  const metadata: ExportMetadata = {
    title: rootContent,
    exportTime: new Date(),
    models: Array.from(models),
    nodeCount: nodeMap.size,
    branchCount,
    rootContent,
  };

  return { nodes: allNodes, metadata };
}

/**
 * 递归构建对话树
 */
function buildTree(
  node: CanvasNodeData,
  nodeMap: Map<string, CanvasNodeData>,
  outgoingMap: Map<string, Array<{ toNode: string; edge: CanvasEdgeData }>>,
  visited: Set<string>
): ExportNode | null {
  if (visited.has(node.id)) return null;
  visited.add(node.id);

  const meta = extractChatMeta(node.text);
  const children = outgoingMap.get(node.id) || [];

  // 是否分叉点（有多个 outgoing edge）
  const isBranchPoint = children.length > 1;

  const exportNode: ExportNode = {
    id: node.id,
    type: meta.role === 'assistant' ? 'ai' : 'user',
    content: meta.content || node.text,
    role: meta.modelAlias || (meta.role === 'assistant' ? 'AI' : undefined),
    color: meta.modelColor || node.color,
    icon: meta.modelIcon,
    children: [],
    model: meta.model,
    timestamp: meta.timestamp,
    isBranchPoint,
  };

  // 递归构建子节点
  for (const child of children) {
    const childNode = nodeMap.get(child.toNode);
    if (!childNode) continue;

    const childExportNode = buildTree(childNode, nodeMap, outgoingMap, visited);
    if (childExportNode) {
      // 设置方向标签
      if (child.edge.label) {
        childExportNode.direction = child.edge.label;
      }
      childExportNode.parentId = node.id;
      exportNode.children.push(childExportNode);
    }
  }

  return exportNode;
}

/**
 * 从 Canvas 节点文本中提取 ChatNodeMeta 元数据
 * 格式：chat_node_meta:{"role":"assistant","model":"deepseek-chat",...}\n正文内容
 */
function extractChatMeta(text: string): {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  modelAlias?: string;
  modelIcon?: string;
  modelColor?: string;
  timestamp?: number;
} {
  const metaLine = text.match(/^chat_node_meta:(.+?)\n/);
  if (!metaLine) {
    return { role: 'user', content: text };
  }

  try {
    const meta: ChatNodeMeta = JSON.parse(metaLine[1]);
    const content = text.substring(metaLine[0].length);

    return {
      role: meta.role,
      content: content.trim(),
      model: meta.model,
      modelAlias: meta.modelAlias,
      modelIcon: meta.modelIcon,
      modelColor: meta.modelColor,
      timestamp: meta.timestamp,
    };
  } catch {
    return { role: 'user', content: text };
  }
}

/**
 * 提取第一句话（取前 30 个字符，到第一个句号/问号/感叹号/换行）
 */
function extractFirstSentence(text: string): string {
  // 清理元数据行
  const cleanText = text.replace(/^chat_node_meta:.*?\n/, '').trim();

  // 取第一个句子（以句号、问号、感叹号、换行为分隔）
  const match = cleanText.match(/^(.{1,30}?)[。？！\n.!?\n]/);
  if (match) {
    return match[1].trim();
  }

  // 无标点则取前 30 个字符
  return cleanText.substring(0, 30).trim();
}