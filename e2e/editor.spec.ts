import { expect, test } from '@playwright/test';
import { center, connect, dragBetween, graph, inPort, menu, node, openFresh, outPort, selection, store, viewport } from './helpers';

test.beforeEach(async ({ page }) => {
  await openFresh(page);
});

test('初回起動でサンプルが表示され、検証は問題なし', async ({ page }) => {
  await expect(page.locator('.node')).toHaveCount(8);
  await expect(page.getByTestId('problem-pill')).toContainText('問題なし');
  const g = await graph(page);
  expect(g.edges).toHaveLength(6);
  expect(g.groups).toHaveLength(1);
});

test('ノードの追加と削除（開始ノードは削除不可）', async ({ page }) => {
  await page.getByTestId('add-action').click();
  await expect(page.locator('.node')).toHaveCount(9);
  expect((await selection(page)).nodes).toHaveLength(1);
  await page.keyboard.press('Delete');
  await expect(page.locator('.node')).toHaveCount(8);

  await node(page, 'start-1').click();
  await page.keyboard.press('Delete');
  await expect(node(page, 'start-1')).toBeVisible();
  await expect(page.getByTestId('toast')).toContainText('開始ノードは削除できません');
  await expect(page.getByTestId('add-start')).toBeDisabled();
});

test('パレットからキャンバスへドラッグして追加できる', async ({ page }) => {
  const canvas = await page.getByTestId('canvas').boundingBox();
  const target = { x: canvas!.x + canvas!.width / 2, y: canvas!.y + canvas!.height - 120 };
  await page.getByTestId('add-end').dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData('application/x-flowloom-node', 'end');
    return d;
  });
  await page.getByTestId('canvas').dispatchEvent('drop', { dataTransfer: dt, clientX: target.x, clientY: target.y });
  await expect(page.locator('.node')).toHaveCount(9);
  const g = await graph(page);
  expect(g.nodes.at(-1)?.type).toBe('end');
});

test('ノードのドラッグ移動と Undo', async ({ page }) => {
  const before = (await graph(page)).nodes.find((n) => n.id === 'action-3')!;
  const z = (await viewport(page)).zoom;
  const c = await center(node(page, 'action-3'));
  await dragBetween(page, c, { x: c.x + 80, y: c.y + 50 });
  const after = (await graph(page)).nodes.find((n) => n.id === 'action-3')!;
  expect(after.x - before.x).toBeCloseTo(80 / z, 0);
  expect(after.y - before.y).toBeCloseTo(50 / z, 0);
  // ドラッグ全体で1操作
  expect(await store(page, 's.getState().past.length')).toBe(1);
  await page.getByTestId('undo').click();
  const undone = (await graph(page)).nodes.find((n) => n.id === 'action-3')!;
  expect(undone.x).toBe(before.x);
  expect(undone.y).toBe(before.y);
});

test('範囲選択（空白ドラッグ）と、複数ノードの一括移動', async ({ page }) => {
  const a = await node(page, 'end-1').boundingBox();
  const b = await node(page, 'end-2').boundingBox();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  // action-3 / end-1 / end-2 を囲む（右側の空白から左上へ）
  const from = { x: Math.min(canvas.x + canvas.width - 8, b!.x + b!.width + 24), y: Math.max(canvas.y + 4, a!.y - 24) };
  const to = { x: (await node(page, 'action-3').boundingBox())!.x + 4, y: b!.y + b!.height + 24 };
  await dragBetween(page, from, to);
  const sel = (await selection(page)).nodes.sort();
  expect(sel).toEqual(expect.arrayContaining(['action-3', 'end-1', 'end-2']));
  expect(sel).not.toContain('start-1');
  // パン（ビューポート）は動いていない
  const vp = await viewport(page);
  const before = (await graph(page)).nodes.filter((n) => sel.includes(n.id));
  const c = await center(node(page, 'end-2'));
  await dragBetween(page, c, { x: c.x - 40, y: c.y + 30 });
  expect(await viewport(page)).toEqual(vp);
  const after = (await graph(page)).nodes.filter((n) => sel.includes(n.id));
  const dxs = after.map((n, i) => n.x - before[i]!.x);
  expect(new Set(dxs.map((d) => Math.round(d))).size).toBe(1); // 全員が同じだけ動く
  expect(dxs[0]).toBeLessThan(0);
  expect(await store(page, 's.getState().past.length')).toBe(1);
});

