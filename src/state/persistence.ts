import type { Viewport } from '../core/geometry';
import { parseGraphJson, serializeGraph } from '../core/schema';
import type { Graph } from '../core/types';
import type { EditorStore } from './editorStore';

export const STORAGE_KEY = 'flowloom:project';
export const VIEWPORT_KEY = 'flowloom:viewport';
export const CORRUPT_BACKUP_KEY = 'flowloom:project:corrupt-backup';
export const AUTOSAVE_DELAY_MS = 300;

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; graph: Graph; viewport: Viewport | null }
  | { status: 'corrupt'; errors: string[] };

/** localStorage が使えない環境（プライベートモード等）でも落とさないための薄いラッパー */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readViewport(storage: StorageLike): Viewport | null {
  try {
    const raw = storage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Viewport>;
    if ([v.x, v.y, v.zoom].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return { x: v.x!, y: v.y!, zoom: v.zoom! };
    }
  } catch {
    /* 破損していても無視して既定の表示にする */
  }
  return null;
}

export function loadProject(storage: StorageLike): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (raw === null) return { status: 'empty' };
  const parsed = parseGraphJson(raw);
  if (!parsed.ok) {
    try {
      storage.setItem(CORRUPT_BACKUP_KEY, raw); // 失われないよう退避しておく
    } catch {
      /* 退避できなくても起動は続ける */
    }
    return { status: 'corrupt', errors: parsed.errors };
  }
  return { status: 'ok', graph: parsed.graph, viewport: readViewport(storage) };
}

export function saveProject(storage: StorageLike, graph: Graph, viewport: Viewport): boolean {
  try {
    storage.setItem(STORAGE_KEY, serializeGraph(graph));
    storage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
    return true;
  } catch {
    return false;
  }
}

export interface Autosave {
  flush(): void;
  dispose(): void;
}

/** グラフ・表示位置が変わったら少し待ってから保存する。ページを離れるときは即保存 */
export function startAutosave(
  store: EditorStore,
  storage: StorageLike,
  onError?: () => void,
  delay = AUTOSAVE_DELAY_MS,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastGraph = store.getState().graph;
  let lastViewport = store.getState().viewport;
  let dirty = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    const s = store.getState();
    if (!saveProject(storage, s.graph, s.viewport)) onError?.();
  };

  const unsubscribe = store.subscribe(() => {
    const s = store.getState();
    if (s.graph === lastGraph && s.viewport === lastViewport) return;
    lastGraph = s.graph;
    lastViewport = s.viewport;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });

  const onHide = () => flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    flush,
    dispose() {
      flush();
      unsubscribe();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
