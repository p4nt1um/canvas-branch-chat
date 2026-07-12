/**
 * replay.ts — P2 #14 对话回放
 *
 * 设计原则：全局总览固定不动，当前节点原地放大，保持整体掌控感。
 *
 * 流程：
 * 1. 初始化：缩放到整棵树可见，标记所有节点为 pending（暗淡）
 * 2. 逐节点：
 *    - 边框强调 → 当前节点原地 scale up → 停留阅读 → 缩小 → 标记 played
 * 3. 结束：清除高亮，还原 viewport
 *
 * 两种遍历模式：
 * - T 时间线：按 y 坐标从上到下
 * - D 深度优先：沿每条分支走到底再回溯
 *
 * ⚠️ 关键：节点放大使用 CSS scale property（独立于 transform），不覆盖 Obsidian
 *    Canvas 用于节点定位的 transform: translate(Xpx, Ypx)。
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
  transitionMs: number;
}

const DEFAULT_CONFIG: ReplayConfig = {
  dwellMs: 3000,
  overviewMs: 1500,
  transitionMs: 500,
};

const SPEED_PRESETS = [
  { label: '慢', dwellMs: 5000, overviewMs: 2500 },
  { label: '中', dwellMs: 3000, overviewMs: 1500 },
  { label: '快', dwellMs: 1500, overviewMs: 800 },
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
  if (c.getViewport) {
    const vp = c.getViewport();
    return { x: vp.x ?? 0, y: vp.y ?? 0, zoom: vp.zoom ?? 1 };
  }
  return { x: c.x ?? 0, y: c.y ?? 0, zoom: c.zoom ?? 1 };
}

function setViewport(canvas: CanvasRuntimeView, vp: Viewport): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  if (c.setViewport) {
    c.setViewport(vp.x, vp.y, vp.zoom);
  } else {
    c.x = vp.x;
    c.y = vp.y;
    c.zoom = vp.zoom;
  }
}

/** 获取 Canvas 可视区域尺寸 — 遍历可能的容器 */
function getCanvasViewportSize(canvas: CanvasRuntimeView): { w: number; h: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  const candidates = [
    c.canvasEl,
    c.contentEl,
    c.containerEl,
    c.el,
    c.view?.containerEl,
    c.view?.canvasEl,
    c.view?.contentEl,
  ];
  for (const el of candidates) {
    if (el && el.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        return { w: rect.width, h: rect.height };
      }
    }
  }
  // 兜底
  return { w: window.innerWidth - 300, h: window.innerHeight - 100 };
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

  if (!isFinite(minX)) return getViewport(canvas);

  const treeW = maxX - minX;
  const treeH = maxY - minY;
  const padding = 100;

  const { w: viewW, h: viewH } = getCanvasViewportSize(canvas);

  const zoomW = viewW / (treeW + padding * 2);
  const zoomH = viewH / (treeH + padding * 2);
  // 允许缩到很小（大树需要），但不低于 0.03（过小没意义）
  const zoom = Math.max(0.03, Math.min(zoomW, zoomH, 1.0));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: centerX - viewW / (2 * zoom),
    y: centerY - viewH / (2 * zoom),
    zoom,
  };
}

/** 缓动动画过渡 viewport */
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
// 节点高亮 — 使用 CSS scale property（不覆盖 transform）
// Obsidian Canvas 用 transform: translate(Xpx, Ypx) 定位节点
// 覆盖 transform 会导致节点飞回 (0,0) 全部堆叠 ❌
// CSS scale property 是独立的，缩放节点但不影响定位 ✅
// ============================================================

function getNodeEl(node: CanvasRuntimeNode): HTMLElement | null {
  return (node.contentEl?.closest('.canvas-node') as HTMLElement) || null;
}

/** 计算最大缩放比例 */
function computeMaxScale(node: CanvasRuntimeNode, canvas: CanvasRuntimeView): number {
  const nodeW = node.width || 400;
  const { w: viewW } = getCanvasViewportSize(canvas);
  const currentZoom = getViewport(canvas).zoom;
  const screenNodeW = nodeW * currentZoom;
  const targetScreenW = viewW * 0.72;
  return Math.max(1.5, targetScreenW / screenNodeW);
}

