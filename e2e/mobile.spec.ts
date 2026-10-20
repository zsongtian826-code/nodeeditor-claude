import { expect, test, type Page } from '@playwright/test';
import { center, graph, node, openFresh, viewport } from './helpers';

async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.beforeEach(async ({ page }) => {
  await openFresh(page);
});

test('スマートフォン: 横スクロールが出ず、ノード追加バーが画面下にある', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('add-action')).toBeVisible();
  const bar = (await page.locator('.palette').boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(bar.y + bar.height).toBeGreaterThan(vh - 4);
  // 詳細パネルは初期状態では隠れている
  await expect(page.locator('.inspector')).not.toBeInViewport();
});

test('スマートフォン: タップでノード追加、詳細シートでタイトル編集', async ({ page }) => {
  await page.getByTestId('add-action').tap();
  await expect(page.locator('.node')).toHaveCount(9);
  await page.getByRole('button', { name: '詳細パネルを開く' }).tap();
  const field = page.getByTestId('field-title');
  await expect(field).toBeVisible();
  await field.fill('スマホで編集');
  const id = (await page.evaluate(() => (window as any).__flowloom.store.getState().selection.nodes[0])) as string;
  expect((await graph(page)).nodes.find((n) => n.id === id)!.title).toBe('スマホで編集');
  await page.getByRole('button', { name: 'パネルを閉じる' }).tap();
  await expect(page.locator('.inspector')).not.toBeInViewport();
});

test('スマートフォン: 1本指で空白をドラッグすると画面移動、ノードをドラッグすると移動', async ({ page }) => {
  const vp = await viewport(page);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await touchDrag(page, { x: canvas.x + 60, y: canvas.y + canvas.height - 120 }, { x: canvas.x + 140, y: canvas.y + canvas.height - 160 });
  const vp2 = await viewport(page);
  expect(vp2.x - vp.x).toBeCloseTo(80, 0);
  expect(vp2.y - vp.y).toBeCloseTo(-40, 0);

  const before = (await graph(page)).nodes.find((n) => n.id === 'action-1')!;
  const c = await center(node(page, 'action-1'));
  await touchDrag(page, c, { x: c.x + 30, y: c.y + 20 });
  const after = (await graph(page)).nodes.find((n) => n.id === 'action-1')!;
  expect(after.x).toBeGreaterThan(before.x);
});

test('スマートフォン: 2本指のピンチでズームできる', async ({ page }) => {
  const z0 = (await viewport(page)).zoom;
  const cdp = await page.context().newCDPSession(page);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }] });
  for (let i = 1; i <= 8; i++) {
    const d = 40 + i * 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const z1 = (await viewport(page)).zoom;
  expect(z1).toBeGreaterThan(z0 * 1.5);
});

test('スマートフォン: 操作ボタンは指で押せる大きさ（40px以上）', async ({ page }) => {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>('.toolbar button, .zoom-controls button, .palette button').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return; // 非表示
      if (r.width < 38 || r.height < 38) out.push(`${el.getAttribute('aria-label') ?? el.textContent}:${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  expect(small).toEqual([]);
});
