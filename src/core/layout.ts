import { nodeSize } from './geometry';
import { getIndex } from './graph';
import type { Graph, Point } from './types';

const COLUMN_GAP = 120;
const ROW_GAP = 40;
const ORIGIN: Point = { x: 120, y: 100 };

/**
 * 左→右の階層レイアウトを計算する（ノードの新しい左上座標を返す）。
 * 循環が無い前提。階層は「入力側の最長経路」で決める。メモは動かさない。
 */
export function autoLayout(graph: Graph): Map<string, Point> {
  const { incoming, outgoing } = getIndex(graph);
  const targets = graph.nodes.filter((n) => n.type !== 'note');
  const ids = new Set(targets.map((n) => n.id));

  // 最長経路による階層（トポロジカル順に伸ばす）
  const layer = new Map<string, number>();
  const indeg = new Map<string, number>();
  for (const n of targets) indeg.set(n.id, (incoming.get(n.id) ?? []).filter((e) => ids.has(e.source)).length);
  const queue = targets.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (const id of queue) layer.set(id, 0);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]!;
    for (const e of outgoing.get(id) ?? []) {
      if (!ids.has(e.target)) continue;
      layer.set(e.target, Math.max(layer.get(e.target) ?? 0, (layer.get(id) ?? 0) + 1));
      const d = (indeg.get(e.target) ?? 0) - 1;
      indeg.set(e.target, d);
      if (d === 0) queue.push(e.target);
    }
  }
  for (const n of targets) if (!layer.has(n.id)) layer.set(n.id, 0); // 念のため（循環）

  const layers: string[][] = [];
  for (const n of targets) (layers[layer.get(n.id)!] ??= []).push(n.id);

  const nodeById = getIndex(graph).nodeById;
  const result = new Map<string, Point>();
  const centerY = new Map<string, number>();
  let x = ORIGIN.x;
  for (const col of layers) {
    if (!col) continue;
    const width = Math.max(...col.map((id) => nodeSize(nodeById.get(id)!).width));
    // 前の階層の位置（親の中心の平均）を希望位置にして、重なりを解消する
    const desired = col.map((id) => {
      const parents = (incoming.get(id) ?? []).map((e) => centerY.get(e.source)).filter((v): v is number => v !== undefined);
      const fallback = nodeById.get(id)!.y;
      return { id, want: parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : fallback, order: fallback };
    });
    desired.sort((a, b) => a.want - b.want || a.order - b.order || (a.id < b.id ? -1 : 1));
    let cursor = -Infinity;
    for (const d of desired) {
      const h = nodeSize(nodeById.get(d.id)!).height;
      const top = Math.max(d.want - h / 2, cursor);
      result.set(d.id, { x, y: top });
      centerY.set(d.id, top + h / 2);
      cursor = top + h + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  }

  // 全体を原点に寄せる
  let minY = Infinity;
  for (const p of result.values()) minY = Math.min(minY, p.y);
  if (Number.isFinite(minY)) for (const [id, p] of result) result.set(id, { x: p.x, y: p.y - minY + ORIGIN.y });
  return result;
}
