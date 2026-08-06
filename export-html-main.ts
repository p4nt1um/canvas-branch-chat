/**
 * 导出交互式 HTML — 主入口
 * 串联 converter + HTML 生成 + marked.js 预渲染 + 文件保存
 *
 * 方案：在导出时用 marked.js 预渲染 Markdown → HTML，
 * 生成的 HTML 文件无需嵌入 marked.js，更轻量。
 */

import { App, Notice } from 'obsidian';
import { marked } from 'marked';
import type { CanvasRuntimeView } from './types';
import type { ExportConfig } from './export-types';
import { convertCanvasData } from './export-converter';
import { generateExportHTML } from './export-html';
import { ExportConfigModal, saveExportFile } from './export-modal';
import { t } from './locale';

/**
 * 弹出配置对话框并导出交互式 HTML
 */
export async function exportInteractiveHTML(
  app: App,
  canvas: CanvasRuntimeView,
  _nodeId: string,
  config?: ExportConfig
): Promise<void> {
  // 1. 获取 Canvas JSON 数据
  const canvasData = (canvas as any).data;
  if (!canvasData || !Array.isArray(canvasData.nodes) || canvasData.nodes.length === 0) {
    new Notice(t('exportHTML.empty'));
    return;
  }

  // 2. 转换数据
  const context = convertCanvasData(canvasData);
  if (context.nodes.length === 0) {
    new Notice(t('exportHTML.empty'));
    return;
  }

  // 3. 预渲染所有 Markdown → HTML
  const renderedNodes = preRenderMarkdown(context.nodes);

  // 4. 弹窗配置（如果未提供 config）
  if (!config) {
    new ExportConfigModal(app, context.metadata.nodeCount, async (cfg) => {
      await doExport(app, { nodes: renderedNodes, metadata: context.metadata }, cfg);
    }).open();
    return;
  }

  await doExport(app, { nodes: renderedNodes, metadata: context.metadata }, config);
}

/**
 * 递归预渲染 Markdown → HTML
 */
function preRenderMarkdown(nodes: any[]): any[] {
  return nodes.map(node => {
    const rendered = { ...node };
    if (node.content) {
      rendered.renderedHTML = marked.parse(node.content, {
        breaks: true,
        gfm: true,
      }) as string;
    }
    if (node.children && node.children.length > 0) {
      rendered.children = preRenderMarkdown(node.children);
    }
    return rendered;
  });
}

/**
 * 执行导出
 */
async function doExport(
  app: App,
  context: { nodes: any[]; metadata: any },
  config: ExportConfig
): Promise<void> {
  try {
    // 1. 生成 HTML（marked.js 已预渲染，不需要内嵌）
    const html = generateExportHTML(context.nodes, context.metadata, config, '');

    // 2. 生成默认文件名：根节点第1句话_YYYYMMDD_HHMMSS.html
    const now = new Date();
    const dateStr = formatDateStr(now);
    const safeRoot = sanitizeFilename(context.metadata.rootContent || '对话树');
    const defaultName = `${safeRoot}_${dateStr}.html`;

    // 3. 保存文件
    await saveExportFile(app, html, defaultName);
  } catch (error) {
    console.error('导出 HTML 失败:', error);
    new Notice(t('exportHTML.fail', { error: (error as Error).message }));
  }
}

/** 格式化日期 YYYYMMDD_HHMMSS */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

/** 文件名安全处理 */
function sanitizeFilename(text: string): string {
  return text
    .replace(/[\\/:*?"<>|]/g, '')  // 去掉非法字符
    .replace(/\s+/g, '_')            // 空格转下划线
    .substring(0, 50)                // 最长 50 字
    .trim();
}