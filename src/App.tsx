import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { generateMarkdown, MARKDOWN_FILE_NAME } from './core/markdown';
import { createBlankGraph } from './core/graphOps';
import { createSampleGraph } from './core/sample';
import { parseGraphJson, serializeGraph } from './core/schema';
import { issuesByNode, validateWorkflow, type Issue } from './core/validate';
import type { EditorStore } from './state/editorStore';
import { StoreContext, useEditor } from './state/useEditor';
import { Canvas } from './ui/Canvas';
import { ConfirmDialog, ErrorDialog, MarkdownDialog, ShortcutsDialog } from './ui/Dialogs';
import { downloadText, readFileText } from './ui/fileIO';
import { Inspector, type InspectorTab } from './ui/Inspector';
import { Minimap } from './ui/Minimap';
import { Palette } from './ui/Palette';
import { Toast } from './ui/Toast';
import { Toolbar, type ProjectActions } from './ui/Toolbar';
import { IssuesContext, ToolContext, UiActionsContext, type IssueState, type Tool, type UiActions } from './ui/UiContext';
import { useShortcuts } from './ui/useShortcuts';
import { ZoomControls } from './ui/ZoomControls';

type Theme = 'light' | 'dark';
const THEME_KEY = 'flowloom:theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* 無視 */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

type Dialog =
  | { kind: 'confirm'; title: string; message: ReactNode; confirmLabel: string; onConfirm: () => void }
  | { kind: 'error'; title: string; errors: string[] }
  | { kind: 'markdown'; text: string; issueCount: number }
  | { kind: 'shortcuts' };

/**
 * 検証結果を提供する。グラフ全体を購読するのはここだけにして、
 * ドラッグ中に App 全体が再描画されないようにしている。検証自体は低優先で遅延実行する。
 */
function IssuesProvider({ children }: { children: ReactNode }) {
  const graph = useEditor((s) => s.graph);
  const deferred = useDeferredValue(graph);
  const prev = useRef<{ sig: string; value: IssueState } | null>(null);
  const value = useMemo(() => {
    const list: Issue[] = validateWorkflow(deferred);
    const sig = JSON.stringify(list);
    if (prev.current?.sig === sig) return prev.current.value;
    const next: IssueState = { list, byNode: issuesByNode(list) };
    prev.current = { sig, value: next };
    return next;
  }, [deferred]);
  return <IssuesContext.Provider value={value}>{children}</IssuesContext.Provider>;
}

