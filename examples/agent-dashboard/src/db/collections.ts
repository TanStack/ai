/**
 * TanStack DB collections. The dashboard's run state is a projection of the
 * AG-UI event stream: the session controller writes events here, and the UI
 * reads them with live queries — no polling.
 */
import {
  createCollection,
  localOnlyCollectionOptions,
} from '@tanstack/react-db'

export interface MessageRow {
  id: string
  threadId: string
  /** The channel this row belongs to (a channel unions N member threads). */
  channelId?: string
  /** Which member produced this row (equals the member's threadId today). */
  agentId?: string
  role: 'user' | 'assistant' | 'system'
  text: string
  /** Set for text produced by a subagent, for attribution. */
  subagentRunId?: string
  /**
   * A platform-generated system card (not a chat bubble): a channel opening, a
   * member joining, or a session event (compaction, sign-in, retry, error).
   */
  system?: {
    kind:
      | 'channel_created'
      | 'member_joined'
      | 'compaction'
      | 'sign_in'
      | 'retry'
      | 'error'
    /** For `sign_in`: where the user signs in. */
    url?: string
    channelId?: string
    channelName?: string
    topic?: string
    who?: string
  }
  createdAt: number
}

export interface ToolCallRow {
  id: string
  threadId: string
  channelId?: string
  agentId?: string
  name: string
  args: string
  result?: string
  status: 'running' | 'done'
  subagentRunId?: string
  /** Set when this tool call was injected out-of-band (not a model call). */
  trigger?: 'timer' | 'manual' | 'webhook' | 'mcp'
  /** Set when the result was truncated for the live view. */
  truncated?: boolean
  createdAt: number
}

export interface ApprovalRow {
  id: string
  threadId: string
  channelId?: string
  agentId?: string
  /** The raw interrupt id (un-namespaced), for the resume/control call. */
  interruptId?: string
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
  channelId?: string
  agentId?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** USD, from provider costs or catalog prices (see `server/spend.ts`). */
  cost: number
}

export interface SessionRow {
  id: string
  threadId: string
  channelId?: string
  agentId?: string
  status: 'idle' | 'running' | 'requires_action'
  createdAt: number
}

export interface BudgetRow {
  id: string
  threadId: string
  maxTokens: number
}

/**
 * A team is the durable unit: a group of agents sharing a chat, a tool registry,
 * and a permission boundary. (The design doc calls this a "pod".) The word
 * "team" only surfaces in the UI once a second member joins.
 */
export interface TeamRow {
  id: string
  name: string
  createdAt: number
}

/**
 * A named stream within a team. `main` is the durable team channel (every member
 * is in it); `dynamic` channels are created on demand (e.g. per PR) and members
 * opt in; `dm` is exactly two members. Channels are cheap and disposable — the
 * team is the durable unit.
 */
export interface ChannelRow {
  id: string
  teamId: string
  name: string
  kind: 'main' | 'dynamic' | 'dm'
  topic?: string
  /** agentId of the member that created the channel (for dynamic/dm). */
  createdBy?: string
  archivedAt?: number
  createdAt: number
}

/**
 * A subscription: react to a team event by joining a channel or being triggered.
 * `channel_created` fires when a member opens a channel; `tool_result` fires when
 * a specific tool's result lands in a channel (set `tool` to scope it). This is
 * the minimal, principled extension point — Phase 4 adds scoping.
 */
export interface Subscription {
  event: 'channel_created' | 'tool_result'
  action: 'join' | 'trigger'
  /** For `tool_result`: only react to this tool's results (e.g. reddit.search_react_news). */
  tool?: string
}

/**
 * The durable team roster row: an agent's membership in a team. It owns the
 * member's `threadId`, which is how N members each keep their own server-side
 * AG-UI thread while sharing one channel view (no harness change required).
 * (`channelId` names the team's main channel, kept for back-compat.)
 */
export interface MembershipRow {
  id: string
  channelId: string
  /** The team this member belongs to. */
  teamId?: string
  agentId: string
  threadId: string
  harness: string
  role: 'agent' | 'operator'
  displayName: string
  /** Team events this member reacts to (e.g. auto-join new PR channels). */
  subscriptions?: Array<Subscription>
  joinedAt: number
}

/**
 * Per-channel membership for non-main channels: which agents have opted into a
 * `dynamic`/`dm` channel (main channel membership is every team member,
 * implicitly). Distinct from `memberships` (team roster) so channels stay cheap.
 */
export interface ChannelMemberRow {
  id: string
  channelId: string
  agentId: string
  threadId: string
  joinedAt: number
}

/**
 * Lightweight per-member run metadata: how many pod-memory entries the platform
 * attached to the member's most recent run (drives the "N memory entries
 * attached" badge). Keyed by threadId.
 */
export interface RunMetaRow {
  id: string
  threadId: string
  attached: number
  updatedAt: number
}

export interface SpanRow {
  id: string
  runId: string
  threadId: string
  channelId?: string
  agentId?: string
  kind: 'run' | 'text' | 'tool' | 'approval'
  name: string
  start: number
  end?: number
  approvalId?: string
}

export interface QuestionRow {
  id: string
  threadId: string
  channelId?: string
  agentId?: string
  message: string
  schema?: Record<string, unknown>
  status: 'pending' | 'answered'
  createdAt: number
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
export const teams = createCollection(
  localOnlyCollectionOptions({ getKey: (row: TeamRow) => row.id }),
)
export const channels = createCollection(
  localOnlyCollectionOptions({ getKey: (row: ChannelRow) => row.id }),
)
export const memberships = createCollection(
  localOnlyCollectionOptions({ getKey: (row: MembershipRow) => row.id }),
)
export const channelMembers = createCollection(
  localOnlyCollectionOptions({ getKey: (row: ChannelMemberRow) => row.id }),
)
export const runMeta = createCollection(
  localOnlyCollectionOptions({ getKey: (row: RunMetaRow) => row.id }),
)
export const spans = createCollection(
  localOnlyCollectionOptions({ getKey: (row: SpanRow) => row.id }),
)
export const questions = createCollection(
  localOnlyCollectionOptions({ getKey: (row: QuestionRow) => row.id }),
)

/**
 * Which channel the operator is currently viewing. A single row (`id: 'active'`)
 * the ChannelView publishes so the (global, out-of-tree) demo-controls devtools
 * panel knows which channel to drive — the panel reads the same live DB state
 * everything else does.
 */
export interface UiStateRow {
  id: string
  channelId?: string
  teamId?: string
}
export const uiState = createCollection(
  localOnlyCollectionOptions({ getKey: (row: UiStateRow) => row.id }),
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
