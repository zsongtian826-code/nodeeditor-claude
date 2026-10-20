import { NODE_SPECS } from './nodeSpec';
import type { Connection, Graph, GraphEdge, GraphNode, OutputPortId } from './types';

// ---------------------------------------------------------------
// インデックス（Graph は不変データなので WeakMap でキャッシュできる）
// ---------------------------------------------------------------

export interface GraphIndex {
  nodeById: Map<string, GraphNode>;
  edgeById: Map<string, GraphEdge>;
  /** `${nodeId}:${port}` → その出力ポートから伸びる接続 */
  edgeByOutput: Map<string, GraphEdge>;
  outgoing: Map<string, GraphEdge[]>;
  incoming: Map<string, GraphEdge[]>;
  groupOfNode: Map<string, string>;
}

const indexCache = new WeakMap<Graph, GraphIndex>();

export function outputKey(nodeId: string, port: string): string {
  return `${nodeId}:${port}`;
}

export function getIndex(graph: Graph): GraphIndex {
  const cached = indexCache.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, GraphNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);
  const edgeById = new Map<string, GraphEdge>();
  const edgeByOutput = new Map<string, GraphEdge>();
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    edgeById.set(e.id, e);
    edgeByOutput.set(outputKey(e.source, e.sourcePort), e);
    (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source)!).push(e);
    (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target)!).push(e);
  }
  const groupOfNode = new Map<string, string>();
  for (const g of graph.groups) for (const id of g.nodeIds) groupOfNode.set(id, g.id);
  const index = { nodeById, edgeById, edgeByOutput, outgoing, incoming, groupOfNode };
  indexCache.set(graph, index);
  return index;
}

// ---------------------------------------------------------------
// 到達可能性・循環検出（どちらも反復型の探索で、再帰によるスタック溢れを避ける）
// ---------------------------------------------------------------

/** `from` から有向辺をたどって到達できるノードID（from 自身を含む） */
export function reachableFrom(graph: Graph, from: string): Set<string> {
  const { outgoing } = getIndex(graph);
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const e of outgoing.get(current) ?? []) {
      if (!seen.has(e.target)) {
        seen.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return seen;
}

/**
 * source → target を足すと循環ができるか。
 * 「target から辿って source に着けるか」を深さ優先探索で調べる。
 */
export function wouldCreateCycle(graph: Graph, source: string, target: string): boolean {
  if (source === target) return true;
  return reachableFrom(graph, target).has(source);
}

/**
 * 既存グラフが循環を含むか（カーンのアルゴリズム）。
 * 循環に関わる（または循環から到達できる）ノードIDを返す。無ければ空配列。
 */
export function findCycleNodes(graph: Pick<Graph, 'nodes' | 'edges'>): string[] {
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const n of graph.nodes) indegree.set(n.id, 0);
  for (const e of graph.edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    (next.get(e.source) ?? next.set(e.source, []).get(e.source)!).push(e.target);
  }
  const queue: string[] = [];
  for (const [id, d] of indegree) if (d === 0) queue.push(id);
  let head = 0;
  const removed = new Set<string>();
  while (head < queue.length) {
    const id = queue[head++]!;
    removed.add(id);
    for (const t of next.get(id) ?? []) {
      const d = (indegree.get(t) ?? 0) - 1;
      indegree.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  return graph.nodes.filter((n) => !removed.has(n.id)).map((n) => n.id);
}

// ---------------------------------------------------------------
// 接続の検証
// ---------------------------------------------------------------

export type ConnectErrorCode =
  | 'missing-node'
  | 'self'
  | 'note'
  | 'start-input'
  | 'end-output'
  | 'invalid-port'
  | 'duplicate'
  | 'occupied'
  | 'cycle';

export type ConnectCheck = { ok: true } | { ok: false; code: ConnectErrorCode; message: string };

const fail = (code: ConnectErrorCode, message: string): ConnectCheck => ({ ok: false, code, message });

/** 接続案が仕様どおり許されるかを検証する（グラフは変更しない） */
export function checkConnection(graph: Graph, c: Connection): ConnectCheck {
  const { nodeById, edgeByOutput } = getIndex(graph);
  const source = nodeById.get(c.source);
  const target = nodeById.get(c.target);
  if (!source || !target) return fail('missing-node', '存在しないノードには接続できません');
  if (source.id === target.id) return fail('self', '自分自身には接続できません');
  if (source.type === 'note' || target.type === 'note') return fail('note', 'メモノードには接続できません');
  if (source.type === 'end') return fail('end-output', '終了ノードからは接続できません');
  if (target.type === 'start') return fail('start-input', '開始ノードへは接続できません');
  if (!NODE_SPECS[source.type].outputs.includes(c.sourcePort as OutputPortId)) {
    return fail('invalid-port', `「${NODE_SPECS[source.type].label}」に出力ポート「${c.sourcePort}」はありません`);
  }
  if (c.targetPort !== 'in' || !NODE_SPECS[target.type].hasInput) {
    return fail('invalid-port', `入力ポート「${c.targetPort}」は存在しません`);
  }
  const existing = edgeByOutput.get(outputKey(c.source, c.sourcePort));
  if (existing) {
    if (existing.target === c.target && existing.targetPort === c.targetPort) {
      return fail('duplicate', '同じ接続がすでにあります');
    }
    return fail('occupied', '出力ポートから出せる接続は1本だけです。先に既存の接続を削除してください');
  }
  if (wouldCreateCycle(graph, c.source, c.target)) {
    return fail('cycle', '循環する接続はできません（先に進んだ道に戻ってしまいます）');
  }
  return { ok: true };
}
