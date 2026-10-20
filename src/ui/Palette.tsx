import { NODE_SPECS, PALETTE_ORDER } from '../core/nodeSpec';
import type { NodeType } from '../core/types';
import { useEditor, useStore } from '../state/useEditor';
import { PALETTE_MIME } from './Canvas';
import { Icon, NODE_ICON } from './icons';

/** ノード追加メニュー。クリックで画面中央に追加、キャンバスへドラッグして好きな位置にも置ける */
export function Palette({ onAdded }: { onAdded?: () => void }) {
  const store = useStore();
  const hasStart = useEditor((s) => s.graph.nodes.some((n) => n.type === 'start'));

  const add = (type: NodeType) => {
    store.addNode(type, store.viewCenter());
    onAdded?.();
  };

  return (
    <nav className="palette" aria-label="ノードを追加">
      <div className="palette__title">ノードを追加</div>
      <ul className="palette__list">
        {PALETTE_ORDER.map((type) => {
          const spec = NODE_SPECS[type];
          const disabled = type === 'start' && hasStart;
          return (
            <li key={type}>
              <button
                type="button"
                className={`palette__item palette__item--${type}`}
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(e) => {
                  e.dataTransfer.setData(PALETTE_MIME, type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => add(type)}
                title={disabled ? '開始ノードはすでに配置されています（1つだけ）' : `${spec.label}ノードを追加（キャンバスへドラッグでも配置できます）`}
                aria-label={`${spec.label}ノードを追加`}
                data-testid={`add-${type}`}
              >
                <span className="palette__icon">
                  <Icon name={NODE_ICON[type]!} size={18} />
                </span>
                <span className="palette__text">
                  <span className="palette__label">{spec.label}</span>
                  <span className="palette__sub">{disabled ? '配置済み' : spec.summary}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="palette__hint">クリックで追加、またはキャンバスへドラッグ。</p>
    </nav>
  );
}
