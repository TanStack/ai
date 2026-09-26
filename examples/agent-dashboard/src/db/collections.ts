/**
 * TanStack DB collections. The dashboard's run state is a projection of the
 * AG-UI event stream: the session controller writes events here, and the UI
 * reads them with live queries — no polling.
 */
import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'

export interface MessageRow {
  id: string
  threadId: string
  role: 'user' | 'assistant'
  text: string
  /** Set for text produced by a subagent, for attribution. */
  subagentRunId?: string
  createdAt: number
}

export interface ToolCallRow {
  id: string
  threadId: string
  name: string
  args: string
  result?: string
  status: 'running' | 'done'
  subagentRunId?: string
  createdAt: number
}

export interface ApprovalRow {
  id: string
  threadId: string
  toolCallId?: string
  reason: string
  message: string
  responseSchema?: Record<string, unknown>
  status: 'pending' | 'approved' | 'denied'
  createdAt: number
}

export interface SpendRow {
  id: string
  threadId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface SessionRow {
  id: string
  threadId: string
  status: 'idle' | 'running' | 'requires_action'
  createdAt: number
}

export interface BudgetRow {
  id: string
  threadId: string
  maxTokens: number
}

export const messages = createCollection(
  localOnlyCollectionOptions({ getKey: (row: MessageRow) => row.id }),
)
export const toolCalls = createCollection(
  localOnlyCollectionOptions({ getKey: (row: ToolCallRow) => row.id }),
)
export const approvals = createCollection(
  localOnlyCollectionOptions({ getKey: (row: ApprovalRow) => row.id }),
)
export const spend = createCollection(
  localOnlyCollectionOptions({ getKey: (row: SpendRow) => row.id }),
)
export const sessions = createCollection(
  localOnlyCollectionOptions({ getKey: (row: SessionRow) => row.id }),
)
export const budgets = createCollection(
  localOnlyCollectionOptions({ getKey: (row: BudgetRow) => row.id }),
)

/** Default per-session token budget, for the spend alerts. */
export const DEFAULT_BUDGET = 2000

/**
 * Insert if absent, else apply the updater. localOnly writes are synchronous.
 * `collection` is a TanStack DB collection; it is typed loosely here so `T` is
 * pinned by the row, not the collection's overloaded `insert`/`update`.
 */
export function upsert<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collection: any,
  row: T,
  updater?: (draft: T) => void,
): void {
  if (collection.has(row.id)) {
    collection.update(row.id, (draft: T) => (updater ?? (() => {}))(draft))
  } else {
    collection.insert(row)
  }
}
