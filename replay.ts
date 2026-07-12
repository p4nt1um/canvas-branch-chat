/**
 * replay.ts — P2 #14 对话回放 v4
 *
 * 核心设计：
 * 1. 全局总览固定不动（一次性 zoom out 到整棵树可见）
 * 2. 逐节点缩放：动画 viewport 到当前节点 → 停留 → 回到总览
 * 3. 不触碰任何 .canvas-node 的 transform 属性
 *
 * 两种遍历模式：
 * - T 时间线：按 y 坐标从上到下
 * - D 深度优先：沿每条分支走到底再回溯
 */

import { Notice } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { findChildNodeIds, findNodeById, getNodeRole, findParentNodeId } from './context';

// ============================================================
// 类型
// ============================================================

type TraversalMode = 'time' | 'depth';

interface ReplayConfig {
  dwellMs: number;
  overviewMs: number;
  zoomMs: number;
}

const DEFAULT_CONFIG: ReplayConfig = {
  dwellMs: 3000,
  overviewMs: 1500,
  zoomMs: 500,
};

const SPEED_PRESETS = [
  { label: '慢', dwellMs: 5000, overviewMs: 2500, zoomMs: 800 },
  { label: '中', dwellMs: 3000, overviewMs: 1500, zoomMs: 500 },
  { label: '快', dwellMs: 1500, overviewMs: 800, zoomMs: 300 },
];

// ============================================================
// Canvas Viewport 辅助
// ============================================================

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

function getViewport(canvas: CanvasRuntimeView): Viewport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  if (typeof c.getViewport === 'function') {
    const vp = c.getViewport();
    return { x: vp.x ?? 0, y: vp.y ?? 0, zoom: vp.zoom ?? 1 };
  }
  return { x: c.x ?? 0, y: c.y ?? 0, zoom: c.zoom ?? 1 };
}

function setViewport(canvas: CanvasRuntimeView, vp: Viewport): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  if (typeof c.setViewport === 'function') {
    c.setViewport(vp.x, vp.y, vp.zoom);
  } else if (typeof c.zoomTo === 'function') {
    // Obsidian Canvas API: zoomTo(x, y, zoom)
    c.zoomTo(vp.x, vp.y, vp.zoom);
  } else {
    c.x = vp.x;
    c.y = vp.y;
    c.zoom = vp.zoom;
  }
}

/** 通过 DOM 获取 Canvas 可视区域尺寸（更可靠） */
function getCanvasViewportSize(): { w: number; h: number } {
  // 方法 1: .canvas-wrapper（Obsidian 官方 class）
  const wrapper = document.querySelector('.canvas-wrapper') as HTMLElement | null;
  if (wrapper) {
    const rect = wrapper.getBoundingClientRect();
    if (rect.width > 200) return { w: rect.width, h: rect.height };
  }
  // 方法 2: .view-content
  const vc = document.querySelector('.view-content') as HTMLElement | null;
  if (vc) {
    const rect = vc.getBoundingClientRect();
    if (rect.width > 200) return { w: rect.width, h: rect.height };
  }
  // 方法 3: workspace-leaf
  const leaf = document.querySelector('.workspace-leaf.mod-active .view-content') as HTMLElement | null;
  if (leaf) {
    const rect = leaf.getBoundingClientRect();
    if (rect.width > 200) return { w: rect.width, h: rect.height };
  }
  // 兜底
  return { w: window.innerWidth - 280, h: window.innerHeight - 60 };
}

/** 计算"整棵树可见"的 viewport */
function viewportForOverview(
  canvas: CanvasRuntimeView,
  nodeIds: string[],
): Viewport {
  if (nodeIds.length === 0) return getViewport(canvas);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const id of nodeIds) {
    const node = findNodeById(canvas, id);
    if (!node) continue;
    found = true;
    const w = node.width || 400;
    const h = node.height || 200;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
    maxY = Math.max(maxY, node.y + h);
  }

  if (!found || !isFinite(minX)) return getViewport(canvas);

  const treeW = maxX - minX;
  const treeH = maxY - minY;
  const padding = 60;

  const { w: viewW, h: viewH } = getCanvasViewportSize();

  const zoomW = viewW / (treeW + padding * 2);
  const zoomH = viewH / (treeH + padding * 2);
  // 不设上限（大树需要很小的 zoom），下限 0.02
  const zoom = Math.max(0.02, Math.min(zoomW, zoomH));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  console.log(`[Canvas Branch Chat] Overview: tree=${treeW}x${treeH}, view=${viewW}x${viewH}, zoom=${zoom}`);

  return {
    x: centerX - viewW / (2 * zoom),
    y: centerY - viewH / (2 * zoom),
    zoom,
  };
}

