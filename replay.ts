/**
 * replay.ts — P2 #14 对话回放
 *
 * 三阶段回放：
 * 1. 全局总览：缩放到整棵树可见
 * 2. 逐节点聚焦：边框脉冲 → zoom 到节点 → 停留阅读 → 缩回全局
 * 3. 结束：回到全局，清除高亮
 *
 * 两种遍历模式：
 * - T 时间线：按 y 坐标从上到下
 * - D 深度优先：沿每条分支走到底再回溯
 */

import { Notice } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { findChildNodeIds, findNodeById, getNodeRole, getNodeText, findParentNodeId } from './context';

// ============================================================
// 类型
// ============================================================

type TraversalMode = 'time' | 'depth';

interface ReplayConfig {
  /** 每个节点停留时间 (ms) */
  dwellMs: number;
  /** 全局总览停留时间 (ms) */
  overviewMs: number;
  /** zoom 过渡时间 (ms) */
  transitionMs: number;
  /** 聚焦时的缩放比例 */
  focusZoom: number;
}

const DEFAULT_CONFIG: ReplayConfig = {
  dwellMs: 3000,
  overviewMs: 2000,
  transitionMs: 400,
  focusZoom: 1.0,
};

const SPEED_PRESETS = [
  { label: '慢', dwellMs: 5000, overviewMs: 3000 },
  { label: '中', dwellMs: 3000, overviewMs: 2000 },
  { label: '快', dwellMs: 1500, overviewMs: 1000 },
];

// ============================================================
// Canvas Viewport 辅助
// ============================================================

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 读取当前 viewport */
function getViewport(canvas: CanvasRuntimeView): Viewport {
  const c = canvas as unknown as {
    x?: number; y?: number; zoom?: number;
    viewport?: { x: number; y: number; zoom: number };
    getViewport?: () => Viewport;
  };
  if (c.getViewport) return c.getViewport();
  if (c.viewport) return { ...c.viewport };
  return { x: c.x ?? 0, y: c.y ?? 0, zoom: c.zoom ?? 1 };
}

/** 设置 viewport */
function setViewport(canvas: CanvasRuntimeView, vp: Viewport): void {
  const c = canvas as unknown as {
    setViewport?: (x: number, y: number, zoom: number) => void;
    viewport?: { x: number; y: number; zoom: number };
    x?: number; y?: number; zoom?: number;
  };
  if (c.setViewport) {
    c.setViewport(vp.x, vp.y, vp.zoom);
  } else {
    c.x = vp.x;
    c.y = vp.y;
    c.zoom = vp.zoom;
    if (c.viewport) {
      c.viewport.x = vp.x;
      c.viewport.y = vp.y;
      c.viewport.zoom = vp.zoom;
    }
  }
  canvas.requestSave();
}

/** 计算"让指定节点居中且可读"的 viewport */
function viewportForNode(node: CanvasRuntimeNode, canvas: CanvasRuntimeView): Viewport {
  const vp = getViewport(canvas);

  // 尝试读取 Canvas 实际可视区域大小
  const c = canvas as unknown as {
    containerEl?: HTMLElement;
    width?: number;
    height?: number;
  };
  let viewW = 800;
  let viewH = 600;
  if (c.containerEl) {
    const rect = c.containerEl.getBoundingClientRect();
    viewW = rect.width || viewW;
    viewH = rect.height || viewH;
  } else if (c.width && c.height) {
    viewW = c.width;
    viewH = c.height;
  }

  // 计算让节点占 ~80% 屏幕宽度的 zoom
  const nodeW = node.width || 400;
  const targetW = viewW * 0.8;
  const zoomByWidth = targetW / nodeW;
  // 限制 zoom 范围
  const zoom = Math.max(0.3, Math.min(zoomByWidth, 2.5));

  // 节点居中
  const nodeCenterX = node.x + (node.width || 400) / 2;
  const nodeCenterY = node.y + (node.height || 200) / 2;

  return {
    x: nodeCenterX - viewW / (2 * zoom),
    y: nodeCenterY - viewH / (2 * zoom),
    zoom,
  };
}

/** 计算"整棵树可见"的 viewport */
function viewportForOverview(
  canvas: CanvasRuntimeView,
  nodeIds: string[],
): Viewport {
  if (nodeIds.length === 0) return getViewport(canvas);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of nodeIds) {
    const node = findNodeById(canvas, id);
    if (!node) continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + (node.width || 400));
    maxY = Math.max(maxY, node.y + (node.height || 200));
  }

  const treeW = maxX - minX;
  const treeH = maxY - minY;
  const padding = 100;

  const c = canvas as unknown as { containerEl?: HTMLElement };
  let viewW = 800;
  let viewH = 600;
  if (c.containerEl) {
    const rect = c.containerEl.getBoundingClientRect();
    viewW = rect.width || viewW;
    viewH = rect.height || viewH;
  }

  const zoomW = viewW / (treeW + padding * 2);
  const zoomH = viewH / (treeH + padding * 2);
  const zoom = Math.min(zoomW, zoomH, 1.0);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: centerX - viewW / (2 * zoom),
    y: centerY - viewH / (2 * zoom),
    zoom,
  };
}

