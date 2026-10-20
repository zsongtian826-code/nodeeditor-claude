import { useEffect } from 'react';
import { useEditor, useStore } from '../state/useEditor';
import { Icon } from './icons';

export function Toast() {
  const store = useStore();
  const notice = useEditor((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => store.dismissNotice(), notice.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [notice, store]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {notice && (
        <div key={notice.id} className={`toast toast--${notice.kind}`} data-testid="toast">
          <Icon name={notice.kind === 'error' ? 'warning' : 'check'} size={16} />
          <span>{notice.message}</span>
          <button className="toast__close" aria-label="通知を閉じる" onClick={() => store.dismissNotice()}>
            <Icon name="cross" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
