import { NODE_SPECS } from './nodeSpec';
import type { GraphNode, Point, PortId } from './types';

/** ズーム倍率の範囲（仕様: 40%〜200%） */
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nodeSize(node: Pick<GraphNode, 'type'>): { width: number; height: number } {
  const spec = NODE_SPECS[node.type];
  return { width: spec.width, height: spec.height };
}

export function nodeRect(node: GraphNode): Rect {
  const { width, height } = nodeSize(node);
  return { x: node.x, y: node.y, width, height };
}

/** ノード左上を原点とした、ポート中心の相対座標。CSS 側もこの値を使う */
export function portOffset(node: Pick<GraphNode, 'type'>, port: PortId): Point {
  const { width, height } = nodeSize(node);
  if (port === 'in') return { x: 0, y: height / 2 };
  if (node.type === 'condition') {
    return { x: width, y: port === 'yes' ? height * 0.42 : height * 0.78 };
  }
  return { x: width, y: height / 2 };
}

export function portPosition(node: GraphNode, port: PortId): Point {
  const o = portOffset(node, port);
  return { x: node.x + o.x, y: node.y + o.y };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function boundsOf(nodes: readonly GraphNode[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = nodeRect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 矩形が画面（width×height）にちょうど収まるビューポートを返す */
export function fitViewport(bounds: Rect | null, screen: { width: number; height: number }, padding = 64): Viewport {
  if (!bounds) return { x: screen.width / 2, y: screen.height / 2, zoom: 1 };
  const availW = Math.max(1, screen.width - padding * 2);
  const availH = Math.max(1, screen.height - padding * 2);
  const zoom = clampZoom(Math.min(availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height), 1.25));
  // 最小ズームでも収まらないときは中央ではなく左上に寄せる（開始ノードが見えるように）
  const x = bounds.width * zoom > availW ? padding - bounds.x * zoom : screen.width / 2 - (bounds.x + bounds.width / 2) * zoom;
  const y = bounds.height * zoom > availH ? padding - bounds.y * zoom : screen.height / 2 - (bounds.y + bounds.height / 2) * zoom;
  return { zoom, x, y };
}

/** カーソル位置を固定したままズームする */
export function zoomAt(view: Viewport, screenPoint: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom);
  const wx = (screenPoint.x - view.x) / view.zoom;
  const wy = (screenPoint.y - view.y) / view.zoom;
  return { zoom, x: screenPoint.x - wx * zoom, y: screenPoint.y - wy * zoom };
}

export function screenToWorld(view: Viewport, p: Point): Point {
  return { x: (p.x - view.x) / view.zoom, y: (p.y - view.y) / view.zoom };
}

/** 接続線（水平に出入りする3次ベジェ）の制御点 */
export function edgeCurve(from: Point, to: Point): { c1: Point; c2: Point } {
  const dx = to.x - from.x;
  const reach = Math.max(60, Math.min(220, Math.abs(dx) * 0.5 + (dx < 0 ? 80 : 0)));
  return { c1: { x: from.x + reach, y: from.y }, c2: { x: to.x - reach, y: to.y } };
}

export function edgePath(from: Point, to: Point): string {
  const { c1, c2 } = edgeCurve(from, to);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

export function bezierPoint(from: Point, to: Point, t: number): Point {
  const { c1, c2 } = edgeCurve(from, to);
  const u = 1 - t;
  return {
    x: u * u * u * from.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * to.x,
    y: u * u * u * from.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * to.y,
  };
}
