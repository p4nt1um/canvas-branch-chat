/**
 * replay.ts — P2 #14 对话回放
 *
 * 全部使用 Obsidian Canvas 原生 API：
 * - zoomToFit()       → 全局总览
 * - zoomToBbox(bbox)  → 聚焦节点
 * - getViewportBBox() → 保存/还原视口
 *
 * 不自建动画，不自定义 viewport 属性。
 */

import { Notice } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { findChildNodeIds, findNodeById, getNodeRole, findParentNodeId } from './context';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCanvas = CanvasRuntimeView & Record<string, any>;

type TraversalMode = 'time' | 'depth';

interface SpeedPreset {
  label: string;
  dwellMs: number;
  overviewMs: number;
}

const SPEEDS: SpeedPreset[] = [
  { label: '慢', dwellMs: 5000, overviewMs: 2500 },
  { label: '中', dwellMs: 3000, overviewMs: 1500 },
  { label: '快', dwellMs: 1500, overviewMs: 800 },
];

// ============================================================
// BBox 辅助
// ============================================================

interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

function nodeBBox(node: CanvasRuntimeNode): BBox {
  return {
    minX: node.x,
    minY: node.y,
    maxX: node.x + (node.width || 400),
    maxY: node.y + (node.height || 200),
  };
}

/** 给 BBox 加 padding（向外扩展） */
function padBBox(bbox: BBox, ratio: number): BBox {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const dx = w * (ratio - 1) / 2;
  const dy = h * (ratio - 1) / 2;
  return {
    minX: bbox.minX - dx,
    minY: bbox.minY - dy,
    maxX: bbox.maxX + dx,
    maxY: bbox.maxY + dy,
  };
}

/** 调用原生 zoomToFit */
function nativeZoomToFit(canvas: AnyCanvas): void {
  if (typeof canvas.zoomToFit === 'function') {
    canvas.zoomToFit();
  } else {
    console.warn('[Canvas Branch Chat] zoomToFit not found');
  }
}

/** 调用原生 zoomToBbox */
function nativeZoomToBbox(canvas: AnyCanvas, bbox: BBox): void {
  if (typeof canvas.zoomToBbox === 'function') {
    canvas.zoomToBbox(bbox);
  } else {
    console.warn('[Canvas Branch Chat] zoomToBbox not found');
  }
}

/** 获取当前视口 BBox */
function nativeGetViewportBBox(canvas: AnyCanvas): BBox | null {
  if (typeof canvas.getViewportBBox === 'function') {
    return canvas.getViewportBBox();
  }
  // 兜底：从节点数据推算
  if (typeof canvas.getData === 'function') {
    const data = canvas.getData();
    if (data?.nodes?.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of data.nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || 400));
        maxY = Math.max(maxY, n.y + (n.height || 200));
      }
      return { minX, minY, maxX, maxY };
    }
  }
  return null;
}

// ============================================================
// 节点高亮（绝不碰 transform）
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
  } else {
    el.style.opacity = '0.55';
    el.style.filter = '';
    el.style.boxShadow = '0 0 0 2px var(--interactive-accent)';
    el.style.zIndex = '';
  }
}

function clearAllStyles(canvas: AnyCanvas): void {
  const container = canvas.canvasEl ?? canvas.containerEl ?? canvas.contentEl ?? canvas.el;
  if (!container?.querySelectorAll) return;
  const nodes = container.querySelectorAll('.canvas-node') as NodeListOf<HTMLElement>;
  nodes.forEach((el) => {
    el.removeClass('replay-pending', 'replay-current', 'replay-played');
    el.style.opacity = '';
    el.style.filter = '';
    el.style.boxShadow = '';
    el.style.zIndex = '';
  });
}

// ============================================================
// 遍历
// ============================================================

function findRootId(canvas: AnyCanvas, startId: string): string {
  let cur = startId;
  for (;;) {
    const parent = findParentNodeId(canvas, cur);
    if (!parent) return cur;
    cur = parent;
  }
}

