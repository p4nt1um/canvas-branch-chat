/**
 * export.ts — P1 #9 一键导出对话树为 Markdown
 *
 * v2 改进：
 * 1. 全文导出，不截断不省略
 * 2. 文件节点用 [[wiki link]] 引用
 * 3. 保留 AI 回答的原始 Markdown 格式（不加 > 前缀）
 */

import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { CanvasTextData } from 'obsidian/canvas';
import { CanvasRuntimeView } from './types';
import { findNodeById, findChildNodeIds, getNodeRole, getNodeText, findParentNodeId } from './context';
import { t } from './locale';

// ============================================================
// 类型定义
// ============================================================

type NodeType = 'text' | 'file' | 'link' | 'group' | 'unknown';

interface TreeNode {
  nodeId: string;
  type: NodeType;
  role: 'user' | 'assistant' | 'branch-point' | 'unknown';
  text: string;
  /** 文件节点：vault 内文件路径 */
  filePath?: string;
  /** 模型别名（从元数据读取） */
  modelAlias?: string;
  /** 分支方向（edge label） */
  edgeLabel?: string;
  children: TreeNode[];
}

// ============================================================
// 树构建
// ============================================================

/** 找到对话树的根节点 */
function findRootNode(canvas: CanvasRuntimeView, nodeId: string): string {
  let current = nodeId;
  let parent = findParentNodeId(canvas, current);
  while (parent) {
    current = parent;
    parent = findParentNodeId(canvas, current);
  }
  return current;
}

/** 获取边标签 */
function getEdgeLabel(canvas: CanvasRuntimeView, fromNode: string, toNode: string): string | undefined {
  const data = canvas.getData();
  const edge = data.edges.find(e => e.fromNode === fromNode && e.toNode === toNode);
  return edge?.label;
}

/** 从 canvas 原始数据读取节点类型和文件路径 */
function getNodeFileInfo(canvas: CanvasRuntimeView, nodeId: string): { type: NodeType; filePath?: string } {
  const data = canvas.getData();
  const raw = data.nodes.find((n: CanvasTextData) => n.id === nodeId);
  if (!raw) return { type: 'unknown' };

  const type = (raw.type || 'text') as string;
  if (type === 'file') {
    const fileRaw = raw as unknown as { file?: string };
    if (fileRaw.file) {
      return { type: 'file', filePath: fileRaw.file };
    }
  }
  return { type: type as NodeType };
}

/** 读取节点关联的模型别名 */
function getNodeModelAlias(canvas: CanvasRuntimeView, nodeId: string): string | undefined {
  const data = canvas.getData();
  const raw = data.nodes.find((n: CanvasTextData) => n.id === nodeId);
  return (raw as { modelAlias?: string })?.modelAlias || undefined;
}

/** 递归构建对话树 */
function buildTree(canvas: CanvasRuntimeView, nodeId: string, visited: Set<string>): TreeNode | null {
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);

  const node = findNodeById(canvas, nodeId);
  if (!node) return null;

  const role = getNodeRole(node) || 'unknown';
  const text = getNodeText(node).trim();
  const fileInfo = getNodeFileInfo(canvas, nodeId);
  const modelAlias = getNodeModelAlias(canvas, nodeId);

  const childIds = findChildNodeIds(canvas, nodeId);
  const children: TreeNode[] = [];

  for (const childId of childIds) {
    const childTree = buildTree(canvas, childId, visited);
    if (childTree) {
      childTree.edgeLabel = getEdgeLabel(canvas, nodeId, childId);
      children.push(childTree);
    }
  }

  return {
    nodeId,
    type: fileInfo.type,
    role,
    text,
    filePath: fileInfo.filePath,
    modelAlias,
    children,
  };
}

// ============================================================
// Markdown 生成
// ============================================================

/**
 * 从文件路径提取文件名（不含扩展名），用于 wiki link
 * "Folder/My Note.md" → "My Note"
 */
function fileBaseName(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  const fileName = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
}

/**
 * 生成单个节点的 Markdown
 *
 * 格式规则：
 * - 文本节点：角色标记 + 全文原格式输出
 * - 文件节点：用 [[文件名]] 双链引用
 * - 分支方向标注在节点头部
 */
