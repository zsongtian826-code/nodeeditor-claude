import { useEffect, useRef, useState } from 'react';
import { useEditor, useStore } from '../state/useEditor';
import { Icon, type IconName } from './icons';
import { useIssueList } from './UiContext';

export interface ProjectActions {
  onNew(): void;
  onLoadSample(): void;
  onImport(): void;
  onExportJson(): void;
  onExportMarkdown(): void;
}

function MenuItem({ icon, label, hint, onClick, danger }: { icon: IconName; label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" className={danger ? 'danger' : ''} onClick={onClick}>
      <Icon name={icon} size={16} />
      <span>{label}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}

function ProjectMenu({ actions }: { actions: ProjectActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="btn btn--ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="project-menu">
        <Icon name="file" size={16} />
        <span className="hide-narrow">プロジェクト</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <MenuItem icon="newfile" label="新規プロジェクト" onClick={run(actions.onNew)} />
          <MenuItem icon="sheet" label="サンプルを読み込む" onClick={run(actions.onLoadSample)} />
          <div className="menu__sep" role="separator" />
          <MenuItem icon="upload" label="JSON を読み込む…" onClick={run(actions.onImport)} />
          <MenuItem icon="download" label="JSON を書き出す" onClick={run(actions.onExportJson)} />
          <MenuItem icon="markdown" label="Markdown を書き出す…" onClick={run(actions.onExportMarkdown)} />
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  actions,
  theme,
  onToggleTheme,
  onHelp,
  onToggleInspector,
  onShowProblems,
}: {
  actions: ProjectActions;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onHelp: () => void;
  onToggleInspector: () => void;
  onShowProblems: () => void;
}) {
  const store = useStore();
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const issues = useIssueList();
  return (
    <header className="toolbar">
      <div className="brand" aria-label="Flowloom">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" className="brand__bg" />
          <path d="M8 10h6c4 0 4 12 8 12h2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="8" cy="10" r="3" fill="var(--c-start)" />
          <circle cx="24" cy="22" r="3" fill="var(--c-end)" />
        </svg>
        <span className="brand__name">Flowloom</span>
      </div>

      <div className="toolbar__group">
        <button className="icon-btn" disabled={!canUndo} onClick={() => store.undo()} aria-label="元に戻す" title="元に戻す (Ctrl/⌘+Z)" data-testid="undo">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => store.redo()} aria-label="やり直す" title="やり直す (Ctrl/⌘+Shift+Z)" data-testid="redo">
          <Icon name="redo" />
        </button>
      </div>

      <ProjectMenu actions={actions} />

      <button className="btn btn--ghost hide-narrow" onClick={() => store.autoLayout()} title="ノードを左から右へ整列します（元に戻せます）">
        <Icon name="layout" size={16} /> 自動整列
      </button>

      <div className="toolbar__spacer" />

      <button
        className={`problem-pill ${issues.length === 0 ? 'is-ok' : 'is-warn'}`}
        onClick={onShowProblems}
        title="検証結果を表示"
        data-testid="problem-pill"
        aria-label={issues.length === 0 ? '検証: 問題なし' : `検証: ${issues.length}件の問題`}
      >
        <Icon name={issues.length === 0 ? 'check' : 'warning'} size={14} />
        <span className="hide-narrow">{issues.length === 0 ? '問題なし' : `${issues.length} 件の問題`}</span>
        <span className="show-narrow">{issues.length === 0 ? '' : issues.length}</span>
      </button>

      <button className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え'} title="テーマ切り替え">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button className="icon-btn hide-narrow" onClick={onHelp} aria-label="ショートカット一覧" title="ショートカット一覧 (?)">
        <Icon name="keyboard" />
      </button>
      <button className="icon-btn show-narrow" onClick={onToggleInspector} aria-label="詳細パネルを開く" title="詳細パネル">
        <Icon name="sliders" />
      </button>
    </header>
  );
}
