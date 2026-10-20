import { useEffect } from 'react';
import type { EditorStore } from '../state/editorStore';
import type { Tool } from './UiContext';

export interface ShortcutHandlers {
  onHelp(): void;
  onTool(t: Tool): void;
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useShortcuts(store: EditorStore, h: ShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal')) return; // ダイアログ表示中はアプリのショートカットを止める
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Undo/Redo は入力欄の中でも、アプリの履歴として扱う（編集内容は履歴にまとめて入っているため）
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        store.notify('success', '変更は自動で保存されています');
        return;
      }
      if (isTyping(e.target)) return;

      if (mod && key === 'd') {
        e.preventDefault();
        store.duplicateSelection();
      } else if (mod && key === 'g') {
        e.preventDefault();
        const sel = store.getState().selection;
        if (e.shiftKey) {
          if (sel.group) store.ungroup(sel.group);
          else {
            const gid = sel.nodes.length > 0 ? store.getState().graph.groups.find((g) => sel.nodes.every((n) => g.nodeIds.includes(n)))?.id : undefined;
            if (gid) store.ungroup(gid);
          }
        } else store.groupSelection();
      } else if (mod && key === 'a') {
        e.preventDefault();
        store.selectAll();
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        store.deleteSelection();
      } else if (!mod && e.key === 'Escape') {
        store.clearSelection();
      } else if (!mod && e.key.startsWith('Arrow')) {
        if (store.getState().selection.nodes.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 32 : 8;
        store.nudgeSelection(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      } else if (!mod && key === 'f') {
        store.fitView();
      } else if (!mod && (e.key === '+' || e.key === '=')) {
        store.zoomBy(1.25);
      } else if (!mod && (e.key === '-' || e.key === '_')) {
        store.zoomBy(1 / 1.25);
      } else if (!mod && key === 'v') {
        h.onTool('select');
      } else if (!mod && key === 'h') {
        h.onTool('pan');
      } else if (!mod && e.key === '?') {
        h.onHelp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, h]);
}
