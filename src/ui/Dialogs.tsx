import { useEffect, useRef, type ReactNode } from 'react';
import { MARKDOWN_FILE_NAME } from '../core/markdown';
import { Icon } from './icons';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // 最初の「キャンセル寄り」のボタンへ。無ければ先頭の操作要素へ
    const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('button, input, textarea');
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, a[href]')];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="cross" size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="modal__body">{message}</div>
      <footer className="modal__foot">
        <button className="btn" onClick={onCancel} data-autofocus>
          キャンセル
        </button>
        <button className="btn btn--danger" onClick={onConfirm} data-testid="confirm-ok">
          {confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}

export function ErrorDialog({ title, errors, onClose }: { title: string; errors: string[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal__body">
        <p>ファイルは読み込まれず、現在のプロジェクトはそのままです。</p>
        <ul className="error-list" data-testid="import-errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
      <footer className="modal__foot">
        <button className="btn btn--primary" onClick={onClose} data-autofocus>
          閉じる
        </button>
      </footer>
    </Modal>
  );
}

export function MarkdownDialog({ text, issueCount, onDownload, onCopy, onClose }: { text: string; issueCount: number; onDownload: () => void; onCopy: () => void; onClose: () => void }) {
  return (
    <Modal title="Markdown に書き出す" onClose={onClose} wide>
      <div className="modal__body">
        {issueCount > 0 ? (
          <p className="callout callout--warn" data-testid="md-warning">
            <Icon name="warning" size={15} /> 検証で {issueCount} 件の問題が見つかっています。内容は文書の「検証結果」にも記載されます。
          </p>
        ) : (
          <p className="callout callout--ok">
            <Icon name="check" size={15} /> 検証で問題は見つかりませんでした。
          </p>
        )}
        <pre className="md-preview" tabIndex={0} data-testid="md-preview">{text}</pre>
      </div>
      <footer className="modal__foot">
        <button className="btn" onClick={onCopy}>
          コピー
        </button>
        <button className="btn btn--primary" onClick={onDownload} data-autofocus data-testid="md-download">
          <Icon name="download" size={15} /> {MARKDOWN_FILE_NAME} をダウンロード
        </button>
      </footer>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['⌘/Ctrl + Z', '元に戻す (Undo)'],
  ['⌘/Ctrl + Shift + Z', 'やり直す (Redo)'],
  ['Delete / Backspace', '選択を削除'],
  ['⌘/Ctrl + D', '選択ノードを複製'],
  ['⌘/Ctrl + G', 'グループ化'],
  ['⌘/Ctrl + Shift + G', 'グループ解除'],
  ['⌘/Ctrl + A', 'すべて選択'],
  ['Shift / ⌘ + クリック', '選択に追加・解除'],
  ['矢印キー', '選択ノードを少し動かす（Shiftで大きく）'],
  ['空白をドラッグ', '範囲選択'],
  ['Space + ドラッグ / 中ボタン', '画面を移動（パン）'],
  ['ホイール', 'ズーム（40〜200%）'],
  ['F', '全体表示 (Fit View)'],
  ['+ / −', 'ズームイン / アウト'],
  ['V / H', '選択ツール / 手のひらツール'],
  ['Esc', '選択解除・操作のキャンセル'],
  ['?', 'このヘルプ'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="キーボードショートカット" onClose={onClose}>
      <div className="modal__body">
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <th scope="row">
                  <kbd>{k}</kbd>
                </th>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="modal__foot">
        <button className="btn btn--primary" onClick={onClose} data-autofocus>
          閉じる
        </button>
      </footer>
    </Modal>
  );
}
