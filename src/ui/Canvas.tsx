import { useContext, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { nodeRect, portPosition, rectsIntersect, screenToWorld, zoomAt, type Rect, type Viewport } from '../core/geometry';
import { checkConnection, getIndex } from '../core/graph';
import { moveNodes } from '../core/graphOps';
import { NODE_SPECS, PALETTE_ORDER, isNodeType } from '../core/nodeSpec';
import type { Graph, NodeType, OutputPortId, Point } from '../core/types';
import { useEditor, useStore } from '../state/useEditor';
import { EdgeActions, EdgeLayer, type PreviewLine } from './EdgeLayer';
import { GroupLayer } from './GroupLayer';
import { Icon, NODE_ICON } from './icons';
import { NodesLayer } from './NodeView';
import { ToolContext, useUiActions } from './UiContext';

export const PALETTE_MIME = 'application/x-flowloom-node';
const DRAG_THRESHOLD = 4; // px。これ未満の動きはクリック扱い
const DOUBLE_TAP_MS = 380;

type Drag =
  | { kind: 'pan'; start: Point; vp: Viewport }
  | { kind: 'marquee'; start: Point; additive: boolean; base: string[]; moved: boolean }
  | { kind: 'nodes'; start: Point; ids: Set<string>; base: Graph; moved: boolean; nodeId: string | null; collapseTo: string | null }
  | { kind: 'connect'; source: string; sourcePort: OutputPortId; from: Point };

interface MenuState {
  x: number;
  y: number;
  world: Point;
  nodeId: string | null;
}

export function Canvas() {
  const store = useStore();
  const ui = useUiActions();
  const { tool, multi } = useContext(ToolContext);
  const viewport = useEditor((s) => s.viewport);
  const connecting = useEditor((s) => s.connecting !== null);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef<{ clientX: number; clientY: number } | null>(null);
  const raf = useRef(0);
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ vp: Viewport; mid: Point; dist: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [preview, setPreview] = useState<PreviewLine | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p: Point): Point => screenToWorld(store.getState().viewport, p);

  // ---- 画面サイズの監視 ----
  useEffect(() => {
    const el = ref.current!;
    const update = () => store.setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [store]);

  // ---- ホイールでズーム（passive: false で、ページのスクロールを止める） ----
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015));
      const vp = store.getState().viewport;
      store.setViewport(zoomAt(vp, local(e), vp.zoom * factor));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // ---- Space でパン、Esc で接続キャンセル ----
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e.target) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.key === 'Escape') {
        setMenu(null);
        if (drag.current?.kind === 'connect') cancelConnect();
        else if (drag.current?.kind === 'nodes' && drag.current.moved) {
          store.cancelDrag();
          drag.current = null;
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    const blur = () => setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const cancelConnect = () => {
    drag.current = null;
    setPreview(null);
    store.setConnecting(null);
  };

  const panAllowed = tool === 'pan' || spaceDown;

  // ------------------------------------------------------------
  // ポインタ操作
  // ------------------------------------------------------------
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (target.closest('button, input, textarea, select, a, [data-no-canvas]')) return;
    setMenu(null);
    const el = ref.current!;
    const p = local(e);

    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, p);
      if (touches.current.size === 2) {
        // 2本指: ピンチ操作（進行中の操作は取り消す）
        if (drag.current?.kind === 'nodes') store.cancelDrag();
        if (drag.current?.kind === 'connect') cancelConnect();
        drag.current = null;
        setMarquee(null);
        const [a, b] = [...touches.current.values()] as [Point, Point];
        pinch.current = { vp: store.getState().viewport, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (touches.current.size > 2) return;
    }

    if (e.button === 1 || (e.button === 0 && panAllowed)) {
      e.preventDefault();
      drag.current = { kind: 'pan', start: p, vp: store.getState().viewport };
      setPanning(true);
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const modifier = e.shiftKey || e.ctrlKey || e.metaKey || multi;
    const portOut = target.closest<HTMLElement>('[data-port-out]');
    const header = target.closest<HTMLElement>('[data-group-id]');
    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    const edgeEl = target.closest<SVGElement>('[data-edge-id]');

    if (portOut) {
      const source = portOut.dataset.node!;
      const sourcePort = portOut.dataset.portOut as OutputPortId;
      const g = store.getState().graph;
      const src = getIndex(g).nodeById.get(source);
      if (!src) return;
      if (getIndex(g).edgeByOutput.has(`${source}:${sourcePort}`)) {
        store.notify('error', 'この出力ポートはすでに接続されています。接続線を選んで削除してから、つなぎ直してください');
        return;
      }
      e.preventDefault();
      const from = portPosition(src, sourcePort);
      drag.current = { kind: 'connect', source, sourcePort, from };
      store.setConnecting({ source, sourcePort, hover: null });
      setPreview({ from, to: from, valid: null });
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (header) {
      const gid = header.dataset.groupId!;
      store.selectGroup(gid);
      const group = store.getState().graph.groups.find((g) => g.id === gid);
      if (!group) return;
      drag.current = { kind: 'nodes', start: p, ids: new Set(group.nodeIds), base: store.getState().graph, moved: false, nodeId: null, collapseTo: null };
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (nodeEl) {
      const id = nodeEl.dataset.nodeId!;
      const sel = store.getState().selection;
      const isSel = sel.nodes.includes(id);
      let collapseTo: string | null = null;
      if (modifier) {
        store.selectNodes([id], 'toggle');
        if (isSel) return; // 選択を外しただけ。ドラッグは始めない
      } else if (!isSel) {
        store.selectNodes([id]);
      } else if (sel.nodes.length > 1) {
        collapseTo = id; // 動かさずに離したら、このノードだけの選択にする
      }
      drag.current = {
        kind: 'nodes',
        start: p,
        ids: new Set(store.getState().selection.nodes),
        base: store.getState().graph,
        moved: false,
        nodeId: id,
        collapseTo,
      };
      el.setPointerCapture(e.pointerId);
      return;
    }

    if (edgeEl) {
      store.selectEdge(edgeEl.dataset.edgeId!);
      return;
    }

    // ---- 何もない所 ----
    if (e.pointerType === 'touch' && !multi) {
      drag.current = { kind: 'pan', start: p, vp: store.getState().viewport };
      setPanning(true);
      store.clearSelection();
    } else {
      const base = modifier ? store.getState().selection.nodes : [];
      if (!modifier) store.clearSelection();
      drag.current = { kind: 'marquee', start: p, additive: modifier, base, moved: false };
    }
    el.setPointerCapture(e.pointerId);
  };

  /** rAF にまとめて1フレーム1回だけ反映する */
  const applyMove = () => {
    raf.current = 0;
    const ev = latest.current;
    const d = drag.current;
    if (!ev || !d) return;
    const p = local(ev);
    const vp = store.getState().viewport;

    if (d.kind === 'pan') {
      store.setViewport({ zoom: vp.zoom, x: d.vp.x + (p.x - d.start.x), y: d.vp.y + (p.y - d.start.y) });
    } else if (d.kind === 'nodes') {
      const dist = Math.hypot(p.x - d.start.x, p.y - d.start.y);
      if (!d.moved) {
        if (dist < DRAG_THRESHOLD) return;
        d.moved = true;
        store.beginDrag();
      }
      store.dragTo(moveNodes(d.base, d.ids, (p.x - d.start.x) / vp.zoom, (p.y - d.start.y) / vp.zoom));
    } else if (d.kind === 'marquee') {
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < DRAG_THRESHOLD) return;
      d.moved = true;
      const rect: Rect = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        width: Math.abs(p.x - d.start.x),
        height: Math.abs(p.y - d.start.y),
      };
      setMarquee(rect);
      const a = screenToWorld(vp, { x: rect.x, y: rect.y });
      const worldRect: Rect = { x: a.x, y: a.y, width: rect.width / vp.zoom, height: rect.height / vp.zoom };
      const hits = store.graph.nodes.filter((n) => rectsIntersect(nodeRect(n), worldRect)).map((n) => n.id);
      store.selectNodes(d.additive ? [...new Set([...d.base, ...hits])] : hits);
    } else if (d.kind === 'connect') {
      const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-node-id]');
      const hover = under?.dataset.nodeId ?? null;
      const cur = store.getState().connecting;
      if (cur && cur.hover !== hover) store.setConnecting({ ...cur, hover });
      let to = world(p);
      let valid: boolean | null = null;
      if (hover) {
        const g = store.getState().graph;
        const check = checkConnection(g, { source: d.source, sourcePort: d.sourcePort, target: hover, targetPort: 'in' });
        valid = check.ok;
        const tn = getIndex(g).nodeById.get(hover);
        if (check.ok && tn) {
          const pos = portPosition(tn, 'in');
          to = { x: pos.x - 9, y: pos.y }; // 入力ポートに吸着
        }
      }
      setPreview({ from: d.from, to, valid });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, local(e));
      if (pinch.current && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()] as [Point, Point];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const z = zoomAt(pinch.current.vp, pinch.current.mid, pinch.current.vp.zoom * (dist / pinch.current.dist));
        store.setViewport({ zoom: z.zoom, x: z.x + (mid.x - pinch.current.mid.x), y: z.y + (mid.y - pinch.current.mid.y) });
        return;
      }
    }
    if (!drag.current) return;
    latest.current = { clientX: e.clientX, clientY: e.clientY };
    if (!raf.current) raf.current = requestAnimationFrame(applyMove);
  };

  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
    const d = drag.current;
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    if (!d) return;
    latest.current = { clientX: e.clientX, clientY: e.clientY };
    if (!cancelled) applyMove();
    drag.current = null;
    setPanning(false);

    if (d.kind === 'nodes') {
      if (cancelled) store.cancelDrag();
      else if (d.moved) store.endDrag();
      else if (d.nodeId) {
        if (d.collapseTo) store.selectNodes([d.collapseTo]);
        const now = Date.now();
        const prev = lastTap.current;
        if (prev && prev.id === d.nodeId && now - prev.time < DOUBLE_TAP_MS) {
          lastTap.current = null;
          ui.editNode(d.nodeId);
        } else lastTap.current = { id: d.nodeId, time: now };
      }
    } else if (d.kind === 'marquee') {
      setMarquee(null);
    } else if (d.kind === 'connect') {
      const hover = store.getState().connecting?.hover ?? null;
      setPreview(null);
      store.setConnecting(null);
      if (!cancelled && hover) {
        store.connect({ source: d.source, sourcePort: d.sourcePort, target: hover, targetPort: 'in' });
      }
    }
  };

  // ------------------------------------------------------------
  // パレットからのドラッグ＆ドロップ
  // ------------------------------------------------------------
  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(PALETTE_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(PALETTE_MIME);
    if (!isNodeType(type)) return;
    e.preventDefault();
    store.addNode(type, world(local(e)));
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const nodeEl = (e.target as Element).closest<HTMLElement>('[data-node-id]');
    const nodeId = nodeEl?.dataset.nodeId ?? null;
    if (nodeId && !store.getState().selection.nodes.includes(nodeId)) store.selectNodes([nodeId]);
    const p = local(e);
    setMenu({ x: p.x, y: p.y, world: world(p), nodeId });
  };

  const grid = 24 * viewport.zoom;
  const cls = ['canvas'];
  if (panAllowed) cls.push('is-pan-ready');
  if (panning) cls.push('is-panning');
  if (connecting) cls.push('is-connecting');

  return (
    <div
      ref={ref}
      className={cls.join(' ')}
      style={{
        backgroundSize: `${grid}px ${grid}px, ${grid * 5}px ${grid * 5}px, ${grid * 5}px ${grid * 5}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
      }}
      data-testid="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
    >
      <div className="world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }} data-testid="world">
        <GroupLayer />
        <EdgeLayer preview={preview} />
        <NodesLayer />
        <EdgeActions />
      </div>
      {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const store = useStore();
  const selection = useEditor((s) => s.selection);
  const hasStart = useEditor((s) => s.graph.nodes.some((n) => n.type === 'start'));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const multiple = selection.nodes.length >= 2;
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }} data-no-canvas>
      {menu.nodeId ? (
        <>
          <button role="menuitem" onClick={run(() => store.duplicateSelection())}>
            <Icon name="copy" size={15} /> 複製<kbd>⌘D</kbd>
          </button>
          {multiple && (
            <button role="menuitem" onClick={run(() => store.groupSelection())}>
              <Icon name="group" size={15} /> グループ化<kbd>⌘G</kbd>
            </button>
          )}
          <button role="menuitem" className="danger" onClick={run(() => store.deleteSelection())}>
            <Icon name="trash" size={15} /> 削除<kbd>Del</kbd>
          </button>
        </>
      ) : (
        <>
          <div className="context-menu__title">ここにノードを追加</div>
          {PALETTE_ORDER.map((t: NodeType) => (
            <button key={t} role="menuitem" disabled={t === 'start' && hasStart} onClick={run(() => store.addNode(t, menu.world))}>
              <Icon name={NODE_ICON[t]!} size={15} /> {NODE_SPECS[t].label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