function nodeToMarkdown(node: TreeNode, depth: number, lines: string[]): void {
  // 根据深度缩进（2 空格 × depth）
  const indent = depth > 0 ? '  '.repeat(depth - 1) : '';
  const isRoot = depth === 0;

  // 角色标记
  let icon: string;
  let label: string;
  if (node.role === 'assistant') {
    icon = '🤖';
    label = node.modelAlias ? `AI (${node.modelAlias})` : 'AI';
  } else if (node.role === 'branch-point') {
    icon = '🔀';
    label = t('export.roleBranch');
  } else if (node.role === 'user') {
    icon = '👤';
    label = t('export.roleUser');
  } else {
    icon = '📝';
    label = t('export.roleNode');
  }

  // 分支方向标注
  const branchInfo = node.edgeLabel ? `  ·  *${t('export.direction', { dir: node.edgeLabel })}*` : '';

  // 输出节点
  if (node.type === 'file' && node.filePath) {
    // 文件节点 → 双链引用
    const wikiLink = `[[${fileBaseName(node.filePath)}]]`;
    if (isRoot) {
      lines.push(`**${icon} ${label}**${branchInfo}`, '');
      lines.push(`📄 ${wikiLink}`);
    } else {
      lines.push(`${indent}- **${icon} ${label}**${branchInfo} → 📄 ${wikiLink}`);
    }
  } else if (node.text) {
    // 文本节点 → 全文输出
    if (isRoot) {
      // 根节点：标题 + 全文
      lines.push(`**${icon} ${label}**${branchInfo}`, '');
      lines.push(node.text);
    } else {
      // 子节点：列表项标记 + 全文
      lines.push(`${indent}- **${icon} ${label}**${branchInfo}`);
      lines.push('');
      // 全文内容，缩进对齐
      const contentIndent = indent + '  ';
      for (const line of node.text.split('\n')) {
        lines.push(line ? contentIndent + line : '');
      }
    }
  }

  // 子节点
  if (node.children.length > 0) {
    // 多分支时加标注
    if (node.children.length > 1) {
      lines.push('');
      lines.push(`${indent}  ${t('export.branches', { n: node.children.length })}`);
    }
    lines.push('');
    for (const child of node.children) {
      nodeToMarkdown(child, depth + 1, lines);
      lines.push(''); // 分隔空行
    }
  }
}

// ============================================================
// 主入口
// ============================================================

/** 从 Canvas 导出对话树 */
export function exportCanvasConversation(
  app: App,
  canvas: CanvasRuntimeView,
  startNodeId: string
): void {
  // 1. 找到根节点
  const rootId = findRootNode(canvas, startNodeId);

  // 2. 构建对话树
  const tree = buildTree(canvas, rootId, new Set());
  if (!tree) {
    new Notice(t('notice.exportFail'));
    return;
  }

  // 3. 生成 Markdown
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN');
  const lines: string[] = [
    t('export.title'),
    t('export.time', { time: dateStr }),
    '',
    '---',
    '',
  ];

  nodeToMarkdown(tree, 0, lines);

  // 清理末尾多余空行
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push('', '---', '', t('export.footer'));

  const markdown = lines.join('\n');

  // 4. 保存到 vault
  const fileDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = t('export.fileName', { date: fileDate });
  const folder = 'Canvas Exports';
  const filePath = normalizePath(`${folder}/${fileName}`);

  const folderObj = app.vault.getAbstractFileByPath(folder);
  if (!folderObj) {
    void app.vault.createFolder(folder).catch(() => {});
  }

  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) {
    void app.vault.modify(existing, markdown).then(() => {
      new Notice(t('notice.exportUpdate', { path: filePath }));
      void app.workspace.openLinkText(filePath, '', true);
    });
  } else {
    void app.vault.create(filePath, markdown).then(() => {
      new Notice(t('notice.exportNew', { path: filePath }));
      void app.workspace.openLinkText(filePath, '', true);
    }).catch((err: unknown) => {
      new Notice(t('notice.exportError', { error: String(err) }));
    });
  }
}
