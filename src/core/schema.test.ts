import { describe, expect, it } from 'vitest';
import { largeGraph, linearGraph } from '../test/builders';
import { createSampleGraph } from './sample';
import { parseGraphJson, serializeGraph, toDocument, validateDocument } from './schema';

const doc = () => JSON.parse(serializeGraph(createSampleGraph()));
const expectError = (raw: unknown, fragment: string) => {
  const r = validateDocument(raw);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors.join('\n')).toContain(fragment);
};

describe('JSON の書き出しと読み込み', () => {
  it('書き出した JSON は同じグラフとして読み戻せる（往復）', () => {
    for (const g of [createSampleGraph(), linearGraph(), largeGraph()]) {
      const r = parseGraphJson(serializeGraph(g));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.graph).toEqual(g);
    }
  });

  it('共通スキーマの形で出力される', () => {
    const d = toDocument(createSampleGraph());
    expect(Object.keys(d)).toEqual(['schemaVersion', 'nodes', 'edges', 'groups']);
    expect(d.schemaVersion).toBe(1);
    expect(Object.keys(d.nodes[0]!)).toEqual(['id', 'type', 'x', 'y', 'title', 'content']);
    expect(Object.keys(d.edges[0]!)).toEqual(['id', 'source', 'sourcePort', 'target', 'targetPort']);
  });

  it('仕様書のサンプル形式（groups が空）を読める', () => {
    const r = validateDocument({
      schemaVersion: 1,
      nodes: [
        { id: 'start-1', type: 'start', x: 200, y: 150, title: '開始', content: '' },
        { id: 'action-1', type: 'action', x: 450, y: 150, title: '要件確認', content: '要件を確認する' },
      ],
      edges: [{ id: 'edge-1', source: 'start-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' }],
      groups: [],
    });
    expect(r.ok).toBe(true);
  });
});

describe('不正なデータの拒否', () => {
  it('JSON として壊れている', () => {
    const r = parseGraphJson('{ not json');
    expect(r.ok).toBe(false);
  });
  it('配列やnullなどオブジェクトでない', () => {
    expect(validateDocument(null).ok).toBe(false);
    expect(validateDocument([]).ok).toBe(false);
    expect(validateDocument('x').ok).toBe(false);
  });
  it('schemaVersion が違う / 無い', () => {
    expectError({ ...doc(), schemaVersion: 2 }, 'schemaVersion');
    const d = doc();
    delete d.schemaVersion;
    expectError(d, 'schemaVersion');
  });
  it('ID の重複', () => {
    const d = doc();
    d.nodes[1].id = d.nodes[0].id;
    expectError(d, '重複');
  });
  it('空・空白や改行を含むID', () => {
    const d = doc();
    d.nodes[1].id = 'bad\nid';
    expectError(d, 'id');
    const d2 = doc();
    d2.nodes[1].id = '';
    expectError(d2, 'id');
  });
  it('不正なノード種別', () => {
    const d = doc();
    d.nodes[1].type = 'banana';
    expectError(d, '不正なノード種別');
  });
  it('座標が数値でない', () => {
    const d = doc();
    d.nodes[1].x = 'abc';
    expectError(d, 'x, y');
  });
  it('存在しない接続先', () => {
    const d = doc();
    d.edges[0].target = 'ghost-9';
    expectError(d, '存在しません');
  });
  it('無効なポート', () => {
    const d = doc();
    d.edges[0].sourcePort = 'yes';
    expectError(d, 'ポート');
    const d2 = doc();
    d2.edges[0].targetPort = 'out';
    expectError(d2, 'ポート');
  });
  it('開始ノードへの接続・終了ノードからの接続・メモとの接続', () => {
    const d = doc();
    d.edges.push({ id: 'edge-99', source: 'action-3', sourcePort: 'out', target: 'start-1', targetPort: 'in' });
    expectError(d, '入力ポート');
    const d2 = doc();
    d2.edges.push({ id: 'edge-99', source: 'end-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' });
    expectError(d2, '出力ポート');
    const d3 = doc();
    d3.edges.push({ id: 'edge-99', source: 'action-3', sourcePort: 'out', target: 'note-1', targetPort: 'in' });
    expectError(d3, '入力ポート');
  });
  it('自己ループ', () => {
    const d = doc();
    d.edges.push({ id: 'edge-99', source: 'action-3', sourcePort: 'out', target: 'action-3', targetPort: 'in' });
    expectError(d, '自分自身');
  });
  it('接続の重複と、出力ポートからの複数接続', () => {
    const d = doc();
    d.edges.push({ ...d.edges[0], id: 'edge-99' });
    expectError(d, '重複');
    const d2 = doc();
    d2.edges.push({ id: 'edge-99', source: 'start-1', sourcePort: 'out', target: 'end-1', targetPort: 'in' });
    expectError(d2, '2本以上');
  });
  it('循環接続', () => {
    const d = doc();
    d.edges = d.edges.filter((e: { id: string }) => e.id !== 'edge-6');
    d.edges.push({ id: 'edge-7', source: 'action-3', sourcePort: 'out', target: 'condition-1', targetPort: 'in' });
    expectError(d, '循環');
  });
  it('開始ノードが無い / 2個ある', () => {
    const d = doc();
    d.nodes = d.nodes.filter((n: { type: string }) => n.type !== 'start');
    d.edges = [];
    expectError(d, '開始');
    const d2 = doc();
    d2.nodes.push({ id: 'start-2', type: 'start', x: 0, y: 0, title: '', content: '' });
    expectError(d2, '開始');
  });
  it('グループ: 存在しないノード・1個だけ・重複所属', () => {
    const d = doc();
    d.groups = [{ id: 'g', title: 't', nodeIds: ['action-1', 'ghost'] }];
    expectError(d, '存在しないノード');
    d.groups = [{ id: 'g', title: 't', nodeIds: ['action-1'] }];
    expectError(d, '2個以上');
    d.groups = [
      { id: 'g1', title: 'a', nodeIds: ['action-1', 'action-2'] },
      { id: 'g2', title: 'b', nodeIds: ['action-2', 'action-3'] },
    ];
    expectError(d, '所属');
    d.groups = [{ id: 'g1', title: 'a', nodeIds: ['action-1', 'action-1'] }];
    expectError(d, '重複');
  });
  it('エラーは複数まとめて報告される', () => {
    const d = doc();
    d.nodes[1].type = 'banana';
    d.edges[0].target = 'ghost';
    const r = validateDocument(d);
    expect(!r.ok && r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
