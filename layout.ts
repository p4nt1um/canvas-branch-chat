/**
 * layout.ts — P1 #12: 一键重排画布对话树
 *
 * 对当前 Canvas 的整棵对话树做从左到右的紧凑树布局
 * （tidy tree / Reingold–Tilford 变体，适配可变节点尺寸）：
 * - 树结构：复用 context.ts 的边遍历逻辑（根节点 = 无入边的对话节点）
 * - 深度 → X 轴（父节点右边缘到子节点左边缘层间距 LAYER_GAP）
 * - 兄弟节点 → Y 轴均匀分布（垂直间距 SIBLING_GAP，子树高度参与打包计算）
 * - 根节点保持原位置不动，其余节点重排
 * - 只改节点 x/y，不改 width/height
 */

import { App } from 'obsidian';
import { CanvasRuntimeNode, CanvasRuntimeView, ChatNodeData } from './types';
import { findNodeById } from './context';

/** 深度层间距：父节点右边缘到子节点左边缘的水平距离（px） */
const LAYER_GAP = 80;

/** 兄弟节点垂直间距（px） */
const SIBLING_GAP = 40;

/** 布局树节点 */
interface LayoutTreeNode {
  id: string;
  node: CanvasRuntimeNode;
  children: LayoutTreeNode[];
  /** 子树总高度（含兄弟间距，用于垂直打包） */
  subtreeHeight: number;
}

/**
 * 获取当前活跃的 Canvas 视图（内部 canvas 实例）
 *
 * Canvas 视图类型未在公开 API 导出，通过 getViewType() 判断，
 * canvas 实例挂在 view.canvas 上。拿不到返回 null，由调用方提示。
 */
export function getActiveCanvasView(app: App): CanvasRuntimeView | null {
  try {
    const leaf = app.workspace.getMostRecentLeaf();
    const view = leaf?.view as unknown as {
      getViewType(): string;
      canvas?: CanvasRuntimeView;
    } | undefined;
    if (!view || view.getViewType() !== 'canvas' || !view.canvas) return null;
    return view.canvas;
  } catch {
    return null;
  }
}

/**
 * 执行整理布局，返回实际移动的节点数（0 = 没有可布局的对话节点）
 *
 * 支持多棵树（多个根节点）：每棵树独立布局，各自根节点原位不动。
 */
export function tidyTreeLayout(canvas: CanvasRuntimeView): number {
  const data = canvas.getData();

  // 1. 收集对话节点（分支对话创建时写入了 chatRole 的节点）
  const chatData = data.nodes.filter((n: ChatNodeData) => !!n.chatRole);
  if (chatData.length === 0) return 0;
  const chatIds = new Set(chatData.map(n => n.id));

  // 2. 运行时节点表（找不到运行时对象的节点无法重排，跳过）
  const nodeById = new Map<string, CanvasRuntimeNode>();
  for (const id of chatIds) {
    const node = findNodeById(canvas, id);
    if (node) nodeById.set(id, node);
  }

  // 3. 建边：只看对话节点之间的连线（与其他节点连线不参与布局）
  const childrenMap = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const edge of data.edges) {
    if (!chatIds.has(edge.fromNode) || !chatIds.has(edge.toNode)) continue;
    if (edge.fromNode === edge.toNode) continue; // 自环防御
    const list = childrenMap.get(edge.fromNode) || [];
    if (!list.includes(edge.toNode)) list.push(edge.toNode);
    childrenMap.set(edge.fromNode, list);
    hasParent.add(edge.toNode);
  }

  // 4. 兄弟按原 y 坐标排序，保持上下顺序稳定
  for (const list of childrenMap.values()) {
    list.sort((a, b) => (nodeById.get(a)?.y ?? 0) - (nodeById.get(b)?.y ?? 0));
  }

  // 5. 每棵树独立布局（根 = 无入边的对话节点；visited 防环）
  const visited = new Set<string>();
  let movedCount = 0;

  const apply = (node: CanvasRuntimeNode, x: number, y: number): void => {
    if (setNodePosition(node, x, y)) movedCount++;
  };

  for (const id of chatIds) {
    if (hasParent.has(id) || visited.has(id)) continue;
    const root = buildTree(id, childrenMap, nodeById, visited);
    if (!root) continue;

    measureSubtree(root);

    // 根节点保持原位：以根为中心展开，子树带顶边由根的反推
    const rootH = root.node.height || 200;
    const bandTop = root.node.y + rootH / 2 - root.subtreeHeight / 2;
    placeChildren(root, bandTop, root.subtreeHeight, apply);
  }

  // 6. 持久化 + 缩放至全部内容（zoom-to-fit 拿不到就跳过）
  canvas.requestSave();
  try {
    canvas.zoomToFit?.();
  } catch {
    // 忽略：个别版本无此内部方法
  }

  return movedCount;
}

