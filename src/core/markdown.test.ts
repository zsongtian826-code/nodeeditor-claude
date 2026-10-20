import { describe, expect, it } from 'vitest';
import { edge, linearGraph, node } from '../test/builders';
import { generateMarkdown } from './markdown';
import { createSampleGraph } from './sample';
import type { Graph } from './types';

describe('Markdown 生成', () => {
  it('サンプルの出力が期待どおりの構造になる', () => {
    const md = generateMarkdown(createSampleGraph());
    expect(md).toContain('# ワークフロー');
    expect(md).toContain('問題は検出されませんでした');
    expect(md).toContain('### Step 1: 開始　〔開始〕');
    expect(md).toContain('### Step 2: 要件確認　〔作業〕');
    expect(md).toContain('> 依頼者に目的・期限・受け入れ条件を確認する');
    expect(md).toContain('### Step 4: テスト結果の確認　〔条件分岐〕');
    expect(md).toContain('**条件:**');
    expect(md).toContain('> すべてのテストが成功したか？');
    expect(md).toContain('- Yes → Step 5「完了」');
    expect(md).toContain('- No → Step 6「修正指示」');
    expect(md).toContain('ここでワークフローは終了します');
    expect(md).toContain('## メモ');
    expect(md).toContain('### 使い方のヒント');
    expect(md).toContain('## グループ');
  });

  it('同じグラフからは必ず同じ Markdown になる（配列順が違っても）', () => {
    const g = createSampleGraph();
    const shuffled: Graph = { nodes: [...g.nodes].reverse(), edges: [...g.edges].reverse(), groups: g.groups };
    expect(generateMarkdown(shuffled)).toBe(generateMarkdown(g));
    expect(generateMarkdown(g)).toBe(generateMarkdown(structuredClone(g)));
  });

  it('合流するノードは重複して出力せず、参照を書く', () => {
    const g: Graph = {
      nodes: [
        node('start-1', 'start'),
        node('condition-1', 'condition', 0, 0, '分岐', '条件'),
        node('action-1', 'action', 0, 0, '左'),
        node('action-2', 'action', 0, 0, '右'),
        node('end-1', 'end', 0, 0, '終わり'),
      ],
      edges: [
        edge('1', 'start-1', 'condition-1'),
        edge('2', 'condition-1', 'action-1', 'yes'),
        edge('3', 'condition-1', 'action-2', 'no'),
        edge('4', 'action-1', 'end-1'),
        edge('5', 'action-2', 'end-1'),
      ],
      groups: [],
    };
    const md = generateMarkdown(g);
    expect(md.match(/### Step \d+: 終わり/g)).toHaveLength(1);
    // 深さ優先なので Yes 側(左)の先で End が Step 4、No 側(右)は Step 5
    expect(md).toContain('- 次 → Step 4「終わり」（合流');
    // Yes 側が先に出力される
    expect(md.indexOf('Step 3: 左')).toBeLessThan(md.indexOf('Step 5: 右'));
  });

  it('接続されていない Action / Condition は「未接続ノード」に出る', () => {
    const g: Graph = { ...linearGraph(), nodes: [...linearGraph().nodes, node('action-9', 'action', 0, 500, '孤立', '説明')] };
    const md = generateMarkdown(g);
    const idx = md.indexOf('## 未接続ノード');
    expect(idx).toBeGreaterThan(0);
    expect(md.slice(idx)).toContain('### 孤立');
    expect(md.slice(md.indexOf('## フロー'), idx)).not.toContain('孤立');
    expect(md).toContain('到達できないノード');
  });

  it('メモは独立した節に出力し、フローには入れない', () => {
    const g: Graph = { ...linearGraph(), nodes: [...linearGraph().nodes, node('note-1', 'note', 0, 0, '注意', '1行目\n2行目')] };
    const md = generateMarkdown(g);
    const flow = md.slice(md.indexOf('## フロー'), md.indexOf('## 未接続ノード'));
    expect(flow).not.toContain('注意');
    expect(md.slice(md.indexOf('## メモ'))).toContain('> 1行目\n> 2行目');
  });

  it('検証結果（警告）を明示する', () => {
    const g = linearGraph();
    const md = generateMarkdown({ ...g, edges: g.edges.filter((e) => e.id !== 'edge-3') });
    expect(md).toContain('件の問題が見つかりました');
    expect(md).toContain('⚠');
    expect(md).toContain('（接続先なし）');
  });

  it('分岐のステップ番号は到達順で決定的に付く', () => {
    const md = generateMarkdown(linearGraph());
    expect(md).toContain('- 次 → Step 2「action-1」');
    expect(md).toContain('### Step 4: end-1　〔終了〕');
  });
});
