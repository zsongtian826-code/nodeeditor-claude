import { useContext } from 'react';
import { useEditor, useStore } from '../state/useEditor';
import { Icon } from './icons';
import { ToolContext, useUiActions, type Tool } from './UiContext';

export function ZoomControls({ onTool, showMap, onToggleMap }: { onTool: (t: Tool) => void; showMap: boolean; onToggleMap: () => void }) {
  const store = useStore();
  const ui = useUiActions();
  const { tool, multi } = useContext(ToolContext);
  const zoom = useEditor((s) => s.viewport.zoom);
  return (
    <div className="zoom-controls" data-no-canvas role="toolbar" aria-label="表示の操作">
      <div className="zoom-controls__group">
        <button className={`icon-btn${tool === 'select' ? ' is-on' : ''}`} onClick={() => onTool('select')} aria-pressed={tool === 'select'} aria-label="選択ツール (V)" title="選択ツール (V): 空白ドラッグで範囲選択">
          <Icon name="cursor" />
        </button>
        <button className={`icon-btn${tool === 'pan' ? ' is-on' : ''}`} onClick={() => onTool('pan')} aria-pressed={tool === 'pan'} aria-label="手のひらツール (H)" title="手のひらツール (H): ドラッグで画面を移動">
          <Icon name="move" />
        </button>
        <button className={`icon-btn touch-only${multi ? ' is-on' : ''}`} onClick={() => ui.toggleMultiSelect()} aria-pressed={multi} aria-label="複数選択モード" title="複数選択モード: タップで選択を追加、空白ドラッグで範囲選択">
          <Icon name="multi" />
        </button>
      </div>
      <div className="zoom-controls__group">
        <button className="icon-btn" onClick={() => store.zoomBy(1 / 1.25)} aria-label="ズームアウト" title="ズームアウト (−)">
          <Icon name="minus" />
        </button>
        <button className="zoom-value" onClick={() => store.setZoom(1)} aria-label="ズームを100%に戻す" title="クリックで100%" data-testid="zoom-value">
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={() => store.zoomBy(1.25)} aria-label="ズームイン" title="ズームイン (+)">
          <Icon name="plus" />
        </button>
        <button className="icon-btn" onClick={() => store.fitView()} aria-label="全体表示" title="全体表示 (F)">
          <Icon name="fit" />
        </button>
      </div>
      <button className={`icon-btn desktop-only${showMap ? ' is-on' : ''}`} onClick={onToggleMap} aria-pressed={showMap} aria-label="ミニマップの表示切替" title="ミニマップ">
        <Icon name="map" />
      </button>
    </div>
  );
}