/** 递归建树（visited 同时防环、防多父重复） */
function buildTree(
  id: string,
  childrenMap: Map<string, string[]>,
  nodeById: Map<string, CanvasRuntimeNode>,
  visited: Set<string>,
): LayoutTreeNode | null {
  const node = nodeById.get(id);
  if (!node || visited.has(id)) return null;
  visited.add(id);

  const children = (childrenMap.get(id) || [])
    .map(cid => buildTree(cid, childrenMap, nodeById, visited))
    .filter((c): c is LayoutTreeNode => c !== null);

  return { id, node, children, subtreeHeight: 0 };
}

/** 自底向上计算子树总高度：max(自身高度, 子节点打包高度) */
function measureSubtree(n: LayoutTreeNode): void {
  const ownH = n.node.height || 200;
  if (n.children.length === 0) {
    n.subtreeHeight = ownH;
    return;
  }
  let total = 0;
  for (const c of n.children) {
    measureSubtree(c);
    total += c.subtreeHeight;
  }
  total += SIBLING_GAP * (n.children.length - 1);
  n.subtreeHeight = Math.max(ownH, total);
}

/**
 * 在 [bandTop, bandTop + bandHeight] 带内布置 parent 的子节点：
 * - 子节点块在带内垂直居中
 * - 每个子节点在自己子树带内垂直居中（紧凑打包，节点自身高度参与计算）
 * - x = 父节点右边缘 + LAYER_GAP
 */
function placeChildren(
  parent: LayoutTreeNode,
  bandTop: number,
  bandHeight: number,
  apply: (node: CanvasRuntimeNode, x: number, y: number) => void,
): void {
  if (parent.children.length === 0) return;

  const parentRight = parent.node.x + (parent.node.width || 400);
  const childX = parentRight + LAYER_GAP;

  const totalH = parent.children.reduce((s, c) => s + c.subtreeHeight, 0)
    + SIBLING_GAP * (parent.children.length - 1);
  let cursor = bandTop + (bandHeight - totalH) / 2;

  for (const child of parent.children) {
    const childH = child.node.height || 200;
    const y = cursor + (child.subtreeHeight - childH) / 2;
    apply(child.node, childX, y);
    placeChildren(child, cursor, child.subtreeHeight, apply);
    cursor += child.subtreeHeight + SIBLING_GAP;
  }
}

/** 回写节点位置（只改 x/y），位置无变化时跳过；返回是否实际修改 */
function setNodePosition(node: CanvasRuntimeNode, x: number, y: number): boolean {
  try {
    const d = node.getData();
    const oldX = typeof d.x === 'number' ? d.x : node.x;
    const oldY = typeof d.y === 'number' ? d.y : node.y;
    if (Math.abs(oldX - x) < 0.5 && Math.abs(oldY - y) < 0.5) return false;
    node.setData({ ...d, x, y });
    return true;
  } catch {
    return false; // 单个节点失败不中断整体布局
  }
}
