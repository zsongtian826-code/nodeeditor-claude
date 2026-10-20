// グラフのデータ構造。JSON のスキーマ (schemaVersion: 1) と同じ形をそのまま内部状態にも使う。

export const NODE_TYPES = ['start', 'action', 'condition', 'end', 'note'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type InputPortId = 'in';
export type OutputPortId = 'out' | 'yes' | 'no';
export type PortId = InputPortId | OutputPortId;

export interface GraphNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  title: string;
  content: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourcePort: OutputPortId;
  target: string;
  targetPort: InputPortId;
}

export interface GraphGroup {
  id: string;
  title: string;
  nodeIds: string[];
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
}

export const SCHEMA_VERSION = 1;

export interface GraphDocument extends Graph {
  schemaVersion: typeof SCHEMA_VERSION;
}

export interface Connection {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export interface Point {
  x: number;
  y: number;
}