/** 计算聚焦单个节点的 viewport */
function viewportForNode(
  node: CanvasRuntimeNode,
  canvas: CanvasRuntimeView,
): Viewport {
  const nodeW = node.width || 400;
  const nodeH = node.height || 200;
  const { w: viewW, h: viewH } = getCanvasViewportSize();

  // 让节点占视口 75% 宽度
  const zoomW = viewW * 0.75 / nodeW;
  const zoomH = viewH * 0.75 / nodeH;
  const zoom = Math.min(zoomW, zoomH, 2.0);

  const centerX = node.x + nodeW / 2;
  const centerY = node.y + nodeH / 2;

  return {
    x: centerX - viewW / (2 * zoom),
    y: centerY - viewH / (2 * zoom),
    zoom,
  };
}

/** 缓动动画过渡 viewport — 使用 Web Animations API 风格的手写帧循环 */
function animateViewport(
  canvas: CanvasRuntimeView,
  from: Viewport,
  to: Viewport,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

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

// ============================================================
// 节点高亮
// ⚠️ 绝不触碰 .canvas-node 的 transform 属性！
//    Obsidian 用它定位节点 (transform: translate(Xpx, Ypx))
//    覆盖 transform 会导致所有节点跳到 (0,0) 堆叠
// ============================================================

function getNodeEl(node: CanvasRuntimeNode): HTMLElement | null {
  return (node.contentEl?.closest('.canvas-node') as HTMLElement) || null;
}

function clearAllHighlights(canvas: CanvasRuntimeView) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  const container = c.canvasEl || c.containerEl || c.contentEl || c.el;
  if (!container || !container.findAll) return;
  const all = container.findAll('.canvas-node') as HTMLElement[];
  all.forEach((el) => {
    el.removeClass('replay-played', 'replay-current', 'replay-pending');
    // ⚠️ 绝不清 transform！
    el.style.zIndex = '';
    el.style.boxShadow = '';
    el.style.transition = '';
    el.style.opacity = '';
    el.style.filter = '';
  });
}

function highlightNode(
  nodeId: string,
  canvas: CanvasRuntimeView,
  state: 'played' | 'current' | 'pending',
) {
  const node = findNodeById(canvas, nodeId);
  if (!node) return;
  const el = getNodeEl(node);
  if (!el) return;
  el.removeClass('replay-played', 'replay-current', 'replay-pending');
  el.addClass(`replay-${state}`);

  if (state === 'pending') {
    el.style.opacity = '0.3';
    el.style.filter = 'grayscale(0.6)';
    el.style.boxShadow = '';
  } else if (state === 'played') {
    el.style.opacity = '';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
  } else if (state === 'current') {
    el.style.opacity = '1';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 3px var(--interactive-accent), 0 4px 20px rgba(0,0,0,0.2)';
    el.style.zIndex = '100';
  }
}

// ============================================================
// 遍历顺序
// ============================================================

