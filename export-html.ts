/**
 * 生成交互式 HTML 文件
 * 包含完整的 CSS + JS（轻量级，Markdown 已预渲染为 HTML）
 */

import type { ExportNode, ExportMetadata, ExportConfig } from './export-types';
import { getExportStyles } from './export-styles';
import { getExportScript } from './export-interactive';

/**
 * 生成完整的 HTML 文件内容
 * @param markedJSCode 预留参数（当前为空，Markdown 在导出时预渲染）
 */
export function generateExportHTML(
  nodes: ExportNode[],
  metadata: ExportMetadata,
  config: ExportConfig,
  _markedJSCode: string
): string {
  const styles = getExportStyles();

  // 只包含已启用的功能
  const script = getExportScript({
    includeToggle: config.includeToggle,
    includeReplay: config.includeReplay,
    includeSearch: config.includeSearch,
    viewMode: config.viewMode,
  });

  const flowHTML = generateFlowHTML(nodes);
  const treeHTML = config.viewMode === 'tree' ? generateTreeHTML(nodes) : '';

  // 是否显示侧边栏
  const showSidebar = config.includeToggle;
  const layoutClass = showSidebar ? 'layout-with-sidebar' : '';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${config.theme === 'auto' ? 'light' : config.theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="Canvas Branch Chat v0.4.0">
  <meta name="export-time" content="${metadata.exportTime.toISOString()}">
  <title>${escapeHtml(metadata.title)} - Canvas Branch Chat</title>
  <style>
${styles}
  </style>
</head>
<body>
  <!-- Header -->
  <header class="export-header">
    <div class="header-title">${escapeHtml(metadata.title)}</div>
    <div class="header-meta">
      <span>📅 ${formatDate(metadata.exportTime)}</span>
      <span>📊 ${metadata.nodeCount} 节点</span>
      <span>🔀 ${metadata.branchCount} 分支</span>
      ${metadata.models.map(m => `<span>🤖 ${escapeHtml(m)}</span>`).join('')}
    </div>
  </header>

  <!-- 工具栏 -->
  <div class="toolbar" id="toolbar">
    <button class="toolbar-btn active" onclick="switchView('flow')" id="btn-flow" title="流式对话视图">
      📊 <span class="label-text">流式视图</span>
    </button>
    <button class="toolbar-btn" onclick="switchView('tree')" id="btn-tree" title="分支树视图">
      🌳 <span class="label-text">分支树</span>
    </button>

    <span class="toolbar-divider"></span>

    ${config.includeReplay ? `
    <button class="toolbar-btn" onclick="toggleReplay()" id="btn-replay" title="回放对话">
      ▶️ <span class="label-text">回放</span>
    </button>
    <button class="toolbar-btn" onclick="changeReplaySpeed()" id="btn-speed" title="回放速度" style="display:none">
      ⏱ <span class="label-text">1x</span>
    </button>
    <div class="replay-progress" id="replay-progress" style="display:none">
      <div class="replay-progress-bar" id="replay-progress-bar" style="width:0%"></div>
    </div>
    ` : ''}

    <button class="toolbar-btn" onclick="toggleTheme()" id="btn-theme" title="切换主题">
      ${config.theme === 'auto' ? '🌓' : config.theme === 'dark' ? '🌙' : '☀️'} <span class="label-text">主题</span>
    </button>

    ${config.includeSearch ? `
    <div class="search-container">
      <input type="text" class="search-input" id="search-input" placeholder="🔍 搜索对话..."
             oninput="performSearch(this.value)">
      <span class="search-count" id="search-count"></span>
      <button class="search-nav-btn" onclick="navigateSearch(-1)" id="btn-search-prev" disabled>▲</button>
      <button class="search-nav-btn" onclick="navigateSearch(1)" id="btn-search-next" disabled>▼</button>
    </div>
    ` : ''}
  </div>

  <!-- 主内容区 -->
  <div class="${layoutClass}" id="main-layout">
    ${showSidebar ? `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-title">📋 节点列表</div>
      ${generateSidebarHTML(nodes)}
    </aside>
    ` : ''}

    <!-- 流式视图 -->
    <div class="conversation-flow flow-view${config.viewMode === 'tree' ? ' hidden' : ''}" id="flow-view">
      ${flowHTML}
    </div>

    <!-- 分支树视图 -->
    <div class="tree-view${config.viewMode === 'tree' ? ' active' : ''}" id="tree-view">
      ${treeHTML || generateTreeHTML(nodes)}
    </div>
  </div>

  <!-- 树形详情面板 -->
  <div class="tree-detail-overlay" id="tree-detail-overlay" onclick="closeTreeDetail()"></div>
  <div class="tree-detail-panel" id="tree-detail-panel">
    <button class="toolbar-btn" onclick="closeTreeDetail()" style="margin-bottom:16px">✕ 关闭</button>
    <div id="tree-detail-content"></div>
  </div>

  <!-- Footer -->
  <footer class="export-footer">
    <p>由 <strong>Canvas Branch Chat</strong> 生成 · ${metadata.exportTime.toLocaleString('zh-CN')}</p>
    <p>对话树包含 ${metadata.nodeCount} 个节点，${metadata.branchCount} 个分支</p>
  </footer>

  <script>
${script}

    // 初始化
    (function init() {
      // 设置初始视图
      switchView('${config.viewMode}');

      // 主题初始化
      ${config.theme === 'auto' ? `
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      });
      ` : ''}
    })();
  </script>
</body>
</html>`;
}

/**
 * 生成流式对话 HTML
 */
function generateFlowHTML(nodes: ExportNode[]): string {
  return nodes.map(node => {
    const modelColor = node.color || (node.type === 'ai' ? '#2196F3' : '#999');
    const icon = node.icon || (node.type === 'ai' ? '🤖' : '👤');
    const role = node.role || (node.type === 'ai' ? 'AI' : '用户');
    const nodeClass = node.type === 'ai' ? 'message ai' : 'message user';

    let html = `
    <div class="${nodeClass}" id="node-${node.id}" style="--model-color:${modelColor}" data-model="${escapeHtml(node.model || '')}" data-type="${node.type}">
      ${node.direction ? `<div class="branch-label">${escapeHtml(node.direction)}</div>` : ''}
      <div class="message-header">
        <span class="icon">${icon}</span>
        <span class="role">${escapeHtml(role)}</span>
        ${node.model ? `<span class="model">${escapeHtml(node.model)}</span>` : ''}
      </div>
      <div class="message-content">
        ${(node as any).renderedHTML || `<p>${escapeHtml(node.content)}</p>`}
      </div>
      <div class="message-actions">
        <button class="action-btn toggle-btn" onclick="toggleNode('${node.id}')" aria-label="展开/收起">
          ${node.children.length > 0 ? '🔽 收起' : '📌'}
        </button>
        ${node.isBranchPoint ? `<button class="action-btn" onclick="scrollToChildren('${node.id}')">🌳 查看分支</button>` : ''}
        ${node.parentId ? `<button class="action-btn" onclick="scrollToParent('${node.parentId}')">⬆ 上文</button>` : ''}
      </div>
    </div>`;

    // 如果有多个子节点，创建分叉组
    if (node.children.length > 1) {
      html += '<div class="fork-group" id="fork-' + node.id + '">';
      html += node.children.map(child => generateFlowHTML([child])).join('');
      html += '</div>';
    } else if (node.children.length === 1) {
      html += generateFlowHTML(node.children);
    }

    return html;
  }).join('');
}

/**
 * 生成分支树 HTML
 */
function generateTreeHTML(nodes: ExportNode[]): string {
  const lines: string[] = [];
  const visited = new Set<string>();

  function renderTreeNode(node: ExportNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const indentClass = depth > 0 ? 'tree-children' : '';
    const icon = node.icon || (node.type === 'ai' ? '🤖' : '👤');
    const role = node.role || (node.type === 'ai' ? 'AI' : '用户');

    lines.push(`<div class="${indentClass}">`);
    lines.push(`
      <div class="tree-node ${node.type}" id="tree-${node.id}" onclick="openTreeDetail('${node.id}')">
        <div class="tree-node-content">
          <span class="icon">${icon}</span>
          <span class="text">${escapeHtml(role)}: ${escapeHtml(truncateText(node.content, 50))}</span>
          ${node.direction ? `<span class="branch-tag">${escapeHtml(node.direction)}</span>` : ''}
        </div>
      </div>
    `);

    if (node.children.length > 0) {
      node.children.forEach(child => renderTreeNode(child, depth + 1));
    }

    lines.push('</div>');
  }

  nodes.forEach(node => renderTreeNode(node, 0));
  return lines.join('\n');
}

/**
 * 生成侧边栏导航 HTML
 */
function generateSidebarHTML(nodes: ExportNode[]): string {
  const items: string[] = [];
  const visited = new Set<string>();

  function addItem(node: ExportNode, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const icon = node.icon || (node.type === 'ai' ? '🤖' : '👤');
    const prefix = depth > 0 ? '└ ' : '';
    const text = truncateText(node.content, 30);
    const itemClass = node.type === 'ai' ? 'sidebar-item ai' : 'sidebar-item';

    items.push(
      `<a class="${itemClass}" href="#node-${node.id}" title="${escapeAttr(truncateText(node.content, 80))}">` +
      `${prefix}${icon} ${escapeHtml(text)}</a>`
    );

    node.children.forEach(child => addItem(child, depth + 1));
  }

  nodes.forEach(node => addItem(node, 0));
  return items.join('\n');
}

/** 转义 HTML */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 转义 HTML 属性 */
function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 格式化日期 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/** 截断文本（按字符） */
function truncateText(text: string, maxLen: number): string {
  const clean = text.replace(/^chat_node_meta:.*?\n/, '').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}