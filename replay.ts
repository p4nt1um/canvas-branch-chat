/**
 * replay.ts — P2 #14 对话回放
 *
 * 设计原则：用 Canvas viewport（zoom/pan）实现所有动画效果，
 * 绝不修改 .canvas-node 的 inline style（Obsidian 用 transform 定位节点）。
 *
 * 三阶段流程：
 *   1. 全局总览：viewport 平滑 zoom out 到整棵树可见
 *   2. 逐节点聚焦：viewport 平滑 zoom in 到当前节点 → 边框高亮 + 停留 → zoom out 回总览
 *   3. 结束还原：viewport 平滑回到原始位置
 *
 * 遍历模式：
 *   T 时间线：所有节点按 y 坐标排序（从上到下）
 *   D 深度优先：沿分支走到底再回溯
 */

import { Notice } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { findChildNodeIds, findNodeById, getNodeRole, findParentNodeId } from './context';

// ============================================================
// 类型
// ============================================================

type TraversalMode = 'time' | 'depth';

interface SpeedPreset {
  label: string;
  dwellMs: number;   // 节点停留时间
  overviewMs: number; // 总览停留时间
  zoomMs: number;    // zoom 动画时长
}

const SPEEDS: SpeedPreset[] = [
  { label: '慢', dwellMs: 5000, overviewMs: 2500, zoomMs: 700 },
  { label: '中', dwellMs: 3000, overviewMs: 1500, zoomMs: 450 },
  { label: '快', dwellMs: 1500, overviewMs: 800,  zoomMs: 300 },
];

// ============================================================
// Viewport 辅助
// ============================================================

interface Viewport { x: number; y: number; zoom: number; }

function getViewport(canvas: CanvasRuntimeView): Viewport {
  const c = canvas as unknown as Record<string, unknown>;
  if (typeof c.getViewport === 'function') {
    const vp = (c.getViewport as () => Viewport)();
    return { x: vp.x ?? 0, y: vp.y ?? 0, zoom: vp.zoom ?? 1 };
  }
  return {
    x: (c.x as number) ?? 0,
    y: (c.y as number) ?? 0,
    zoom: (c.zoom as number) ?? 1,
  };
}

function setViewport(canvas: CanvasRuntimeView, vp: Viewport): void {
  const c = canvas as unknown as Record<string, unknown>;
  if (typeof c.setViewport === 'function') {
    (c.setViewport as (x: number, y: number, z: number) => void)(vp.x, vp.y, vp.zoom);
  } else if (typeof c.zoomTo === 'function') {
    (c.zoomTo as (x: number, y: number, z: number) => void)(vp.x, vp.y, vp.zoom);
  } else {
    c.x = vp.x;
    c.y = vp.y;
    c.zoom = vp.zoom;
  }
}

/** 获取 Canvas 可视区域尺寸（通过 DOM 查询） */
function getViewSize(): { w: number; h: number } {
  // 按优先级查询 DOM 元素
  const selectors = [
    '.canvas-wrapper',
    '.workspace-leaf.mod-active .view-content',
    '.view-content',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 200) {
        return { w: rect.width, h: rect.height };
      }
    }
  }
  return { w: window.innerWidth - 280, h: window.innerHeight - 60 };
}

/** 计算"整棵树可见"的 viewport */
function calcOverview(canvas: CanvasRuntimeView, nodeIds: string[]): Viewport {
  const current = getViewport(canvas);
  if (nodeIds.length === 0) return current;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const id of nodeIds) {
    const node = findNodeById(canvas, id);
    if (!node) continue;
    found = true;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + (node.width || 400));
    maxY = Math.max(maxY, node.y + (node.height || 200));
  }
  if (!found || !isFinite(minX)) return current;

  const treeW = maxX - minX;
  const treeH = maxY - minY;
  const pad = 80;
  const { w, h } = getViewSize();

  const zoom = Math.max(0.02, Math.min(
    w / (treeW + pad * 2),
    h / (treeH + pad * 2),
  ));

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  console.log(`[Canvas Branch Chat] calcOverview: tree=${Math.round(treeW)}x${Math.round(treeH)}, view=${Math.round(w)}x${Math.round(h)}, zoom=${zoom.toFixed(3)}`);

  // Obsidian Canvas viewport: x/y 是视口中心的画布坐标
  return {
    x: cx,
    y: cy,
    zoom,
  };
}

