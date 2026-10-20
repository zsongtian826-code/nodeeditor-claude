import { expect, type Locator, type Page } from '@playwright/test';

export interface GraphLike {
  nodes: { id: string; type: string; x: number; y: number; title: string; content: string }[];
  edges: { id: string; source: string; sourcePort: string; target: string; targetPort: string }[];
  groups: { id: string; title: string; nodeIds: string[] }[];
}

export async function openFresh(page: Page) {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.node').first()).toBeVisible();
  // 初回の全体表示が終わるまで待つ
  await page.waitForFunction(() => (window as any).__flowloom.store.getState().canvasSize.width > 50);
}

export const graph = (page: Page): Promise<GraphLike> => page.evaluate(() => (window as any).__flowloom.store.getState().graph);
export const selection = (page: Page): Promise<{ nodes: string[]; edge: string | null; group: string | null }> =>
  page.evaluate(() => (window as any).__flowloom.store.getState().selection);
export const viewport = (page: Page): Promise<{ x: number; y: number; zoom: number }> =>
  page.evaluate(() => (window as any).__flowloom.store.getState().viewport);

export const node = (page: Page, id: string): Locator => page.locator(`[data-node-id="${id}"]`);

export async function center(loc: Locator) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('要素が見つかりません');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** 画面座標でドラッグ（途中の動きを入れて、実際の操作に近づける） */
export async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export const outPort = (page: Page, nodeId: string, port = 'out'): Locator => page.locator(`[data-port-out="${port}"][data-node="${nodeId}"]`);
export const inPort = (page: Page, nodeId: string): Locator => page.locator(`[data-port-in="${nodeId}"]`);

/** 出力ポートから、相手ノードの本体へドラッグして接続する */
export async function connect(page: Page, from: string, to: string, port = 'out') {
  await dragBetween(page, await center(outPort(page, from, port)), await center(node(page, to)), 15);
}

export const store = (page: Page, expr: string) => page.evaluate(`(() => { const s = window.__flowloom.store; return ${expr}; })()`);

export async function menu(page: Page, label: string) {
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: label }).click();
}
