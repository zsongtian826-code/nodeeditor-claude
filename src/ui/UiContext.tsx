import { createContext, useContext } from 'react';
import type { Issue } from '../core/validate';

/** App が持つ UI 操作（ダイアログなど）を、深い階層から呼ぶための窓口 */
export interface UiActions {
  /** ノードをダブルクリック等で編集に入るとき（詳細パネルを開いてタイトルにフォーカス） */
  editNode(id: string): void;
  toggleMultiSelect(): void;
}

export const UiActionsContext = createContext<UiActions>({ editNode: () => {}, toggleMultiSelect: () => {} });
export const useUiActions = () => useContext(UiActionsContext);

export interface IssueState {
  list: readonly Issue[];
  byNode: ReadonlyMap<string, readonly Issue[]>;
}
export const IssuesContext = createContext<IssueState>({ list: [], byNode: new Map() });
export const useNodeIssues = (id: string): readonly Issue[] | undefined => useContext(IssuesContext).byNode.get(id);
export const useIssueList = (): readonly Issue[] => useContext(IssuesContext).list;

export type Tool = 'select' | 'pan';
export const ToolContext = createContext<{ tool: Tool; multi: boolean }>({ tool: 'select', multi: false });