/** 计算"聚焦单个节点"的 viewport */
function calcFocus(node: CanvasRuntimeNode): Viewport {
  const nw = node.width || 400;
  const nh = node.height || 200;
  const { w, h } = getViewSize();

  // 节点占视口 70%
  const zoom = Math.min((w * 0.7) / nw, (h * 0.7) / nh, 2.5);

  // Obsidian Canvas viewport: x/y 是视口中心 = 节点中心
  return {
    x: node.x + nw / 2,
    y: node.y + nh / 2,
    zoom,
  };
}

/** 缓动过渡 viewport */
function animateViewport(canvas: CanvasRuntimeView, from: Viewport, to: Viewport, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) { setViewport(canvas, to); resolve(); return; }
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const tick = (now: number) => {
      const t = Math.min((now - t0) / ms, 1);
      const e = ease(t);
      setViewport(canvas, {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        zoom: from.zoom + (to.zoom - from.zoom) * e,
      });
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

// ============================================================
// 节点视觉高亮（不碰 transform / 不碰 .canvas-node inline style 的 transform）
// ============================================================

function nodeEl(node: CanvasRuntimeNode): HTMLElement | null {
  return (node.contentEl?.closest('.canvas-node') as HTMLElement) ?? null;
}

function setHighlight(node: CanvasRuntimeNode, state: 'pending' | 'current' | 'played'): void {
  const el = nodeEl(node);
  if (!el) return;
  el.removeClass('replay-pending', 'replay-current', 'replay-played');
  el.addClass(`replay-${state}`);

  if (state === 'pending') {
    el.style.opacity = '0.25';
    el.style.filter = 'grayscale(0.7)';
    el.style.boxShadow = '';
    el.style.zIndex = '';
  } else if (state === 'current') {
    el.style.opacity = '1';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 4px var(--interactive-accent), 0 8px 36px rgba(0,0,0,0.3)';
    el.style.zIndex = '100';
  } else { // played
    el.style.opacity = '0.55';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
    el.style.zIndex = '';
  }
}

function clearAllStyles(canvas: CanvasRuntimeView): void {
  const c = canvas as unknown as Record<string, unknown>;
  const container = (c.canvasEl ?? c.containerEl ?? c.contentEl ?? c.el) as HTMLElement | undefined;
  if (!container?.querySelectorAll) return;
  const nodes = container.querySelectorAll('.canvas-node') as NodeListOf<HTMLElement>;
  nodes.forEach((el) => {
    el.removeClass('replay-pending', 'replay-current', 'replay-played');
    el.style.opacity = '';
    el.style.filter = '';
    el.style.boxShadow = '';
    el.style.zIndex = '';
    // ⚠️ 绝不清 transform — Obsidian 用它定位节点
  });
}

// ============================================================
// 遍历
// ============================================================

function findRootId(canvas: CanvasRuntimeView, startId: string): string {
  let cur = startId;
  for (;;) {
    const parent = findParentNodeId(canvas, cur);
    if (!parent) return cur;
    cur = parent;
  }
}

/** 时间线模式：所有对话节点按 y 排序 */
function traverseTime(canvas: CanvasRuntimeView, rootId: string): string[] {
  const seen = new Set<string>();
  const items: { id: string; y: number }[] = [];
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = findNodeById(canvas, id);
    if (!node) return;
    const role = getNodeRole(node);
    if (role === 'user' || role === 'assistant') {
      items.push({ id, y: node.y });
    }
    for (const child of findChildNodeIds(canvas, id)) walk(child);
  };
  walk(rootId);
  items.sort((a, b) => a.y - b.y);
  return items.map((i) => i.id);
}

/** 深度优先模式：沿分支走到底 */
function traverseDepth(canvas: CanvasRuntimeView, rootId: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const dfs = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = findNodeById(canvas, id);
    if (!node) return;
    const role = getNodeRole(node);
    if (role === 'user' || role === 'assistant') {
      result.push(id);
    }
    for (const child of findChildNodeIds(canvas, id)) dfs(child);
  };
  dfs(rootId);
  return result;
}

// ============================================================
// 控制条（fixed 定位，挂 body）
// ============================================================

interface ControlBar {
  el: HTMLElement;
  setProgress: (cur: number, total: number) => void;
  setPaused: (paused: boolean) => void;
  setMode: (mode: TraversalMode) => void;
  destroy: () => void;
}

