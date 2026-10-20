import { describe, expect, it } from 'vitest';
import { moveNodes } from '../core/graphOps';
import { createSampleGraph } from '../core/sample';
import { linearGraph } from '../test/builders';
import { COALESCE_MS, EditorStore, HISTORY_LIMIT } from './editorStore';

const make = (g = linearGraph()) => {
  let t = 0;
  const store = new EditorStore(g, undefined, { now: () => t });
  return { store, tick: (ms: number) => (t += ms) };
};

describe('ノードの追加・削除・複製', () => {
  it('追加→選択され、削除で接続も消え、Undo で元に戻る', () => {
    const { store } = make();
    const id = store.addNode('action', { x: 500, y: 400 })!;
    expect(store.getState().selection.nodes).toEqual([id]);
    expect(store.graph.nodes).toHaveLength(5);

    store.selectNodes(['action-1']);
    store.deleteSelection();
    expect(store.graph.nodes.find((n) => n.id === 'action-1')).toBeUndefined();
    expect(store.graph.edges.map((e) => e.id)).toEqual(['edge-3']);

    store.undo();
    expect(store.graph.nodes.some((n) => n.id === 'action-1')).toBe(true);
    expect(store.graph.edges).toHaveLength(3);
  });

  it('開始ノードは削除・複製できず、通知が出る', () => {
    const { store } = make();
    store.selectNodes(['start-1']);
    store.deleteSelection();
    expect(store.graph.nodes.some((n) => n.type === 'start')).toBe(true);
    expect(store.getState().notice?.kind).toBe('error');
    store.duplicateSelection();
    expect(store.graph.nodes).toHaveLength(4);
    expect(store.canUndo).toBe(false);
  });

  it('2個目の開始ノードは追加できない', () => {
    const { store } = make();
    expect(store.addNode('start', { x: 0, y: 0 })).toBeNull();
    expect(store.graph.nodes).toHaveLength(4);
  });

  it('複製した新しいノードが選択される', () => {
    const { store } = make();
    store.selectNodes(['action-1', 'action-2']);
    store.duplicateSelection();
    expect(store.getState().selection.nodes).toEqual(['action-3', 'action-4']);
  });
});

describe('ドラッグは完了時に1操作として記録される', () => {
  it('多数の位置更新→1回のUndoで元に戻る', () => {
    const { store } = make();
    const base = store.graph;
    store.beginDrag();
    for (let i = 1; i <= 50; i++) store.dragTo(moveNodes(base, new Set(['action-1']), i, i));
    expect(store.canUndo).toBe(false); // ドラッグ中は履歴に積まない
    store.endDrag();
    expect(store.getState().past).toHaveLength(1);
    expect(store.graph.nodes.find((n) => n.id === 'action-1')).toMatchObject({ x: 350, y: 50 });
    store.undo();
    expect(store.graph.nodes.find((n) => n.id === 'action-1')).toMatchObject({ x: 300, y: 0 });
    store.redo();
    expect(store.graph.nodes.find((n) => n.id === 'action-1')).toMatchObject({ x: 350, y: 50 });
  });

  it('動かさなかったドラッグ（クリック）は履歴を汚さない', () => {
    const { store } = make();
    store.beginDrag();
    store.dragTo(moveNodes(store.graph, new Set(['action-1']), 0, 0));
    store.endDrag();
    expect(store.canUndo).toBe(false);
  });

  it('元の位置に戻したドラッグも履歴を汚さない', () => {
    const { store } = make();
    const base = store.graph;
    store.beginDrag();
    store.dragTo(moveNodes(base, new Set(['action-1']), 30, 0));
    store.dragTo(moveNodes(base, new Set(['action-1']), 0, 0));
    store.endDrag();
    expect(store.canUndo).toBe(false);
  });

  it('cancelDrag で元に戻る', () => {
    const { store } = make();
    const base = store.graph;
    store.beginDrag();
    store.dragTo(moveNodes(base, new Set(['action-1']), 30, 0));
    store.cancelDrag();
    expect(store.graph).toBe(base);
  });

  it('複数選択の一括移動も1操作', () => {
    const { store } = make();
    const base = store.graph;
    store.beginDrag();
    store.dragTo(moveNodes(base, new Set(['action-1', 'action-2', 'end-1']), 20, 10));
    store.endDrag();
    expect(store.getState().past).toHaveLength(1);
    store.undo();
    expect(store.graph.nodes.map((n) => [n.x, n.y])).toEqual(base.nodes.map((n) => [n.x, n.y]));
  });
});

