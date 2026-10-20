import type { GraphNode, NodeType, OutputPortId, Point } from './types';

export interface NodeSpec {
  type: NodeType;
  label: string;
  /** 一覧やバッジに出す短い説明 */
  summary: string;
  hasInput: boolean;
  outputs: readonly OutputPortId[];
  width: number;
  height: number;
  defaultTitle: string;
  defaultContent: string;
  /** 詳細パネルで「content」をどう呼ぶか */
  contentLabel: string;
  contentPlaceholder: string;
  /** 削除・複製を許可するか（Start は不可） */
  removable: boolean;
}

export const NODE_SPECS: Record<NodeType, NodeSpec> = {
  start: {
    type: 'start',
    label: '開始',
    summary: 'ワークフローの開始地点',
    hasInput: false,
    outputs: ['out'],
    width: 200,
    height: 72,
    defaultTitle: '開始',
    defaultContent: '',
    contentLabel: '開始条件・メモ',
    contentPlaceholder: 'どんなときに始まるか（任意）',
    removable: false,
  },
  action: {
    type: 'action',
    label: '作業',
    summary: '作業や指示',
    hasInput: true,
    outputs: ['out'],
    width: 264,
    height: 108,
    defaultTitle: '新しい作業',
    defaultContent: '',
    contentLabel: '説明文',
    contentPlaceholder: '何をするか、具体的な指示を書く',
    removable: true,
  },
  condition: {
    type: 'condition',
    label: '条件分岐',
    summary: 'Yes / No で分岐',
    hasInput: true,
    outputs: ['yes', 'no'],
    width: 264,
    height: 132,
    defaultTitle: '条件の確認',
    defaultContent: '',
    contentLabel: '条件文',
    contentPlaceholder: '例: テストはすべて成功したか？',
    removable: true,
  },
  end: {
    type: 'end',
    label: '終了',
    summary: 'ワークフローの終了地点',
    hasInput: true,
    outputs: [],
    width: 200,
    height: 72,
    defaultTitle: '終了',
    defaultContent: '',
    contentLabel: '終了時のメモ',
    contentPlaceholder: 'この終わり方の意味（任意）',
    removable: true,
  },
  note: {
    type: 'note',
    label: 'メモ',
    summary: '自由なメモ（接続なし）',
    hasInput: false,
    outputs: [],
    width: 240,
    height: 140,
    defaultTitle: 'メモ',
    defaultContent: '',
    contentLabel: '本文',
    contentPlaceholder: '自由に書けます',
    removable: true,
  },
};

export const PALETTE_ORDER: readonly NodeType[] = ['start', 'action', 'condition', 'end', 'note'];

export function createNode(type: NodeType, id: string, pos: Point, overrides: Partial<GraphNode> = {}): GraphNode {
  const spec = NODE_SPECS[type];
  return {
    id,
    type,
    x: pos.x,
    y: pos.y,
    title: spec.defaultTitle,
    content: spec.defaultContent,
    ...overrides,
  };
}

export function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NODE_SPECS, value);
}
