import { useRef } from 'react';
import { boundsOf, nodeRect } from '../core/geometry';
import { useEditor, useStore } from '../state/useEditor';

const W = 184;
const H = 116;

export function Minimap() {
  const store = useStore();
  const nodes = useEditor((s) => s.graph.nodes);
  const vp = useEditor((s) => s.viewport);
  const size = useEditor((s) => s.canvasSize);
  const dragging = useRef(false);

  // 表示領域（ワールド座標）と、ノード全体を含む範囲
  const view = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, width: size.width / vp.zoom, height: size.height / vp.zoom };
  const nb = boundsOf(nodes);
  const minX = Math.min(view.x, nb?.x ?? view.x) - 80;
  const minY = Math.min(view.y, nb?.y ?? view.y) - 80;
  const maxX = Math.max(view.x + view.width, (nb?.x ?? 0) + (nb?.width ?? 0)) + 80;
  const maxY = Math.max(view.y + view.height, (nb?.y ?? 0) + (nb?.height ?? 0)) + 80;
  const scale = Math.min(W / (maxX - minX), H / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;

  const toWorld = (e: React.PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return { x: (e.clientX - r.left - offX) / scale + minX, y: (e.clientY - r.top - offY) / scale + minY };
  };
  const center = (e: React.PointerEvent) => {
    const w = toWorld(e);
    const cur = store.getState();
    store.setViewport({ zoom: cur.viewport.zoom, x: cur.canvasSize.width / 2 - w.x * cur.viewport.zoom, y: cur.canvasSize.height / 2 - w.y * cur.viewport.zoom });
  };

  return (
    <div className="minimap" data-no-canvas aria-label="ミニマップ（クリック・ドラッグで移動）" role="img">
      <svg
        width={W}
        height={H}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          center(e);
        }}
        onPointerMove={(e) => dragging.current && center(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <g transform={`translate(${offX} ${offY}) scale(${scale}) translate(${-minX} ${-minY})`}>
          {nodes.map((n) => {
            const r = nodeRect(n);
            return <rect key={n.id} className={`minimap__node minimap__node--${n.type}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={10} />;
          })}
          <rect className="minimap__view" x={view.x} y={view.y} width={view.width} height={view.height} strokeWidth={1.5 / scale} />
        </g>
      </svg>
    </div>
  );
}
