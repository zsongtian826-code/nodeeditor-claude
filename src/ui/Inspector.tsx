import { useEffect, useRef } from 'react';
import { getIndex, outputKey } from '../core/graph';
import { NODE_SPECS } from '../core/nodeSpec';
import type { Issue } from '../core/validate';
import { useEditor, useStore } from '../state/useEditor';
import { Icon, NODE_ICON } from './icons';
import { useIssueList } from './UiContext';

export type InspectorTab = 'detail' | 'problems';

export function Inspector({
  tab,
  onTab,
  focusToken,
  open,
  onClose,
}: {
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  focusToken: number;
  /** 画面が狭いとき、下から出るシートとして開いているか */
  open: boolean;
  onClose: () => void;
}) {
  const issues = useIssueList();
  return (
    <aside className={`inspector${open ? ' is-open' : ''}`} aria-label="詳細パネル">
      <div className="inspector__tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'is-active' : ''} onClick={() => onTab('detail')}>
          詳細
        </button>
        <button role="tab" aria-selected={tab === 'problems'} className={tab === 'problems' ? 'is-active' : ''} onClick={() => onTab('problems')}>
          検証
          {issues.length > 0 ? <span className="count-badge count-badge--warn">{issues.length}</span> : <span className="count-badge count-badge--ok">✓</span>}
        </button>
        <button className="inspector__close icon-btn" onClick={onClose} aria-label="パネルを閉じる">
          <Icon name="chevronDown" size={16} />
        </button>
      </div>
      <div className="inspector__body" role="tabpanel">
        {tab === 'problems' ? <ProblemsList issues={issues} /> : <DetailPanel focusToken={focusToken} issues={issues} onShowProblems={() => onTab('problems')} />}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------

export function ProblemsList({ issues }: { issues: readonly Issue[] }) {
  const store = useStore();
  if (issues.length === 0) {
    return (
      <div className="empty-state ok">
        <Icon name="check" size={22} />
        <p>問題は見つかりませんでした。</p>
        <small>開始から終了まで、すべてのノードがつながっています。</small>
      </div>
    );
  }
  return (
    <div>
      <p className="muted">編集の途中でも保存はできます。気になる項目をクリックすると、該当のノードへ移動します。</p>
      <ul className="problems" aria-label="検証結果">
        {issues.map((i, n) => (
          <li key={`${i.code}-${i.nodeId ?? ''}-${i.port ?? ''}-${n}`}>
            <button className="problem" disabled={!i.nodeId} onClick={() => i.nodeId && store.focusNode(i.nodeId)}>
              <Icon name="warning" size={15} />
              <span>{i.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailPanel({ focusToken, issues, onShowProblems }: { focusToken: number; issues: readonly Issue[]; onShowProblems: () => void }) {
  const selection = useEditor((s) => s.selection);
  if (selection.edge) return <EdgePanel id={selection.edge} />;
  if (selection.group) return <GroupPanel id={selection.group} />;
  if (selection.nodes.length === 1) return <NodePanel id={selection.nodes[0]!} focusToken={focusToken} />;
  if (selection.nodes.length > 1) return <MultiPanel ids={selection.nodes} />;
  return <ProjectPanel issueCount={issues.length} onShowProblems={onShowProblems} />;
}

function ProjectPanel({ issueCount, onShowProblems }: { issueCount: number; onShowProblems: () => void }) {
  const counts = useEditor((s) => `${s.graph.nodes.length},${s.graph.edges.length},${s.graph.groups.length}`);
  const [n, e, g] = counts.split(',');
  return (
    <div>
      <h2 className="panel-title">プロジェクト</h2>
      <dl className="stats">
        <div><dt>ノード</dt><dd>{n}</dd></div>
        <div><dt>接続</dt><dd>{e}</dd></div>
        <div><dt>グループ</dt><dd>{g}</dd></div>
      </dl>
      {issueCount > 0 && (
        <button className="notice-button" onClick={onShowProblems}>
          <Icon name="warning" size={15} /> {issueCount} 件の検証メッセージ
        </button>
      )}
      <h3 className="panel-subtitle">操作のヒント</h3>
      <ul className="tips">
        <li>ノードを選ぶと、ここで内容を編集できます。</li>
        <li><b>出力ポート</b>（右側の●）から<b>入力ポート</b>へドラッグして接続します。</li>
        <li>空白をドラッグで<b>範囲選択</b>。<kbd>Space</kbd>+ドラッグ、または中ボタンで<b>画面移動</b>。</li>
        <li>ホイールでズーム（40〜200%）。<kbd>F</kbd>で全体表示。</li>
        <li>複数選択して<kbd>Ctrl/⌘</kbd>+<kbd>G</kbd>でグループ化。</li>
        <li>ノードをダブルクリックでタイトル編集。</li>
        <li>スマートフォン: 1本指で移動、2本指でズーム。複数選択ボタンで範囲選択。</li>
      </ul>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  inputRef,
  multiline,
  placeholder,
  rows = 5,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
  testId?: string;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {multiline ? (
        <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      ) : (
        <input ref={inputRef} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      )}
    </label>
  );
}

function NodePanel({ id, focusToken }: { id: string; focusToken: number }) {
  const store = useStore();
  const node = useEditor((s) => getIndex(s.graph).nodeById.get(id));
  const groupTitle = useEditor((s) => {
    const gid = getIndex(s.graph).groupOfNode.get(id);
    return gid ? JSON.stringify([gid, s.graph.groups.find((g) => g.id === gid)?.title ?? '']) : '';
  });
  const links = useEditor((s) => {
    const idx = getIndex(s.graph);
    const n = idx.nodeById.get(id);
    if (!n) return '';
    const outs = NODE_SPECS[n.type].outputs.map((p) => {
      const e = idx.edgeByOutput.get(outputKey(id, p));
      const t = e ? idx.nodeById.get(e.target) : undefined;
      return [p, e?.id ?? '', t ? t.title || '(無題)' : ''];
    });
    return JSON.stringify([idx.incoming.get(id)?.length ?? 0, outs]);
  });
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusToken > 0) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [focusToken]);

  if (!node) return null;
  const spec = NODE_SPECS[node.type];
  const [incoming, outLines] = JSON.parse(links) as [number, [string, string, string][]];
  const [gid, gtitle] = groupTitle ? (JSON.parse(groupTitle) as [string, string]) : ['', ''];

  return (
    <div>
      <div className="panel-head">
        <span className={`type-chip type-chip--${node.type}`}>
          <Icon name={NODE_ICON[node.type]!} size={14} /> {spec.label}
        </span>
        <code className="id-tag">{node.id}</code>
      </div>
      <TextField label="タイトル" value={node.title} onChange={(v) => store.updateNode(id, { title: v })} inputRef={titleRef} testId="field-title" />
      <TextField
        label={spec.contentLabel}
        value={node.content}
        onChange={(v) => store.updateNode(id, { content: v })}
        multiline
        placeholder={spec.contentPlaceholder}
        testId="field-content"
      />

      <div className="field-row">
        <label className="field">
          <span className="field__label">X</span>
          <input type="number" value={Math.round(node.x)} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && store.updateNode(id, { x: e.target.valueAsNumber })} />
        </label>
        <label className="field">
          <span className="field__label">Y</span>
          <input type="number" value={Math.round(node.y)} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && store.updateNode(id, { y: e.target.valueAsNumber })} />
        </label>
      </div>

      {node.type !== 'note' && (
        <section className="links">
          <h3 className="panel-subtitle">接続</h3>
          {spec.hasInput && <div className="link-row"><span>入力</span><b>{incoming} 本</b></div>}
          {outLines.map(([port, edgeId, target]) => {
            const label = port === 'yes' ? 'Yes' : port === 'no' ? 'No' : '出力';
            return (
              <div key={port} className={`link-row link-row--${port}`}>
                <span className="link-row__port">{label}</span>
                {edgeId ? (
                  <>
                    <b className="link-row__target">→ {target}</b>
                    <button className="mini-btn" onClick={() => store.deleteEdge(edgeId)} aria-label={`${label}の接続を削除`}>
                      切断
                    </button>
                  </>
                ) : (
                  <b className="link-row__none">未接続</b>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="link-row">
        <span>所属グループ</span>
        {gid ? <button className="mini-btn" onClick={() => store.selectGroup(gid)}>{gtitle || '(無題)'}</button> : <b className="muted">なし</b>}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={() => store.duplicateSelection()} disabled={!spec.removable}>
          <Icon name="copy" size={15} /> 複製
        </button>
        <button className="btn btn--danger" onClick={() => store.deleteSelection()} disabled={!spec.removable}>
          <Icon name="trash" size={15} /> 削除
        </button>
      </div>
      {!spec.removable && <p className="muted small">開始ノードは1つだけ必要なため、削除・複製できません。</p>}
    </div>
  );
}

function MultiPanel({ ids }: { ids: string[] }) {
  const store = useStore();
  const titles = useEditor((s) => {
    const idx = getIndex(s.graph);
    return JSON.stringify(ids.map((id) => [id, idx.nodeById.get(id)?.title ?? '']));
  });
  const anyGrouped = useEditor((s) => ids.some((id) => getIndex(s.graph).groupOfNode.has(id)));
  return (
    <div>
      <h2 className="panel-title">{ids.length} 個のノードを選択中</h2>
      <p className="muted">まとめて移動できます。ドラッグすると選択したノードが一緒に動きます。</p>
      <div className="btn-row btn-row--wrap">
        <button className="btn btn--primary" onClick={() => store.groupSelection()} disabled={anyGrouped}>
          <Icon name="group" size={15} /> グループ化
        </button>
        <button className="btn" onClick={() => store.duplicateSelection()}>
          <Icon name="copy" size={15} /> 複製
        </button>
        <button className="btn btn--danger" onClick={() => store.deleteSelection()}>
          <Icon name="trash" size={15} /> 削除
        </button>
      </div>
      {anyGrouped && <p className="muted small">すでにグループに入っているノードが含まれています（1つのノードは1つのグループにだけ所属できます）。</p>}
      <ul className="member-list">
        {(JSON.parse(titles) as [string, string][]).map(([id, title]) => {
          return (
            <li key={id}>
              <button className="member" onClick={() => store.selectNodes([id])}>
                {title || '(無題)'} <code>{id}</code>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupPanel({ id }: { id: string }) {
  const store = useStore();
  const group = useEditor((s) => s.graph.groups.find((g) => g.id === id));
  const members = useEditor((s) => {
    const g = s.graph.groups.find((x) => x.id === id);
    const idx = getIndex(s.graph);
    return JSON.stringify(g ? g.nodeIds.map((n) => [n, idx.nodeById.get(n)?.title ?? '']) : []);
  });
  if (!group) return null;
  return (
    <div>
      <div className="panel-head">
        <span className="type-chip type-chip--group">
          <Icon name="group" size={14} /> グループ
        </span>
        <code className="id-tag">{group.id}</code>
      </div>
      <TextField label="グループ名" value={group.title} onChange={(v) => store.renameGroup(id, v)} testId="field-group-title" />
      <h3 className="panel-subtitle">所属ノード（クリックで個別に編集）</h3>
      <ul className="member-list">
        {(JSON.parse(members) as [string, string][]).map(([nid, title]) => {
          return (
            <li key={nid}>
              <button className="member" onClick={() => store.selectNodes([nid])}>
                {title || '(無題)'} <code>{nid}</code>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="btn-row">
        <button className="btn" onClick={() => store.ungroup(id)}>
          <Icon name="ungroup" size={15} /> グループ解除
        </button>
      </div>
      <p className="muted small">解除してもノードと接続は削除されません。</p>
    </div>
  );
}

function EdgePanel({ id }: { id: string }) {
  const store = useStore();
  const info = useEditor((s) => {
    const idx = getIndex(s.graph);
    const e = idx.edgeById.get(id);
    if (!e) return '';
    const a = idx.nodeById.get(e.source);
    const b = idx.nodeById.get(e.target);
    return JSON.stringify([a?.title ?? e.source, e.sourcePort, b?.title ?? e.target]);
  });
  if (!info) return null;
  const [from, port, to] = JSON.parse(info) as [string, string, string];
  const label = port === 'yes' ? 'Yes' : port === 'no' ? 'No' : '出力';
  return (
    <div>
      <div className="panel-head">
        <span className="type-chip type-chip--edge">接続</span>
        <code className="id-tag">{id}</code>
      </div>
      <div className="edge-info">
        <div><span>から</span><b>{from}</b> <em className={`port-tag port-tag--${port}`}>{label}</em></div>
        <div><span>まで</span><b>{to}</b></div>
      </div>
      <div className="btn-row">
        <button className="btn btn--danger" onClick={() => store.deleteEdge(id)}>
          <Icon name="trash" size={15} /> 接続を削除
        </button>
      </div>
    </div>
  );
}