function createControlBar(total: number, cb: {
  onTogglePause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onMode: (m: TraversalMode) => void;
  onSpeed: (i: number) => void;
}): ControlBar {
  const el = document.body.createDiv({ cls: 'replay-bar' });

  // 左：播放控制
  const left = el.createDiv({ cls: 'replay-bar-left' });
  const mkBtn = (icon: string, title: string, fn: () => void) => {
    const b = left.createEl('button', { cls: 'replay-bar-btn' });
    b.innerHTML = icon;
    b.title = title;
    b.addEventListener('click', fn);
    return b;
  };
  const prevBtn = mkBtn('⏮', '上一个 (←)', cb.onPrev);
  const playBtn = mkBtn('⏸', '暂停/继续 (空格)', cb.onTogglePause);
  const nextBtn = mkBtn('⏭', '下一个 (→)', cb.onNext);

  // 中：模式 + 速度
  const mid = el.createDiv({ cls: 'replay-bar-mid' });

  const modeT = mid.createEl('button', { cls: 'replay-bar-mode replay-bar-mode-active' });
  modeT.textContent = 'T 时间线';
  modeT.title = '按时间顺序';
  modeT.addEventListener('click', () => cb.onMode('time'));

  const modeD = mid.createEl('button', { cls: 'replay-bar-mode' });
  modeD.textContent = 'D 深度优先';
  modeD.title = '按分支深度';
  modeD.addEventListener('click', () => cb.onMode('depth'));

  // 速度选择
  const speedWrap = mid.createDiv({ cls: 'replay-bar-speed-wrap' });
  const speedBtn = speedWrap.createEl('button', { cls: 'replay-bar-speed' });
  speedBtn.textContent = '⏱ 中';
  const speedDrop = speedWrap.createDiv({ cls: 'replay-bar-speed-drop' });
  SPEEDS.forEach((s, i) => {
    const opt = speedDrop.createEl('button', { cls: 'replay-bar-speed-opt' });
    opt.textContent = s.label;
    opt.addEventListener('click', () => {
      speedBtn.textContent = `⏱ ${s.label}`;
      cb.onSpeed(i);
      speedDrop.removeClass('show');
    });
  });
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speedDrop.classList.toggle('show');
  });
  const closeDrop = (e: MouseEvent) => {
    if (!speedWrap.contains(e.target as Node)) speedDrop.removeClass('show');
  };
  document.addEventListener('click', closeDrop);

  // 右：进度 + 退出
  const right = el.createDiv({ cls: 'replay-bar-right' });
  const progress = right.createSpan({ cls: 'replay-bar-progress' });
  progress.textContent = `1/${total}`;

  const exitBtn = right.createEl('button', { cls: 'replay-bar-exit' });
  exitBtn.textContent = '✕ 退出';
  exitBtn.title = '退出回放 (Esc)';
  exitBtn.addEventListener('click', cb.onExit);

  return {
    el,
    setProgress: (cur, t) => { progress.textContent = `${cur + 1}/${t}`; },
    setPaused: (paused) => { playBtn.innerHTML = paused ? '▶' : '⏸'; },
    setMode: (mode) => {
      modeT.toggleClass('replay-bar-mode-active', mode === 'time');
      modeD.toggleClass('replay-bar-mode-active', mode === 'depth');
    },
    destroy: () => {
      document.removeEventListener('click', closeDrop);
      el.remove();
    },
  };
}

// ============================================================
// 回放控制器
// ============================================================