// ============================================================
// 平滑过渡动画
// ============================================================

/** requestAnimationFrame 缓动过渡 viewport */
function animateViewport(
  canvas: CanvasRuntimeView,
  from: Viewport,
  to: Viewport,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      const e = ease(t);

      setViewport(canvas, {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      });

      if (t < 1) {
        window.requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    window.requestAnimationFrame(tick);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// ============================================================
// 节点高亮
// ============================================================

/** 获取节点的最外层 DOM 元素 */
function getNodeEl(node: CanvasRuntimeNode): HTMLElement | null {
  const el = node.contentEl?.closest('.canvas-node') as HTMLElement | null;
  return el;
}

function clearHighlight(canvas: CanvasRuntimeView) {
  const container = (canvas as unknown as { containerEl?: HTMLElement }).containerEl;
  if (!container) return;
  container.findAll('.replay-played, .replay-current, .replay-pending').forEach((el: HTMLElement) => {
    el.removeClass('replay-played', 'replay-current', 'replay-pending');
  });
}

function highlightNode(nodeId: string, canvas: CanvasRuntimeView, state: 'played' | 'current' | 'pending') {
  const node = findNodeById(canvas, nodeId);
  if (!node) return;
  const el = getNodeEl(node);
  if (!el) return;
  el.removeClass('replay-played', 'replay-current', 'replay-pending');
  el.addClass(`replay-${state}`);
}

// ============================================================
// 遍历顺序
// ============================================================

/** 时间线模式：按 y 坐标排序 */
function traversalTime(canvas: CanvasRuntimeView, rootId: string): string[] {
  const visited = new Set<string>();
  const collected: { id: string; y: number }[] = [];

  const collect = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = findNodeById(canvas, nodeId);
    if (!node) return;

    // 只收集对话节点（有角色的）
    const role = getNodeRole(node);
    if (role === 'user' || role === 'assistant') {
      collected.push({ id: nodeId, y: node.y });
    }

    for (const childId of findChildNodeIds(canvas, nodeId)) {
      collect(childId);
    }
  };

  collect(rootId);
  collected.sort((a, b) => a.y - b.y);
  return collected.map((c) => c.id);
}

/** 深度优先：沿每条分支走到底再回溯 */
function traversalDepth(canvas: CanvasRuntimeView, rootId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  const dfs = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = findNodeById(canvas, nodeId);
    if (!node) return;

    const role = getNodeRole(node);
    if (role === 'user' || role === 'assistant') {
      result.push(nodeId);
    }

    for (const childId of findChildNodeIds(canvas, nodeId)) {
      dfs(childId);
    }
  };

  dfs(rootId);
  return result;
}

/** 找到对话树根节点 */
function findRoot(canvas: CanvasRuntimeView, nodeId: string): string {
  let current = nodeId;
  let parent = findParentNodeId(canvas, current);
  while (parent) {
    current = parent;
    parent = findParentNodeId(canvas, current);
  }
  return current;
}

// ============================================================
// 控制条 UI
// ============================================================

interface ControlBarCallbacks {
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onSetMode: (mode: TraversalMode) => void;
  onSetSpeed: (speed: number) => void; // index into SPEED_PRESETS
}

