import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorState, EditorStore } from './editorStore';

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext が見つかりません');
  return store;
}

/** セレクタが返す値は参照が安定している（プリミティブか不変データ）ものにすること */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