function traversalTime(canvas: CanvasRuntimeView, rootId: string): string[] {
  const visited = new Set<string>();
  const collected: { id: string; y: number }[] = [];

  const collect = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = findNodeById(canvas, nodeId);
    if (!node) return;
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
// 控制条 UI — fixed 定位，不受 Canvas transform 影响
// ============================================================

interface ControlBarCallbacks {
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onSetMode: (mode: TraversalMode) => void;
  onSetSpeed: (speed: number) => void;
}

function createControlBar(
  totalNodes: number,
  callbacks: ControlBarCallbacks,
) {
  const bar = document.body.createDiv({ cls: 'replay-control-bar' });

  // 左侧：播放控制
  const left = bar.createDiv({ cls: 'replay-controls-left' });

  const prevBtn = left.createEl('button', { cls: 'replay-btn' });
  prevBtn.innerHTML = '⏮';
  prevBtn.title = '上一个 (←)';

  const playBtn = left.createEl('button', { cls: 'replay-btn replay-play-btn' });
  playBtn.innerHTML = '⏸';
  playBtn.title = '暂停/继续 (空格)';

  const nextBtn = left.createEl('button', { cls: 'replay-btn' });
  nextBtn.innerHTML = '⏭';
  nextBtn.title = '下一个 (→)';

  // 中间：模式 + 速度
  const center = bar.createDiv({ cls: 'replay-controls-center' });

  const modeTime = center.createEl('button', { cls: 'replay-mode-btn replay-mode-active' });
  modeTime.innerHTML = 'T 时间线';
  modeTime.title = '按时间顺序 (T)';

  const modeDepth = center.createEl('button', { cls: 'replay-mode-btn' });
  modeDepth.innerHTML = 'D 深度优先';
  modeDepth.title = '按分支深度 (D)';

  const speedWrap = center.createDiv({ cls: 'replay-speed-wrap' });
  const speedBtn = speedWrap.createEl('button', { cls: 'replay-speed-btn' });
  speedBtn.innerHTML = '⏱ 中';
  speedBtn.title = '播放速度';

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

  const docClick = (e: MouseEvent) => {
    if (!speedWrap.contains(e.target as Node)) {
      speedMenu.removeClass('replay-speed-show');
    }
  };
  document.addEventListener('click', docClick);

  // 右侧：进度 + 退出
  const right = bar.createDiv({ cls: 'replay-controls-right' });

  const progress = right.createDiv({ cls: 'replay-progress' });
  const progressText = progress.createSpan({ cls: 'replay-progress-text', text: `1/${totalNodes}` });

  const exitBtn = right.createEl('button', { cls: 'replay-btn replay-exit-btn' });
  exitBtn.innerHTML = '✕ 退出';
  exitBtn.title = '退出回放 (Esc)';

  // Bind events
  prevBtn.addEventListener('click', callbacks.onPrev);
  playBtn.addEventListener('click', callbacks.onTogglePause);
  nextBtn.addEventListener('click', callbacks.onNext);
  exitBtn.addEventListener('click', callbacks.onExit);
  modeTime.addEventListener('click', () => callbacks.onSetMode('time'));
  modeDepth.addEventListener('click', () => callbacks.onSetMode('depth'));

  return {
    bar,
    playBtn,
    progressText,
    modeTime,
    modeDepth,
    speedBtn,
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
    destroy: () => {
      document.removeEventListener('click', docClick);
      bar.remove();
    },
  };
}

// ============================================================
// 回放控制器
// ============================================================

export class ReplayController {
  private canvas: CanvasRuntimeView;
  private startNodeId: string;
  private nodeIds: string[] = [];
  private currentIndex: number = 0;
  private mode: TraversalMode = 'time';
  private speedIndex: number = 1;
  private paused: boolean = false;
  private cancelled: boolean = false;
  private controlBar: ReturnType<typeof createControlBar> | null = null;
  private savedViewport: Viewport | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: CanvasRuntimeView, startNodeId: string) {
    this.canvas = canvas;
    this.startNodeId = startNodeId;
  }

  async start() {
    try {
      await this._start();
    } catch (err) {
      console.error('[Canvas Branch Chat] Replay error:', err);
      new Notice(`❌ 回放出错: ${err instanceof Error ? err.message : String(err)}`);
      this.cleanup();
    }
  }

  private async _start() {
    const rootId = findRoot(this.canvas, this.startNodeId);
    this.rebuildTraversal();

    if (this.nodeIds.length === 0) {
      new Notice('没有可回放的对话节点');
      return;
    }

    console.log(
      `[Canvas Branch Chat] 🎬 Replay: ${this.nodeIds.length} nodes, mode=${this.mode}`,
      'ids:', this.nodeIds.slice(0, 5), '...',
    );

    // 1. 保存原 viewport
    this.savedViewport = getViewport(this.canvas);

    // 2. 创建控制条 — 挂到 body，用 fixed 定位
    this.controlBar = createControlBar(this.nodeIds.length, {
      onTogglePause: () => this.togglePause(),
      onPrev: () => this.prev(),
      onNext: () => this.next(),
      onExit: () => this.cancel(),
      onSetMode: (mode) => this.setMode(mode),
      onSetSpeed: (speed) => this.setSpeed(speed),
    });

    // 3. 注册键盘
    this.registerKeyboard();

    // 4. 标记所有节点 pending
    for (const id of this.nodeIds) {
      highlightNode(id, this.canvas, 'pending');
    }

    const config = this.getConfig();

    // 5. 阶段 1: 全局总览
    const overviewVp = viewportForOverview(this.canvas, this.nodeIds);
    console.log('[Canvas Branch Chat] Overview:', JSON.stringify(overviewVp));
    await animateViewport(this.canvas, this.savedViewport, overviewVp, config.zoomMs);
    if (this.cancelled) { this.cleanup(); return; }
    await this.interruptibleDelay(config.overviewMs);
    if (this.cancelled) { this.cleanup(); return; }

    // 6. 阶段 2: 逐节点 focus → 回到总览 → 标记 played
    for (this.currentIndex = 0; this.currentIndex < this.nodeIds.length; this.currentIndex++) {
      if (this.cancelled) break;

      const nodeId = this.nodeIds[this.currentIndex];
      const node = findNodeById(this.canvas, nodeId);
      if (!node) continue;

      this.controlBar?.updateProgress(this.currentIndex);

      // 6a. 标记当前
      highlightNode(nodeId, this.canvas, 'current');

      // 6b. 动画 zoom 到当前节点
      const nodeVp = viewportForNode(node, this.canvas);
      await animateViewport(this.canvas, overviewVp, nodeVp, config.zoomMs);
      if (this.cancelled) break;

      // 6c. 停留阅读
      await this.interruptibleDelay(config.dwellMs);
      if (this.cancelled) break;

      // 6d. 动画 zoom 回总览
      await animateViewport(this.canvas, nodeVp, overviewVp, config.zoomMs);
      if (this.cancelled) break;

      // 6e. 标记已播放
      highlightNode(nodeId, this.canvas, 'played');
    }

    // 7. 完成
    this.finish();
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
      const curId = this.nodeIds[this.currentIndex];
      const curNode = findNodeById(this.canvas, curId);
      // 标记当前为 pending
      if (curId) highlightNode(curId, this.canvas, 'pending');
      this.currentIndex -= 2;
    }
  }

  private next() {
    this.paused = false;
  }

  private cancel() {
    this.cancelled = true;
    this.paused = false;
  }

  private setMode(mode: TraversalMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.controlBar?.updateMode(mode);

    const currentNode = this.nodeIds[this.currentIndex];
    this.rebuildTraversal();
    const newIdx = this.nodeIds.indexOf(currentNode);
    if (newIdx >= 0) this.currentIndex = newIdx;
  }

  private setSpeed(speed: number) {
    this.speedIndex = speed;
  }

  private getConfig(): ReplayConfig {
    const preset = SPEED_PRESETS[this.speedIndex] || SPEED_PRESETS[1];
    return {
      dwellMs: preset.dwellMs,
      overviewMs: preset.overviewMs,
      zoomMs: preset.zoomMs,
    };
  }

  private rebuildTraversal() {
    const rootId = findRoot(this.canvas, this.startNodeId);
    this.nodeIds = this.mode === 'time'
      ? traversalTime(this.canvas, rootId)
      : traversalDepth(this.canvas, rootId);
    console.log(`[Canvas Branch Chat] Traversal: ${this.nodeIds.length} nodes, mode=${this.mode}`);
  }

  // ============================================================
  // 延迟（支持暂停 + 取消）
  // ============================================================

  private interruptibleDelay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.cancelled) { resolve(); return; }
        if (this.paused) {
          window.setTimeout(check, 100);
        } else {
          window.setTimeout(resolve, ms);
        }
      };
      window.setTimeout(check, 100);
    });
  }

  // ============================================================
  // 键盘
  // ============================================================

  private registerKeyboard() {
    this.onKeyDown = (e: KeyboardEvent) => {
      // 不在输入框中处理（避免影响编辑）
      if ((e.target as HTMLElement)?.tagName === 'INPUT' ||
          (e.target as HTMLElement)?.tagName === 'TEXTAREA' ||
          (e.target as HTMLElement)?.contentEditable === 'true') {
        return;
      }
      switch (e.key) {
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          this.togglePause();
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          this.cancel();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          this.prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
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
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  private unregisterKeyboard() {
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown, true);
      this.onKeyDown = null;
    }
  }

  // ============================================================
  // 结束 / 清理
  // ============================================================

  private finish() {
    console.log('[Canvas Branch Chat] 🎬 Replay finished');
    if (this.savedViewport) {
      const currentVp = getViewport(this.canvas);
      void animateViewport(this.canvas, currentVp, this.savedViewport, 500);
    }
    this.cleanup();
  }

  private cleanup() {
    this.unregisterKeyboard();
    clearAllHighlights(this.canvas);
    if (this.controlBar) {
      this.controlBar.destroy();
      this.controlBar = null;
    }
    this.canvas.requestSave();
  }

  destroy() {
    this.cancelled = true;
    this.paused = false;
    this.cleanup();
    if (this.savedViewport) {
      setViewport(this.canvas, this.savedViewport);
      this.canvas.requestSave();
    }
  }
}