function createControlBar(
  container: HTMLElement,
  totalNodes: number,
  callbacks: ControlBarCallbacks,
) {
  const bar = container.createDiv({ cls: 'replay-control-bar' });

  // 左侧：播放控制
  const left = bar.createDiv({ cls: 'replay-controls-left' });

  const prevBtn = left.createEl('button', { cls: 'replay-btn' });
  prevBtn.innerHTML = '⏮';
  prevBtn.title = '上一个';
  prevBtn.addEventListener('click', callbacks.onPrev);

  const playBtn = left.createEl('button', { cls: 'replay-btn replay-play-btn' });
  playBtn.innerHTML = '⏸';
  playBtn.title = '暂停/继续';
  playBtn.addEventListener('click', callbacks.onTogglePause);

  const nextBtn = left.createEl('button', { cls: 'replay-btn' });
  nextBtn.innerHTML = '⏭';
  nextBtn.title = '下一个';
  nextBtn.addEventListener('click', callbacks.onNext);

  // 中间：模式切换
  const center = bar.createDiv({ cls: 'replay-controls-center' });

  const modeTime = center.createEl('button', { cls: 'replay-mode-btn replay-mode-active' });
  modeTime.innerHTML = 'T 时间线';
  modeTime.title = '按时间顺序 (T)';
  modeTime.addEventListener('click', () => callbacks.onSetMode('time'));

  const modeDepth = center.createEl('button', { cls: 'replay-mode-btn' });
  modeDepth.innerHTML = 'D 深度优先';
  modeDepth.title = '按分支深度 (D)';
  modeDepth.addEventListener('click', () => callbacks.onSetMode('depth'));

  // 速度
  const speedWrap = center.createDiv({ cls: 'replay-speed-wrap' });
  const speedBtn = speedWrap.createEl('button', { cls: 'replay-speed-btn' });
  speedBtn.innerHTML = '⏱ 中';

  const speedMenu = speedWrap.createDiv({ cls: 'replay-speed-dropdown' });
  SPEED_PRESETS.forEach((preset, i) => {
    const item = speedMenu.createEl('button', { cls: 'replay-speed-option' });
    item.innerHTML = preset.label;
    item.addEventListener('click', () => {
      speedBtn.innerHTML = `⏱ ${preset.label}`;
      callbacks.onSetSpeed(i);
      speedMenu.removeClass('replay-speed-show');
    });
  });
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu.classList.toggle('replay-speed-show');
  });

  // 右侧：进度 + 退出
  const right = bar.createDiv({ cls: 'replay-controls-right' });

  const progress = right.createDiv({ cls: 'replay-progress' });
  const progressText = progress.createSpan({ cls: 'replay-progress-text', text: `1/${totalNodes}` });

  const exitBtn = right.createEl('button', { cls: 'replay-btn replay-exit-btn' });
  exitBtn.innerHTML = '退出';
  exitBtn.addEventListener('click', callbacks.onExit);

  return {
    bar,
    playBtn,
    progressText,
    modeTime,
    modeDepth,
    speedBtn,
    speedMenu,
    updateProgress: (current: number) => {
      progressText.setText(`${current + 1}/${totalNodes}`);
    },
    updatePlayBtn: (paused: boolean) => {
      playBtn.innerHTML = paused ? '▶' : '⏸';
    },
    updateMode: (mode: TraversalMode) => {
      modeTime.toggleClass('replay-mode-active', mode === 'time');
      modeDepth.toggleClass('replay-mode-active', mode === 'depth');
    },
  };
}

// ============================================================
// 回放控制器
// ============================================================

export class ReplayController {
  private canvas: CanvasRuntimeView;
  private container: HTMLElement;
  private startNodeId: string;
  private nodeIds: string[] = [];
  private currentIndex: number = 0;
  private mode: TraversalMode = 'time';
  private speedIndex: number = 1; // 中
  private paused: boolean = false;
  private cancelled: boolean = false;
  private controlBar: ReturnType<typeof createControlBar> | null = null;
  private savedViewport: Viewport | null = null;

  constructor(canvas: CanvasRuntimeView, startNodeId: string) {
    this.canvas = canvas;
    this.startNodeId = startNodeId;
    const c = canvas as unknown as { containerEl?: HTMLElement };
    this.container = c.containerEl || (canvas as unknown as HTMLElement);
  }

  async start() {
    // 1. 计算遍历顺序
    const rootId = findRoot(this.canvas, this.startNodeId);
    this.rebuildTraversal();

    if (this.nodeIds.length === 0) {
      new Notice('没有可回放的对话节点');
      return;
    }

    // 2. 保存当前 viewport
    this.savedViewport = getViewport(this.canvas);

    // 3. 创建控制条
    this.controlBar = createControlBar(this.container, this.nodeIds.length, {
      onTogglePause: () => this.togglePause(),
      onPrev: () => this.prev(),
      onNext: () => this.next(),
      onExit: () => this.cancel(),
      onSetMode: (mode) => this.setMode(mode),
      onSetSpeed: (speed) => this.setSpeed(speed),
    });

    // 4. 键盘快捷键
    this.registerKeyboard();

    // 5. 标记所有节点为 pending
    for (const id of this.nodeIds) {
      highlightNode(id, this.canvas, 'pending');
    }

    const config = this.getConfig();

    // 6. 阶段 1: 全局总览
    const overviewVp = viewportForOverview(this.canvas, this.nodeIds);
    await animateViewport(this.canvas, this.savedViewport, overviewVp, config.transitionMs);
    if (this.cancelled) return;
    await this.dwellDelay(config.overviewMs);
    if (this.cancelled) return;

    // 7. 阶段 2: 逐节点聚焦
    for (this.currentIndex = 0; this.currentIndex < this.nodeIds.length; this.currentIndex++) {
      if (this.cancelled) return;
      await this.focusNode(this.nodeIds[this.currentIndex]);
      if (this.cancelled) return;
    }

    // 8. 阶段 3: 结束，回到全局
    this.finish();
  }

