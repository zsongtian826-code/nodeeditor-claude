import { describe, expect, it } from 'vitest';
import { largeGraph, linearGraph } from '../test/builders';
import { nodeRect, nodeSize, rectsIntersect } from './geometry';
import { autoLayout } from './layout';
import { createSampleGraph } from './sample';
import { setNodePositions } from './graphOps';

describe('自動整列', () => {
  it('左から右へ階層が進み、ノード同士が重ならない', () => {
    const g = createSampleGraph();
    const laid = setNodePositions(g, autoLayout(g));
    for (const e of laid.edges) {
      const s = laid.nodes.find((n) => n.id === e.source)!;
      const t = laid.nodes.find((n) => n.id === e.target)!;
      expect(t.x).toBeGreaterThan(s.x);
    }
    const nodes = laid.nodes.filter((n) => n.type !== 'note');
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(rectsIntersect(nodeRect(nodes[i]!), nodeRect(nodes[j]!))).toBe(false);
      }
    }
  });

  it('メモは動かさない', () => {
    const g = createSampleGraph();
    const pos = autoLayout(g);
    expect(pos.has('note-1')).toBe(false);
  });

  it('大きなグラフでも重ならず高速に終わる', () => {
    const g = largeGraph(100);
    const t0 = performance.now();
    const laid = setNodePositions(g, autoLayout(g));
    expect(performance.now() - t0).toBeLessThan(500);
    const rects = laid.nodes.map(nodeRect);
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rectsIntersect(rects[i]!, rects[j]!)) overlaps++;
    expect(overlaps).toBe(0);
  });

  it('一本道は水平に並ぶ', () => {
    const g = linearGraph();
    const pos = autoLayout(g);
    // 高さが違うノードでも、中心のy座標がそろう
    const centers = new Set(g.nodes.map((n) => pos.get(n.id)!.y + nodeSize(n).height / 2));
    expect(centers.size).toBe(1);
  });
});
