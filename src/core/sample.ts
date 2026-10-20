import type { Graph } from './types';

/** 初回起動時のサンプル。分岐は2つのルートに分かれ、どちらも End に到達する（循環なし） */
export function createSampleGraph(): Graph {
  return {
    nodes: [
      { id: 'start-1', type: 'start', x: 80, y: 220, title: '開始', content: '新しい機能の依頼を受けた' },
      { id: 'action-1', type: 'action', x: 340, y: 202, title: '要件確認', content: '依頼者に目的・期限・受け入れ条件を確認する' },
      { id: 'action-2', type: 'action', x: 684, y: 202, title: '実装', content: '要件に沿って機能を実装し、単体テストを書く' },
      { id: 'condition-1', type: 'condition', x: 1028, y: 190, title: 'テスト結果の確認', content: 'すべてのテストが成功したか？' },
      { id: 'end-1', type: 'end', x: 1412, y: 120, title: '完了', content: 'リリースして依頼者に報告する' },
      { id: 'action-3', type: 'action', x: 1372, y: 330, title: '修正指示', content: '失敗したテストの原因と修正方針をまとめる' },
      { id: 'end-2', type: 'end', x: 1700, y: 348, title: '差し戻し', content: '修正指示を添えて次の対応へ引き継ぐ' },
      {
        id: 'note-1',
        type: 'note',
        x: 340,
        y: -20,
        title: '使い方のヒント',
        content: 'ポートをドラッグして接続。空白をドラッグで範囲選択、Space+ドラッグで移動。Ctrl+Gでグループ化。',
      },
    ],
    edges: [
      { id: 'edge-1', source: 'start-1', sourcePort: 'out', target: 'action-1', targetPort: 'in' },
      { id: 'edge-2', source: 'action-1', sourcePort: 'out', target: 'action-2', targetPort: 'in' },
      { id: 'edge-3', source: 'action-2', sourcePort: 'out', target: 'condition-1', targetPort: 'in' },
      { id: 'edge-4', source: 'condition-1', sourcePort: 'yes', target: 'end-1', targetPort: 'in' },
      { id: 'edge-5', source: 'condition-1', sourcePort: 'no', target: 'action-3', targetPort: 'in' },
      { id: 'edge-6', source: 'action-3', sourcePort: 'out', target: 'end-2', targetPort: 'in' },
    ],
    groups: [{ id: 'group-1', title: '開発', nodeIds: ['action-1', 'action-2'] }],
  };
}