export class ReplayController {
  private canvas: CanvasRuntimeView;
  private startNodeId: string;
  private mode: TraversalMode = 'time';
  private speedIdx = 1;
  private paused = false;
  private cancelled = false;
  private nodeIds: string[] = [];
  private idx = 0;
  private savedVp: Viewport | null = null;
  private bar: ControlBar | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: CanvasRuntimeView, startNodeId: string) {
    this.canvas = canvas;
    this.startNodeId = startNodeId;
  }

  async start(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      console.error('[Canvas Branch Chat] Replay error:', err);
      new Notice(`❌ 回放出错: ${err instanceof Error ? err.message : String(err)}`);
      this.teardown();
    }
  }

  private async run(): Promise<void> {
    const rootId = findRootId(this.canvas, this.startNodeId);
    this.rebuild();
    if (this.nodeIds.length === 0) {
      new Notice('没有可回放的对话节点');
      return;
    }

    console.log(`[Canvas Branch Chat] 🎬 Replay: ${this.nodeIds.length} nodes, mode=${this.mode}`);

    // 保存原 viewport
    this.savedVp = getViewport(this.canvas);

    // 创建控制条
    this.bar = createControlBar(this.nodeIds.length, {
      onTogglePause: () => this.togglePause(),
      onPrev: () => this.prev(),
      onNext: () => this.next(),
      onExit: () => this.cancel(),
      onMode: (m) => this.changeMode(m),
      onSpeed: (i) => { this.speedIdx = i; },
    });

    // 键盘
    this.bindKeys();

    // 标记所有 pending
    for (const id of this.nodeIds) {
      const n = findNodeById(this.canvas, id);
      if (n) setHighlight(n, 'pending');
    }

    const sp = SPEEDS[this.speedIdx];

    // 阶段 1: 全局总览
    const overviewVp = calcOverview(this.canvas, this.nodeIds);
    console.log('[Canvas Branch Chat] overview:', JSON.stringify(overviewVp));
    await animateViewport(this.canvas, this.savedVp, overviewVp, sp.zoomMs);
    if (this.guard()) return;
    await this.delay(sp.overviewMs);
    if (this.guard()) return;

    // 阶段 2: 逐节点
    for (this.idx = 0; this.idx < this.nodeIds.length; this.idx++) {
      if (this.cancelled) break;

      const node = findNodeById(this.canvas, this.nodeIds[this.idx]);
      if (!node) continue;

      this.bar?.setProgress(this.idx, this.nodeIds.length);
      setHighlight(node, 'current');

      // zoom 到节点
      const focusVp = calcFocus(node);
      await animateViewport(this.canvas, overviewVp, focusVp, sp.zoomMs);
      if (this.cancelled) break;

      // 停留阅读
      await this.delay(sp.dwellMs);
      if (this.cancelled) break;

      // zoom 回总览
      await animateViewport(this.canvas, focusVp, overviewVp, sp.zoomMs);
      if (this.cancelled) break;

      setHighlight(node, 'played');
    }

    // 阶段 3: 结束还原
    if (!this.cancelled) {
      console.log('[Canvas Branch Chat] 🎬 Replay finished');
    }
    this.teardown();
  }

  /** true = 应提前退出 */
  private guard(): boolean {
    return this.cancelled;
  }

  // ── 用户控制 ──

  private togglePause(): void {
    this.paused = !this.paused;
    this.bar?.setPaused(this.paused);
  }

  private prev(): void {
    if (this.idx > 0) {
      const n = findNodeById(this.canvas, this.nodeIds[this.idx]);
      if (n) setHighlight(n, 'pending');
      this.idx -= 2; // for 循环会 +1，所以 -2 回到上一个
    }
  }

  private next(): void {
    this.paused = false;
  }

  private cancel(): void {
    this.cancelled = true;
    this.paused = false;
  }

  private changeMode(m: TraversalMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.bar?.setMode(m);
    const cur = this.nodeIds[this.idx];
    this.rebuild();
    const newIdx = this.nodeIds.indexOf(cur);
    if (newIdx >= 0) this.idx = newIdx;
  }

  private rebuild(): void {
    const root = findRootId(this.canvas, this.startNodeId);
    this.nodeIds = this.mode === 'time'
      ? traverseTime(this.canvas, root)
      : traverseDepth(this.canvas, root);
  }

  // ── 可中断延迟 ──

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.cancelled) { resolve(); return; }
        if (this.paused) { setTimeout(check, 100); return; }
        setTimeout(resolve, ms);
      };
      setTimeout(check, 50);
    });
  }

  // ── 键盘 ──

  private bindKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.target as HTMLElement)?.contentEditable === 'true') return;

      switch (e.key) {
        case ' ':
          e.preventDefault(); e.stopPropagation();
          this.togglePause();
          break;
        case 'Escape':
          e.preventDefault(); e.stopPropagation();
          this.cancel();
          break;
        case 'ArrowLeft':
          e.preventDefault(); e.stopPropagation();
          this.prev();
          break;
        case 'ArrowRight':
          e.preventDefault(); e.stopPropagation();
          this.next();
          break;
        case 't': case 'T':
          this.changeMode('time');
          break;
        case 'd': case 'D':
          this.changeMode('depth');
          break;
      }
    };
    document.addEventListener('keydown', this.keyHandler, true); // capture phase
  }

  private unbindKeys(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  // ── 清理 ──

  private teardown(): void {
    this.unbindKeys();
    clearAllStyles(this.canvas);
    this.bar?.destroy();
    this.bar = null;

    // 还原 viewport
    if (this.savedVp) {
      const cur = getViewport(this.canvas);
      void animateViewport(this.canvas, cur, this.savedVp, 400).then(() => {
        this.canvas.requestSave();
      });
    }
  }

  destroy(): void {
    this.cancel();
    this.teardown();
  }
}
