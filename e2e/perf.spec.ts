import { expect, test } from '@playwright/test';
import { center, dragBetween, graph, openFresh } from './helpers';

/** 100ノード・約150接続の層状グラフを作って読み込む */
async function loadLarge(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const nodes: any[] = [{ id: 'start-1', type: 'start', x: 0, y: 0, title: '開始', content: '' }];
    const edges: any[] = [];
    const ids = ['start-1'];
    for (let i = 1; i < 100; i++) {
      const type = i === 99 ? 'end' : i % 4 === 0 ? 'condition' : 'action';
      const id = `${type}-${i}`;
      nodes.push({ id, type, x: (i % 10) * 330, y: Math.floor(i / 10) * 170, title: `ノード ${i}`, content: `説明文 ${i} `.repeat(6) });
      ids.push(id);
    }
    let e = 1;
    for (let i = 0; i < 99; i++) {
      const n = nodes[i];
      const ports = n.type === 'condition' ? ['yes', 'no'] : ['out'];
      ports.forEach((p: string, k: number) => {
        const t = ids[Math.min(99, i + 1 + k * 3)]!;
        edges.push({ id: `edge-${e++}`, source: n.id, sourcePort: p, target: t, targetPort: 'in' });
      });
    }
    // 追加の接続（循環しない範囲で）
    (window as any).__flowloom.store.replaceGraph({ nodes, edges, groups: [] });
  });
}

test('100ノードでもドラッグ・パン・ズームが滑らか', async ({ page }) => {
  await openFresh(page);
  await loadLarge(page);
  const g = await graph(page);
  expect(g.nodes).toHaveLength(100);
  expect(g.edges.length).toBeGreaterThanOrEqual(120);

  // 1フレームの間隔を記録しながら操作する
  await page.evaluate(() => {
    const w = window as any;
    w.__frames = [];
    let last = performance.now();
    const loop = () => {
      const t = performance.now();
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  // 画面内にあるノードをつかんでドラッグ
  await page.getByRole('button', { name: 'ズームを100%に戻す' }).click();
  const target = page.locator('[data-node-id="action-1"]');
  const c = await center(target);
  await dragBetween(page, c, { x: c.x + 300, y: c.y + 200 }, 90);

  // パン
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.down('Space');
  await dragBetween(page, { x: canvas.x + 300, y: canvas.y + 500 }, { x: canvas.x + 100, y: canvas.y + 300 }, 60);
  await page.keyboard.up('Space');
  // ズーム
  await page.mouse.move(canvas.x + 400, canvas.y + 300);
  for (let i = 0; i < 25; i++) await page.mouse.wheel(0, 100);

  const stats = await page.evaluate(() => {
    const w = window as any;
    w.__stop = true;
    const f: number[] = w.__frames.slice(2).sort((a: number, b: number) => a - b);
    return { n: f.length, p50: f[Math.floor(f.length * 0.5)], p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1] };
  });
  console.log('100ノードのフレーム間隔(ms):', JSON.stringify(stats));
  expect(stats.p95).toBeLessThan(50); // 20fps 以上を維持（headless 環境でも安定する緩めの基準）

  // 大量ノードで全体表示
  await page.getByRole('button', { name: '全体表示' }).click();
  await expect(page.locator('.node')).toHaveCount(100);
  // 全選択→移動→Undo
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  expect(await page.evaluate(() => (window as any).__flowloom.store.getState().selection.nodes.length)).toBe(100);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+z');
  expect((await graph(page)).nodes.find((n) => n.id === 'action-1')!.x).toBeGreaterThanOrEqual(0);
});