  /** 聚焦单个节点 */
  private async focusNode(nodeId: string) {
    const config = this.getConfig();
    const node = findNodeById(this.canvas, nodeId);
    if (!node) return;

    // 更新控制条进度
    this.controlBar?.updateProgress(this.currentIndex);

    // 标记当前节点
    highlightNode(nodeId, this.canvas, 'current');

    // 从全局 → 聚焦
    const overviewVp = viewportForOverview(this.canvas, this.nodeIds);
    const focusVp = viewportForNode(node, this.canvas);
    await animateViewport(this.canvas, overviewVp, focusVp, config.transitionMs);
    if (this.cancelled) return;

    // 停留阅读（支持暂停中断）
    await this.dwellDelay(config.dwellMs);
    if (this.cancelled) return;

    // 缩回全局
    await animateViewport(this.canvas, getViewport(this.canvas), overviewVp, config.transitionMs * 0.7);
    if (this.cancelled) return;

    // 标记为已播放
    highlightNode(nodeId, this.canvas, 'played');
  }

  /** 带暂停支持的延迟 */
  private async dwellDelay(ms: number): Promise<void> {
    const checkInterval = 100;
    let elapsed = 0;
    while (elapsed < ms) {
      if (this.cancelled) return;
      if (!this.paused) {
        elapsed += checkInterval;
      }
      await delay(checkInterval);
    }
  }

  // ============================================================
  // 用户控制
  // ============================================================

  private togglePause() {
    this.paused = !this.paused;
    this.controlBar?.updatePlayBtn(this.paused);
  }

  private prev() {
    if (this.currentIndex > 0) {
      this.currentIndex -= 2; // for 循环会 +1
    }
  }

  private next() {
    // for 循环会自然 +1，这里只需跳过当前停留
    // 通过设置 dwellElapsed 来实现跳过
    this.paused = false;
  }

  private cancel() {
    this.cancelled = true;
  }

  private setMode(mode: TraversalMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.controlBar?.updateMode(mode);

    // 记录当前节点，重建遍历顺序
    const currentNode = this.nodeIds[this.currentIndex];
    this.rebuildTraversal();

    // 找到当前节点在新序列中的位置
    const newIdx = this.nodeIds.indexOf(currentNode);
    if (newIdx >= 0) {
      this.currentIndex = newIdx;
    }
  }

  private setSpeed(speed: number) {
    this.speedIndex = speed;
  }

  private getConfig(): ReplayConfig {
    const preset = SPEED_PRESETS[this.speedIndex];
    return {
      dwellMs: preset.dwellMs,
      overviewMs: preset.overviewMs,
      transitionMs: DEFAULT_CONFIG.transitionMs,
      focusZoom: DEFAULT_CONFIG.focusZoom,
    };
  }

  private rebuildTraversal() {
    const rootId = findRoot(this.canvas, this.startNodeId);
    this.nodeIds = this.mode === 'time'
      ? traversalTime(this.canvas, rootId)
      : traversalDepth(this.canvas, rootId);
  }

  // ============================================================
  // 键盘
  // ============================================================

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private registerKeyboard() {
    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePause();
          break;
        case 'Escape':
          e.preventDefault();
          this.cancel();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.next();
          break;
        case 't':
        case 'T':
          this.setMode('time');
          break;
        case 'd':
        case 'D':
          this.setMode('depth');
          break;
      }
    };
    this.container.addEventListener('keydown', this.keyHandler);
  }

  // ============================================================
  // 结束/清理
  // ============================================================

  private finish() {
    this.unregisterKeyboard();
    clearHighlight(this.canvas);

    // 回到原始 viewport
    if (this.savedViewport) {
      const currentVp = getViewport(this.canvas);
      animateViewport(this.canvas, currentVp, this.savedViewport, DEFAULT_CONFIG.transitionMs);
    }

    // 移除控制条
    this.controlBar?.bar.remove();
    this.controlBar = null;

    new Notice('回放完成');
  }

  private unregisterKeyboard() {
    if (this.keyHandler) {
      this.container.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  /** 外部强制终止 */
  destroy() {
    this.cancelled = true;
    this.unregisterKeyboard();
    clearHighlight(this.canvas);
    if (this.savedViewport) {
      setViewport(this.canvas, this.savedViewport);
    }
    this.controlBar?.bar.remove();
    this.controlBar = null;
  }
}