function traverseTime(canvas: AnyCanvas, rootId: string): string[] {
  // 时间线模式：按对话时间顺序（BFS 层序），同层内按 y 升序再按 x 升序
  // y 升序 = 屏幕上方先出现；x 升序 = 从左到右
  const seen = new Set<string>();
  const result: string[] = [];

  // BFS 按层级遍历
  let queue = [rootId];
  while (queue.length > 0) {
    const nextQueue: string[] = [];
    const levelItems: { id: string; y: number; x: number }[] = [];

    for (const id of queue) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = findNodeById(canvas, id);
      if (!node) continue;

      const role = getNodeRole(node);
      if (role === 'user' || role === 'assistant') {
        levelItems.push({ id, y: node.y, x: node.x });
      }

      for (const child of findChildNodeIds(canvas, id)) {
        if (!seen.has(child)) nextQueue.push(child);
      }
    }

    // 同层内排序：先 y（上到下）再 x（左到右）
    levelItems.sort((a, b) => a.y - b.y || a.x - b.x);
    result.push(...levelItems.map(i => i.id));

    queue = nextQueue;
  }

  return result;
}

function traverseDepth(canvas: AnyCanvas, rootId: string): string[] {
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
// 控制条
// ============================================================

interface ControlBar {
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
  el.style.pointerEvents = 'auto';

  // helper: 用 pointerdown 替代 click，绕过 Canvas 事件捕获
  const onBtn = (b: HTMLElement, fn: () => void) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  };

  // 左：播放
  const left = el.createDiv({ cls: 'replay-bar-left' });
  const mkBtn = (icon: string, title: string, fn: () => void) => {
    const b = left.createEl('button', { cls: 'replay-bar-btn' });
    b.innerHTML = icon;
    b.title = title;
    onBtn(b, fn);
    return b;
  };
  mkBtn('⏮', '上一个 (←)', cb.onPrev);
  const playBtn = mkBtn('⏸', '暂停/继续 (空格)', cb.onTogglePause);
  mkBtn('⏭', '下一个 (→)', cb.onNext);

  // 中：模式 + 速度
  const mid = el.createDiv({ cls: 'replay-bar-mid' });

  const modeT = mid.createEl('button', { cls: 'replay-bar-mode replay-bar-mode-active' });
  modeT.textContent = 'T 时间线';
  onBtn(modeT, () => cb.onMode('time'));

  const modeD = mid.createEl('button', { cls: 'replay-bar-mode' });
  modeD.textContent = 'D 深度优先';
  onBtn(modeD, () => cb.onMode('depth'));

  const speedWrap = mid.createDiv({ cls: 'replay-bar-speed-wrap' });
  const speedBtn = speedWrap.createEl('button', { cls: 'replay-bar-speed' });
  speedBtn.textContent = '⏱ 中';
  const speedDrop = speedWrap.createDiv({ cls: 'replay-bar-speed-drop' });
  SPEEDS.forEach((s, i) => {
    const opt = speedDrop.createEl('button', { cls: 'replay-bar-speed-opt' });
    opt.textContent = s.label;
    onBtn(opt, () => {
      speedBtn.textContent = `⏱ ${s.label}`;
      cb.onSpeed(i);
      speedDrop.toggleClass('show', false);
    });
  });
  onBtn(speedBtn, () => {
    speedDrop.toggleClass('show', !speedDrop.hasClass('show'));
  });
  const closeDrop = (e: PointerEvent) => {
    if (!speedWrap.contains(e.target as Node)) speedDrop.toggleClass('show', false);
  };
  document.addEventListener('pointerdown', closeDrop, true);

  // 右：进度 + 退出
  const right = el.createDiv({ cls: 'replay-bar-right' });
  const progress = right.createSpan({ cls: 'replay-bar-progress' });
  progress.textContent = `1/${total}`;

  const exitBtn = right.createEl('button', { cls: 'replay-bar-exit' });
  exitBtn.textContent = '✕ 退出';
  exitBtn.title = '退出回放 (Esc)';
  onBtn(exitBtn, cb.onExit);

  return {
    setProgress: (cur, t) => { progress.textContent = `${cur + 1}/${t}`; },
    setPaused: (paused) => { playBtn.innerHTML = paused ? '▶' : '⏸'; },
    setMode: (mode) => {
      modeT.toggleClass('replay-bar-mode-active', mode === 'time');
      modeD.toggleClass('replay-bar-mode-active', mode === 'depth');
    },
    destroy: () => {
      document.removeEventListener('pointerdown', closeDrop, true);
      el.remove();
    },
  };
}

