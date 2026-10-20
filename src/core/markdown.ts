import { getIndex, outputKey } from './graph';
import { NODE_SPECS } from './nodeSpec';
import type { Graph, GraphNode, OutputPortId } from './types';
import { byPosition, validateWorkflow } from './validate';

export const MARKDOWN_FILE_NAME = 'workflow.md';

const PORT_LABEL: Record<OutputPortId, string> = { out: '次', yes: 'Yes', no: 'No' };

/** 見出し・箇条書きに入れる1行テキスト */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
const titleOf = (n: GraphNode) => oneLine(n.title) || '(無題)';

/** 本文は引用ブロックとして出力する（改行を保つ） */
function quote(text: string): string[] {
  const body = text.replace(/\r\n?/g, '\n').trim();
  if (body === '') return [];
  return [...body.split('\n').map((l) => (l === '' ? '>' : `> ${l}`)), ''];
}

interface Walk {
  /** 訪問順（Start から決定的な深さ優先・前順） */
  order: GraphNode[];
  step: Map<string, number>;
  /** そのノードを最初に発見した接続のID */
  treeEdge: Map<string, string>;
}

/** Start から、出力ポートの順 (out → yes → no) に深さ優先で辿る。各ノードは1回だけ訪問する */
function walkFromStart(graph: Graph): Walk {
  const { nodeById, edgeByOutput } = getIndex(graph);
  const start = graph.nodes.find((n) => n.type === 'start');
  const walk: Walk = { order: [], step: new Map(), treeEdge: new Map() };
  if (!start) return walk;
  const stack: { id: string; via?: string }[] = [{ id: start.id }];
  while (stack.length > 0) {
    const { id, via } = stack.pop()!;
    if (walk.step.has(id)) continue;
    const node = nodeById.get(id);
    if (!node) continue;
    walk.step.set(id, walk.order.length + 1);
    walk.order.push(node);
    if (via) walk.treeEdge.set(id, via);
    // 先に出力したい枝を最後に積む
    const outs = [...NODE_SPECS[node.type].outputs].reverse();
    for (const port of outs) {
      const e = edgeByOutput.get(outputKey(id, port));
      if (e && !walk.step.has(e.target)) stack.push({ id: e.target, via: e.id });
    }
  }
  return walk;
}

export function generateMarkdown(graph: Graph): string {
  const { nodeById, edgeByOutput } = getIndex(graph);
  const walk = walkFromStart(graph);
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  const issues = validateWorkflow(graph);
  const reachableIds = new Set(walk.order.map((n) => n.id));

  push('# ワークフロー', '');
  push(
    `- ノード数: ${graph.nodes.length}`,
    `- 接続数: ${graph.edges.length}`,
    `- グループ数: ${graph.groups.length}`,
    '',
  );

  push('## 検証結果', '');
  if (issues.length === 0) {
    push('問題は検出されませんでした。', '');
  } else {
    push(`${issues.length} 件の問題が見つかりました。`, '');
    for (const i of issues) push(`- ⚠ ${i.message}`);
    push('');
  }

  const stepLabel = (id: string) => {
    const n = nodeById.get(id)!;
    return `Step ${walk.step.get(id)}「${titleOf(n)}」`;
  };

  /** 出力ポートごとの「行き先」行 */
  const linkLines = (n: GraphNode, stepNo: number | null): string[] => {
    const out: string[] = [];
    for (const port of NODE_SPECS[n.type].outputs) {
      const label = n.type === 'condition' ? PORT_LABEL[port] : '次';
      const e = edgeByOutput.get(outputKey(n.id, port));
      if (!e) {
        out.push(`- ${label} → （接続先なし）`);
      } else if (stepNo === null) {
        // 未接続セクション：Step番号が無いのでノード名で示す
        const t = nodeById.get(e.target);
        const ref = walk.step.has(e.target) ? stepLabel(e.target) : `「${t ? titleOf(t) : e.target}」(${e.target})`;
        out.push(`- ${label} → ${ref}`);
      } else {
        const isTree = walk.treeEdge.get(e.target) === e.id;
        out.push(`- ${label} → ${stepLabel(e.target)}${isTree ? '' : '（合流：上記または別経路で出力済み。そちらを参照）'}`);
      }
    }
    return out;
  };

  push('## フロー', '');
  if (walk.order.length === 0) {
    push('開始ノードがありません。', '');
  } else {
    for (const n of walk.order) {
      const no = walk.step.get(n.id)!;
      const spec = NODE_SPECS[n.type];
      push(`### Step ${no}: ${titleOf(n)}　〔${spec.label}〕`, '');
      if (n.type === 'condition') {
        const cond = n.content.trim();
        push(`**条件:** ${cond === '' ? '（未設定）' : ''}`.trimEnd());
        if (cond !== '') push('', ...quote(cond));
        else push('');
      } else {
        push(...quote(n.content));
      }
      if (n.type === 'end') push('- ここでワークフローは終了します。');
      else push(...linkLines(n, no));
      push('');
    }
  }

  const unconnected = graph.nodes.filter((n) => n.type !== 'note' && !reachableIds.has(n.id)).sort(byPosition);
  push('## 未接続ノード', '');
  if (unconnected.length === 0) {
    push('なし', '');
  } else {
    push('開始地点から到達できないノードです。', '');
    for (const n of unconnected) {
      push(`### ${titleOf(n)}　〔${NODE_SPECS[n.type].label}〕 \`${n.id}\``, '');
      if (n.type === 'condition' && n.content.trim() !== '') push('**条件:**', '');
      push(...quote(n.content));
      if (n.type === 'end') push('- 終了地点');
      else push(...linkLines(n, null));
      push('');
    }
  }

  const notes = graph.nodes.filter((n) => n.type === 'note').sort(byPosition);
  push('## メモ', '');
  if (notes.length === 0) {
    push('なし', '');
  } else {
    for (const n of notes) {
      push(`### ${titleOf(n)}`, '');
      push(...quote(n.content));
    }
  }

  if (graph.groups.length > 0) {
    push('## グループ', '');
    for (const g of graph.groups) {
      const members = g.nodeIds.map((id) => nodeById.get(id)).filter((n): n is GraphNode => !!n);
      push(`- **${oneLine(g.title) || '(無題)'}**: ${members.map((m) => `「${titleOf(m)}」`).join('、')}`);
    }
    push('');
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
