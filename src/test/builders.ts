import type { Graph, GraphEdge, GraphNode, NodeType, OutputPortId } from '../core/types';

export function node(id: string, type: NodeType, x = 0, y = 0, title = id, content = ''): GraphNode {
  return { id, type, x, y, title, content };
}

export function edge(id: string, source: string, target: string, sourcePort: OutputPortId = 'out'): GraphEdge {
  return { id, source, sourcePort, target, targetPort: 'in' };
}

/** start → a1 → a2 → end の一本道 */
export function linearGraph(): Graph {
  return {
    nodes: [node('start-1', 'start', 0, 0), node('action-1', 'action', 300, 0), node('action-2', 'action', 600, 0), node('end-1', 'end', 900, 0)],
    edges: [edge('edge-1', 'start-1', 'action-1'), edge('edge-2', 'action-1', 'action-2'), edge('edge-3', 'action-2', 'end-1')],
    groups: [],
  };
}

/** 巨大グラフ（100ノード・約150本の接続）。層状に作るので循環しない */
export function largeGraph(nodeCount = 100): Graph {
  const nodes: GraphNode[] = [node('start-1', 'start', 0, 0)];
  const edges: GraphEdge[] = [];
  const conditionIds: string[] = [];
  const ids: string[] = ['start-1'];
  for (let i = 1; i < nodeCount; i++) {
    const type: NodeType = i % 5 === 0 ? 'condition' : i === nodeCount - 1 ? 'end' : 'action';
    const id = `${type}-${i}`;
    nodes.push(node(id, type, (i % 10) * 300, Math.floor(i / 10) * 160));
    ids.push(id);
    if (type === 'condition') conditionIds.push(id);
  }
  let e = 1;
  const used = new Set<string>();
  // 各ノードの出力を、より後ろ（番号が大きい）ノードへつなぐ
  for (let i = 0; i < ids.length - 1; i++) {
    const id = ids[i]!;
    const n = nodes[i]!;
    const ports: OutputPortId[] = n.type === 'condition' ? ['yes', 'no'] : ['out'];
    for (const [k, p] of ports.entries()) {
      const target = ids[Math.min(ids.length - 1, i + 1 + k * 2)]!;
      if (used.has(`${id}:${p}`) || nodes.find((x) => x.id === target)?.type === 'start') continue;
      used.add(`${id}:${p}`);
      edges.push(edge(`edge-${e++}`, id, target, p));
    }
  }
  return { nodes, edges, groups: [] };
}