// ============================================================
// 回放控制器
// ============================================================

export class ReplayController {
  private canvas: AnyCanvas;
  private startNodeId: string;
  private mode: TraversalMode = 'time';
  private speedIdx = 1;
  private paused = false;
  private cancelled = false;
  private nodeIds: string[] = [];
  private idx = 0;
  private savedBBox: BBox | null = null;
  private bar: ControlBar | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: CanvasRuntimeView, startNodeId: string) {
    this.canvas = canvas as AnyCanvas;
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

    // 保存原视口
    this.savedBBox = nativeGetViewportBBox(this.canvas);

    // 控制条
    this.bar = createControlBar(this.nodeIds.length, {
      onTogglePause: () => this.togglePause(),
      onPrev: () => this.prev(),
      onNext: () => this.next(),
      onExit: () => this.cancel(),
      onMode: (m) => this.changeMode(m),
      onSpeed: (i) => { this.speedIdx = i; },
    });

    this.bindKeys();

    // 标记 pending
    for (const id of this.nodeIds) {
      const n = findNodeById(this.canvas, id);
      if (n) setHighlight(n, 'pending');
    }

    // 阶段 1: 全局总览 — 原生 zoomToFit
    console.log('[Canvas Branch Chat] Phase 1: zoomToFit');
    nativeZoomToFit(this.canvas);
    await this.delay(this.getSpeed().overviewMs);
    if (this.guard()) return;

    // 阶段 2: 逐节点
    const BACKTRACK_EVERY = 4;
    let sinceOverview = 0;

    for (this.idx = 0; this.idx < this.nodeIds.length; this.idx++) {
      if (this.cancelled) break;

      const node = findNodeById(this.canvas, this.nodeIds[this.idx]);
      if (!node) continue;

      this.bar?.setProgress(this.idx, this.nodeIds.length);
      setHighlight(node, 'current');

      // 每 N 张回一次总览
      if (sinceOverview >= BACKTRACK_EVERY) {
        nativeZoomToFit(this.canvas);
        await this.delay(500);
        if (this.cancelled) break;
        sinceOverview = 0;
      }

      // 聚焦当前节点 — 原生 zoomToBbox（加 30% padding 让卡片不贴边）
      const bbox = padBBox(nodeBBox(node), 1.3);
      console.log(`[Canvas Branch Chat] Focus [${this.idx}] node=${this.nodeIds[this.idx]}, bbox=${JSON.stringify(bbox)}`);
      nativeZoomToBbox(this.canvas, bbox);

      await this.delay(this.getSpeed().dwellMs);
      if (this.cancelled) break;

      setHighlight(node, 'played');
      sinceOverview++;
    }

    // 最后回总览
    if (!this.cancelled && this.nodeIds.length > 0) {
      nativeZoomToFit(this.canvas);
    }

    // 结束
    if (!this.cancelled) {
      console.log('[Canvas Branch Chat] 🎬 Replay finished');
    }
    this.teardown();
  }

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
      this.idx -= 2;
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

  private getSpeed(): SpeedPreset {
    return SPEEDS[this.speedIdx] ?? SPEEDS[1];
  }

  private rebuild(): void {
    const root = findRootId(this.canvas, this.startNodeId);
    this.nodeIds = this.mode === 'time'
      ? traverseTime(this.canvas, root)
      : traverseDepth(this.canvas, root);
  }

  // ── 延迟 ──

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
    document.addEventListener('keydown', this.keyHandler, true);
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

    // 还原原视口
    if (this.savedBBox) {
      nativeZoomToBbox(this.canvas, this.savedBBox);
    }
    this.canvas.requestSave();
  }

  destroy(): void {
    this.cancel();
    this.teardown();
  }
}
