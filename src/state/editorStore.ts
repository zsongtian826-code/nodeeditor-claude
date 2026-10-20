import { boundsOf, clampZoom, fitViewport, nodeSize, zoomAt, type Viewport } from '../core/geometry';
import { getIndex } from '../core/graph';
import {
  addNode as opAddNode,
  connectNodes,
  createBlankGraph,
  createGroup,
  duplicateNodes,
  moveGroup,
  moveNodes,
  removeEdges,
  removeNodes,
  renameGroup,
  setNodePositions,
  ungroup,
  updateNode,
  type NodePatch,
} from '../core/graphOps';
import { autoLayout } from '../core/layout';
import { NODE_SPECS } from '../core/nodeSpec';
import type { Connection, Graph, NodeType, Point } from '../core/types';

/** Undo で戻れる最大の操作数（仕様の下限は30） */
export const HISTORY_LIMIT = 100;
/** 同じ項目への連続入力（文字入力など）を1操作にまとめる間隔 */
export const COALESCE_MS = 1000;

export interface Selection {
  nodes: string[];
  edge: string | null;
  group: string | null;
}

export const NO_SELECTION: Selection = { nodes: [], edge: null, group: null };

export interface Notice {
  id: number;
  kind: 'error' | 'info' | 'success';
  message: string;
}

export interface EditorState {
  graph: Graph;
  past: readonly Graph[];
  future: readonly Graph[];
  selection: Selection;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  notice: Notice | null;
  /** 接続ドラッグ中の出力元（ポートのハイライトに使う） */
  connecting: { source: string; sourcePort: string; hover: string | null } | null;
}

type Listener = () => void;

export interface StoreOptions {
  now?: () => number;
  historyLimit?: number;
}

