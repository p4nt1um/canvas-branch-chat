/**
 * auto-size.ts — P1 #13: AI 回答节点自动宽高适配
 *
 * AI 回答流式结束后（而非流式过程中，防抖动）测量 Markdown 渲染高度，
 * 回写节点尺寸：
 * - 宽度 = clamp(窗口宽度 × 0.4, 400px, 900px)
 * - 高度 = 实测渲染高度，夹在 [120, 软上限] 之间；超出软上限则内容区滚动
 * - 节点处于编辑态（双击）时不调整
 *
 * 测量策略：优先读 DOM（.markdown-preview-sizer scrollHeight，
 * 含被裁剪部分的真实内容高度）；DOM 不可用时按文本行数估算（见 report 局限说明）。
 */

import { CanvasRuntimeNode } from './types';

/** 宽度下限（px） */
const MIN_WIDTH = 400;
/** 宽度上限（px） */
const MAX_WIDTH = 900;
/** 高度下限（px），避免短回答节点塌成一条 */
const MIN_HEIGHT = 120;
/** 高度余量：节点内容区内边距补偿（px） */
const HEIGHT_PADDING = 16;
/** 渲染完成等待时间：setText 后 Markdown 渲染是异步的（ms） */
const RENDER_SETTLE_MS = 150;

/** 自动宽高适配参数 */
export interface AutoFitOptions {
  /** 功能开关（设置项） */
  enabled: boolean;
  /** 高度软上限（设置项，px），超出则内容区滚动 */
  maxHeight: number;
}

/** 宽度 = 窗口宽度 × 0.4，clamp 到 [400, 900] */
export function calcAutoFitWidth(windowWidth: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, windowWidth * 0.4)));
}

/** 节点是否处于编辑态（双击编辑中）— Obsidian 内部属性，读不到按未编辑处理 */
export function isNodeEditing(node: CanvasRuntimeNode): boolean {
  const internal = node as unknown as { isEditing?: boolean };
  return internal.isEditing === true;
}

/**
 * 流式结束后调用：延迟一拍等 Markdown 渲染完成，再测量回写尺寸。
 * 流式过程中不要调用（每次 setText 都改尺寸会抖动）。
 */
export function scheduleAutoFitNodeSize(node: CanvasRuntimeNode, opts: AutoFitOptions): void {
  if (!opts.enabled) return;
  if (isNodeEditing(node)) return;
  window.setTimeout(() => {
    try {
      applyAutoFitNodeSize(node, opts);
    } catch (err) {
      console.error('Branch Chat: auto-fit size failed', err);
    }
  }, RENDER_SETTLE_MS);
}

/** 测量并回写节点宽高 */
export function applyAutoFitNodeSize(node: CanvasRuntimeNode, opts: AutoFitOptions): void {
  if (isNodeEditing(node)) return;

  const width = calcAutoFitWidth(window.innerWidth);
  const measured = measureRenderedHeight(node) ?? estimateHeightFromText(node.text ?? '', width);
  const height = Math.round(Math.min(opts.maxHeight, Math.max(MIN_HEIGHT, measured)));

  const data = node.getData();
  const oldW = typeof data.width === 'number' ? data.width : node.width;
  const oldH = typeof data.height === 'number' ? data.height : node.height;
  const changed = Math.abs(oldW - width) >= 1 || Math.abs(oldH - height) >= 1;
  if (changed) {
    node.setData({ ...data, width, height });
  }

  // 超出软上限：给节点加标记 class，内容区启用滚动（见 styles.css）
  if (measured > opts.maxHeight) {
    try {
      node.contentEl.addClass('cbz-autofit-scroll');
    } catch {
      // 忽略
    }
  }

  if (changed) {
    try {
      node.canvas.requestSave();
    } catch {
      // 忽略
    }
  }
}

/**
 * 测量渲染后的真实内容高度（px）
 *
 * 优先 .markdown-preview-sizer 的 scrollHeight（utils.ts 同款链路，
 * 但不做 node.height 兜底——那会让"测量失败"伪装成"内容不变"），
 * 返回 null 表示 DOM 不可用，由调用方走估算。
 */
function measureRenderedHeight(node: CanvasRuntimeNode): number | null {
  try {
    const container = node.contentEl;
    if (!container) return null;

    // contentEl > .canvas-node-content > .markdown-preview-view > .markdown-preview-sizer
    const sizer = container.querySelector('.markdown-preview-sizer');
    if (sizer instanceof HTMLElement && sizer.scrollHeight > 0) {
      return sizer.scrollHeight + HEIGHT_PADDING;
    }
    // fallback：容器 scrollHeight（含被裁剪内容）
    if (container.scrollHeight > 0) {
      return container.scrollHeight + HEIGHT_PADDING;
    }
  } catch {
    // fallthrough
  }
  return null;
}

/**
 * DOM 兜底：按文本行数估算高度（px）
 *
 * 局限：不感知 Markdown 渲染结果（标题/列表/代码块的实际行高与间距），
 * CJK 与西文混排宽度差异也会带来误差，仅在 DOM 测量不可用时使用。
 */
export function estimateHeightFromText(text: string, width: number): number {
  // 按 CJK 全角字符宽（≈16px）估算每行可容纳字符数
  const charsPerLine = Math.max(8, Math.floor((width - 32) / 16));
  let lines = 0;
  for (const raw of text.split('\n')) {
    lines += Math.max(1, Math.ceil(Math.max(raw.length, 1) / charsPerLine));
  }
  return Math.max(1, lines) * 24; // 行高近似 24px
}