test('Shift+クリックで選択を追加・解除', async ({ page }) => {
  await node(page, 'action-1').click();
  await node(page, 'action-3').click({ modifiers: ['Shift'] });
  expect((await selection(page)).nodes.sort()).toEqual(['action-1', 'action-3']);
  await node(page, 'action-1').click({ modifiers: ['Shift'] });
  expect((await selection(page)).nodes).toEqual(['action-3']);
});

test('出力ポートから入力ポートへドラッグして接続でき、接続は移動に追従する', async ({ page }) => {
  await page.getByTestId('add-action').click();
  const id = (await selection(page)).nodes[0]!;
  // action-3 の出力は end-2 に接続済み。2本目は始められない
  await connect(page, 'action-3', id);
  await expect(page.getByTestId('toast')).toContainText('すでに接続');
  // 空いている出力: action-1 → action-2 を外してから、id へ繋ぐ
  await page.evaluate(() => (window as any).__flowloom.store.deleteEdge('edge-2'));
  await connect(page, 'action-1', id);
  const g = await graph(page);
  expect(g.edges.some((e) => e.source === 'action-1' && e.target === id && e.targetPort === 'in')).toBe(true);

  // 接続中のノードを動かすと、線が追従する（線の端点が入力ポートの位置と一致）
  const c = await center(node(page, id));
  await dragBetween(page, c, { x: c.x + 60, y: c.y + 60 });
  const edge = page.locator('.edge:not(.edge--yes):not(.edge--no) .edge__arrow').last();
  const ab = (await edge.boundingBox())!;
  const pb = (await inPort(page, id).boundingBox())!;
  expect(Math.abs(ab.x + ab.width - (pb.x + pb.width / 2))).toBeLessThan(14);
  expect(Math.abs(ab.y + ab.height / 2 - (pb.y + pb.height / 2))).toBeLessThan(8);
});

test('不正な接続は拒否される（循環・占有・自己接続）', async ({ page }) => {
  const before = (await graph(page)).edges.length;
  // 循環: action-3 → end-2 を外し、action-3 → action-1 を試す
  await page.evaluate(() => (window as any).__flowloom.store.deleteEdge('edge-6'));
  await connect(page, 'action-3', 'action-1');
  await expect(page.getByTestId('toast')).toContainText('循環');
  expect((await graph(page)).edges).toHaveLength(before - 1);
  // 自己接続
  await connect(page, 'action-3', 'action-3');
  await expect(page.getByTestId('toast')).toContainText('自分自身');
  // 占有: Yes はすでに end-1 に接続済みのため、ドラッグを始められない
  await dragBetween(page, await center(outPort(page, 'condition-1', 'yes')), await center(node(page, 'end-2')));
  await expect(page.getByTestId('toast')).toContainText('すでに接続');
  expect((await graph(page)).edges).toHaveLength(before - 1);
});

test('接続線を選択して削除できる（ボタンと Delete キー）', async ({ page }) => {
  const before = (await graph(page)).edges.length;
  await page.evaluate(() => (window as any).__flowloom.store.selectEdge('edge-2'));
  await expect(page.locator('.edge-delete')).toBeVisible();
  await page.locator('.edge-delete').click();
  expect((await graph(page)).edges).toHaveLength(before - 1);
  await page.evaluate(() => (window as any).__flowloom.store.selectEdge('edge-1'));
  await page.keyboard.press('Delete');
  expect((await graph(page)).edges).toHaveLength(before - 2);
  await page.keyboard.press('Control+z');
  expect((await graph(page)).edges).toHaveLength(before - 1);
});

