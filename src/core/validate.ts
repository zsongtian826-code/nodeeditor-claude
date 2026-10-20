import { getIndex, outputKey, reachableFrom } from './graph';
import { NODE_SPECS } from './nodeSpec';
import type { Graph, GraphNode, OutputPortId } from './types';

// 編集途中のグラフに見つかる「問題」。保存は妨げない（警告として表示するだけ）。

export type IssueCode = 'unreachable' | 'dangling-output' | 'condition-branch' | 'no-end';

export interface Issue {
  code: IssueCode;
  message: string;
  nodeId?: string;
  port?: OutputPortId;
}

/** 位置→IDの順に並べる。同じグラフなら常に同じ順序になる */
export function byPosition(a: GraphNode, b: GraphNode): number {
  return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const nameOf = (n: GraphNode) => `「${n.title || '(無題)'}」`;

export function validateWorkflow(graph: Graph): Issue[] {
  const { edgeByOutput } = getIndex(graph);
  const start = graph.nodes.find((n) => n.type === 'start');
  const reachable = start ? reachableFrom(graph, start.id) : new Set<string>();
  const sorted = [...graph.nodes].sort(byPosition);
  const issues: Issue[] = [];

  for (const n of sorted) {
    if (n.type === 'note' || n.type === 'start') continue;
    if (!reachable.has(n.id)) {
      issues.push({
        code: 'unreachable',
        nodeId: n.id,
        message: `${NODE_SPECS[n.type].label}${nameOf(n)}は開始地点から到達できません`,
      });
    }
  }

  for (const n of sorted) {
    for (const port of NODE_SPECS[n.type].outputs) {
      if (edgeByOutput.has(outputKey(n.id, port))) continue;
      if (n.type === 'condition') {
        issues.push({
          code: 'condition-branch',
          nodeId: n.id,
          port,
          message: `条件分岐${nameOf(n)}の「${port === 'yes' ? 'Yes' : 'No'}」の行き先がありません`,
        });
      } else {
        issues.push({
          code: 'dangling-output',
          nodeId: n.id,
          port,
          message: `${NODE_SPECS[n.type].label}${nameOf(n)}の出力の接続先がありません`,
        });
      }
    }
  }

  const endReachable = graph.nodes.some((n) => n.type === 'end' && reachable.has(n.id));
  if (!endReachable) {
    issues.push({ code: 'no-end', message: '開始地点から到達できる終了(End)ノードがありません' });
  }
  return issues;
}

/** ノードごとの問題の有無（描画用） */
export function issuesByNode(issues: readonly Issue[]): Map<string, Issue[]> {
  const map = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!i.nodeId) continue;
    (map.get(i.nodeId) ?? map.set(i.nodeId, []).get(i.nodeId)!).push(i);
  }
  return map;
}
