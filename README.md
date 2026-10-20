# Flowloom — ビジュアルノードエディタ

ブラウザだけで動く、ワークフロー作成用のノードエディタです。ノードを置いて線でつなぎ、分岐・グループ化・Undo/Redo・JSON 保存・Markdown 書き出しまでできます。サーバーも外部 API も使いません。

- 公開URL: https://zsongtian826-code.github.io/nodeeditor-claude/
- 技術: Vite + React + TypeScript + CSS（**実行時の依存は react / react-dom のみ**）

## 使い方

| 操作 | 方法 |
| --- | --- |
| ノード追加 | 左のパレットをクリック（画面中央に追加）／キャンバスへドラッグ／右クリックメニュー |
| 接続 | 出力ポート（右側の●）から入力ポート（左側の●）へドラッグ。つなげるポートが光ります |
| 範囲選択 | 空白をドラッグ |
| 画面移動 | `Space`+ドラッグ・中ボタンドラッグ・手のひらツール(`H`)。スマホは1本指 |
| ズーム | ホイール／ピンチ／ボタン（40〜200%）。`F` で全体表示 |
| 複数選択 | `Shift`/`⌘`+クリック、`⌘/Ctrl+A` |
| グループ化 | 2個以上選んで `⌘/Ctrl+G`（解除は `⌘/Ctrl+Shift+G`） |
| 複製・削除 | `⌘/Ctrl+D`・`Delete` |
| Undo / Redo | `⌘/Ctrl+Z`・`⌘/Ctrl+Shift+Z`（最大100操作） |

ショートカット一覧は `?` キー。

## 開発

```bash
npm install
npm run dev        # 開発サーバー
npm test           # 単体テスト (Vitest)
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（型チェック込み）
npm run e2e        # 画面操作テスト (Playwright / 初回は npx playwright install chromium)
```

## 設計

```
src/
  core/    画面に依存しない純粋なロジック（テスト対象の中心）
    types.ts        グラフのデータ構造（JSONスキーマと同形）
    graph.ts        接続の検証・循環検出（反復DFS / カーン法）
    graphOps.ts     追加・削除・複製・接続・グループ操作（不変更新）
    schema.ts       JSON の検証と書き出し
    markdown.ts     Markdown 生成（決定的）
    validate.ts     グラフ検証（到達不能・未接続など）
    layout.ts       自動整列
  state/
    editorStore.ts  履歴・選択・表示位置を持つストア（useSyncExternalStore）
    persistence.ts  localStorage への自動保存・復元
  ui/       React コンポーネント（Canvas / NodeView / EdgeLayer / Inspector …）
  styles/   CSS（色は tokens.css の変数に集約。ライト/ダーク）
```

### データ構造
`{ schemaVersion: 1, nodes[], edges[], groups[] }`。内部状態もこの形をそのまま使います。

### 接続の検証
`checkConnection` が次の順で検証します: 存在しないノード → 自己接続 → メモ → 終了からの出力 → 開始への入力 → 無効ポート → 重複 → 出力ポートの占有（1本まで） → **循環**。循環は「接続先から有向辺をたどって接続元に着けるか」を反復DFSで調べます（再帰を使わないので大きなグラフでも安全）。JSON 読み込み時はカーン法（入次数0から順に取り除き、残ったものが循環）で全体を検査します。

### Undo / Redo
不変データのスナップショット方式です。ノード・辺は変更のない部分を使い回すため軽量です。
- 履歴は最大100件。Undo 後に新しい編集をすると Redo は破棄。
- ドラッグ中は履歴に積まず、完了時に1操作として記録（動かなかった場合は記録しない）。
- 同じ項目への連続入力（文字入力・矢印キー）は1秒以内なら1操作にまとめる。
- 新規作成・JSON 読み込みは履歴を初期化（確認ダイアログあり）。

### 保存
`localStorage` に `schemaVersion` つきの JSON を自動保存（300ms デバウンス＋ページ離脱時に即時保存）。壊れたデータは検証で弾き、元データを `flowloom:project:corrupt-backup` に退避してサンプルで起動します。

### 技術選定
React Flow などは使わず、DOM（ノード）+ SVG（接続線）で自作しています。仕様の細かい制約（ポート単位の接続検証、ドラッグ中の履歴まとめ、グループ枠など）を直接制御でき、依存を増やさず保守しやすいためです。ノードは固定サイズ（長い文字は省略表示）にして、ポート座標を計算だけで求めています。

## JSON スキーマ
`schemaVersion`, `nodes`（`id/type/x/y/title/content`）, `edges`（`id/source/sourcePort/target/targetPort`）, `groups`（`id/title/nodeIds`）。ノード種別は `start/action/condition/end/note`、出力ポートは `out`（start/action）・`yes`/`no`（condition）、入力ポートは `in`。
