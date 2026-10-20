import { checkConnection, getIndex } from './graph';
import { createNode, NODE_SPECS } from './nodeSpec';
import { nextId } from './ids';
import type { Connection, Graph, GraphEdge, GraphNode, NodeType, Point } from './types';

// グラフに対する純粋な操作。すべて新しい Graph を返し、元は変更しない。
// （変更のないノード・辺は同じオブジェクトを使い回すので、履歴のスナップショットが軽い）

export type OpResult<T = object> = ({ ok: true; graph: Graph } & T) | { ok: false; message: string };

export const EMPTY_GRAPH: Graph = { nodes: [], edges: [], groups: [] };

export function hasStart(graph: Graph): boolean {
  return graph.nodes.some((n) => n.type === 'start');
}

export function createBlankGraph(): Graph {
  return {
    nodes: [createNode('start', 'start-1', { x: 160, y: 200 })],
    edges: [],
    groups: [],
  };
}

export function addNode(
  graph: Graph,
  type: NodeType,
  pos: Point,
  overrides: Partial<GraphNode> = {},
): OpResult<{ id: string }> {
  if (type === 'start' && hasStart(graph)) {
    return { ok: false, message: '開始ノードは1つのワークフローに1個だけです' };
  }
  const id = nextId(type, graph.nodes.map((n) => n.id));
  const node = createNode(type, id, pos, overrides);
  return { ok: true, graph: { ...graph, nodes: [...graph.nodes, node] }, id };
}

/** グループの不変条件（2個未満なら解散）を保つ */
function normalizeGroups(graph: Graph): Graph {
  const alive = new Set(graph.nodes.map((n) => n.id));
  let changed = false;
  const groups = [];
  for (const g of graph.groups) {
    const nodeIds = g.nodeIds.filter((id) => alive.has(id));
    if (nodeIds.length !== g.nodeIds.length) changed = true;
    if (nodeIds.length < 2) {
      changed = true;
      continue;
    }
    groups.push(nodeIds.length === g.nodeIds.length ? g : { ...g, nodeIds });
  }
  return changed ? { ...graph, groups } : graph;
}

/** ノードを削除し、関連する接続も削除する。開始ノードは削除しない */
export function removeNodes(graph: Graph, ids: readonly string[]): Graph {
  const doomed = new Set(ids.filter((id) => graph.nodes.find((n) => n.id === id)?.type !== 'start'));
  if (doomed.size === 0) return graph;
  return normalizeGroups({
    ...graph,
    nodes: graph.nodes.filter((n) => !doomed.has(n.id)),
    edges: graph.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
  });
}

export function moveNodes(graph: Graph, ids: ReadonlySet<string>, dx: number, dy: number): Graph {
  if (ids.size === 0 || (dx === 0 && dy === 0)) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  };
}

export function setNodePositions(graph: Graph, positions: ReadonlyMap<string, Point>): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = positions.get(n.id);
      return p && (p.x !== n.x || p.y !== n.y) ? { ...n, x: p.x, y: p.y } : n;
    }),
  };
}

export type NodePatch = Partial<Pick<GraphNode, 'title' | 'content' | 'x' | 'y'>>;

export function updateNode(graph: Graph, id: string, patch: NodePatch): Graph {
  const current = getIndex(graph).nodeById.get(id);
  if (!current) return graph;
  const changed = (Object.keys(patch) as (keyof NodePatch)[]).some((k) => patch[k] !== undefined && patch[k] !== current[k]);
  if (!changed) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/**
 * 選択ノードを複製する。複製ノード同士の接続は引き継ぎ、グループには入れない。
 * 開始ノードは複製できない（無視する）。
 */
export function duplicateNodes(
  graph: Graph,
  ids: readonly string[],
  offset: Point = { x: 40, y: 40 },
): OpResult<{ newIds: string[] }> {
  const { nodeById } = getIndex(graph);
  const sources = graph.nodes.filter((n) => ids.includes(n.id) && NODE_SPECS[n.type].removable && nodeById.has(n.id));
  if (sources.length === 0) return { ok: false, message: '複製できるノードがありません（開始ノードは複製できません）' };
  const taken = graph.nodes.map((n) => n.id);
  const idMap = new Map<string, string>();
  const clones: GraphNode[] = [];
  for (const n of sources) {
    const id = nextId(n.type, taken);
    taken.push(id);
    idMap.set(n.id, id);
    clones.push({ ...n, id, x: n.x + offset.x, y: n.y + offset.y });
  }
  const takenEdges = graph.edges.map((e) => e.id);
  const cloneEdges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const s = idMap.get(e.source);
    const t = idMap.get(e.target);
    if (!s || !t) continue;
    const id = nextId('edge', takenEdges);
    takenEdges.push(id);
    cloneEdges.push({ ...e, id, source: s, target: t });
  }
  return {
    ok: true,
    graph: { ...graph, nodes: [...graph.nodes, ...clones], edges: [...graph.edges, ...cloneEdges] },
    newIds: clones.map((c) => c.id),
  };
}

export function connectNodes(graph: Graph, c: Connection): OpResult<{ id: string }> {
  const check = checkConnection(graph, c);
  if (!check.ok) return check;
  const id = nextId('edge', graph.edges.map((e) => e.id));
  const edge = {
    id,
    source: c.source,
    sourcePort: c.sourcePort,
    target: c.target,
    targetPort: c.targetPort,
  } as GraphEdge;
  return { ok: true, graph: { ...graph, edges: [...graph.edges, edge] }, id };
}

export function removeEdges(graph: Graph, ids: readonly string[]): Graph {
  const doomed = new Set(ids);
  if (!graph.edges.some((e) => doomed.has(e.id))) return graph;
  return { ...graph, edges: graph.edges.filter((e) => !doomed.has(e.id)) };
}

// ---------------------------------------------------------------
// グループ
// ---------------------------------------------------------------

export function createGroup(graph: Graph, nodeIds: readonly string[], title = 'グループ'): OpResult<{ id: string }> {
  const unique = [...new Set(nodeIds)];
  const { nodeById, groupOfNode } = getIndex(graph);
  const valid = unique.filter((id) => nodeById.has(id));
  if (valid.length < 2) return { ok: false, message: 'グループには2個以上のノードが必要です' };
  if (valid.some((id) => groupOfNode.has(id))) {
    return { ok: false, message: 'すでに別のグループに入っているノードが含まれています（先にグループを解除してください）' };
  }
  const id = nextId('group', graph.groups.map((g) => g.id));
  // 並びは graph.nodes の順に揃える（出力を決定的にするため）
  const ordered = graph.nodes.filter((n) => valid.includes(n.id)).map((n) => n.id);
  return { ok: true, graph: { ...graph, groups: [...graph.groups, { id, title, nodeIds: ordered }] }, id };
}

export function renameGroup(graph: Graph, groupId: string, title: string): Graph {
  const g = graph.groups.find((x) => x.id === groupId);
  if (!g || g.title === title) return graph;
  return { ...graph, groups: graph.groups.map((x) => (x.id === groupId ? { ...x, title } : x)) };
}

/** グループだけを解除する。中のノードと接続はそのまま残る */
export function ungroup(graph: Graph, groupId: string): Graph {
  if (!graph.groups.some((g) => g.id === groupId)) return graph;
  return { ...graph, groups: graph.groups.filter((g) => g.id !== groupId) };
}

export function moveGroup(graph: Graph, groupId: string, dx: number, dy: number): Graph {
  const g = graph.groups.find((x) => x.id === groupId);
  if (!g) return graph;
  return moveNodes(graph, new Set(g.nodeIds), dx, dy);
}
