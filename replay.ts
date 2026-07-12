/**
 * replay.ts — P2 #14 对话回放
 *
 * 全部使用 Obsidian Canvas 原生 API：
 * - zoomToFit()       → 全局总览
 * - zoomToBbox(bbox)  → 聚焦节点
 * - getViewportBBox() → 保存/还原视口
 */

import { Notice } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView } from './types';
import { findChildNodeIds, findNodeById, getNodeRole, findParentNodeId, getNodeCreatedAt } from './context';

type AnyCanvas = CanvasRuntimeView & Record<string, unknown>;

type TraversalMode = 'time' | 'depth' | 'breadth';

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

function nativeZoomToFit(canvas: AnyCanvas): void {
  const fn = canvas.zoomToFit;
  if (typeof fn === 'function') fn.call(canvas);
}

function nativeZoomToBbox(canvas: AnyCanvas, bbox: BBox): void {
  const fn = canvas.zoomToBbox;
  if (typeof fn === 'function') fn.call(canvas, bbox);
}

function nativeGetViewportBBox(canvas: AnyCanvas): BBox | null {
  const fn = canvas.getViewportBBox;
  if (typeof fn === 'function') return fn.call(canvas);
  const getData = canvas.getData;
  if (typeof getData === 'function') {
    const data = getData.call(canvas);
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
// 节点高亮（CSS class 驱动，不用 inline style）
// ============================================================

function nodeEl(node: CanvasRuntimeNode): HTMLElement | null {
  return (node.contentEl?.closest('.canvas-node') as HTMLElement) ?? null;
}

function setHighlight(node: CanvasRuntimeNode, state: 'pending' | 'current' | 'played'): void {
  const el = nodeEl(node);
  if (!el) return;
  el.removeClass('replay-pending', 'replay-current', 'replay-played');
  el.addClass(`replay-${state}`);
}

function clearAllStyles(canvas: AnyCanvas): void {
  const container = (canvas.canvasEl ?? canvas.containerEl ?? canvas.contentEl ?? canvas.el) as HTMLElement | undefined;
  if (!container?.querySelectorAll) return;
  const nodes = container.querySelectorAll('.canvas-node') as NodeListOf<HTMLElement>;
  nodes.forEach((el) => {
    el.removeClass('replay-pending', 'replay-current', 'replay-played');
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
  const seen = new Set<string>();
  const items: { id: string; createdAt: number | null; y: number; x: number }[] = [];

  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = findNodeById(canvas, id);
    if (!node) return;
    const role = getNodeRole(node);
    if (role === 'user' || role === 'assistant') {
      items.push({ id, createdAt: getNodeCreatedAt(node), y: node.y, x: node.x });
    }
    for (const child of findChildNodeIds(canvas, id)) walk(child);
  };
  walk(rootId);

  const withTimestamp = items.filter(i => i.createdAt !== null);
  if (withTimestamp.length === items.length && items.length > 0) {
    items.sort((a, b) => (a.createdAt! - b.createdAt!));
  } else {
    items.sort((a, b) => a.y - b.y || a.x - b.x);
  }

  return items.map(i => i.id);
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

function traverseBreadth(canvas: AnyCanvas, rootId: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let queue = [rootId];

  while (queue.length > 0) {
    const nextQueue: string[] = [];
    const levelItems: { id: string; createdAt: number | null; x: number }[] = [];

    for (const id of queue) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = findNodeById(canvas, id);
      if (!node) continue;
      const role = getNodeRole(node);
      if (role === 'user' || role === 'assistant') {
        levelItems.push({ id, createdAt: getNodeCreatedAt(node), x: node.x });
      }
      for (const child of findChildNodeIds(canvas, id)) {
        if (!seen.has(child)) nextQueue.push(child);
      }
    }

    levelItems.sort((a, b) => {
      if (a.createdAt !== null && b.createdAt !== null) return a.createdAt - b.createdAt;
      return a.x - b.x;
    });
    result.push(...levelItems.map(i => i.id));
    queue = nextQueue;
  }

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
  const doc = activeDocument;
  const el = doc.body.createDiv({ cls: 'replay-bar' });

  const onBtn = (b: HTMLElement, fn: () => void) => {
    b.addEventListener('pointerdown', (e: PointerEvent) => { e.preventDefault(); e.stopPropagation(); fn(); });
  };

  // 左：播放
  const left = el.createDiv({ cls: 'replay-bar-left' });
  const mkBtn = (icon: string, title: string, fn: () => void) => {
    const b = left.createEl('button', { cls: 'replay-bar-btn' });
    b.textContent = icon;
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

  const modeB = mid.createEl('button', { cls: 'replay-bar-mode' });
  modeB.textContent = 'B 广度优先';
  onBtn(modeB, () => cb.onMode('breadth'));

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
  doc.addEventListener('pointerdown', closeDrop, true);

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
    setPaused: (paused) => { playBtn.textContent = paused ? '▶' : '⏸'; },
    setMode: (mode) => {
      modeT.toggleClass('replay-bar-mode-active', mode === 'time');
      modeB.toggleClass('replay-bar-mode-active', mode === 'breadth');
      modeD.toggleClass('replay-bar-mode-active', mode === 'depth');
    },
    destroy: () => {
      doc.removeEventListener('pointerdown', closeDrop, true);
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
    this.rebuild();
    if (this.nodeIds.length === 0) {
      new Notice('没有可回放的对话节点');
      return;
    }

    console.log(`[Canvas Branch Chat] 🎬 Replay: ${this.nodeIds.length} nodes, mode=${this.mode}`);

    this.savedBBox = nativeGetViewportBBox(this.canvas);

    this.bar = createControlBar(this.nodeIds.length, {
      onTogglePause: () => this.togglePause(),
      onPrev: () => this.prev(),
      onNext: () => this.next(),
      onExit: () => this.cancel(),
      onMode: (m) => this.changeMode(m),
      onSpeed: (i) => { this.speedIdx = i; },
    });

    this.bindKeys();

    for (const id of this.nodeIds) {
      const n = findNodeById(this.canvas, id);
      if (n) setHighlight(n, 'pending');
    }

    // 阶段 1: 全局总览
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

      if (sinceOverview >= BACKTRACK_EVERY) {
        nativeZoomToFit(this.canvas);
        await this.delay(500);
        if (this.cancelled) break;
        sinceOverview = 0;
      }

      const bbox = padBBox(nodeBBox(node), 1.3);
      nativeZoomToBbox(this.canvas, bbox);

      await this.delay(this.getSpeed().dwellMs);
      if (this.cancelled) break;

      setHighlight(node, 'played');
      sinceOverview++;
    }

    if (!this.cancelled && this.nodeIds.length > 0) {
      nativeZoomToFit(this.canvas);
    }

    this.teardown();
  }

  private guard(): boolean {
    return this.cancelled;
  }

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
    if (this.mode === 'time') {
      this.nodeIds = traverseTime(this.canvas, root);
    } else if (this.mode === 'breadth') {
      this.nodeIds = traverseBreadth(this.canvas, root);
    } else {
      this.nodeIds = traverseDepth(this.canvas, root);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.cancelled) { resolve(); return; }
        if (this.paused) { window.setTimeout(check, 100); return; }
        window.setTimeout(resolve, ms);
      };
      window.setTimeout(check, 50);
    });
  }

  private bindKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (target?.contentEditable === 'true') return;

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
        case 'b': case 'B':
          this.changeMode('breadth');
          break;
        case 't': case 'T':
          this.changeMode('time');
          break;
        case 'd': case 'D':
          this.changeMode('depth');
          break;
      }
    };
    activeDocument.addEventListener('keydown', this.keyHandler, true);
  }

  private unbindKeys(): void {
    if (this.keyHandler) {
      activeDocument.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  private teardown(): void {
    this.unbindKeys();
    clearAllStyles(this.canvas);
    this.bar?.destroy();
    this.bar = null;

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
