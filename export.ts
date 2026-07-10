/**
 * export.ts — P1 #9 一键导出对话树为 Markdown
 *
 * 功能：
 * 1. 从任意节点出发，找到对话树的根节点
 * 2. 递归遍历整棵对话树
 * 3. 生成带层级缩进的 Markdown
 * 4. 通过 Obsidian API 保存到 vault
 */

import { App, Notice, TFile, normalizePath } from 'obsidian';
import { CanvasRuntimeView, CanvasRuntimeNode } from './types';
import { findNodeById, findChildNodeIds, getNodeRole, getNodeText, getAncestorChain, findParentNodeId } from './context';

// ============================================================
// 类型定义
// ============================================================

interface TreeNode {
  nodeId: string;
  role: 'user' | 'assistant' | 'branch-point' | 'unknown';
  text: string;
  edgeLabel?: string;
  modelAlias?: string;
  children: TreeNode[];
}

// ============================================================
// 树构建
// ============================================================

/** 找到对话树的根节点（沿祖先链向上直到没有父节点） */
function findRootNode(canvas: CanvasRuntimeView, nodeId: string): string {
  let current = nodeId;
  let parent = findParentNodeId(canvas, current);
  while (parent) {
    current = parent;
    parent = findParentNodeId(canvas, current);
  }
  return current;
}

/** 获取边标签（分支方向） */
function getEdgeLabel(canvas: CanvasRuntimeView, fromNode: string, toNode: string): string | undefined {
  const data = canvas.getData();
  const edge = data.edges.find(e => e.fromNode === fromNode && e.toNode === toNode);
  return edge?.label;
}

/** 递归构建对话树 */
function buildTree(canvas: CanvasRuntimeView, nodeId: string, visited: Set<string>): TreeNode | null {
  if (visited.has(nodeId)) return null; // 环检测
  visited.add(nodeId);

  const node = findNodeById(canvas, nodeId);
  if (!node) return null;

  const role = getNodeRole(node) || 'unknown';
  const text = getNodeText(node).trim();

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
    role: role as any,
    text,
    children,
  };
}

// ============================================================
// Markdown 生成
// ============================================================

/** 生成节点摘要（前 50 字） */
function summarize(text: string, maxLen: number = 50): string {
  const clean = text.replace(/[#*>`-]/g, '').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen) + '...';
}

/** 递归生成 Markdown 列表 */
function treeToMarkdown(node: TreeNode, depth: number, lines: string[]): void {
  const indent = '  '.repeat(depth);
  const prefix = depth === 0 ? '' : indent + '- ';

  if (depth === 0) {
    // 根节点不加列表标记
    lines.push(`**👤 ${node.text.slice(0, 200)}**`);
  } else {
    // 根据角色格式化
    let icon = '💬';
    let label = '用户';

    if (node.role === 'assistant') {
      icon = '🤖';
      label = 'AI';
    } else if (node.role === 'branch-point') {
      icon = '🔀';
      label = '分叉';
    }

    // 分支方向标注
    const branchInfo = node.edgeLabel ? ` *(${node.edgeLabel})*` : '';

    // AI 回答：摘要 + 正文
    if (node.role === 'assistant' && node.text) {
      const summary = summarize(node.text);
      lines.push(`${prefix}${icon} **${label}**${branchInfo}: ${summary}`);
      // 如果正文较长，折叠到下一级
      if (node.text.length > 100) {
        const contentIndent = '  '.repeat(depth + 1);
        const paragraphs = node.text.split('\n\n');
        for (const para of paragraphs.slice(0, 3)) {
          lines.push(`${contentIndent}> ${para.replace(/\n/g, '\n' + contentIndent + '> ')}`);
        }
        if (paragraphs.length > 3) {
          lines.push(`${contentIndent}> ...（共 ${paragraphs.length} 段，已省略）`);
        }
      }
    } else if (node.text) {
      // 用户消息：完整显示（通常较短）
      const displayText = node.text.length > 200 ? summarize(node.text, 100) : node.text;
      lines.push(`${prefix}${icon} **${label}**${branchInfo}: ${displayText}`);
    }
  }

  // 递归子节点
  for (const child of node.children) {
    treeToMarkdown(child, depth + 1, lines);
  }

  // 同级之间加分隔（只在第一层子节点之间）
  if (depth === 1 && node.children.length === 0) {
    lines.push(''); // 空行分隔不同分支
  }
}

/** 主导出入口：从 Canvas 导出对话树 */
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
    new Notice('❌ 无法构建对话树');
    return;
  }

  // 3. 生成 Markdown
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN');
  const lines: string[] = [
    '# Canvas 对话导出',
    `> 导出时间: ${dateStr}`,
    '',
    '---',
    '',
  ];

  treeToMarkdown(tree, 0, lines);

  lines.push('', '---', `*由 Canvas Branch Chat 插件生成*`);

  const markdown = lines.join('\n');

  // 4. 保存到 vault
  const fileName = `对话导出_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.md`;
  const folder = 'Canvas Exports';
  const filePath = normalizePath(`${folder}/${fileName}`);

  // 确保目录存在
  const folderObj = app.vault.getAbstractFileByPath(folder);
  if (!folderObj) {
    app.vault.createFolder(folder).catch(() => {});
  }

  // 写入文件
  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) {
    app.vault.modify(existing, markdown).then(() => {
      new Notice(`✅ 已更新: ${filePath}`);
      app.workspace.openLinkText(filePath, '', true);
    });
  } else {
    app.vault.create(filePath, markdown).then(() => {
      new Notice(`✅ 已导出: ${filePath}`);
      app.workspace.openLinkText(filePath, '', true);
    }).catch(err => {
      new Notice(`❌ 导出失败: ${err}`);
    });
  }
}
