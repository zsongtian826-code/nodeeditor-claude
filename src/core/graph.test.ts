import { describe, expect, it } from 'vitest';
import { edge, linearGraph, node } from '../test/builders';
import { checkConnection, findCycleNodes, reachableFrom, wouldCreateCycle } from './graph';
import type { Connection, Graph } from './types';

const conn = (source: string, target: string, sourcePort = 'out', targetPort = 'in'): Connection => ({
  source,
  sourcePort,
  target,
  targetPort,
});

describe('checkConnection（接続の検証）', () => {
  const base: Graph = {
    nodes: [
      node('start-1', 'start'),
      node('action-1', 'action'),
      node('action-2', 'action'),
      node('condition-1', 'condition'),
      node('end-1', 'end'),
      node('end-2', 'end'),
      node('note-1', 'note'),
    ],
    edges: [],
    groups: [],
  };

  it('正常な接続を許可する', () => {
    expect(checkConnection(base, conn('start-1', 'action-1')).ok).toBe(true);
    expect(checkConnection(base, conn('action-1', 'end-1')).ok).toBe(true);
    expect(checkConnection(base, conn('condition-1', 'end-1', 'yes')).ok).toBe(true);
    expect(checkConnection(base, conn('condition-1', 'end-2', 'no')).ok).toBe(true);
  });

  it('開始ノードへの入力接続を拒否する', () => {
    const r = checkConnection(base, conn('action-1', 'start-1'));
    expect(r).toMatchObject({ ok: false, code: 'start-input' });
  });

  it('終了ノードからの出力接続を拒否する', () => {
    expect(checkConnection(base, conn('end-1', 'action-1'))).toMatchObject({ ok: false, code: 'end-output' });
  });

  it('メモノードとの接続を拒否する（どちら向きでも）', () => {
    expect(checkConnection(base, conn('note-1', 'action-1'))).toMatchObject({ ok: false, code: 'note' });
    expect(checkConnection(base, conn('action-1', 'note-1'))).toMatchObject({ ok: false, code: 'note' });
  });

  it('自分自身への接続を拒否する', () => {
    expect(checkConnection(base, conn('action-1', 'action-1'))).toMatchObject({ ok: false, code: 'self' });
  });

  it('存在しないノードへの接続を拒否する', () => {
    expect(checkConnection(base, conn('action-1', 'ghost'))).toMatchObject({ ok: false, code: 'missing-node' });
    expect(checkConnection(base, conn('ghost', 'action-1'))).toMatchObject({ ok: false, code: 'missing-node' });
  });

  it('無効なポートを拒否する', () => {
    expect(checkConnection(base, conn('action-1', 'action-2', 'yes'))).toMatchObject({ ok: false, code: 'invalid-port' });
    expect(checkConnection(base, conn('condition-1', 'action-2', 'out'))).toMatchObject({ ok: false, code: 'invalid-port' });
    expect(checkConnection(base, conn('action-1', 'action-2', 'out', 'out'))).toMatchObject({ ok: false, code: 'invalid-port' });
  });

  it('同一接続の重複を拒否する', () => {
    const g = { ...base, edges: [edge('edge-1', 'action-1', 'action-2')] };
    expect(checkConnection(g, conn('action-1', 'action-2'))).toMatchObject({ ok: false, code: 'duplicate' });
  });

  it('出力ポートから2本目の接続を拒否する（別の行き先でも）', () => {
    const g = { ...base, edges: [edge('edge-1', 'action-1', 'action-2')] };
    expect(checkConnection(g, conn('action-1', 'end-1'))).toMatchObject({ ok: false, code: 'occupied' });
  });

  it('入力ポートには複数の接続を許可する', () => {
    const g = { ...base, edges: [edge('edge-1', 'start-1', 'end-1')] };
    expect(checkConnection(g, conn('action-1', 'end-1')).ok).toBe(true);
  });

  it('Yes/No は独立したポートとして扱う', () => {
    const g = { ...base, edges: [edge('edge-1', 'condition-1', 'end-1', 'yes')] };
    expect(checkConnection(g, conn('condition-1', 'end-2', 'no')).ok).toBe(true);
    expect(checkConnection(g, conn('condition-1', 'end-2', 'yes'))).toMatchObject({ ok: false, code: 'occupied' });
  });
});

describe('循環検出', () => {
  it('直接の循環（A→B→A）を拒否する', () => {
    const g = linearGraph();
    expect(checkConnection(g, conn('action-1', 'start-1'))).toMatchObject({ ok: false });
    // action-2 → action-1 は循環
    const r = checkConnection({ ...g, edges: g.edges.filter((e) => e.id !== 'edge-3') }, conn('action-2', 'action-1'));
    expect(r).toMatchObject({ ok: false, code: 'cycle' });
  });

  it('長い経路を戻る循環も検出する', () => {
    const g: Graph = {
      nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => node(id, 'action')),
      edges: [edge('1', 'a', 'b'), edge('2', 'b', 'c'), edge('3', 'c', 'd'), edge('4', 'd', 'e')],
      groups: [],
    };
    expect(wouldCreateCycle(g, 'e', 'a')).toBe(true);
    expect(wouldCreateCycle(g, 'a', 'e')).toBe(false);
    expect(wouldCreateCycle(g, 'c', 'c')).toBe(true);
  });

  it('ダイヤモンド型の合流は循環ではない', () => {
    const g: Graph = {
      nodes: [node('c', 'condition'), node('a', 'action'), node('b', 'action'), node('m', 'action')],
      edges: [edge('1', 'c', 'a', 'yes'), edge('2', 'c', 'b', 'no'), edge('3', 'a', 'm')],
      groups: [],
    };
    expect(checkConnection(g, { source: 'b', sourcePort: 'out', target: 'm', targetPort: 'in' }).ok).toBe(true);
    expect(findCycleNodes(g)).toEqual([]);
  });

  it('findCycleNodes は既存の循環を報告する', () => {
    const g: Graph = {
      nodes: [node('a', 'action'), node('b', 'action'), node('c', 'action')],
      edges: [edge('1', 'a', 'b'), edge('2', 'b', 'c'), edge('3', 'c', 'b')],
      groups: [],
    };
    expect(findCycleNodes(g).sort()).toEqual(['b', 'c']);
  });

  it('reachableFrom は到達可能なノードだけを返す', () => {
    const g = linearGraph();
    expect([...reachableFrom(g, 'action-1')].sort()).toEqual(['action-1', 'action-2', 'end-1']);
  });
});