test('接続線を直接クリックして選択できる', async ({ page }) => {
  const hit = page.locator('[data-edge-id="edge-2"]');
  const b = (await hit.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  expect((await selection(page)).edge).toBe('edge-2');
});

test('ノード削除で関連する接続も消える', async ({ page }) => {
  await node(page, 'condition-1').click();
  await page.keyboard.press('Delete');
  const g = await graph(page);
  expect(g.nodes.some((n) => n.id === 'condition-1')).toBe(false);
  expect(g.edges.every((e) => e.source !== 'condition-1' && e.target !== 'condition-1')).toBe(true);
  await expect(page.getByTestId('problem-pill')).toContainText('件の問題');
});

test('グループ化・グループ移動・解除（ノードと接続は残る）', async ({ page }) => {
  await node(page, 'action-3').click();
  await node(page, 'end-1').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  let g = await graph(page);
  expect(g.groups).toHaveLength(2);
  const created = g.groups[1]!;
  expect(created.nodeIds.sort()).toEqual(['action-3', 'end-1']);

  // グループ名を編集
  await page.getByTestId('field-group-title').fill('分岐後');
  g = await graph(page);
  expect(g.groups[1]!.title).toBe('分岐後');

  // ヘッダーをドラッグでグループ全体を移動
  const header = page.locator(`[data-group-id="${created.id}"]`);
  const before = g.nodes.filter((n) => created.nodeIds.includes(n.id));
  const c = await center(header);
  await dragBetween(page, c, { x: c.x + 30, y: c.y + 20 });
  const after = (await graph(page)).nodes.filter((n) => created.nodeIds.includes(n.id));
  expect(after[0]!.x).toBeGreaterThan(before[0]!.x);
  expect(after[0]!.x - before[0]!.x).toBeCloseTo(after[1]!.x - before[1]!.x, 5);
  expect(g.nodes.find((n) => n.id === 'start-1')!.x).toBe((await graph(page)).nodes.find((n) => n.id === 'start-1')!.x);

  // 所属ノードの個別編集
  await node(page, 'end-1').click();
  await page.getByTestId('field-title').fill('成功');
  expect((await graph(page)).nodes.find((n) => n.id === 'end-1')!.title).toBe('成功');

  // 解除
  await page.locator(`[data-group-id="${created.id}"]`).click();
  await page.getByRole('button', { name: 'グループ解除' }).click();
  g = await graph(page);
  expect(g.groups).toHaveLength(1);
  expect(g.nodes).toHaveLength(8);
  expect(g.edges).toHaveLength(6);
});

test('すでにグループにいるノードを含む選択ではグループ化できない', async ({ page }) => {
  await node(page, 'action-1').click();
  await node(page, 'end-1').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('toast')).toContainText('別のグループ');
  expect((await graph(page)).groups).toHaveLength(1);
});

test('Undo / Redo のショートカットと、Undo 後の新しい編集で Redo が破棄される', async ({ page }) => {
  await page.getByTestId('add-action').click();
  await page.getByTestId('add-note').click();
  await expect(page.locator('.node')).toHaveCount(10);
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } }); // フォーカスを入力欄から外す
  await page.keyboard.press('Control+z');
  await expect(page.locator('.node')).toHaveCount(9);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.node')).toHaveCount(10);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.node')).toHaveCount(8);
  await expect(page.getByTestId('redo')).toBeEnabled();
  await page.getByTestId('add-end').click();
  await expect(page.getByTestId('redo')).toBeDisabled();
});