describe('Undo / Redo', () => {
  it('Undo → Redo で往復できる', () => {
    const { store } = make();
    store.addNode('note', { x: 0, y: 300 });
    const after = store.graph;
    store.undo();
    expect(store.graph.nodes).toHaveLength(4);
    store.redo();
    expect(store.graph).toBe(after);
  });

  it('Undo 後に新しい編集をすると Redo 履歴は破棄される', () => {
    const { store } = make();
    store.addNode('note', { x: 0, y: 300 });
    store.addNode('note', { x: 0, y: 500 });
    store.undo();
    expect(store.canRedo).toBe(true);
    store.addNode('action', { x: 0, y: 700 });
    expect(store.canRedo).toBe(false);
    store.redo(); // 何も起きない
    expect(store.graph.nodes).toHaveLength(6);
  });

  it(`少なくとも30操作ぶん（上限${HISTORY_LIMIT}）戻れる`, () => {
    const { store } = make();
    for (let i = 0; i < 35; i++) store.addNode('note', { x: i * 10, y: 300 });
    expect(store.graph.nodes).toHaveLength(39);
    for (let i = 0; i < 35; i++) store.undo();
    expect(store.graph.nodes).toHaveLength(4);
  });

  it('履歴は上限を超えない', () => {
    const t = 0;
    const store = new EditorStore(linearGraph(), undefined, { now: () => t, historyLimit: 30 });
    for (let i = 0; i < 50; i++) store.addNode('note', { x: i, y: 300 });
    expect(store.getState().past).toHaveLength(30);
  });

  it('接続の追加・削除・グループの作成・解除・グループ移動を Undo できる', () => {
    const { store } = make({ ...linearGraph(), edges: [] });
    store.connect({ source: 'start-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' });
    expect(store.graph.edges).toHaveLength(1);
    store.undo();
    expect(store.graph.edges).toHaveLength(0);
    store.redo();
    store.deleteEdge('edge-1');
    expect(store.graph.edges).toHaveLength(0);
    store.undo();
    expect(store.graph.edges).toHaveLength(1);

    store.selectNodes(['action-1', 'action-2']);
    store.groupSelection('準備');
    expect(store.graph.groups).toHaveLength(1);
    store.undo();
    expect(store.graph.groups).toHaveLength(0);
    store.redo();
    const gid = store.graph.groups[0]!.id;
    store.ungroup(gid);
    expect(store.graph.groups).toHaveLength(0);
    store.undo();
    expect(store.graph.groups).toHaveLength(1);
  });

  it('連続する文字入力は1操作にまとめられ、時間が空くと別操作になる', () => {
    const { store, tick } = make();
    for (const s of ['A', 'AB', 'ABC']) {
      store.updateNode('action-1', { title: s });
      tick(100);
    }
    expect(store.getState().past).toHaveLength(1);
    tick(COALESCE_MS + 1);
    store.updateNode('action-1', { title: 'ABCD' });
    expect(store.getState().past).toHaveLength(2);
    store.undo();
    expect(store.graph.nodes[1]!.title).toBe('ABC');
    store.undo();
    expect(store.graph.nodes[1]!.title).toBe('action-1');
  });

  it('別のノード・別の項目の編集はまとめない', () => {
    const { store } = make();
    store.updateNode('action-1', { title: 'x' });
    store.updateNode('action-2', { title: 'y' });
    store.updateNode('action-2', { content: 'z' });
    expect(store.getState().past).toHaveLength(3);
  });

  it('Undo でグループ・選択から消えたIDが取り除かれる', () => {
    const { store } = make();
    const id = store.addNode('note', { x: 0, y: 300 })!;
    expect(store.getState().selection.nodes).toEqual([id]);
    store.undo();
    expect(store.getState().selection.nodes).toEqual([]);
  });
});

describe('接続', () => {
  it('不正な接続は拒否され、グラフも履歴も変わらない', () => {
    const { store } = make();
    const g = store.graph;
    const r = store.connect({ source: 'end-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' });
    expect(r.ok).toBe(false);
    expect(store.graph).toBe(g);
    expect(store.canUndo).toBe(false);
    expect(store.getState().notice?.kind).toBe('error');
  });

  it('循環する接続は拒否される', () => {
    const { store } = make({ ...linearGraph(), edges: linearGraph().edges.filter((e) => e.id !== 'edge-3') });
    const r = store.connect({ source: 'action-2', sourcePort: 'out', target: 'action-1', targetPort: 'in' });
    expect(r.ok).toBe(false);
  });
});

describe('グループ操作', () => {
  it('所属ノードが1つになるとグループが自動解散し、Undo で戻る', () => {
    const { store } = make();
    store.selectNodes(['action-1', 'action-2']);
    store.groupSelection();
    store.selectNodes(['action-1']);
    store.deleteSelection();
    expect(store.graph.groups).toHaveLength(0);
    store.undo();
    expect(store.graph.groups).toHaveLength(1);
  });

  it('すでにグループにいるノードを含む選択ではグループ化できない', () => {
    const { store } = make();
    store.selectNodes(['action-1', 'action-2']);
    store.groupSelection();
    store.selectNodes(['action-2', 'end-1']);
    store.groupSelection();
    expect(store.graph.groups).toHaveLength(1);
    expect(store.getState().notice?.kind).toBe('error');
  });
});

describe('プロジェクト置き換え・ビュー', () => {
  it('replaceGraph は履歴をリセットする', () => {
    const { store } = make();
    store.addNode('note', { x: 0, y: 300 });
    store.replaceGraph(createSampleGraph());
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    expect(store.graph.nodes).toHaveLength(8);
  });

  it('ズームは 40%〜200% に制限される', () => {
    const { store } = make();
    store.setZoom(5);
    expect(store.getState().viewport.zoom).toBe(2);
    store.setZoom(0.01);
    expect(store.getState().viewport.zoom).toBe(0.4);
    for (let i = 0; i < 30; i++) store.zoomBy(1.2);
    expect(store.getState().viewport.zoom).toBe(2);
  });

  it('Fit View は全ノードを画面内に収める', () => {
    const { store } = make();
    store.setCanvasSize({ width: 800, height: 600 });
    store.fitView();
    const v = store.getState().viewport;
    for (const n of store.graph.nodes) {
      const sx = n.x * v.zoom + v.x;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(800);
    }
  });

  it('自動整列は1操作として Undo できる', () => {
    const { store } = make(createSampleGraph());
    const before = store.graph;
    store.autoLayout();
    expect(store.graph).not.toBe(before);
    store.undo();
    expect(store.graph).toBe(before);
  });
});
