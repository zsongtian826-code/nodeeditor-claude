import { memo, useMemo } from 'react';
import { boundsOf } from '../core/geometry';
import { getIndex } from '../core/graph';
import { useEditor } from '../state/useEditor';

export const GROUP_PADDING = 28;
export const GROUP_HEADER = 30;

const GroupView = memo(function GroupView({ id }: { id: string }) {
  const title = useEditor((s) => s.graph.groups.find((g) => g.id === id)?.title ?? '');
  const count = useEditor((s) => s.graph.groups.find((g) => g.id === id)?.nodeIds.length ?? 0);
  const selected = useEditor((s) => s.selection.group === id);
  // 所属ノードの外接矩形。文字列にして、変化したときだけ再描画する
  const boundsKey = useEditor((s) => {
    const g = s.graph.groups.find((x) => x.id === id);
    if (!g) return '';
    const idx = getIndex(s.graph);
    const members = g.nodeIds.map((n) => idx.nodeById.get(n)).filter((n) => !!n);
    const b = boundsOf(members);
    return b ? `${b.x},${b.y},${b.width},${b.height}` : '';
  });
  const rect = useMemo(() => {
    if (!boundsKey) return null;
    const [x, y, w, h] = boundsKey.split(',').map(Number) as [number, number, number, number];
    return { x: x - GROUP_PADDING, y: y - GROUP_PADDING - GROUP_HEADER, w: w + GROUP_PADDING * 2, h: h + GROUP_PADDING * 2 + GROUP_HEADER };
  }, [boundsKey]);
  if (!rect) return null;
  return (
    <div
      className={`group${selected ? ' is-selected' : ''}`}
      style={{ transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.w, height: rect.h }}
    >
      <div className="group__header" data-group-id={id} style={{ height: GROUP_HEADER }} title="ドラッグでグループ全体を移動">
        <span className="group__title">{title.trim() === '' ? '(無題のグループ)' : title}</span>
        <span className="group__count">{count}</span>
      </div>
    </div>
  );
});

export function GroupLayer() {
  const key = useEditor((s) => s.graph.groups.map((g) => g.id).join('\n'));
  const ids = key === '' ? [] : key.split('\n');
  return (
    <div className="groups-layer">
      {ids.map((id) => (
        <GroupView key={id} id={id} />
      ))}
    </div>
  );
}