test('内容の編集は即座にキャンバスへ反映され、長い文字でもノードの大きさは変わらない', async ({ page }) => {
  await node(page, 'action-1').click();
  const before = (await node(page, 'action-1').boundingBox())!;
  await page.getByTestId('field-title').fill('とても長いタイトル'.repeat(20));
  await page.getByTestId('field-content').fill('長い説明文です。'.repeat(80));
  await expect(node(page, 'action-1').locator('.node__title')).toContainText('とても長いタイトル');
  const after = (await node(page, 'action-1').boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
});

test('ホイールでズーム（40〜200%）、Fit View、ズームボタン', async ({ page }) => {
  const c = await center(page.getByTestId('canvas'));
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await viewport(page)).zoom).toBeCloseTo(2, 5);
  for (let i = 0; i < 80; i++) await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await viewport(page)).zoom).toBeCloseTo(0.4, 5);
  await page.getByRole('button', { name: 'ズームイン' }).click();
  expect((await viewport(page)).zoom).toBeCloseTo(0.5, 5);
  await page.getByRole('button', { name: 'ズームを100%に戻す' }).click();
  expect((await viewport(page)).zoom).toBe(1);
  await page.getByRole('button', { name: '全体表示' }).click();
  expect((await viewport(page)).zoom).toBeLessThan(1);
});

test('Space+ドラッグで画面を移動（範囲選択とは区別される）', async ({ page }) => {
  const vp = await viewport(page);
  const c = await center(page.getByTestId('canvas'));
  await page.keyboard.down('Space');
  await dragBetween(page, { x: c.x, y: c.y + 150 }, { x: c.x + 70, y: c.y + 190 });
  await page.keyboard.up('Space');
  const vp2 = await viewport(page);
  expect(vp2.x - vp.x).toBeCloseTo(70, 0);
  expect(vp2.y - vp.y).toBeCloseTo(40, 0);
  expect((await selection(page)).nodes).toHaveLength(0);
});

test('リロード後も、ノード・接続・位置・グループが復元される（自動保存）', async ({ page }) => {
  await page.getByTestId('add-condition').click();
  const c = await center(node(page, 'action-3'));
  await dragBetween(page, c, { x: c.x + 40, y: c.y + 40 });
  const g1 = await graph(page);
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('.node')).toHaveCount(9);
  expect(await graph(page)).toEqual(g1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('flowloom:project')!));
  expect(saved.schemaVersion).toBe(1);
});

test('保存データが壊れていてもクラッシュせず、サンプルで起動する', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('flowloom:project', '{"schemaVersion":1,"nodes":'));
  await page.reload();
  await expect(page.locator('.node')).toHaveCount(8);
  await expect(page.getByTestId('toast')).toContainText('壊れて');
  expect(await page.evaluate(() => localStorage.getItem('flowloom:project:corrupt-backup'))).toContain('"nodes"');
});

