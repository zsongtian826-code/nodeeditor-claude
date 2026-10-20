import { describe, expect, it } from 'vitest';
import { edge, linearGraph, node } from '../test/builders';
import { createSampleGraph } from './sample';
import { validateWorkflow } from './validate';
import type { Graph } from './types';

describe('グラフ検証', () => {
  it('完全なサンプルでは問題なし', () => {
    expect(validateWorkflow(createSampleGraph())).toEqual([]);
    expect(validateWorkflow(linearGraph())).toEqual([]);
  });

  it('到達不能ノードを検出する', () => {
    const g: Graph = { ...linearGraph(), nodes: [...linearGraph().nodes, node('action-9', 'action', 0, 300, '孤立')] };
    const issues = validateWorkflow(g);
    expect(issues.filter((i) => i.code === 'unreachable').map((i) => i.nodeId)).toEqual(['action-9']);
    // 孤立ノードの出力も未接続
    expect(issues.some((i) => i.code === 'dangling-output' && i.nodeId === 'action-9')).toBe(true);
  });

  it('接続先のない出力ポートを検出する', () => {
    const g = linearGraph();
    const issues = validateWorkflow({ ...g, edges: g.edges.filter((e) => e.id !== 'edge-2') });
    expect(issues.some((i) => i.code === 'dangling-output' && i.nodeId === 'action-1')).toBe(true);
  });

  it('到達可能な End が無い場合を検出する', () => {
    const g: Graph = { nodes: [node('start-1', 'start'), node('action-1', 'action')], edges: [edge('e', 'start-1', 'action-1')], groups: [] };
    expect(validateWorkflow(g).map((i) => i.code)).toContain('no-end');
  });

  it('End があっても Start から繋がっていなければ no-end', () => {
    const g: Graph = { nodes: [node('start-1', 'start'), node('end-1', 'end')], edges: [], groups: [] };
    expect(validateWorkflow(g).map((i) => i.code)).toEqual(expect.arrayContaining(['no-end', 'unreachable', 'dangling-output']));
  });

  it('Condition の未接続分岐をYes/No別に検出する', () => {
    const g: Graph = {
      nodes: [node('start-1', 'start'), node('condition-1', 'condition'), node('end-1', 'end')],
      edges: [edge('1', 'start-1', 'condition-1'), edge('2', 'condition-1', 'end-1', 'yes')],
      groups: [],
    };
    const issues = validateWorkflow(g);
    expect(issues.filter((i) => i.code === 'condition-branch')).toEqual([
      expect.objectContaining({ nodeId: 'condition-1', port: 'no' }),
    ]);
  });

  it('メモは検証対象外', () => {
    const g = { ...linearGraph(), nodes: [...linearGraph().nodes, node('note-1', 'note')] };
    expect(validateWorkflow(g)).toEqual([]);
  });
});