export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();
  /** ドラッグ中の操作の「開始前」スナップショット。終了時に1操作として履歴へ積む */
  private txBase: Graph | null = null;
  private lastCoalesce: { key: string; time: number } | null = null;
  private noticeSeq = 0;
  private readonly now: () => number;
  private readonly limit: number;

  constructor(graph: Graph, viewport?: Viewport, options: StoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.limit = options.historyLimit ?? HISTORY_LIMIT;
    this.state = {
      graph,
      past: [],
      future: [],
      selection: NO_SELECTION,
      viewport: viewport ?? { x: 0, y: 0, zoom: 1 },
      canvasSize: { width: 0, height: 0 }, // 実際の大きさは Canvas が測って知らせる
      notice: null,
      connecting: null,
    };
  }

  // ------------------------------------------------------------
  // useSyncExternalStore 用
  // ------------------------------------------------------------
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = (): EditorState => this.state;

  private set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  get graph(): Graph {
    return this.state.graph;
  }
  get canUndo(): boolean {
    return this.state.past.length > 0;
  }
  get canRedo(): boolean {
    return this.state.future.length > 0;
  }

  // ------------------------------------------------------------
  // 履歴
  // ------------------------------------------------------------

  /** 履歴に積む編集。変化が無ければ何もしない */
  private commit(next: Graph, opts: { coalesceKey?: string; selection?: Selection } = {}): boolean {
    const { graph, past } = this.state;
    if (next === graph) return false;
    this.txBase = null;
    const t = this.now();
    const merge =
      opts.coalesceKey !== undefined &&
      this.lastCoalesce?.key === opts.coalesceKey &&
      t - this.lastCoalesce.time < COALESCE_MS &&
      past.length > 0;
    this.lastCoalesce = opts.coalesceKey !== undefined ? { key: opts.coalesceKey, time: t } : null;
    const newPast = merge ? past : [...past, graph].slice(-this.limit);
    this.set({
      graph: next,
      past: newPast,
      future: [], // 新しい編集で Redo 履歴は破棄
      selection: this.prune(opts.selection ?? this.state.selection, next),
    });
    return true;
  }

  /** 存在しなくなったIDを選択から外す */
  private prune(sel: Selection, graph: Graph): Selection {
    const { nodeById, edgeById } = getIndex(graph);
    const nodes = sel.nodes.filter((id) => nodeById.has(id));
    const edge = sel.edge && edgeById.has(sel.edge) ? sel.edge : null;
    const group = sel.group && graph.groups.some((g) => g.id === sel.group) ? sel.group : null;
    if (nodes.length === sel.nodes.length && edge === sel.edge && group === sel.group) return sel;
    return { nodes, edge, group };
  }

  undo(): void {
    if (this.txBase) this.cancelDrag();
    const { past, future, graph } = this.state;
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    this.lastCoalesce = null;
    this.set({
      graph: prev,
      past: past.slice(0, -1),
      future: [graph, ...future],
      selection: this.prune(this.state.selection, prev),
    });
  }

  redo(): void {
    if (this.txBase) this.cancelDrag();
    const { past, future, graph } = this.state;
    if (future.length === 0) return;
    const [next, ...rest] = future;
    this.lastCoalesce = null;
    this.set({
      graph: next!,
      past: [...past, graph].slice(-this.limit),
      future: rest,
      selection: this.prune(this.state.selection, next!),
    });
  }

  // ------------------------------------------------------------
  // ドラッグ（多数の位置更新を、完了時に1操作として記録する）
  // ------------------------------------------------------------

  beginDrag(): void {
    this.txBase = this.state.graph;
  }

  /** 履歴に積まず、見た目だけ更新する */
  dragTo(next: Graph): void {
    if (!this.txBase) return;
    this.set({ graph: next });
  }

  endDrag(): void {
    const base = this.txBase;
    this.txBase = null;
    if (!base) return;
    const current = this.state.graph;
    if (current === base || JSON.stringify(current.nodes) === JSON.stringify(base.nodes)) {
      // 動いていない（クリックだけ）
      if (current !== base) this.set({ graph: base });
      return;
    }
    this.lastCoalesce = null;
    this.set({ past: [...this.state.past, base].slice(-this.limit), future: [] });
  }

  cancelDrag(): void {
    const base = this.txBase;
    this.txBase = null;
    if (base) this.set({ graph: base });
  }

  get dragging(): boolean {
    return this.txBase !== null;
  }

  // ------------------------------------------------------------
  // 選択
  // ------------------------------------------------------------

  clearSelection(): void {
    if (this.state.selection !== NO_SELECTION) this.set({ selection: NO_SELECTION });
  }

  selectNodes(ids: string[], mode: 'replace' | 'toggle' | 'add' = 'replace'): void {
    const cur = this.state.selection;
    let nodes: string[];
    if (mode === 'replace') nodes = ids;
    else if (mode === 'add') nodes = [...new Set([...cur.nodes, ...ids])];
    else {
      const set = new Set(cur.nodes);
      for (const id of ids) (set.has(id) ? set.delete(id) : set.add(id));
      nodes = [...set];
    }
    this.set({ selection: { nodes, edge: null, group: null } });
  }

  selectEdge(id: string): void {
    this.set({ selection: { nodes: [], edge: id, group: null } });
  }

  selectGroup(id: string): void {
    const g = this.state.graph.groups.find((x) => x.id === id);
    if (!g) return;
    this.set({ selection: { nodes: [...g.nodeIds], edge: null, group: id } });
  }

  selectAll(): void {
    this.set({ selection: { nodes: this.state.graph.nodes.map((n) => n.id), edge: null, group: null } });
  }

  // ------------------------------------------------------------
  // 編集
  // ------------------------------------------------------------

  /** ノードを追加して選択する。位置はノード中心の座標 */
  addNode(type: NodeType, center: Point): string | null {
    const spec = NODE_SPECS[type];
    const r = opAddNode(this.state.graph, type, this.freeSpot({ x: center.x - spec.width / 2, y: center.y - spec.height / 2 }));
    if (!r.ok) {
      this.notify('error', r.message);
      return null;
    }
    this.commit(r.graph, { selection: { nodes: [r.id], edge: null, group: null } });
    return r.id;
  }

  /** 同じ位置に重なって出ないよう、少しずつずらす */
  private freeSpot(p: Point): Point {
    const taken = new Set(this.state.graph.nodes.map((n) => `${Math.round(n.x / 8)},${Math.round(n.y / 8)}`));
    let q = { x: Math.round(p.x), y: Math.round(p.y) };
    for (let i = 0; i < 40 && taken.has(`${Math.round(q.x / 8)},${Math.round(q.y / 8)}`); i++) {
      q = { x: q.x + 28, y: q.y + 28 };
    }
    return q;
  }

  deleteSelection(): void {
    const { selection, graph } = this.state;
    if (selection.edge) {
      this.commit(removeEdges(graph, [selection.edge]), { selection: NO_SELECTION });
      return;
    }
    const removable = selection.nodes.filter((id) => {
      const n = getIndex(graph).nodeById.get(id);
      return n && NODE_SPECS[n.type].removable;
    });
    if (removable.length === 0) {
      if (selection.nodes.length > 0) this.notify('error', '開始ノードは削除できません');
      return;
    }
    const next = removeNodes(graph, removable);
    this.commit(next, { selection: NO_SELECTION });
    if (removable.length < selection.nodes.length) this.notify('info', '開始ノードは削除できないため残しました');
  }

  deleteEdge(id: string): void {
    this.commit(removeEdges(this.state.graph, [id]), { selection: NO_SELECTION });
  }

  duplicateSelection(): void {
    const r = duplicateNodes(this.state.graph, this.state.selection.nodes);
    if (!r.ok) {
      this.notify('error', r.message);
      return;
    }
    if (this.state.selection.nodes.some((id) => this.state.graph.nodes.find((n) => n.id === id)?.type === 'start')) {
      this.notify('info', '開始ノードは複製できないため除きました');
    }
    this.commit(r.graph, { selection: { nodes: r.newIds, edge: null, group: null } });
  }

  /** 接続を試みる。失敗時は理由を通知し、メッセージを返す */
  connect(c: Connection): { ok: true } | { ok: false; message: string } {
    const r = connectNodes(this.state.graph, c);
    if (!r.ok) {
      this.notify('error', r.message);
      return r;
    }
    this.commit(r.graph, { selection: { nodes: [], edge: r.id, group: null } });
    return { ok: true };
  }

  updateNode(id: string, patch: NodePatch): void {
    const key = `node:${id}:${Object.keys(patch).sort().join(',')}`;
    this.commit(updateNode(this.state.graph, id, patch), { coalesceKey: key });
  }

  /** 矢印キーなどでの微調整（連続操作はまとめる） */
  nudgeSelection(dx: number, dy: number): void {
    const { selection, graph } = this.state;
    if (selection.nodes.length === 0) return;
    this.commit(moveNodes(graph, new Set(selection.nodes), dx, dy), { coalesceKey: 'nudge' });
  }

  groupSelection(title = 'グループ'): void {
    const r = createGroup(this.state.graph, this.state.selection.nodes, title);
    if (!r.ok) {
      this.notify('error', r.message);
      return;
    }
    const g = r.graph.groups.find((x) => x.id === r.id)!;
    this.commit(r.graph, { selection: { nodes: [...g.nodeIds], edge: null, group: r.id } });
  }

  renameGroup(id: string, title: string): void {
    this.commit(renameGroup(this.state.graph, id, title), { coalesceKey: `group:${id}:title` });
  }

  ungroup(id: string): void {
    const g = this.state.graph.groups.find((x) => x.id === id);
    if (!g) return;
    this.commit(ungroup(this.state.graph, id), { selection: { nodes: [...g.nodeIds], edge: null, group: null } });
  }

  /** グループを動かす（ドラッグ用: beginDrag 後に使う） */
  moveGroupLive(base: Graph, groupId: string, dx: number, dy: number): void {
    this.dragTo(moveGroup(base, groupId, dx, dy));
  }

  autoLayout(): void {
    const g = this.state.graph;
    const next = setNodePositions(g, autoLayout(g));
    if (this.commit(next)) this.fitView();
  }

  // ------------------------------------------------------------
  // プロジェクト全体の置き換え（履歴は新しく始める）
  // ------------------------------------------------------------
  replaceGraph(graph: Graph, opts: { fit?: boolean } = {}): void {
    this.txBase = null;
    this.lastCoalesce = null;
    this.set({ graph, past: [], future: [], selection: NO_SELECTION, connecting: null });
    if (opts.fit !== false) this.fitView();
  }

  newProject(): void {
    this.replaceGraph(createBlankGraph());
  }

  // ------------------------------------------------------------
  // ビューポート
  // ------------------------------------------------------------
  setViewport(viewport: Viewport): void {
    const v = { ...viewport, zoom: clampZoom(viewport.zoom) };
    const cur = this.state.viewport;
    if (v.x === cur.x && v.y === cur.y && v.zoom === cur.zoom) return;
    this.set({ viewport: v });
  }

  setCanvasSize(size: { width: number; height: number }): void {
    const cur = this.state.canvasSize;
    if (size.width === cur.width && size.height === cur.height) return;
    this.set({ canvasSize: size });
  }

  zoomBy(factor: number): void {
    const { viewport, canvasSize } = this.state;
    this.setViewport(zoomAt(viewport, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, viewport.zoom * factor));
  }

  setZoom(zoom: number): void {
    const { viewport, canvasSize } = this.state;
    this.setViewport(zoomAt(viewport, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, zoom));
  }

  fitView(): void {
    const { graph, canvasSize } = this.state;
    const bounds = boundsOf(graph.nodes);
    this.set({ viewport: fitViewport(bounds, canvasSize) });
  }

  /** 指定ノードが画面中央に来るようにする（検証パネルからのジャンプ用） */
  focusNode(id: string): void {
    const n = getIndex(this.state.graph).nodeById.get(id);
    if (!n) return;
    const { viewport, canvasSize } = this.state;
    const { width, height } = nodeSize(n);
    this.set({
      selection: { nodes: [id], edge: null, group: null },
      viewport: {
        zoom: viewport.zoom,
        x: canvasSize.width / 2 - (n.x + width / 2) * viewport.zoom,
        y: canvasSize.height / 2 - (n.y + height / 2) * viewport.zoom,
      },
    });
  }

  /** 画面中央のワールド座標 */
  viewCenter(): Point {
    const { viewport, canvasSize } = this.state;
    return {
      x: (canvasSize.width / 2 - viewport.x) / viewport.zoom,
      y: (canvasSize.height / 2 - viewport.y) / viewport.zoom,
    };
  }

  // ------------------------------------------------------------
  // 通知・接続ドラッグ状態
  // ------------------------------------------------------------
  notify(kind: Notice['kind'], message: string): void {
    this.set({ notice: { id: ++this.noticeSeq, kind, message } });
  }

  dismissNotice(): void {
    if (this.state.notice) this.set({ notice: null });
  }

  setConnecting(c: EditorState['connecting']): void {
    this.set({ connecting: c });
  }
}
