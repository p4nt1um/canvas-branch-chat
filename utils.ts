/**
 * utils.ts — 工具函数
 *
 * 包含：
 * 1. scrollHeight 安全读取（替代脆弱的 DOM 链式访问）
 * 2. ID 生成
 * 3. Canvas 通用操作
 */

import { CanvasRuntimeNode } from './types';

// ============================================================
// DOM 安全访问
// ============================================================

/**
 * 安全获取节点的实际渲染高度
 * 
 * 替代 fork 中的脆弱写法：
 *   answerTextNode.contentEl.firstChild.firstChild.scrollHeight
 * 
 * 加了完整的 null-check 兜底。
 */
export function getNodeScrollHeight(node: CanvasRuntimeNode): number {
  try {
    const container = node?.contentEl;
    if (!container) return node.height || 100;

    // Obsidian Canvas 文本节点结构：
    // contentEl > .canvas-node-content > .markdown-preview-view > .markdown-preview-sizer
    const previewEl = container.querySelector('.markdown-preview-sizer');
    if (previewEl instanceof HTMLElement) {
      return previewEl.scrollHeight;
    }

    // fallback：使用容器的 scrollHeight
    if (container.scrollHeight > 0) {
      return container.scrollHeight;
    }

    // 最后兜底
    return node.height || 100;
  } catch {
    return node.height || 100;
  }
}

/**
 * 安全读取 DOM 文本内容
 */
export function getNodeTextContent(node: CanvasRuntimeNode): string {
  try {
    return node?.text ?? '';
  } catch {
    return '';
  }
}

// ============================================================
// ID 生成
// ============================================================

/**
 * 生成短 ID（不依赖 crypto.randomUUID）
 */
export function generateId(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// Canvas 节点高度自适应
// ============================================================

/**
 * 根据内容自动调整节点高度
 * 如果计算高度大于当前高度，则更新；否则保持原高度
 */
export function autoFitNodeHeight(node: CanvasRuntimeNode): void {
  const actualHeight = getNodeScrollHeight(node);
  const nodeData = node.getData();
  
  if (actualHeight > nodeData.height) {
    node.setData({ ...nodeData, height: actualHeight });
  }
}

// ============================================================
// 文本截断
// ============================================================

/**
 * 截断文本，用于节点自动命名
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
