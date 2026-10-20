import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleGraph } from '../core/sample';
import { linearGraph } from '../test/builders';
import { EditorStore } from './editorStore';
import { CORRUPT_BACKUP_KEY, STORAGE_KEY, VIEWPORT_KEY, loadProject, saveProject, startAutosave, type StorageLike } from './persistence';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe('localStorage への保存と復元', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('何も保存されていなければ empty', () => {
    expect(loadProject(storage)).toEqual({ status: 'empty' });
  });

  it('ノード・接続・位置・グループ・表示位置を保存して復元できる', () => {
    const graph = createSampleGraph();
    expect(saveProject(storage, graph, { x: 10, y: 20, zoom: 0.8 })).toBe(true);
    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.schemaVersion).toBe(1);
    const r = loadProject(storage);
    expect(r).toEqual({ status: 'ok', graph, viewport: { x: 10, y: 20, zoom: 0.8 } });
  });

  it('壊れた JSON でもクラッシュせず corrupt を返し、元データを退避する', () => {
    storage.setItem(STORAGE_KEY, '{ broken');
    const r = loadProject(storage);
    expect(r.status).toBe('corrupt');
    expect(storage.data.get(CORRUPT_BACKUP_KEY)).toBe('{ broken');
  });

  it('構造が不正なデータ（循環など）も corrupt 扱い', () => {
    const doc = { schemaVersion: 1, nodes: [{ id: 'a', type: 'zzz', x: 0, y: 0, title: '', content: '' }], edges: [], groups: [] };
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
    expect(loadProject(storage).status).toBe('corrupt');
  });

  it('表示位置が壊れていても、グラフは復元できる', () => {
    saveProject(storage, linearGraph(), { x: 0, y: 0, zoom: 1 });
    storage.setItem(VIEWPORT_KEY, 'not-json');
    const r = loadProject(storage);
    expect(r).toMatchObject({ status: 'ok', viewport: null });
  });

  it('容量超過などで書き込みに失敗しても例外を投げない', () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(saveProject(full, linearGraph(), { x: 0, y: 0, zoom: 1 })).toBe(false);
  });

  it('読み取りが例外を投げる環境でも empty として起動できる', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadProject(broken)).toEqual({ status: 'empty' });
  });
});

describe('自動保存', () => {
  it('編集後に一定時間で保存され、連続編集はまとめて1回', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const setItem = vi.spyOn(storage, 'setItem');
    const store = new EditorStore(linearGraph());
    const auto = startAutosave(store, storage, undefined, 300);
    store.addNode('note', { x: 0, y: 300 });
    store.addNode('note', { x: 0, y: 500 });
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(350);
    const r = loadProject(storage);
    expect(r.status === 'ok' && r.graph.nodes).toHaveLength(6);
    // JSON 本体とビューポートで setItem 2回
    expect(setItem).toHaveBeenCalledTimes(2);
    auto.dispose();
    vi.useRealTimers();
  });

  it('flush（ページ離脱時）で待たずに保存される', () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const store = new EditorStore(linearGraph());
    const auto = startAutosave(store, storage, undefined, 5000);
    store.addNode('note', { x: 0, y: 300 });
    auto.flush();
    expect(loadProject(storage).status).toBe('ok');
    auto.dispose();
    vi.useRealTimers();
  });

  it('保存に失敗したら onError が呼ばれる', () => {
    vi.useFakeTimers();
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {},
    };
    const onError = vi.fn();
    const store = new EditorStore(linearGraph());
    const auto = startAutosave(store, storage, onError, 10);
    store.addNode('note', { x: 0, y: 300 });
    vi.advanceTimersByTime(20);
    expect(onError).toHaveBeenCalled();
    auto.dispose();
    vi.useRealTimers();
  });
});