export function App({ store }: { store: EditorStore }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [tool, setTool] = useState<Tool>('select');
  const [multi, setMulti] = useState(false);
  const [tab, setTab] = useState<InspectorTab>('detail');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [showMap, setShowMap] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fitted = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 保存できなくても動作には影響しない */
    }
  }, [theme]);

  // 初回表示: 保存された表示位置が無ければ全体表示にする
  useEffect(() => {
    if (fitted.current) return;
    // 子（Canvas）が先に大きさを知らせている場合もあるので、購読の前にも1回調べる
    const tryFit = () => {
      const s = store.getState();
      if (fitted.current || s.canvasSize.width < 50) return;
      fitted.current = true;
      if (s.viewport.zoom === 1 && s.viewport.x === 0 && s.viewport.y === 0) store.fitView();
      unsub();
    };
    const unsub = store.subscribe(tryFit);
    tryFit();
    return unsub;
  }, [store]);

  const confirmReplace = useCallback(
    (title: string, detail: string, run: () => void) => {
      const g = store.graph;
      setDialog({
        kind: 'confirm',
        title,
        confirmLabel: '置き換える',
        message: (
          <>
            <p>{detail}</p>
            <p className="callout callout--warn">
              現在のプロジェクト（ノード {g.nodes.length} 個・接続 {g.edges.length} 本・グループ {g.groups.length} 個）は失われ、元に戻せません。
            </p>
            <p className="muted small">必要なら、先に「JSON を書き出す」で保存してください。</p>
          </>
        ),
        onConfirm: () => {
          setDialog(null);
          run();
        },
      });
    },
    [store],
  );

  const actions: ProjectActions = useMemo(
    () => ({
      onNew: () =>
        confirmReplace('新規プロジェクトを作成', '空のプロジェクト（開始ノードだけ）を作成します。', () => {
          store.replaceGraph(createBlankGraph());
          store.notify('success', '新規プロジェクトを作成しました');
        }),
      onLoadSample: () =>
        confirmReplace('サンプルを読み込む', 'サンプルのワークフローで置き換えます。', () => {
          store.replaceGraph(createSampleGraph());
          store.notify('success', 'サンプルを読み込みました');
        }),
      onImport: () => fileInput.current?.click(),
      onExportJson: () => {
        downloadText('workflow.json', serializeGraph(store.graph), 'application/json');
        store.notify('success', 'workflow.json を書き出しました');
      },
      onExportMarkdown: () => {
        const text = generateMarkdown(store.graph);
        setDialog({ kind: 'markdown', text, issueCount: validateWorkflow(store.graph).length });
      },
    }),
    [store, confirmReplace],
  );

  const onFileChosen = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ''; // 同じファイルを続けて選べるように
    if (!file) return;
    let text: string;
    try {
      text = await readFileText(file);
    } catch (e) {
      setDialog({ kind: 'error', title: '読み込めませんでした', errors: [e instanceof Error ? e.message : String(e)] });
      return;
    }
    const parsed = parseGraphJson(text);
    if (!parsed.ok) {
      setDialog({ kind: 'error', title: 'JSON を読み込めませんでした', errors: parsed.errors });
      return;
    }
    const { graph } = parsed;
    confirmReplace('JSON を読み込む', `「${file.name}」（ノード ${graph.nodes.length} 個・接続 ${graph.edges.length} 本）で現在のプロジェクトを置き換えます。`, () => {
      store.replaceGraph(graph);
      store.notify('success', `${file.name} を読み込みました`);
    });
  };

  const uiActions: UiActions = useMemo(
    () => ({
      editNode: () => {
        setTab('detail');
        setSheetOpen(true);
        setFocusToken((t) => t + 1);
      },
      toggleMultiSelect: () => setMulti((v) => !v),
    }),
    [],
  );

  const shortcutHandlers = useMemo(
    () => ({ onHelp: () => setDialog({ kind: 'shortcuts' }), onTool: setTool }),
    [],
  );
  useShortcuts(store, shortcutHandlers);

  const toolValue = useMemo(() => ({ tool, multi }), [tool, multi]);

  return (
    <StoreContext.Provider value={store}>
      <UiActionsContext.Provider value={uiActions}>
        <ToolContext.Provider value={toolValue}>
          <IssuesProvider>
            <div className="app">
              <Toolbar
                actions={actions}
                theme={theme}
                onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                onHelp={shortcutHandlers.onHelp}
                onToggleInspector={() => setSheetOpen((v) => !v)}
                onShowProblems={() => {
                  setTab('problems');
                  setSheetOpen(true);
                }}
              />
              <main className="workspace">
                <Palette />
                <section className="stage" aria-label="キャンバス">
                  <Canvas />
                  <ZoomControls onTool={setTool} showMap={showMap} onToggleMap={() => setShowMap((v) => !v)} />
                  {showMap && <Minimap />}
                </section>
                <Inspector tab={tab} onTab={setTab} focusToken={focusToken} open={sheetOpen} onClose={() => setSheetOpen(false)} />
              </main>
              <Toast />
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                data-testid="import-input"
                onChange={(e) => void onFileChosen(e.target.files?.[0])}
              />
              {dialog?.kind === 'confirm' && (
                <ConfirmDialog title={dialog.title} message={dialog.message} confirmLabel={dialog.confirmLabel} onConfirm={dialog.onConfirm} onCancel={() => setDialog(null)} />
              )}
              {dialog?.kind === 'error' && <ErrorDialog title={dialog.title} errors={dialog.errors} onClose={() => setDialog(null)} />}
              {dialog?.kind === 'markdown' && (
                <MarkdownDialog
                  text={dialog.text}
                  issueCount={dialog.issueCount}
                  onClose={() => setDialog(null)}
                  onDownload={() => {
                    downloadText(MARKDOWN_FILE_NAME, dialog.text, 'text/markdown');
                    store.notify('success', `${MARKDOWN_FILE_NAME} を書き出しました`);
                  }}
                  onCopy={() => {
                    void navigator.clipboard?.writeText(dialog.text).then(
                      () => store.notify('success', 'Markdown をコピーしました'),
                      () => store.notify('error', 'コピーできませんでした'),
                    );
                  }}
                />
              )}
              {dialog?.kind === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
            </div>
          </IssuesProvider>
        </ToolContext.Provider>
      </UiActionsContext.Provider>
    </StoreContext.Provider>
  );
}