test('新規プロジェクトは確認ダイアログを経て、開始ノードだけになる', async ({ page }) => {
  await menu(page, '新規プロジェクト');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('失われ');
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('.node')).toHaveCount(8);
  await menu(page, '新規プロジェクト');
  await page.getByTestId('confirm-ok').click();
  await expect(page.locator('.node')).toHaveCount(1);
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('JSON の書き出しと読み込み（置き換え前に確認）', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await menu(page, 'JSON を書き出す');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('workflow.json');
  const path = await download.path();
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(path, 'utf8');
  const doc = JSON.parse(text);
  expect(doc.schemaVersion).toBe(1);
  expect(doc.nodes).toHaveLength(8);

  // 内容を壊さず別の状態にしてから、読み込みで元に戻る
  await page.evaluate(() => (window as any).__flowloom.store.newProject());
  await expect(page.locator('.node')).toHaveCount(1);
  await menu(page, 'JSON を読み込む');
  await page.getByTestId('import-input').setInputFiles({ name: 'workflow.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('dialog')).toContainText('置き換え');
  await page.getByTestId('confirm-ok').click();
  await expect(page.locator('.node')).toHaveCount(8);
  expect(await graph(page)).toEqual({ nodes: doc.nodes, edges: doc.edges, groups: doc.groups });
});

test('不正な JSON は読み込みを拒否し、エラーを表示する', async ({ page }) => {
  const bad = JSON.stringify({
    schemaVersion: 1,
    nodes: [
      { id: 'start-1', type: 'start', x: 0, y: 0, title: '', content: '' },
      { id: 'a', type: 'action', x: 0, y: 0, title: '', content: '' },
      { id: 'b', type: 'action', x: 0, y: 0, title: '', content: '' },
    ],
    edges: [
      { id: 'e1', source: 'a', sourcePort: 'out', target: 'b', targetPort: 'in' },
      { id: 'e2', source: 'b', sourcePort: 'out', target: 'a', targetPort: 'in' },
    ],
    groups: [],
  });
  await menu(page, 'JSON を読み込む');
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
  await expect(page.getByTestId('import-errors')).toContainText('循環');
  await page.getByRole('button', { name: '閉じる' }).last().click();
  await expect(page.locator('.node')).toHaveCount(8); // 元のまま

  await menu(page, 'JSON を読み込む');
  await page.getByTestId('import-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
  await expect(page.getByTestId('import-errors')).toContainText('JSON');
});

test('Markdown 出力（検証結果つき・workflow.md）', async ({ page }) => {
  await menu(page, 'Markdown を書き出す');
  await expect(page.getByTestId('md-preview')).toContainText('# ワークフロー');
  await expect(page.getByTestId('md-preview')).toContainText('Yes → Step 5「完了」');
  const dl = page.waitForEvent('download');
  await page.getByTestId('md-download').click();
  expect((await dl).suggestedFilename()).toBe('workflow.md');
  await page.keyboard.press('Escape');

  // 未接続の問題があると警告が明示される
  await page.evaluate(() => (window as any).__flowloom.store.deleteEdge('edge-6'));
  await menu(page, 'Markdown を書き出す');
  await expect(page.getByTestId('md-warning')).toContainText('2 件');
  await expect(page.getByTestId('md-preview')).toContainText('⚠');
});

test('検証パネル: 到達不能・未接続・Condition の未接続分岐を表示し、クリックでノードへ移動', async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as any).__flowloom.store;
    s.deleteEdge('edge-5'); // No → 修正指示 を外す（action-3, end-2 が到達不能に）
  });
  await expect(page.getByTestId('problem-pill')).toContainText('件の問題');
  await page.getByTestId('problem-pill').click();
  const list = page.getByRole('list', { name: '検証結果' });
  await expect(list).toContainText('「No」の行き先がありません');
  await expect(list).toContainText('到達できません');
  await list.getByRole('button').filter({ hasText: '修正指示' }).first().click();
  expect((await selection(page)).nodes).toEqual(['action-3']);
});

test('自動整列は1操作として Undo できる', async ({ page }) => {
  const before = await graph(page);
  await page.getByRole('button', { name: '自動整列' }).click();
  expect(await graph(page)).not.toEqual(before);
  await page.getByTestId('undo').click();
  expect(await graph(page)).toEqual(before);
});

test('ダークテーマとライトテーマを切り替えられる', async ({ page }) => {
  const html = page.locator('html');
  const t0 = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: /テーマに切り替え/ }).click();
  expect(await html.getAttribute('data-theme')).not.toBe(t0);
});

test('キーボードショートカット一覧を ? で開ける', async ({ page }) => {
  await page.locator('.canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toContainText('キーボードショートカット');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('矢印キーで微調整でき、連続操作は1回の Undo で戻る', async ({ page }) => {
  await node(page, 'action-3').click();
  const x0 = (await graph(page)).nodes.find((n) => n.id === 'action-3')!.x;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect((await graph(page)).nodes.find((n) => n.id === 'action-3')!.x).toBe(x0 + 48);
  await page.keyboard.press('Control+z');
  expect((await graph(page)).nodes.find((n) => n.id === 'action-3')!.x).toBe(x0);
});
