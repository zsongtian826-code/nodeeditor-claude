import { findCycleNodes } from './graph';
import { NODE_SPECS, isNodeType } from './nodeSpec';
import { SCHEMA_VERSION, type Graph, type GraphDocument, type GraphEdge, type GraphGroup, type GraphNode, type OutputPortId } from './types';

// JSON の読み込み検証と書き出し。

export type ParseResult = { ok: true; graph: Graph } | { ok: false; errors: string[] };

const MAX_REPORTED_ERRORS = 12;

/** ID に空白・制御文字を含めない（画面内部で区切り文字として使うため。通常のIDは影響を受けない） */
const ID_PATTERN = /^[^\s\u0000-\u001f\u007f]+$/;
const isValidId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function toDocument(graph: Graph): GraphDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, title: n.title, content: n.content })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourcePort: e.sourcePort,
      target: e.target,
      targetPort: e.targetPort,
    })),
    groups: graph.groups.map((g) => ({ id: g.id, title: g.title, nodeIds: [...g.nodeIds] })),
  };
}

export function serializeGraph(graph: Graph): string {
  return JSON.stringify(toDocument(graph), null, 2) + '\n';
}

/** 未知の値を検証し、問題がなければ Graph（余計な項目を除いたもの）を返す */
export function validateDocument(raw: unknown): ParseResult {
  const errors: string[] = [];
  const err = (m: string) => {
    errors.push(m);
  };

  if (!isRecord(raw)) return { ok: false, errors: ['JSONのトップレベルがオブジェクトではありません'] };
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`schemaVersion が ${SCHEMA_VERSION} ではありません（値: ${JSON.stringify(raw.schemaVersion) ?? '未指定'}）`],
    };
  }
  if (!Array.isArray(raw.nodes)) err('nodes が配列ではありません');
  if (!Array.isArray(raw.edges)) err('edges が配列ではありません');
  if (raw.groups !== undefined && !Array.isArray(raw.groups)) err('groups が配列ではありません');
  if (errors.length > 0) return { ok: false, errors };

  // ---- ノード ----
  const nodes: GraphNode[] = [];
  const nodeById = new Map<string, GraphNode>();
  (raw.nodes as unknown[]).forEach((item, i) => {
    const at = `nodes[${i}]`;
    if (!isRecord(item)) return err(`${at} がオブジェクトではありません`);
    const { id, type, x, y, title, content } = item;
    if (!isValidId(id)) return err(`${at}: id が空、または空白・制御文字を含む文字列です`);
    if (nodeById.has(id)) return err(`${at}: id「${id}」が重複しています`);
    if (!isNodeType(type)) return err(`${at}(${id}): 不正なノード種別です（${JSON.stringify(type)}）`);
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
      return err(`${at}(${id}): x, y が有限の数値ではありません`);
    }
    if (title !== undefined && typeof title !== 'string') return err(`${at}(${id}): title が文字列ではありません`);
    if (content !== undefined && typeof content !== 'string') return err(`${at}(${id}): content が文字列ではありません`);
    const node: GraphNode = { id, type, x, y, title: title ?? '', content: content ?? '' };
    nodes.push(node);
    nodeById.set(id, node);
  });

  const starts = nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) err(`開始(start)ノードはちょうど1個必要です（現在 ${starts.length} 個）`);

  // ---- 接続 ----
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  const outputUsed = new Set<string>();
  const tuples = new Set<string>();
  (raw.edges as unknown[]).forEach((item, i) => {
    const at = `edges[${i}]`;
    if (!isRecord(item)) return err(`${at} がオブジェクトではありません`);
    const { id, source, sourcePort, target, targetPort } = item;
    if (!isValidId(id)) return err(`${at}: id が空、または空白・制御文字を含む文字列です`);
    if (edgeIds.has(id)) return err(`${at}: id「${id}」が重複しています`);
    edgeIds.add(id);
    if (typeof source !== 'string' || typeof target !== 'string') return err(`${at}(${id}): source/target が文字列ではありません`);
    const s = nodeById.get(source);
    const t = nodeById.get(target);
    if (!s) return err(`${at}(${id}): 接続元ノード「${source}」が存在しません`);
    if (!t) return err(`${at}(${id}): 接続先ノード「${target}」が存在しません`);
    if (s.id === t.id) return err(`${at}(${id}): 自分自身への接続です`);
    if (!NODE_SPECS[s.type].outputs.includes(sourcePort as OutputPortId)) {
      return err(`${at}(${id}): ${s.type} ノード「${source}」に出力ポート ${JSON.stringify(sourcePort)} はありません`);
    }
    if (targetPort !== 'in' || !NODE_SPECS[t.type].hasInput) {
      return err(`${at}(${id}): ${t.type} ノード「${target}」に入力ポート ${JSON.stringify(targetPort)} はありません`);
    }
    const tuple = JSON.stringify([source, sourcePort, target, targetPort]);
    if (tuples.has(tuple)) return err(`${at}(${id}): 同じ接続が重複しています`);
    tuples.add(tuple);
    const outKey = `${source}:${sourcePort}`;
    if (outputUsed.has(outKey)) return err(`${at}(${id}): 出力ポート ${source}.${sourcePort} から2本以上の接続が出ています`);
    outputUsed.add(outKey);
    edges.push({ id, source, sourcePort: sourcePort as OutputPortId, target, targetPort: 'in' });
  });

  // ---- グループ ----
  const groups: GraphGroup[] = [];
  const groupIds = new Set<string>();
  const memberOf = new Map<string, string>();
  ((raw.groups as unknown[] | undefined) ?? []).forEach((item, i) => {
    const at = `groups[${i}]`;
    if (!isRecord(item)) return err(`${at} がオブジェクトではありません`);
    const { id, title, nodeIds } = item;
    if (!isValidId(id)) return err(`${at}: id が空、または空白・制御文字を含む文字列です`);
    if (groupIds.has(id)) return err(`${at}: id「${id}」が重複しています`);
    groupIds.add(id);
    if (title !== undefined && typeof title !== 'string') return err(`${at}(${id}): title が文字列ではありません`);
    if (!Array.isArray(nodeIds) || nodeIds.some((x) => typeof x !== 'string')) {
      return err(`${at}(${id}): nodeIds が文字列の配列ではありません`);
    }
    const members = nodeIds as string[];
    if (new Set(members).size !== members.length) return err(`${at}(${id}): nodeIds に重複があります`);
    if (members.length < 2) return err(`${at}(${id}): グループには2個以上のノードが必要です`);
    let ok = true;
    for (const m of members) {
      if (!nodeById.has(m)) {
        err(`${at}(${id}): 存在しないノード「${m}」が含まれています`);
        ok = false;
      } else if (memberOf.has(m)) {
        err(`${at}(${id}): ノード「${m}」はすでにグループ「${memberOf.get(m)}」に所属しています`);
        ok = false;
      }
    }
    if (!ok) return;
    for (const m of members) memberOf.set(m, id);
    groups.push({ id, title: title ?? '', nodeIds: members });
  });

  // ---- 循環 ----（ほかの検証が通っているときだけ意味がある）
  if (errors.length === 0) {
    const cyclic = findCycleNodes({ nodes, edges });
    if (cyclic.length > 0) err(`循環する接続があります（関係するノード: ${cyclic.slice(0, 5).join(', ')}${cyclic.length > 5 ? ' ほか' : ''}）`);
  }

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_REPORTED_ERRORS);
    if (errors.length > shown.length) shown.push(`ほか ${errors.length - shown.length} 件のエラー`);
    return { ok: false, errors: shown };
  }
  return { ok: true, graph: { nodes, edges, groups } };
}

/** 文字列(JSON)を解析して検証する */
export function parseGraphJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSONとして読み込めません: ${e instanceof Error ? e.message : String(e)}`] };
  }
  return validateDocument(raw);
}