/**
 * 原地放大：先用 rAF + force reflow 确保初始 scale:1 被提交，
 * 再设置目标 scale，触发 CSS transition。
 */
function amplifyNode(node: CanvasRuntimeNode, canvas: CanvasRuntimeView) {
  const el = getNodeEl(node);
  if (!el) return;

  const scale = computeMaxScale(node, canvas);

  el.style.transition = 'scale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease';
  el.style.boxShadow = '0 0 0 3px var(--interactive-accent), 0 8px 40px rgba(0,0,0,0.25)';
  el.style.zIndex = '200';

  // 强制浏览器提交 scale:1 的初始状态，再跳到目标值，这样才能触发 transition
  el.style.scale = '1';
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  window.getComputedStyle(el).scale; // force reflow
  el.style.scale = String(scale);
}

/**
 * 缩小还原：先切到 scale:1 过渡，transitionend 后清理 style
 */
function unamplifyNode(node: CanvasRuntimeNode) {
  const el = getNodeEl(node);
  if (!el) return;

  el.style.transition = 'scale 0.25s ease, box-shadow 0.25s ease';
  el.style.scale = '1';
  el.style.boxShadow = '';

  const onEnd = (e: TransitionEvent) => {
    if (e.propertyName !== 'scale') return;
    el.removeEventListener('transitionend', onEnd);
    el.style.scale = '';
    el.style.zIndex = '';
    el.style.transition = '';
    el.style.boxShadow = '';
  };
  el.addEventListener('transitionend', onEnd);
}

/** 暴力清除所有节点的回放样式（回放结束/取消时调用） */
function clearAllHighlights(canvas: CanvasRuntimeView) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = canvas as any;
  const container = c.canvasEl || c.containerEl || c.contentEl || c.el;
  if (!container || !container.findAll) return;
  const all = container.findAll('.canvas-node') as HTMLElement[];
  all.forEach((el) => {
    el.removeClass('replay-played', 'replay-current', 'replay-pending');
    el.style.transform = '';
    el.style.zIndex = '';
    el.style.boxShadow = '';
    el.style.transition = '';
    el.style.opacity = '';
    el.style.filter = '';
    el.style.scale = '';
  });
}

