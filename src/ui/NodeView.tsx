import { memo } from 'react';
import { portOffset } from '../core/geometry';
import { checkConnection, getIndex, outputKey } from '../core/graph';
import { NODE_SPECS } from '../core/nodeSpec';
import type { OutputPortId } from '../core/types';
import { useEditor } from '../state/useEditor';
import { Icon, NODE_ICON } from './icons';
import { useNodeIssues } from './UiContext';

const PORT_LABEL: Record<OutputPortId, { text: string; icon: 'check' | 'cross' | null }> = {
  out: { text: '', icon: null },
  yes: { text: 'Yes', icon: 'check' },
  no: { text: 'No', icon: 'cross' },
};

function InputPort({ nodeId }: { nodeId: string }) {
  const node = useEditor((s) => getIndex(s.graph).nodeById.get(nodeId));
  const connected = useEditor((s) => (getIndex(s.graph).incoming.get(nodeId)?.length ?? 0) > 0);
  // 接続ドラッグ中だけ、この入力ポートに繋げられるかを調べて見せる
  const mode = useEditor((s) => {
    const c = s.connecting;
    if (!c) return 'idle';
    const r = checkConnection(s.graph, { source: c.source, sourcePort: c.sourcePort, target: nodeId, targetPort: 'in' });
    if (!r.ok) return c.hover === nodeId ? 'rejected' : 'invalid';
    return c.hover === nodeId ? 'target' : 'valid';
  });
  if (!node) return null;
  const off = portOffset(node, 'in');
  return (
    <div
      className={`port port--in is-${mode}${connected ? ' is-connected' : ''}`}
      data-port-in={nodeId}
      style={{ top: off.y }}
      title="入力"
    />
  );
}

function OutputPort({ nodeId, port }: { nodeId: string; port: OutputPortId }) {
  const node = useEditor((s) => getIndex(s.graph).nodeById.get(nodeId));
  const connected = useEditor((s) => getIndex(s.graph).edgeByOutput.has(outputKey(nodeId, port)));
  const active = useEditor((s) => s.connecting?.source === nodeId && s.connecting.sourcePort === port);
  const issues = useNodeIssues(nodeId);
  if (!node) return null;
  const off = portOffset(node, port);
  const dangling = issues?.some((i) => i.port === port) ?? false;
  const label = PORT_LABEL[port];
  return (
    <>
      {label.icon && (
        <span className={`port-label port-label--${port}`} style={{ top: off.y }}>
          <Icon name={label.icon} size={11} strokeWidth={3} />
          {label.text}
        </span>
      )}
      <div
        className={`port port--out port--${port}${connected ? ' is-connected' : ''}${active ? ' is-active' : ''}${dangling ? ' is-dangling' : ''}`}
        data-port-out={port}
        data-node={nodeId}
        style={{ top: off.y }}
        title={port === 'out' ? '出力（ドラッグして接続）' : `${label.text} の出力（ドラッグして接続）`}
      />
    </>
  );
}

export const NodeView = memo(function NodeView({ id }: { id: string }) {
  const node = useEditor((s) => getIndex(s.graph).nodeById.get(id));
  const selected = useEditor((s) => s.selection.nodes.includes(id));
  const grouped = useEditor((s) => getIndex(s.graph).groupOfNode.has(id));
  const issues = useNodeIssues(id);
  if (!node) return null;
  const spec = NODE_SPECS[node.type];
  const title = node.title.trim() === '' ? '(無題)' : node.title;
  const unreachable = issues?.some((i) => i.code === 'unreachable');

  return (
    <div
      className={`node node--${node.type}${selected ? ' is-selected' : ''}${grouped ? ' is-grouped' : ''}${unreachable ? ' is-unreachable' : ''}`}
      data-node-id={id}
      role="group"
      aria-label={`${spec.label}ノード: ${title}`}
      aria-selected={selected}
      style={{ transform: `translate(${node.x}px, ${node.y}px)`, width: spec.width, height: spec.height }}
    >
      <div className="node__inner">
        <div className="node__head">
          <span className="node__badge">
            <Icon name={NODE_ICON[node.type]!} size={13} />
          </span>
          <span className="node__kind">{spec.label}</span>
          {issues && issues.length > 0 && (
            <span className="node__warn" title={issues.map((i) => i.message).join('\n')}>
              <Icon name="warning" size={13} />
              {issues.length}
            </span>
          )}
        </div>
        <div className="node__title">{title}</div>
        {node.content.trim() !== '' && node.type !== 'start' && node.type !== 'end' && <div className="node__content">{node.content}</div>}
        {node.type === 'condition' && node.content.trim() === '' && <div className="node__content node__content--empty">条件文を設定してください</div>}
      </div>
      {spec.hasInput && <InputPort nodeId={id} />}
      {spec.outputs.map((p) => (
        <OutputPort key={p} nodeId={id} port={p} />
      ))}
    </div>
  );
});

/** ノードID一覧（位置が変わっても文字列が変わらないので、ドラッグ中に一覧が再描画されない） */
export function NodesLayer() {
  const key = useEditor((s) => s.graph.nodes.map((n) => n.id).join('\n'));
  const ids = key === '' ? [] : key.split('\n');
  return (
    <div className="nodes-layer">
      {ids.map((id) => (
        <NodeView key={id} id={id} />
      ))}
    </div>
  );
}
