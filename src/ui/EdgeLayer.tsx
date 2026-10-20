import { memo, useMemo } from 'react';
import { bezierPoint, edgePath, portPosition } from '../core/geometry';
import { getIndex } from '../core/graph';
import type { Point } from '../core/types';
import { useEditor, useStore } from '../state/useEditor';

const PORT_GAP = 9; // 入力ポートの手前で止める（矢印の先端がポートに触れる位置）
const ARROW_LEN = 11;
const ARROW_HALF = 5.5;

function arrowPath(tip: Point): string {
  return `M ${tip.x - ARROW_LEN} ${tip.y - ARROW_HALF} L ${tip.x} ${tip.y} L ${tip.x - ARROW_LEN} ${tip.y + ARROW_HALF} Z`;
}

/** 辺の両端の座標。移動に追従する */
function useEdgeEnds(id: string): { from: Point; to: Point; port: string } | null {
  const key = useEditor((s) => {
    const idx = getIndex(s.graph);
    const e = idx.edgeById.get(id);
    if (!e) return '';
    const a = idx.nodeById.get(e.source);
    const b = idx.nodeById.get(e.target);
    if (!a || !b) return '';
    const p = portPosition(a, e.sourcePort);
    const q = portPosition(b, e.targetPort);
    return `${p.x},${p.y},${q.x},${q.y},${e.sourcePort}`;
  });
  return useMemo(() => {
    if (!key) return null;
    const [sx, sy, tx, ty, port] = key.split(',');
    return { from: { x: Number(sx), y: Number(sy) }, to: { x: Number(tx) - PORT_GAP, y: Number(ty) }, port: port! };
  }, [key]);
}

const EdgeView = memo(function EdgeView({ id }: { id: string }) {
  const ends = useEdgeEnds(id);
  const selected = useEditor((s) => s.selection.edge === id);
  if (!ends) return null;
  const d = edgePath(ends.from, ends.to);
  const label = ends.port === 'yes' ? 'Yes' : ends.port === 'no' ? 'No' : null;
  const labelPos = label ? bezierPoint(ends.from, ends.to, 0.12) : null;
  return (
    <g className={`edge edge--${ends.port}${selected ? ' is-selected' : ''}`}>
      <path className="edge__hit" d={d} data-edge-id={id} />
      <path className="edge__line" d={d} />
      <path className="edge__arrow" d={arrowPath(ends.to)} />
      {labelPos && (
        <text className="edge__label" x={labelPos.x} y={labelPos.y - 9} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
});

export interface PreviewLine {
  from: Point;
  to: Point;
  valid: boolean | null;
}

export function EdgeLayer({ preview }: { preview: PreviewLine | null }) {
  const key = useEditor((s) => s.graph.edges.map((e) => e.id).join('\n'));
  const ids = key === '' ? [] : key.split('\n');
  return (
    <svg className="edges-layer" width="1" height="1" aria-hidden="true">
      {ids.map((id) => (
        <EdgeView key={id} id={id} />
      ))}
      {preview && (
        <g className={`edge-preview${preview.valid === true ? ' is-valid' : preview.valid === false ? ' is-invalid' : ''}`}>
          <path className="edge-preview__line" d={edgePath(preview.from, preview.to)} />
          <path className="edge-preview__arrow" d={arrowPath(preview.to)} />
        </g>
      )}
    </svg>
  );
}

/** 選択中の接続線の中央に出す削除ボタン */
export function EdgeActions() {
  const store = useStore();
  const id = useEditor((s) => s.selection.edge);
  const zoom = useEditor((s) => s.viewport.zoom);
  const ends = useEdgeEnds(id ?? '');
  if (!id || !ends) return null;
  const mid = bezierPoint(ends.from, ends.to, 0.5);
  return (
    <button
      type="button"
      className="edge-delete"
      style={{ left: mid.x, top: mid.y, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
      aria-label="この接続を削除"
      title="この接続を削除 (Delete)"
      onClick={() => store.deleteEdge(id)}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
