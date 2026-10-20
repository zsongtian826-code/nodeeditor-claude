import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createSampleGraph } from './core/sample';
import { EditorStore } from './state/editorStore';
import { loadProject, startAutosave, type StorageLike } from './state/persistence';
import './styles/app.css';

/** localStorage が使えない環境でも動くように、メモリ上の代替を用意する */
function getStorage(): StorageLike {
  try {
    const s = window.localStorage;
    s.getItem('flowloom:probe');
    return s;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}

const storage = getStorage();
const loaded = loadProject(storage);
const store = new EditorStore(loaded.status === 'ok' ? loaded.graph : createSampleGraph(), loaded.status === 'ok' ? (loaded.viewport ?? undefined) : undefined);

if (loaded.status === 'corrupt') {
  store.notify('error', '保存データが壊れていたため読み込めませんでした。サンプルで起動しました（元のデータは退避してあります）');
  console.warn('保存データの検証エラー:', loaded.errors);
}

const autosave = startAutosave(store, storage, () => store.notify('error', '自動保存に失敗しました（保存容量が足りない可能性があります）。JSONの書き出しをおすすめします'));
// 開発・検証用の窓口（画面操作のテストから状態を直接確認できる）
Object.assign(window, { __flowloom: { store, autosave } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
