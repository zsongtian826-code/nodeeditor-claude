import { describe, expect, it } from 'vitest';
import { largeGraph } from '../test/builders';
import { checkConnection } from './graph';
import { generateMarkdown } from './markdown';
import { parseGraphJson, serializeGraph } from './schema';
import { validateWorkflow } from './validate';

describe('大量ノード（100ノード・約150接続）', () => {
  const g = largeGraph(100);

  it('規模が想定どおり', () => {
    expect(g.nodes).toHaveLength(100);
    expect(g.edges.length).toBeGreaterThanOrEqual(100);
  });

  it('検証・JSON往復・Markdown生成が実用的な速さで終わる', () => {
    const t0 = performance.now();
    validateWorkflow(g);
    const parsed = parseGraphJson(serializeGraph(g));
    expect(parsed.ok).toBe(true);
    generateMarkdown(g);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('接続検証（循環チェック）を大量に繰り返しても速い', () => {
    const t0 = performance.now();
    let rejected = 0;
    for (let i = 0; i < 2000; i++) {
      const a = g.nodes[i % 100]!;
      const b = g.nodes[(i * 7 + 3) % 100]!;
      if (!checkConnection(g, { source: a.id, sourcePort: 'out', target: b.id, targetPort: 'in' }).ok) rejected++;
    }
    expect(rejected).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
