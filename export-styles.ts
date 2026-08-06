/**
 * 导出 HTML 的 CSS 样式（内嵌）
 * 移动端优先设计
 */

export function getExportStyles(): string {
  return /* css */ `
/* ===== CSS 变量 ===== */
:root {
  --bg: #ffffff;
  --bg-secondary: #f8f9fa;
  --text: #2c3e50;
  --text-secondary: #6c757d;
  --border: #dee2e6;
  --border-light: #e9ecef;
  --accent: #2196F3;
  --user-bg: #f5f5f5;
  --user-border: #999;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
  --radius: 8px;
  --font-size: 16px;
  --line-height: 1.6;
  --touch-target: 44px;
  --gap: 16px;
  --header-bg: #f0f4f8;
  --code-bg: #f5f5f5;
  --blockquote-border: #ddd;
  --search-highlight: #fff3cd;
  --replay-highlight: #e3f2fd;
}

[data-theme="dark"] {
  --bg: #1a1a2e;
  --bg-secondary: #16213e;
  --text: #e0e0e0;
  --text-secondary: #a0a0a0;
  --border: #2a2a4a;
  --border-light: #2a2a4a;
  --user-bg: #2a2a3e;
  --user-border: #555;
  --header-bg: #16213e;
  --code-bg: #2a2a3e;
  --blockquote-border: #555;
  --shadow: 0 1px 3px rgba(0,0,0,0.3);
  --search-highlight: #5a4a00;
  --replay-highlight: #1a3a5c;
}

/* ===== 基础重置 ===== */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  font-size: var(--font-size);
  line-height: var(--line-height);
  color: var(--text);
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
  overflow-x: hidden;
}

/* ===== Header ===== */
.export-header {
  background: var(--header-bg);
  padding: clamp(12px, 3vw, 20px) clamp(12px, 4vw, 24px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.header-title {
  font-size: clamp(18px, 4vw, 24px);
  font-weight: 700;
  margin-bottom: 4px;
  word-break: break-word;
}

.header-meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.header-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ===== 工具栏 ===== */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: clamp(8px, 2vw, 12px) clamp(12px, 4vw, 24px);
  background: var(--bg);
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 64px;
  z-index: 99;
  align-items: center;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  min-height: var(--touch-target);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.toolbar-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--accent);
}

.toolbar-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.toolbar-btn:active {
  transform: scale(0.97);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 4px;
}

/* 搜索框 */
.search-container {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  width: 180px;
  background: var(--bg);
  color: var(--text);
  min-height: var(--touch-target);
  transition: width 0.2s;
}

.search-input:focus {
  width: 240px;
  outline: none;
  border-color: var(--accent);
}

.search-count {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.search-nav-btn {
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  font-size: 16px;
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.search-nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ===== 主内容区 ===== */
.main-content {
  max-width: 900px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 32px) clamp(12px, 4vw, 24px);
}

/* ===== 侧边栏导航（桌面端） ===== */
.layout-with-sidebar {
  display: flex;
  max-width: 1100px;
  margin: 0 auto;
  padding: clamp(16px, 4vw, 32px) clamp(12px, 4vw, 24px);
  gap: 24px;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  position: sticky;
  top: 130px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  border-right: 1px solid var(--border-light);
  padding-right: 16px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-item {
  display: block;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.1s;
  min-height: var(--touch-target);
  line-height: var(--touch-target);
}

.sidebar-item:hover {
  background: var(--bg-secondary);
  color: var(--text);
}

.sidebar-item.ai {
  padding-left: 20px;
}

/* ===== 对话流 ===== */
.conversation-flow {
  flex: 1;
  min-width: 0;
}

/* ===== 消息节点 ===== */
.message {
  border-radius: var(--radius);
  padding: clamp(12px, 3vw, 20px);
  margin-bottom: var(--gap);
  border-left: 4px solid;
  background: var(--bg);
  box-shadow: var(--shadow);
  transition: all 0.3s ease;
  position: relative;
  word-break: break-word;
}

.message.user {
  background: var(--user-bg);
  border-color: var(--user-border);
}

.message.ai {
  border-color: var(--model-color, var(--accent));
}

.message.replay-active {
  box-shadow: 0 0 0 3px var(--accent);
  transform: scale(1.01);
  z-index: 10;
}

.message.search-match {
  box-shadow: 0 0 0 3px #ffc107;
}

/* 消息头部 */
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}

.message-header .icon {
  font-size: 18px;
}

.message-header .role {
  font-weight: 600;
  color: var(--text);
}

.message-header .model {
  font-size: 11px;
  opacity: 0.7;
}

/* 分支方向标签 */
.branch-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.branch-label::before {
  content: '🔀';
  font-size: 11px;
}

/* 消息内容 */
.message-content {
  line-height: var(--line-height);
}

.message-content h1,
.message-content h2,
.message-content h3,
.message-content h4 {
  margin: 0.6em 0 0.3em;
  line-height: 1.3;
}

.message-content h1 { font-size: 1.4em; }
.message-content h2 { font-size: 1.2em; }
.message-content h3 { font-size: 1.1em; }

.message-content p {
  margin: 0.4em 0;
}

.message-content ul,
.message-content ol {
  margin: 0.4em 0;
  padding-left: 1.8em;
}

.message-content li {
  margin: 0.2em 0;
}

.message-content code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.9em;
  word-break: break-all;
}

.message-content pre {
  background: var(--code-bg);
  padding: clamp(8px, 2vw, 14px);
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.5em 0;
  -webkit-overflow-scrolling: touch;
}

.message-content pre code {
  background: none;
  padding: 0;
}

.message-content blockquote {
  border-left: 3px solid var(--blockquote-border);
  margin: 0.5em 0;
  padding: 4px 12px;
  color: var(--text-secondary);
}

.message-content a {
  color: var(--accent);
  text-decoration: underline;
}

.message-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  font-size: 14px;
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.message-content th,
.message-content td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  text-align: left;
}

.message-content th {
  background: var(--bg-secondary);
  font-weight: 600;
}

.message-content strong {
  font-weight: 600;
}

.message-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* 节点操作按钮 */
.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.action-btn:active {
  transform: scale(0.97);
}

/* ===== 分叉组 ===== */
.fork-group {
  margin-left: clamp(12px, 3vw, 20px);
  border-left: 2px dashed var(--border);
  padding-left: clamp(8px, 2vw, 16px);
  margin-bottom: var(--gap);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0;
}

.fork-group > .message {
  border-left-style: dashed;
}

/* ===== 分支树视图 ===== */
.tree-view {
  display: none;
  padding: 20px;
  min-height: 400px;
}

.tree-view.active {
  display: block;
}

.flow-view {
  display: block;
}

.flow-view.hidden {
  display: none;
}

.tree-node {
  position: relative;
  padding: 8px 16px;
  margin: 4px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 14px;
  border-left: 3px solid transparent;
}

.tree-node:hover {
  background: var(--bg-secondary);
}

.tree-node.user {
  border-left-color: var(--user-border);
}

.tree-node.ai {
  border-left-color: var(--model-color, var(--accent));
}

.tree-node.selected {
  background: var(--replay-highlight);
}

.tree-children {
  margin-left: 20px;
  border-left: 1px solid var(--border-light);
  padding-left: 12px;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.tree-node-content .icon {
  flex-shrink: 0;
}

.tree-node-content .text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node-content .branch-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* 分支详情面板 */
.tree-detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 400px;
  height: 100vh;
  background: var(--bg);
  box-shadow: -2px 0 10px rgba(0,0,0,0.1);
  z-index: 200;
  overflow-y: auto;
  padding: 24px;
  transform: translateX(100%);
  transition: transform 0.3s ease;
}

.tree-detail-panel.open {
  transform: translateX(0);
}

.tree-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 199;
  display: none;
}

.tree-detail-overlay.visible {
  display: block;
}

/* ===== Footer ===== */
.export-footer {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 12px;
  border-top: 1px solid var(--border-light);
  margin-top: 32px;
}

/* ===== 搜索高亮 ===== */
mark {
  background: var(--search-highlight);
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

mark.active {
  background: #ff9800;
  color: #fff;
}

/* ===== 回放进度条 ===== */
.replay-progress {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--border-light);
  z-index: 300;
}

.replay-progress-bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.3s linear;
}

/* ===== 移动端适配 ===== */
@media (max-width: 768px) {
  .toolbar {
    padding: 8px 12px;
    top: 56px;
    gap: 4px;
  }

  .toolbar-btn {
    padding: 6px 10px;
    font-size: 12px;
    gap: 4px;
  }

  .toolbar-divider {
    display: none;
  }

  .search-container {
    width: 100%;
    margin-left: 0;
    margin-top: 4px;
  }

  .search-input {
    flex: 1;
    width: auto;
  }

  .search-input:focus {
    width: auto;
  }

  /* 移动端隐藏侧边栏 */
  .sidebar {
    display: none;
  }

  /* 分叉组纵向排列 */
  .fork-group {
    grid-template-columns: 1fr;
    margin-left: 12px;
    padding-left: 12px;
  }

  /* 消息卡片间距加大 */
  .message {
    margin-bottom: 12px;
  }

  /* 树形详情面板全屏 */
  .tree-detail-panel {
    width: 100%;
  }

  /* 最佳触摸尺寸 */
  .action-btn,
  .toolbar-btn,
  .sidebar-item {
    min-height: var(--touch-target);
  }
}

@media (max-width: 480px) {
  :root {
    --font-size: 15px;
    --gap: 12px;
  }

  .export-header {
    padding: 10px 12px;
  }

  .header-title {
    font-size: 16px;
  }

  .main-content,
  .layout-with-sidebar {
    padding: 12px 8px;
  }

  .message {
    padding: 12px;
    border-radius: 6px;
  }

  .fork-group {
    margin-left: 8px;
    padding-left: 8px;
  }

  .toolbar-btn span.label-text {
    display: none; /* 移动端只显示图标 */
  }
}

/* ===== 打印样式 ===== */
@media print {
  .toolbar,
  .export-footer,
  .message-actions,
  .sidebar {
    display: none !important;
  }

  .message {
    box-shadow: none;
    border: 1px solid #ddd;
    break-inside: avoid;
  }

  body {
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
}

/* ===== 动画 ===== */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message {
  animation: fadeIn 0.3s ease-out;
}
`;
}