/** 节点高亮状态标记 */
function highlightNode(nodeId: string, canvas: CanvasRuntimeView, state: 'played' | 'current' | 'pending') {
  const node = findNodeById(canvas, nodeId);
  if (!node) return;
  const el = getNodeEl(node);
  if (!el) return;
  el.removeClass('replay-played', 'replay-current', 'replay-pending');
  el.addClass(`replay-${state}`);

  if (state === 'pending') {
    el.style.opacity = '0.35';
    el.style.filter = 'grayscale(0.6)';
  } else if (state === 'played') {
    el.style.opacity = '';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
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
// 控制条 UI — 浮动在 Canvas 顶部
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
  parent: HTMLElement,
  totalNodes: number,
  callbacks: ControlBarCallbacks,
) {
  const bar = parent.createDiv({ cls: 'replay-control-bar' });

  // 左侧：播放控制
  const left = bar.createDiv({ cls: 'replay-controls-left' });

  const prevBtn = left.createEl('button', { cls: 'replay-btn' });
  prevBtn.innerHTML = '⏮';
  prevBtn.title = '上一个 (←)';
  prevBtn.addEventListener('click', callbacks.onPrev);

  const playBtn = left.createEl('button', { cls: 'replay-btn replay-play-btn' });
  playBtn.innerHTML = '⏸';
  playBtn.title = '暂停/继续 (空格)';
  playBtn.addEventListener('click', callbacks.onTogglePause);

  const nextBtn = left.createEl('button', { cls: 'replay-btn' });
  nextBtn.innerHTML = '⏭';
  nextBtn.title = '下一个 (→)';
  nextBtn.addEventListener('click', callbacks.onNext);

  // 中间：模式 + 速度
  const center = bar.createDiv({ cls: 'replay-controls-center' });

  const modeTime = center.createEl('button', { cls: 'replay-mode-btn replay-mode-active' });
  modeTime.innerHTML = 'T 时间线';
  modeTime.title = '按时间顺序 (T)';
  modeTime.addEventListener('click', () => callbacks.onSetMode('time'));

  const modeDepth = center.createEl('button', { cls: 'replay-mode-btn' });
  modeDepth.innerHTML = 'D 深度优先';
  modeDepth.title = '按分支深度 (D)';
  modeDepth.addEventListener('click', () => callbacks.onSetMode('depth'));

  // 速度下拉
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

  // 关闭下拉
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
  exitBtn.addEventListener('click', callbacks.onExit);

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

    console.log(`[Canvas Branch Chat] 🎬 Replay start: ${this.nodeIds.length} nodes, mode=${this.mode}`);

    // 1. 保存原 viewport
    this.savedViewport = getViewport(this.canvas);

    // 2. 创建控制条
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvas = this.canvas as any;
    const parent = canvas.canvasEl || canvas.containerEl || canvas.contentEl || canvas.el;
    if (!parent || !parent.createDiv) {
      console.error('[Canvas Branch Chat] Cannot find canvas container for control bar');
      new Notice('❌ 无法创建控制条');
      return;
    }
    this.controlBar = createControlBar(parent, this.nodeIds.length, {
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

    // 5. 阶段 1: 全局总览 — 一次到位，后续不再改 viewport
    const overviewViewport = viewportForOverview(this.canvas, this.nodeIds);
    console.log(`[Canvas Branch Chat] Overview viewport:`, overviewViewport);
    await animateViewport(this.canvas, this.savedViewport, overviewViewport, config.transitionMs);
    if (this.cancelled) { this.cleanup(); return; }
    await this.interruptibleDelay(config.overviewMs);
    if (this.cancelled) { this.cleanup(); return; }

    // 6. 阶段 2: 逐节点放大缩小
    for (this.currentIndex = 0; this.currentIndex < this.nodeIds.length; this.currentIndex++) {
      if (this.cancelled) break;

      const nodeId = this.nodeIds[this.currentIndex];
      const node = findNodeById(this.canvas, nodeId);
      if (!node) continue;

      this.controlBar?.updateProgress(this.currentIndex);

      // 6a. 标记当前
      highlightNode(nodeId, this.canvas, 'current');

      // 6b. 原地放大（带弹性动画）
      amplifyNode(node, this.canvas);

      // 6c. 停留阅读
      await this.interruptibleDelay(config.dwellMs);
      if (this.cancelled) break;

      // 6d. 缩小还原
      unamplifyNode(node);

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
      if (curNode) unamplifyNode(curNode);
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
    };
  }

  private rebuildTraversal() {
    const rootId = findRoot(this.canvas, this.startNodeId);
    this.nodeIds = this.mode === 'time'
      ? traversalTime(this.canvas, rootId)
      : traversalDepth(this.canvas, rootId);
    console.log(`[Canvas Branch Chat] Traversal rebuilt: ${this.nodeIds.length} nodes, mode=${this.mode}`);
  }

  // ============================================================
  // 延迟（支持暂停 + 取消）
  // ============================================================

  private interruptibleDelay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this.cancelled) { resolve(); return; }
        if (this.paused) {
          window.setTimeout(check, 100);
        } else {
          const remaining = ms - (Date.now() - start);
          if (remaining <= 0) { resolve(); }
          else { window.setTimeout(resolve, remaining); }
        }
      };
      window.setTimeout(check, 100);
    });
  }

  // ============================================================
  // 键盘 — document 级别 capture phase
  // ============================================================

  private registerKeyboard() {
    this.onKeyDown = (e: KeyboardEvent) => {
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
    const currentVp = getViewport(this.canvas);
    if (this.savedViewport) {
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
    // 确保 viewport 持久化
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
