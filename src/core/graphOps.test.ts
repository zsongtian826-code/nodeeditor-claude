import { describe, expect, it } from 'vitest';
import { edge, linearGraph, node } from '../test/builders';
import {
  addNode,
  connectNodes,
  createBlankGraph,
  createGroup,
  duplicateNodes,
  moveGroup,
  moveNodes,
  removeEdges,
  removeNodes,
  renameGroup,
  ungroup,
  updateNode,
} from './graphOps';
import type { Graph } from './types';

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe('ノードの追加と削除', () => {
  it('追加すると一意のIDが振られる', () => {
    let g = createBlankGraph();
    g = ok(addNode(g, 'action', { x: 10, y: 20 })).graph;
    const r = ok(addNode(g, 'action', { x: 30, y: 40 }));
    expect(r.id).toBe('action-2');
    expect(r.graph.nodes).toHaveLength(3);
  });

  it('開始ノードは2個目を追加できない', () => {
    expect(addNode(createBlankGraph(), 'start', { x: 0, y: 0 }).ok).toBe(false);
  });

  it('削除すると関連する接続も消える', () => {
    const g = removeNodes(linearGraph(), ['action-1']);
    expect(g.nodes.map((n) => n.id)).toEqual(['start-1', 'action-2', 'end-1']);
    expect(g.edges.map((e) => e.id)).toEqual(['edge-3']);
  });

  it('開始ノードは削除できない', () => {
    const g = linearGraph();
    expect(removeNodes(g, ['start-1'])).toBe(g);
    expect(removeNodes(g, ['start-1', 'end-1']).nodes.map((n) => n.id)).toContain('start-1');
  });

  it('削除後に空きIDが再利用されてもエッジIDが衝突しない', () => {
    let g = linearGraph();
    g = removeEdges(g, ['edge-2']);
    const r = ok(connectNodes(g, { source: 'action-1', sourcePort: 'out', target: 'action-2', targetPort: 'in' }));
    expect(new Set(r.graph.edges.map((e) => e.id)).size).toBe(r.graph.edges.length);
  });
});

describe('移動', () => {
  it('指定したノードだけが動き、他は同一参照のまま', () => {
    const g = linearGraph();
    const moved = moveNodes(g, new Set(['action-1', 'action-2']), 10, -5);
    expect(moved.nodes[1]).toMatchObject({ x: 310, y: -5 });
    expect(moved.nodes[2]).toMatchObject({ x: 610, y: -5 });
    expect(moved.nodes[0]).toBe(g.nodes[0]);
    expect(moved.edges).toBe(g.edges);
  });
});

describe('複製', () => {
  it('複製すると新しいIDでずれた位置に作られ、内部の接続も複製される', () => {
    const r = ok(duplicateNodes(linearGraph(), ['action-1', 'action-2']));
    expect(r.newIds).toEqual(['action-3', 'action-4']);
    const a3 = r.graph.nodes.find((n) => n.id === 'action-3')!;
    expect(a3).toMatchObject({ x: 340, y: 40, title: 'action-1' });
    expect(r.graph.edges.some((e) => e.source === 'action-3' && e.target === 'action-4')).toBe(true);
    // 選択外との接続は複製されない
    expect(r.graph.edges).toHaveLength(4);
  });

  it('開始ノードは複製できない', () => {
    expect(duplicateNodes(linearGraph(), ['start-1']).ok).toBe(false);
    const r = ok(duplicateNodes(linearGraph(), ['start-1', 'end-1']));
    expect(r.newIds).toEqual(['end-2']);
  });
});

describe('ノード内容の編集', () => {
  it('title / content を更新できる', () => {
    const g = updateNode(linearGraph(), 'action-1', { title: 'X', content: 'Y' });
    expect(g.nodes[1]).toMatchObject({ title: 'X', content: 'Y' });
  });
  it('変更が無ければ同じ参照を返す', () => {
    const g = linearGraph();
    expect(updateNode(g, 'action-1', { title: 'action-1' })).toBe(g);
  });
});

describe('グループ', () => {
  it('2個未満では作れない', () => {
    expect(createGroup(linearGraph(), ['action-1']).ok).toBe(false);
    expect(createGroup(linearGraph(), ['action-1', 'action-1']).ok).toBe(false);
  });

  it('作成・名前変更・解除ができ、解除してもノードと接続は残る', () => {
    let g = ok(createGroup(linearGraph(), ['action-1', 'action-2'], '準備')).graph;
    expect(g.groups).toEqual([{ id: 'group-1', title: '準備', nodeIds: ['action-1', 'action-2'] }]);
    g = renameGroup(g, 'group-1', '開発');
    expect(g.groups[0]!.title).toBe('開発');
    const edgesBefore = g.edges;
    g = ungroup(g, 'group-1');
    expect(g.groups).toEqual([]);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toBe(edgesBefore);
  });

  it('1つのノードは1つのグループにしか入れない', () => {
    const g = ok(createGroup(linearGraph(), ['action-1', 'action-2'])).graph;
    expect(createGroup(g, ['action-2', 'end-1']).ok).toBe(false);
  });

  it('グループ移動で所属ノードがまとめて動き、接続は維持される', () => {
    const g = ok(createGroup(linearGraph(), ['action-1', 'action-2'])).graph;
    const moved = moveGroup(g, 'group-1', 50, 60);
    expect(moved.nodes.find((n) => n.id === 'action-1')).toMatchObject({ x: 350, y: 60 });
    expect(moved.nodes.find((n) => n.id === 'action-2')).toMatchObject({ x: 650, y: 60 });
    expect(moved.nodes.find((n) => n.id === 'end-1')).toMatchObject({ x: 900, y: 0 });
    expect(moved.edges).toBe(g.edges);
  });

  it('所属ノードの削除でグループが2個未満になると自動で解散する', () => {
    const g = ok(createGroup(linearGraph(), ['action-1', 'action-2'])).graph;
    expect(removeNodes(g, ['action-1']).groups).toEqual([]);
    const g3 = ok(createGroup(linearGraph(), ['action-1', 'action-2', 'end-1'])).graph;
    expect(removeNodes(g3, ['end-1']).groups[0]!.nodeIds).toEqual(['action-1', 'action-2']);
  });

  it('グループ化しても接続は変わらない', () => {
    const before = linearGraph();
    const after = ok(createGroup(before, ['action-1', 'action-2'])).graph;
    expect(after.edges).toBe(before.edges);
  });
});

describe('connectNodes', () => {
  it('検証を通ると接続が増える', () => {
    const g: Graph = { nodes: [node('start-1', 'start'), node('a', 'action')], edges: [], groups: [] };
    const r = ok(connectNodes(g, { source: 'start-1', sourcePort: 'out', target: 'a', targetPort: 'in' }));
    expect(r.graph.edges).toEqual([edge('edge-1', 'start-1', 'a')]);
  });
  it('検証に失敗するとグラフを変えずにメッセージを返す', () => {
    const g = linearGraph();
    const r = connectNodes(g, { source: 'end-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' });
    expect(r.ok).toBe(false);
  });
});
