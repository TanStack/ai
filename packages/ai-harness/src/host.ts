import { EventType } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import { AccessDeniedError, membersOnlyPolicyOf } from './access'
import { SharedLog, loadLogState, logIdOf, parseLogId } from './log'
import { HostPlugins } from './host-plugins'
import { purgeThreadData } from './purge'
import { LEASE } from './resume'
import { SessionImpl } from './session/harness-session'
import { sessionHandle } from './session/handle'
import { observedSession } from './session/observed-session'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import { changedEntry } from './session-entry'
import type { PromptCacheOptions, RunStore, StreamChunk } from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  ChatTranscriptStores,
  GenerationRunStore,
  InboxStore,
  InterruptStore,
  LeaseStore,
  LogStore,
  MetadataStore,
  WorkClaimStore,
  SessionIndexEntry,
  SessionIndexKey,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
  SessionMember,
} from '@tanstack/ai-persistence'
import type {
  AccessAction,
  AccessRun,
  AccessSession,
  HarnessAccess,
} from './access'
import type { HandleGuard } from './session/handle'
import type { AnyHarness, HarnessLogStateOf, SessionMetadataOf } from './define'
import type { SessionEntryChange, SessionEntryUpdate } from './session-entry'
import type { ReduceOptions } from './log'
import type { LeaseOptions } from './resume'
import type { HarnessSession } from './session/index'
import type { ObservedSession } from './session/observed-session'
import type { ForkPoint, Principal } from './types'

type SharedStores = {
  artifacts?: ArtifactStore
  blobs?: BlobStore
  generationRuns?: GenerationRunStore
  /** Claims on busy threads, for `resumePending`. */
  workClaims?: WorkClaimStore
  /** The session index that `host.sessions` reads. */
  sessions?: SessionIndexStore
}

/** A durable host needs run leases, host leases, or both. */
type DurableLeases =
  | { runs: RunStore; leases?: LeaseStore }
  | { runs?: RunStore; leases: LeaseStore }

/**
 * The stores a host needs. Two shapes:
 *
 * - A message store, plus any of runs, interrupts, metadata, and inbox.
 *   Without an inbox, inputs are kept in memory and a restart loses the ones
 *   not yet applied.
 * - Durable mode: a `log`, and `runs` or `leases`. The log holds the events,
 *   transcript, inputs, and tool steps of each thread, so this shape has no
 *   `messages`. With several hosts, add `workClaims`: an input that reaches a
 *   host while another host owns the thread is refused (`owned_elsewhere`),
 *   so it never stops the owner's turn. Add `inbox` too, and that input waits
 *   in the inbox for the owner instead (receipt `queued`).
 *
 * Without `artifacts`, `blobs`, and `generationRuns`, media is kept in memory.
 * With `sessions`, the host keeps one index entry per tenant and thread (see
 * `host.sessions`). The store needs `getVersioned` and `upsertIf`, or the host
 * throws at the start.
 */
export type HarnessPersistence =
  | AIPersistence<
      ChatTranscriptStores & {
        inbox?: InboxStore
        log?: never
        leases?: never
      } & SharedStores
    >
  | AIPersistence<
      {
        log: LogStore
        interrupts?: InterruptStore
        metadata?: MetadataStore
        messages?: never
        /** Inputs for the host that owns a thread. Needs `workClaims`. */
        inbox?: InboxStore
      } & DurableLeases &
        SharedStores
    >

export interface HarnessHostOptions<P extends Principal = Principal> {
  /** Where sessions keep their state. Default: in memory, lost on restart. */
  persistence?: HarnessPersistence
  /**
   * Who may use the sessions, and what they may do: `identify` reads the
   * user of a request, and `authorize` decides each action. The principal
   * type of the host comes from what `identify` returns. With it, every
   * public host call needs a `principal`, a session is reached only from
   * its own tenant, and keyed adapters do not read env vars unless
   * `envKeys` is `true`. It needs `stores.sessions`, where each session
   * keeps its owner and members. Without it, there is no check: one user
   * runs the host.
   *
   * @example
   * ```ts
   * const host = createHarnessHost({
   *   access: {
   *     identify: async ({ request }) => getUser(request),
   *     authorize: membersOnly(),
   *   },
   * })
   * ```
   */
  access?: HarnessAccess<P>
  /**
   * Where users' API keys and OAuth tokens are saved: a table in your own
   * database, or a secrets manager. Encrypt the secrets at rest. Default: in
   * memory, lost on restart.
   */
  credentials?: CredentialStore
  /**
   * How a durable host (`stores.log`) appends to the log. Leave it out for
   * the defaults.
   */
  log?: {
    /**
     * How long the host merges streamed text before it appends it, in
     * milliseconds. Boundaries (a message start or end, a tool call, a run
     * event) append at once. Default 100.
     */
    coalesceMs?: number
  }
  /**
   * How this host holds the runs it owns: how long a run lease lasts
   * (default 30000 ms), and how often the host renews it (default 10000 ms).
   * Leave it out for the defaults.
   */
  ownership?: LeaseOptions
  /** How the sessions of this host live. Leave it out for the defaults. */
  lifecycle?: HostLifecycleOptions
}

/** How the sessions of a host live. */
export interface HostLifecycleOptions {
  /**
   * How long a session that no handle holds stays open after it goes idle,
   * in milliseconds. Then the host closes it, and the next call on one of
   * its handles opens it again. `0` closes it at once. Default 60 000.
   */
  idleCloseMs?: number
  /**
   * How many sessions the host keeps open. An open past it first closes the
   * least recently used sessions that no handle holds and that are idle.
   * When there are none, the open goes on, with one warning. Default 500.
   */
  maxOpen?: number
  /** How much each session keeps in memory. */
  retention?: RetentionLimits
}

/**
 * How much each session keeps in memory, so a long-lived session does not
 * grow. Leave a field out for its default.
 */
export interface RetentionLimits {
  /**
   * How many settled operations (turns, commands, resets) a session keeps,
   * with their receipts and settlements. Inputs with no turn (agent runs,
   * messages to them, commands, cancels) have a window of the same size.
   * Past it, `session.operation(id)` is `undefined` for the oldest, and
   * `settled()` of its input reads the log (a durable host). Default 500.
   */
  settledOperations?: number
  /**
   * How many settled agent runs a session keeps. Past it, `agentRun(id)`
   * and `agentRuns()` leave out the oldest, except what the log has (a
   * durable host). Default 500.
   */
  settledAgentRuns?: number
  /**
   * How many bytes of events a session keeps in memory for `events()`, as
   * the JSON length of each event. A reader whose cursor is older starts
   * at the oldest event kept. A durable host reads older events from the
   * log. Default 8 000 000.
   */
  eventBytes?: number
}

/** {@link RetentionLimits} with every default filled in. */
export type Retention = Required<RetentionLimits>

export interface OpenSessionOptions<P extends Principal = Principal> {
  /** The conversation id. Opening the same id again returns the live session. */
  threadId: string
  /**
   * Who opens the session. The session that `open` returns acts as this
   * principal: a call that passes no `principal` stores it on the input.
   * Its `tenantId` is the tenant of the session (without it, the default
   * tenant): one `threadId` in two tenants is two sessions, with two index
   * entries and two logs. Required when the host has `access`.
   */
  principal?: P
  /**
   * The log of the session, on a durable host. Sessions with the same log id
   * share one log and one writer: one append can hold records for several of
   * them. Default: `threadId`.
   */
  logId?: string
  /**
   * Prompt caching for this session. It overrides the harness `promptCache`,
   * for example with a stable affinity key. Opening the same `threadId` again
   * returns the live session, which keeps the value of the first open.
   */
  promptCache?: PromptCacheOptions
}

/**
 * The session index of a host: one entry per tenant and thread, for a list
 * of sessions. The host writes the entry when a session opens and after each
 * turn. Without `stores.sessions`, `list` is empty, `get` is `undefined`,
 * and `rename` writes nothing. `delete` still deletes the data of the
 * thread in the other stores.
 *
 * Each method takes a `principal`. Its `tenantId` picks the tenant (without
 * it, the default tenant), as in `host.open`. A method never reads or
 * changes the entries of another tenant. With host `access`, the principal
 * is required, and each method asks `authorize` first: `get` reads, `list`
 * lists, `rename` and `update` configure, `delete` deletes, `fork` forks, and
 * `share` and `unshare` share. A refused action throws `AccessDeniedError`.
 * A child thread is checked through its root thread.
 */
export interface HostSessions<P extends Principal = Principal> {
  /**
   * The entries of the tenant of `principal`, newest `updatedAt` first.
   * Default: only top-level sessions (`parentThreadId: null`). Pass a thread
   * id to get its child sessions. With access, only the entries that
   * `authorize` lets the principal list.
   *
   * @example
   * ```ts
   * const page = await host.sessions.list({ principal, limit: 20 })
   * ```
   */
  list: (
    options?: Omit<SessionIndexListOptions, 'tenantId' | 'memberId'> & {
      principal?: P
    },
  ) => Promise<SessionIndexPage>
  /**
   * The entry of a thread, or `undefined`.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.get({ threadId: 't-1', principal })
   * ```
   */
  get: (options: {
    threadId: string
    principal?: P
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Set the title of a thread. Resolves to the changed entry, or to
   * `undefined` for a thread that has no entry.
   */
  rename: (change: {
    threadId: string
    title: string
    principal?: P
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Change the entry of a thread from app code, with no session open: its
   * `title`, `pinned`, or `metadata`. Each field you pass replaces the stored
   * one. Pass a function of the current entry to change part of `metadata`:
   * with a store that has `upsertIf`, it runs again when another host wrote
   * first, so neither change is lost. The harness `metadataSchema` checks
   * `metadata`, and types it. Resolves to the changed entry, or `undefined`
   * for a thread that has no entry. Throws `SessionMetadataError` for
   * metadata the schema refuses, and an error when the entry names another
   * harness.
   *
   * @example
   * ```ts
   * await host.sessions.update({
   *   harness: assistant,
   *   threadId,
   *   update: (entry) => ({
   *     metadata: { ...entry.metadata, pinned: [...(entry.metadata?.pinned ?? []), file] },
   *   }),
   * })
   * ```
   */
  update: <THarness extends AnyHarness>(change: {
    harness: THarness
    threadId: string
    update: SessionEntryUpdate<SessionMetadataOf<THarness>>
    principal?: P
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>> | undefined>
  /**
   * Delete a thread and its child threads (the entries with this thread as
   * `parentThreadId`, and their children). For each thread, it:
   *
   * - closes its open sessions on this host, of every harness, for every
   *   handle. A handle that calls again opens an empty thread.
   * - deletes its log, or its messages on a host with no `stores.log`.
   * - deletes its media: the uploads and the generated files, records and
   *   bytes.
   * - deletes its thread settings, plugin config, usage, interrupted turn,
   *   revert state, and log checkpoint from `stores.metadata`.
   * - removes its index entry. Then `get` is `undefined`, and the next open
   *   of the thread writes a new entry.
   *
   * A store the host does not have is skipped. Plugin state, runs,
   * interrupts, the inbox, and work claims stay. Only the tenant of
   * `principal` is touched.
   *
   * @example
   * ```ts
   * await host.sessions.delete({ threadId: 't-1', principal })
   * ```
   */
  delete: (options: { threadId: string; principal?: P }) => Promise<void>
  /**
   * Fork a thread into a new thread with `host.fork`, so the fork gets the
   * settings, plugin config, and media too. `{ through: id }` copies the
   * messages up to and including `id`. `{ before: id }` copies the messages
   * before `id`, so a fork before the first message has no messages. The new
   * thread gets its own entry in the same tenant, with the title of the old
   * one plus ` (fork)`, and the harness. Resolves to the new entry. Throws
   * when the message id is not in the transcript, or when the entry of the
   * thread names another harness.
   *
   * `members` picks who can use the fork. `'self'`: the user who forks is
   * the owner and the only member. `'all'`: that user is the owner, and the
   * other members keep their roles (the old owner becomes a `member`). With
   * access, the default is the `fork.members` of `membersOnly()`, else
   * `'self'`. Without access and without `members`, the fork gets the owner
   * and members of the old thread.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.fork({
   *   harness: assistant,
   *   threadId: 't-1',
   *   at: { before: messageId },
   *   principal,
   * })
   * const fork = await host.open(assistant, { threadId: entry.threadId, principal })
   * ```
   */
  fork: (options: {
    harness: AnyHarness
    threadId: string
    at: ForkPoint
    members?: 'self' | 'all'
    principal?: P
  }) => Promise<SessionIndexEntry>
  /**
   * Add the user `userId` to the members of a thread with `role`, or change
   * the role of a member. Needs `membersOnly()` as the host's `authorize`,
   * and the `share` action (the owner). Resolves to the changed entry, or
   * `undefined` for a thread that has no entry.
   *
   * @example
   * ```ts
   * await host.sessions.share({ threadId, userId: 'u3', role: 'member', principal })
   * ```
   */
  share: (options: {
    threadId: string
    userId: string
    role: SessionMember['role']
    principal?: P
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Remove the user `userId` from the members of a thread. Needs
   * `membersOnly()`, and the `share` action. The work that the user started
   * on the session in this host stops, and `host.revoke` runs for the user.
   * The owner cannot be removed. Resolves to the changed entry, or
   * `undefined` for a thread that has no entry.
   *
   * @example
   * ```ts
   * await host.sessions.unshare({ threadId, userId: 'u3', principal })
   * ```
   */
  unshare: (options: {
    threadId: string
    userId: string
    principal?: P
  }) => Promise<SessionIndexEntry | undefined>
}

/**
 * An open session of the host changed its status. `running`: an operation
 * runs. `waiting`: a question or an interrupt waits for an answer. `idle`:
 * nothing runs or waits. `at` is the time of the change, in epoch ms.
 * `tenantId` is the tenant of the session, when it is not the default
 * tenant.
 */
export interface HostStatusEvent {
  type: 'status'
  threadId: string
  tenantId?: string
  status: 'idle' | 'running' | 'waiting'
  at: number
}

/**
 * The host wrote the index entry of a thread: a new session, the end of a
 * turn, a rename, or a fork. `entry` is the new entry, with its `tenantId`.
 */
export interface HostSessionEvent {
  type: 'session'
  threadId: string
  entry: SessionIndexEntry
}

/** The host removed the index entry of a thread. `entry` is the removed entry. */
export interface HostSessionDeletedEvent {
  type: 'session-deleted'
  threadId: string
  entry: SessionIndexEntry
}

/**
 * `host.revoke` took the access of the user `principalId` to a thread, or
 * `host.sessions.unshare` removed the user. The streams of that user on the
 * thread close.
 */
export interface HostRevokedEvent {
  type: 'revoked'
  tenantId?: string
  threadId: string
  principalId: string
  at: number
}

/** What `host.events()` yields. */
export type HostEvent =
  | HostStatusEvent
  | HostSessionEvent
  | HostSessionDeletedEvent
  | HostRevokedEvent

export interface ForkSessionOptions<P extends Principal = Principal> {
  /** The thread to copy. */
  threadId: string
  /** The new thread. It must have no messages yet. */
  newThreadId: string
  /**
   * The id of the last message to copy. `null` copies no messages, but still
   * copies the settings and plugin config. Default: the whole transcript. An
   * id the thread does not have throws.
   */
  at?: string | null
  /**
   * Who opens the new thread, as in `open`. Its `tenantId` is the tenant of
   * both threads. With access, it needs the `fork` action on the source, and
   * it owns the new thread.
   */
  principal?: P
  /** The log of the source thread, as in `open`. Default: `threadId`. */
  logId?: string
}

export interface ResumePendingOptions {
  /** The harnesses whose threads this sweep may open, matched by name. */
  harnesses: ReadonlyArray<AnyHarness>
  /**
   * What happens to a session that the sweep opened. `'whenIdle'`
   * (default): it closes as soon as its pending work ends, unless the app
   * opened the thread too. `'never'`: it closes like any session that no
   * handle holds, after `lifecycle.idleCloseMs`.
   */
  close?: 'whenIdle' | 'never'
  /**
   * At most how many expired claims of `harnesses` one call takes. Default
   * 100.
   */
  limit?: number
}

/**
 * Runs sessions for one or more harnesses in this process. `P` is the
 * principal type: what `access.identify` returns.
 */
export interface HarnessHost<P extends Principal = Principal> {
  /**
   * Open a session of `harness` for `principal`. Each open gives its own
   * handle to the live session of this harness, tenant, and thread: a call
   * that passes no `principal` acts as the principal of the open. Session
   * plugins are set up on the first open, so a plugin error rejects the
   * promise. A subagent child thread (its index entry has a
   * `parentThreadId`) does not open: open its root thread, and read the
   * child with `session.agentTranscript`.
   *
   * Release the handle with `session.close()`, or with `await using`. The
   * session closes when no handle holds it and it was idle for
   * `lifecycle.idleCloseMs`. A call on a handle after that opens the session
   * again. Throws after `host.close()`.
   *
   * With access, `principal` is required. A thread that exists needs the
   * `read` action, else the open throws `AccessDeniedError`. A new thread
   * gets the principal as its owner. Then each action of the handle asks
   * `authorize`, and the handle acts only as its principal.
   *
   * @example
   * ```ts
   * const session = await host.open(assistant, { threadId: 't-1', principal })
   * ```
   */
  open: <THarness extends AnyHarness>(
    harness: THarness,
    options: OpenSessionOptions<P>,
  ) => Promise<HarnessSession<THarness>>
  /**
   * A read-only view of a thread of `harness`, for `principal`: its events,
   * transcript, snapshot, media, usage, and index entry (see
   * `ObservedSession`). It mounts no plugins, writes nothing (no index entry, no
   * metadata), claims nothing, and runs no recovery, so a read of an idle
   * thread costs only store reads. When the session of the thread is open on
   * this host, the view reads through it, and it never holds it open. On a
   * durable host, the views of one log share its fold and its events. Use
   * `open` for a write, or for what needs plugins (`describe`).
   *
   * With access, `principal` is required, and the thread needs the `read`
   * action, else the call throws `AccessDeniedError`. A child thread is
   * checked through its root thread. A thread with no index entry gets the
   * same answer as a refusal: a read creates no thread. Throws after
   * `host.close()`.
   *
   * @example
   * ```ts
   * const view = await host.observe(assistant, { threadId: 't-1', principal })
   * const snapshot = await view.snapshot()
   * ```
   */
  observe: <THarness extends AnyHarness>(
    harness: THarness,
    options: Pick<OpenSessionOptions<P>, 'threadId' | 'principal' | 'logId'>,
  ) => Promise<ObservedSession<THarness>>
  /**
   * Is a session of `harness` open on `threadId` on this host, in the tenant
   * of `principal`? A session that closed on idle is not open, also when a
   * handle of it still exists.
   */
  isOpen: (
    harness: AnyHarness,
    options: { threadId: string; principal?: P },
  ) => boolean
  /**
   * Start a new thread as a copy of another one, and return its open
   * session of `harness`. It copies the transcript up to and including the
   * message `at`, the media that those messages use, the stored settings,
   * and the plugin config. It does not copy plugin state, pending
   * interrupts, queued inputs, or running work. A `newThreadId` with
   * messages is refused.
   *
   * @example
   * ```ts
   * const fork = await host.fork(assistant, { threadId: 't-1', newThreadId: 't-2', at: messageId })
   * ```
   */
  fork: <THarness extends AnyHarness>(
    harness: THarness,
    options: ForkSessionOptions<P>,
  ) => Promise<HarnessSession<THarness>>
  /**
   * Continue the work of hosts that stopped. Needs `stores.workClaims`. It
   * opens each thread whose claim expired, for a harness in `harnesses`, and
   * the session recovers its pending work. Two hosts can call it at once:
   * each thread goes to one of them. Call it at boot, and from a cron job or
   * a Durable Object alarm. Resolves with the threads it opened.
   *
   * Known limits: a thread that this host has open already is claimed, but
   * its session does not recover again. Call `host.recover(threadId)` for it.
   * Each thread opens in its own tenant, with no principal.
   *
   * @example
   * ```ts
   * await host.resumePending({ harnesses: [assistant] })
   * ```
   */
  resumePending: (
    options: ResumePendingOptions,
  ) => Promise<Array<{ threadId: string; harness: string }>>
  /**
   * Run `session.recover()` on the open sessions of `threadId`, or on every
   * open session without it. A turn that another host ran when its session
   * opened runs here once that host's lease expires.
   *
   * @example
   * ```ts
   * await host.recover('thread-1')
   * ```
   */
  recover: (threadId?: string) => Promise<void>
  /**
   * Run `session.reload()` on every open session of `harness`. Rejects when
   * one of them fails. The other sessions still reload.
   *
   * @example
   * ```ts
   * await host.reload(assistant)
   * ```
   */
  reload: (harness: AnyHarness) => Promise<void>
  /**
   * Close every live session, for every handle, end the event reads of
   * every `observe` view, and refuse later opens and views. After it, a call
   * on a view throws, and so does a call on a handle, except a read that
   * gives a value at once (`snapshot()`): it reads the last state. With
   * `recoverable`, the running work stops with no settlement, and the next
   * host that opens a thread runs it again: use it when a durable host shuts
   * down, for example for a deploy. Without it, the running work is
   * cancelled.
   *
   * @example
   * ```ts
   * await host.close({ recoverable: true })
   * ```
   */
  close: (options?: { recoverable?: boolean }) => Promise<void>
  /**
   * The `durability.reduce` fold of `harness` for a log that has an open
   * session or a running `observe` read in this host. `logId` is the `logId`
   * of `open`, in the tenant of `principal`. `undefined` when nothing has the
   * log open, or when the reduce of another harness folded the log (the
   * harness of its first session folds a shared log). `view.logState()` of
   * `host.observe` reads a log that is not open too.
   *
   * @example
   * ```ts
   * const state = host.logState({ harness: assistant, logId: 'agent-1' })
   * ```
   */
  logState: <THarness extends AnyHarness>(options: {
    harness: THarness
    logId: string
    principal?: P
  }) => HarnessLogStateOf<THarness> | undefined
  /** The session index: list, rename, delete, fork, and share sessions. */
  sessions: HostSessions<P>
  /**
   * Take the access of the user `principal` to a thread, after your app
   * changed its own access tables. `host.events()` yields a `revoked`
   * event, so the user's streams close. On a host with access, the open
   * handles of that user on the thread throw `AccessDeniedError` from now
   * on, and a new `host.open` asks `authorize` again. The `tenantId` of
   * `principal` picks the tenant. Only `id` and `tenantId` are read.
   *
   * @example
   * ```ts
   * host.revoke({ threadId, principal: { id: 'u3', tenantId: 'acme' } })
   * ```
   */
  revoke: (options: {
    threadId: string
    principal: { id: string; tenantId?: string }
  }) => void
  /**
   * The user of `request`, from `access.identify`, or `null` when
   * `identify` refuses it. Network code other than the HTTP handler (an MCP
   * server, your own route) uses it. Throws on a host with no `access`.
   */
  identify: (options: { request: Request }) => Promise<P | null>
  /** `true` when the host was made with `access`, so every call needs a principal. */
  readonly hasAccess: boolean
  /**
   * The status changes and the session index changes of this host, for a
   * list of sessions that stays current. First the current status of each
   * open session, then each change as it occurs. Each call reads on its own.
   * The read stops when `signal` aborts or the loop ends.
   *
   * @example
   * ```ts
   * for await (const event of host.events({ signal })) {
   *   if (event.type === 'status') console.log(event.threadId, event.status)
   * }
   * ```
   */
  events: (options?: { signal?: AbortSignal }) => AsyncIterable<HostEvent>
}

/** Throw when `entry` names another harness than `harness`. */
function checkHarness(
  entry: SessionIndexEntry | undefined,
  harness: AnyHarness,
) {
  if (entry?.harness !== undefined && entry.harness !== harness.name) {
    throw new Error(
      `Thread ${JSON.stringify(entry.threadId)} belongs to harness ${JSON.stringify(entry.harness)}, not ${JSON.stringify(harness.name)}.`,
    )
  }
}

let warned = false

/**
 * Writes to the session index. A write replaces the whole entry, so a change
 * reads the entry with its revision, changes a copy, and writes it back with
 * `upsertIf`. A change that another host wrote first runs again on the new
 * entry. The changes of one key run one at a time on this host, so no change
 * loses the fields of another. `onChange` gets each write and each removal.
 */
function sessionIndex(
  store: SessionIndexStore | undefined,
  onChange: (event: HostSessionEvent | HostSessionDeletedEvent) => void,
) {
  const tails = new Map<string, Promise<void>>()
  const serial = <T>(key: SessionIndexKey, task: () => Promise<T>) => {
    const id = logIdOf({ tenantId: key.tenantId, logId: key.threadId })
    // The tail never rejects, so a failed change does not stop the next one.
    const run = (tails.get(id) ?? Promise.resolve()).then(task)
    const tail = run.then(
      () => {},
      () => {},
    )
    tails.set(id, tail)
    void tail.then(() => {
      if (tails.get(id) === tail) tails.delete(id)
    })
    return run
  }
  return {
    get: async (key: SessionIndexKey) => store?.get(key),
    /**
     * Write `change(entry)` for the key. `change` gets `undefined` when the
     * key has no entry, and returns `undefined` to write nothing.
     */
    update: (
      key: SessionIndexKey,
      change: (
        entry: SessionIndexEntry | undefined,
      ) =>
        | SessionIndexEntry
        | undefined
        | Promise<SessionIndexEntry | undefined>,
    ) =>
      serial(key, async () => {
        if (!store) return undefined
        const { threadId } = key
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const current = await store.getVersioned(key)
          const next = await change(current?.entry)
          if (!next) return undefined
          const written = await store.upsertIf({
            entry: next,
            revision: current?.revision ?? null,
          })
          if (!written.ok) continue
          onChange({ type: 'session', threadId, entry: next })
          return next
        }
        throw new Error(
          `The session index entry of ${threadId} changed on another host 5 times in a row.`,
        )
      }),
    /** Remove the entry of the key: a hard delete. */
    remove: (key: SessionIndexKey) =>
      serial(key, async () => {
        if (!store) return
        const entry = await store.get(key)
        await store.delete(key)
        if (entry) {
          onChange({ type: 'session-deleted', threadId: key.threadId, entry })
        }
      }),
  }
}

/**
 * Throw a clear error for a sessions store without compare-and-set. The
 * types need both methods, but a store in plain JS can leave them out.
 */
function checkSessionStore(store: SessionIndexStore | undefined) {
  if (store === undefined) return
  const hasCompareAndSet =
    typeof store.getVersioned === 'function' &&
    typeof store.upsertIf === 'function'
  if (!hasCompareAndSet) {
    throw new Error(
      'stores.sessions needs getVersioned and upsertIf. The host changes an index entry with compare-and-set, so two hosts do not lose the changes of each other.',
    )
  }
}

/**
 * The key of an open session in the host: the harness, the tenant, and the
 * thread. One thread id in two tenants is two sessions.
 */
const sessionKey = (
  harness: string,
  tenantId: string | undefined,
  threadId: string,
) => `${harness}\u0000${logIdOf({ tenantId, logId: threadId })}`

/** @internal How a session writes its index entry. */
export type SessionIndexWriter = ReturnType<typeof sessionIndex>

/**
 * The status rule: the status of `session` after `event`, or `undefined`
 * when the event changes nothing. An operation that starts runs, and a
 * question waits. When an operation ends or a question gets its answer, the
 * session waits while a question or an interrupt still waits, runs while
 * another operation runs, and else is idle.
 */
function statusAfter(session: HarnessSession, event: StreamChunk) {
  if (event.type !== EventType.CUSTOM) return undefined
  switch (event.name) {
    case HARNESS_EVENTS.operationStarted:
      return 'running'
    case HARNESS_EVENTS.question:
      return 'waiting'
    case HARNESS_EVENTS.operationFinished:
    case HARNESS_EVENTS.questionAnswered: {
      const { pendingQuestions, pendingInterrupts, activeOperations } =
        session.snapshot()
      const isInterrupted =
        isRecord(event.value) && event.value.status === 'interrupted'
      const stillWaits =
        isInterrupted ||
        pendingQuestions.length > 0 ||
        pendingInterrupts.length > 0
      if (stillWaits) return 'waiting'
      return activeOperations.length > 0 ? 'running' : 'idle'
    }
    default:
      return undefined
  }
}

/** Where a host looks for the open session of a chat turn. */
interface TurnLookup {
  harness: AnyHarness
  /** Only the sessions of this tenant. */
  tenantId: string | undefined
  operationId: string
}

/** How each host finds the open session of a chat turn. Not public API. */
const turnFinders = new WeakMap<
  object,
  (lookup: TurnLookup) => Promise<HarnessSession | undefined>
>()

/**
 * @internal The open session of `harness` in `host`, in the tenant
 * `tenantId`, that has the chat turn `operationId`, running or ended. A
 * turn's events live in the host that runs it, so the handler joins a run
 * through this.
 */
export function sessionOfTurn<P extends Principal>(
  host: HarnessHost<P>,
  lookup: TurnLookup,
): Promise<HarnessSession | undefined> {
  return turnFinders.get(host)?.(lookup) ?? Promise.resolve(undefined)
}

/** What a host keeps for each session key: its handles and its idle timer. */
interface Hold {
  /** The handles that hold the session now. */
  handles: number
  /** The idle close that waits. */
  timer: ReturnType<typeof setTimeout> | undefined
  /** A dropped handle of this session warned already. */
  warned: boolean
}

/** What a host counts, for a leak check. */
interface HostCounts {
  /** Open sessions, and sessions that open. */
  sessions: number
  /** Handles that hold a session. */
  handles: number
  /** Session keys with a hold record. */
  holds: number
  /** Statuses that `host.events()` starts with. */
  statuses: number
  /** Sessions that close now. */
  closing: number
}

/** How each host counts. Not public API. */
const counters = new WeakMap<object, () => HostCounts>()

/**
 * @internal What `host` keeps now: sessions, handles, hold records,
 * statuses, and closes. Tests read it to find leaks.
 */
export function hostCountsOf<P extends Principal>(host: HarnessHost<P>) {
  const count = counters.get(host)
  if (!count) throw new Error('Not a host of createHarnessHost.')
  return count()
}

/** The log and run stores of each durable host. Not public API. */
const durableStores = new WeakMap<object, { log: LogStore; runs?: RunStore }>()

/**
 * @internal The log and run stores of `host` when it is durable
 * (`stores.log`), else `undefined`.
 */
export function durableStoresOf<P extends Principal>(host: HarnessHost<P>) {
  return durableStores.get(host)
}

/** The `access` of each host that has one. Not public API. */
const accesses = new WeakMap<object, unknown>()

/**
 * @internal The `access` of `host`, or `undefined` for a host with no
 * checks. The HTTP handler reads `identify` from it.
 */
export function accessOf<P extends Principal>(host: HarnessHost<P>) {
  // The host stored its own access under its own key, so it has type P.
  return accesses.get(host) as HarnessAccess<P> | undefined
}

/** The key of what `host.revoke` took: one user on one thread of a tenant. */
const revokedKey = (
  tenantId: string | undefined,
  threadId: string,
  principalId: string,
) => `${logIdOf({ tenantId, logId: threadId })}\u0000${principalId}`

/**
 * The owner and members of a fork. `'self'`: the forker alone. `'all'`: the
 * forker as the owner, and the other members with their roles, the old
 * owner as a `member`. Without a mode or a forker: those of the source.
 */
function forkedMembers(
  source: SessionIndexEntry | undefined,
  forker: Principal | undefined,
  mode: 'self' | 'all' | undefined,
) {
  if (mode === undefined || forker === undefined) {
    return { ownerId: source?.ownerId, members: source?.members ?? [] }
  }
  const owner: SessionMember = { userId: forker.id, role: 'owner' }
  if (mode === 'self') return { ownerId: forker.id, members: [owner] }
  const oldOwner = source?.ownerId
  const others = (source?.members ?? [])
    .filter((member) => member.userId !== forker.id)
    .map(
      (member): SessionMember =>
        member.role === 'owner' ? { ...member, role: 'member' } : member,
    )
  // An owner through `ownerId` alone has no entry in `members`.
  const isListed =
    oldOwner === undefined ||
    oldOwner === forker.id ||
    others.some((member) => member.userId === oldOwner)
  const old: Array<SessionMember> = isListed
    ? []
    : [{ userId: oldOwner, role: 'member' }]
  return { ownerId: forker.id, members: [owner, ...old, ...others] }
}

/** Throw a clear error for a durable store set that cannot work. */
function checkDurableStores(persistence: HarnessPersistence) {
  const { stores } = persistence
  if (stores.log === undefined) return
  if (stores.runs === undefined && stores.leases === undefined) {
    throw new Error(
      'A durable host (stores.log) needs stores.runs or stores.leases: a lease finds a crashed host.',
    )
  }
  if (stores.messages !== undefined) {
    throw new Error(
      'A durable host (stores.log) keeps the transcript and the inputs in the log. Remove stores.messages. A reader outside a session can use logMessageStore({ store }).',
    )
  }
  if (stores.inbox !== undefined && stores.workClaims === undefined) {
    throw new Error(
      'A durable host (stores.log) uses stores.inbox to pass inputs to the host that owns a thread. That needs stores.workClaims.',
    )
  }
}

/**
 * Create a host for harness sessions. With `access`, the principal type of
 * the host is what `access.identify` returns, and each call is checked (see
 * `HarnessHostOptions.access`). Throws when `access` has no
 * `stores.sessions` to keep the owner and members in.
 *
 * @example
 * ```ts
 * const host = createHarnessHost({ persistence })
 * const session = await host.open(studio, { threadId: 'thread-1' })
 * const turn = await session.send('Write a haiku about the sea.')
 * ```
 */
export function createHarnessHost<P extends Principal = Principal>(
  options: HarnessHostOptions<P> = {},
) {
  if (!options.persistence && !warned) {
    warned = true
    console.warn(
      '[@tanstack/ai-harness] No persistence given: sessions live in memory and are lost on restart.',
    )
  }
  const persistence: HarnessPersistence =
    options.persistence ?? memoryPersistence()
  checkDurableStores(persistence)
  checkSessionStore(persistence.stores.sessions)
  const { access } = options
  if (access && !persistence.stores.sessions) {
    throw new Error(
      'Host access needs stores.sessions: each session keeps its owner and members there.',
    )
  }
  const policy = access && membersOnlyPolicyOf(access.authorize)
  const memory = memoryPersistence().stores
  // ponytail: a memory inbox when the stores have none. Pass `stores.inbox`
  // to keep accepted inputs across restarts. A durable host keeps them in
  // the log instead.
  const inbox = persistence.stores.inbox ?? memory.inbox
  // ponytail: memory credentials when none are given. Pass `credentials`
  // to keep sign-ins across restarts.
  const credentials = options.credentials ?? memoryCredentialStore()
  // ponytail: memory media stores when the stores have none. Pass
  // `stores.artifacts`, `stores.blobs`, and `stores.generationRuns` to keep
  // media across restarts.
  const media = {
    stores: {
      artifacts: persistence.stores.artifacts ?? memory.artifacts,
      blobs: persistence.stores.blobs ?? memory.blobs,
      generationRuns:
        persistence.stores.generationRuns ?? memory.generationRuns,
    },
  }
  const logStore = persistence.stores.log
  const { metadata, sessions: sessionStore } = persistence.stores
  /** One per running `host.events()` read. */
  const listeners = new Set<(event: HostEvent) => void>()
  const emit = (event: HostEvent) => {
    for (const listener of [...listeners]) {
      // One reader that throws must not stop the others.
      try {
        listener(event)
      } catch (error) {
        console.error(
          '[@tanstack/ai-harness] A host events reader threw.',
          error,
        )
      }
    }
  }
  /** The latest status of each open session, by session key. */
  const statuses = new Map<string, HostStatusEvent>()
  const setStatus = (
    key: string,
    of: SessionIndexKey,
    status: HostStatusEvent['status'],
  ) => {
    if (statuses.get(key)?.status === status) return
    const event: HostStatusEvent = {
      type: 'status',
      threadId: of.threadId,
      ...(of.tenantId !== undefined ? { tenantId: of.tenantId } : {}),
      status,
      at: Date.now(),
    }
    statuses.set(key, event)
    emit(event)
  }
  const index = sessionIndex(sessionStore, emit)
  const coalesceMs = options.log?.coalesceMs ?? 100
  const limits = options.lifecycle?.retention
  const retention = {
    settledOperations: limits?.settledOperations ?? 500,
    settledAgentRuns: limits?.settledAgentRuns ?? 500,
    eventBytes: limits?.eventBytes ?? 8_000_000,
  }
  /** The shared log of each log with an open session, by its store log id. */
  const logs = new Map<string, Promise<SharedLog>>()
  /** The resolved shared logs, and the reduce that folds each one, for `logState`. */
  const resolved = new Map<
    string,
    { log: SharedLog; reduce: ReduceOptions<unknown> | undefined }
  >()
  /**
   * The shared log with the store log id `logId`, whose records with no
   * `thread` field belong to `rootThread`. The harness of the session that
   * opens it first gives the `project` and `reduce` that fold it.
   */
  const sharedLog = (
    store: LogStore,
    { logId, rootThread }: { logId: string; rootThread: string },
    harness: AnyHarness,
  ) => {
    const open = logs.get(logId)
    if (open) return open
    const project = harness.durability?.project
    const reduce = harness.durability?.reduce
    const loaded = loadLogState({
      store,
      logId,
      rootThread,
      ...(metadata ? { metadata } : {}),
      ...(project ? { project } : {}),
      ...(reduce ? { reduce } : {}),
    }).then((state) => {
      const log = new SharedLog({
        store,
        logId,
        rootThread,
        state,
        coalesceMs,
        eventBytes: retention.eventBytes,
        ...(project ? { project } : {}),
        ...(reduce ? { reduce } : {}),
        ...(metadata ? { metadata } : {}),
        // The next open folds the log again.
        onIdle: () => {
          if (logs.get(logId) === loaded) logs.delete(logId)
          if (resolved.get(logId)?.log === log) resolved.delete(logId)
        },
      })
      resolved.set(logId, { log, reduce })
      return log
    })
    loaded.catch(() => logs.delete(logId))
    logs.set(logId, loaded)
    return loaded
  }
  const sessions = new Map<string, Promise<SessionImpl>>()
  /** The plugins with `lifetime: 'host'`, shared by the sessions of a harness. */
  const hostPlugins = new HostPlugins()
  /** The sessions of `sessions` that finished opening, by key. */
  const live = new Map<string, SessionImpl>()
  /**
   * The keys of sessions that only a `resumePending` sweep opened. With
   * `close: 'whenIdle'`, such a session closes at once when it goes idle. An
   * open by the app takes a key out.
   */
  const sweptOnly = new Set<string>()
  /** The closes of sessions that left the cache, by key. */
  const closing = new Map<string, Promise<void>>()
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  const idleCloseMs = options.lifecycle?.idleCloseMs ?? 60_000
  const maxOpen = options.lifecycle?.maxOpen ?? 500
  /** `host.close()` ran: no session opens any more. */
  let isClosed = false
  /**
   * The handles and the idle timer of each session key, the least recently
   * used key first. Each open session has one.
   */
  const holds = new Map<string, Hold>()
  /** The open went past `maxOpen` with no session to close, and warned. */
  let warnedFull = false

  const hostClosed = () =>
    new Error('The host is closed. Create a new host to open sessions.')

  /** The hold of `key`, now the most recently used. */
  const touch = (key: string) => {
    const held = holds.get(key) ?? {
      handles: 0,
      timer: undefined,
      warned: false,
    }
    holds.delete(key)
    holds.set(key, held)
    return held
  }

  /** Stop the idle close of `key` that waits. */
  const cancelIdle = (key: string) => {
    const held = holds.get(key)
    clearTimeout(held?.timer)
    if (held) held.timer = undefined
  }

  /** Drop the hold record of `key` when no handle and no session uses it. */
  const dropHold = (key: string) => {
    const held = holds.get(key)
    if (!held || held.handles > 0 || sessions.has(key)) return
    clearTimeout(held.timer)
    holds.delete(key)
  }

  /** Keep the close of `key`, so the next open of the key waits for it. */
  const trackClose = (key: string, closed: Promise<void>) => {
    const settled = closed.then(
      () => {},
      () => {},
    )
    closing.set(key, settled)
    void settled.then(() => {
      if (closing.get(key) === settled) closing.delete(key)
    })
  }

  /** Take `session` out of the open sessions of `key`, when it is the one. */
  const forget = (key: string, session: SessionImpl) => {
    if (live.get(key) !== session) return
    live.delete(key)
    sessions.delete(key)
    statuses.delete(key)
    sweptOnly.delete(key)
    cancelIdle(key)
    dropHold(key)
  }

  /**
   * Close the session of `key` for every handle. From here on, an open of
   * the key gets a new session, which waits for this close. A handle opens
   * the new one on its next call.
   */
  const closeShared = (
    key: string,
    session: SessionImpl,
    closeOptions?: { recoverable?: boolean },
  ) => {
    forget(key, session)
    const closed = session.close(closeOptions)
    trackClose(key, closed)
    return closed
  }

  /** `closeShared` of an idle session: a failed close only logs. */
  const closeIdle = (key: string, session: SessionImpl) =>
    // ponytail: an idle session has no work to lose.
    closeShared(key, session).catch((error: unknown) =>
      console.error(
        '[@tanstack/ai-harness] An idle session did not close.',
        error,
      ),
    )

  /** No handle holds the open session `session` of `key`, and it is idle. */
  const isUnused = (key: string, session: SessionImpl) =>
    live.get(key) === session &&
    (holds.get(key)?.handles ?? 0) === 0 &&
    !session.isClosing() &&
    session.isIdle()

  /**
   * Start the idle close of the session of `key` when no handle holds it and
   * it is idle. With a delay of 0, it closes at once. Resolves after a close
   * that it starts.
   */
  const armIdle = (key: string) => {
    const session = live.get(key)
    const held = holds.get(key)
    if (!session || !held) {
      dropHold(key)
      return Promise.resolve()
    }
    if (held.timer !== undefined || !isUnused(key, session)) {
      return Promise.resolve()
    }
    const delay = sweptOnly.has(key) ? 0 : idleCloseMs
    if (delay <= 0) return closeIdle(key, session)
    const timer = setTimeout(() => {
      held.timer = undefined
      // A session that is busy now arms again when it goes idle.
      if (isUnused(key, session)) void closeIdle(key, session)
    }, delay)
    // The timer must not keep a process alive.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    held.timer = timer
    return Promise.resolve()
  }

  /** One more handle on the session of `key`: it does not close on idle. */
  const hold = (key: string) => {
    touch(key).handles += 1
    cancelIdle(key)
  }

  /** One handle less on the session of `key`. Resolves after its close. */
  const release = (key: string) => {
    const held = holds.get(key)
    if (!held) return Promise.resolve()
    held.handles = Math.max(0, held.handles - 1)
    touch(key)
    return armIdle(key)
  }

  /** The first dropped handle of a session warns. */
  const warnDropped = (key: string, threadId: string) => {
    const held = holds.get(key)
    if (!held || held.warned) return
    held.warned = true
    console.warn(
      `[@tanstack/ai-harness] A handle of thread ${JSON.stringify(threadId)} was dropped without close(), so the host released it. Call session.close(), or open the session with await using.`,
    )
  }

  /**
   * Room for one more session: close the least recently used sessions that
   * no handle holds and that are idle. When none is, warn once.
   */
  const makeRoom = () => {
    let excess = sessions.size + 1 - maxOpen
    if (excess <= 0) {
      warnedFull = false
      return
    }
    const keys = [...holds.keys()]
    for (const key of keys) {
      if (excess <= 0) break
      const session = live.get(key)
      if (!session || !isUnused(key, session)) continue
      void closeIdle(key, session)
      excess -= 1
    }
    if (excess <= 0 || warnedFull) return
    warnedFull = true
    console.warn(
      `[@tanstack/ai-harness] The host has ${sessions.size} open sessions, more than lifecycle.maxOpen (${maxOpen}), and each one is busy or held by a handle. Release handles with session.close().`,
    )
  }

  /** Throw when the index entry of the thread names a parent thread. */
  const refuseChild = async (key: SessionIndexKey) => {
    const parent = (await index.get(key))?.parentThreadId
    if (parent === undefined) return
    throw new Error(
      `${JSON.stringify(key.threadId)} is a child thread of ${JSON.stringify(parent)}. Open the root thread and read the child through it.`,
    )
  }

  /**
   * `host.open`, in the tenant `tenantId`, with no checks and no handle. It
   * gives the session class, so the host can call the members that the
   * `HarnessSession` type does not have. An internal open can pass a tenant
   * with no principal, so it does not claim an entry with no owner. Hold the
   * key first (`hold`), or the session can close on idle at once.
   */
  const openSession = <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, principal, logId: openLogId, promptCache }: OpenSessionOptions,
    tenantId: string | undefined,
  ) => {
    if (isClosed) return Promise.reject(hostClosed())
    const key = sessionKey(harness.name, tenantId, threadId)
    const of = { tenantId, threadId }
    touch(key)
    let session = sessions.get(key)
    // A session that closes by itself (its log failed) takes no new work.
    const stopping = live.get(key)
    if (session && stopping?.isClosing()) {
      forget(key, stopping)
      trackClose(key, stopping.close())
      session = undefined
    }
    // The app opened a thread that a sweep opened: it stays open.
    if (session) sweptOnly.delete(key)
    if (!session) {
      makeRoom()
      const logId = openLogId ?? threadId
      // The one place where the log id of the app becomes the id in the
      // store: the tenant is part of it.
      const storeLogId = logIdOf({ tenantId, logId })
      const created = new SessionImpl({
        harness,
        threadId,
        logId,
        storeLogId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        persistence,
        inbox,
        credentials,
        media,
        hostId,
        index,
        retention,
        hostPlugins,
        ...(logStore
          ? {
              log: {
                store: logStore,
                ...(harness.durability?.project
                  ? { project: harness.durability.project }
                  : {}),
                open: async (sessionThread, onFailure) => {
                  const ids = { logId: storeLogId, rootThread: logId }
                  let log = await sharedLog(logStore, ids, harness)
                  // The log closed while this open waited, and the host
                  // dropped it.
                  while (!log.isOpen) {
                    log = await sharedLog(logStore, ids, harness)
                  }
                  return log.view(sessionThread, onFailure)
                },
              },
            }
          : {}),
        ...(options.ownership ? { lease: options.ownership } : {}),
        ...(principal ? { principal } : {}),
        ...(promptCache ? { promptCache } : {}),
        ...(access ? { access: { envKeys: access.envKeys === true } } : {}),
        onEvent: (event) => {
          // A session that left the cache has no status any more.
          if (sessions.get(key) !== session) return
          const status = statusAfter(created, event)
          if (status === 'running') cancelIdle(key)
          if (status) setStatus(key, of, status)
        },
        // A new session under this key opens only after this one closed.
        onClose: () => forget(key, created),
        // After the call: the session may close, but not inside its own code.
        onIdle: () =>
          queueMicrotask(() => {
            if (live.get(key) === created) void armIdle(key)
          }),
      })
      // A session under this key may still close: it lets go of the thread
      // first.
      const closed = closing.get(key) ?? Promise.resolve()
      session = closed
        .then(() => refuseChild(of))
        .then(() => created.open())
        .then(
          () => {
            if (sessions.get(key) !== session) return created
            live.set(key, created)
            // A recovered turn can run already. Else the new session is
            // idle.
            if (!statuses.has(key)) setStatus(key, of, 'idle')
            // A session that no handle holds (a sweep) closes on idle too.
            void armIdle(key)
            return created
          },
          (error: unknown) => {
            if (sessions.get(key) === session) {
              sessions.delete(key)
              statuses.delete(key)
            }
            dropHold(key)
            throw error
          },
        )
      sessions.set(key, session)
    }
    // The key names the harness, so the session is a session of `harness`.
    // A map of sessions cannot carry a harness type per key.
    return session as Promise<SessionImpl<THarness>>
  }

  /**
   * How often `host.revoke` took each user's access to each thread. A handle
   * keeps the count of its open, and refuses each call once it changed.
   */
  // ponytail: one count per revoked user and thread, for the life of the
  // host. Drop the old ones if a host revokes millions.
  const revocations = new Map<string, number>()

  /** Count a revoke, and tell the readers of `host.events()`. */
  const revokeUser = ({
    tenantId,
    threadId,
    principalId,
  }: {
    tenantId: string | undefined
    threadId: string
    principalId: string
  }) => {
    const key = revokedKey(tenantId, threadId, principalId)
    revocations.set(key, (revocations.get(key) ?? 0) + 1)
    emit({
      type: 'revoked',
      ...(tenantId !== undefined ? { tenantId } : {}),
      threadId,
      principalId,
      at: Date.now(),
    })
  }

  /** With access, the principal of a public call: it is required. */
  const need = (principal: P | undefined, call: string) => {
    if (principal === undefined) {
      throw new Error(`${call} needs a principal: the host has access.`)
    }
    return principal
  }

  /** The entry of the root thread of `entry`. A child is checked through it. */
  const rootOf = async (entry: SessionIndexEntry) => {
    let root = entry
    const seen = new Set([root.threadId])
    while (
      root.parentThreadId !== undefined &&
      !seen.has(root.parentThreadId)
    ) {
      seen.add(root.parentThreadId)
      const parent = await index.get({
        tenantId: root.tenantId,
        threadId: root.parentThreadId,
      })
      if (!parent) break
      root = parent
    }
    return root
  }

  /**
   * Throw `AccessDeniedError` unless `authorize` lets `principal` do
   * `action` on the thread of `entry`. Without access, it allows all. The
   * entries are read in the tenant of the principal, so a session of
   * another tenant is never found.
   */
  const allow = async ({
    principal,
    action,
    threadId,
    entry,
    run,
  }: {
    principal: P
    action: AccessAction
    threadId: string
    entry: SessionIndexEntry | undefined
    run?: AccessRun
  }) => {
    if (!access) return
    const { tenantId } = principal
    // A thread with no entry has no owner and no members.
    const session: AccessSession = entry
      ? await rootOf(entry)
      : {
          ...(tenantId !== undefined ? { tenantId } : {}),
          threadId,
          members: [],
        }
    const isAllowed = await access.authorize({
      principal,
      action,
      session,
      ...(run ? { run } : {}),
    })
    if (!isAllowed) throw new AccessDeniedError({ action, threadId })
  }

  /**
   * The entry of a thread for a public call, after the check of `action`.
   * With access, the principal is required, and a thread with no entry
   * needs no check: the call finds nothing.
   */
  const checkEntry = async (
    call: string,
    action: AccessAction,
    { threadId, principal }: { threadId: string; principal?: P | undefined },
  ) => {
    const user = access ? need(principal, call) : undefined
    const entry = await index.get({ tenantId: principal?.tenantId, threadId })
    if (user && entry) await allow({ principal: user, action, threadId, entry })
    return entry
  }

  /** With access, the source of a fork needs an entry and the `fork` action. */
  const checkFork = async (
    call: string,
    target: { threadId: string; principal?: P | undefined },
  ) => {
    const source = await checkEntry(call, 'fork', target)
    // No entry is not found: the same answer as a refusal.
    if (access && !source) {
      throw new AccessDeniedError({ action: 'fork', threadId: target.threadId })
    }
    return source
  }

  /** `share` and `unshare` change the members list of `membersOnly()`. */
  const checkShare = async (
    call: string,
    target: { threadId: string; principal?: P | undefined },
  ) => {
    if (!policy) {
      throw new Error(
        `${call} needs membersOnly() as the authorize of the host access. With your own access tables, change them and call host.revoke.`,
      )
    }
    await checkEntry(call, 'share', target)
    return need(target.principal, call)
  }

  /** The checks of a handle of `principal` on `threadId`. */
  const guardOf = (principal: P, threadId: string): HandleGuard => {
    const key = revokedKey(principal.tenantId, threadId, principal.id)
    const count = revocations.get(key) ?? 0
    return {
      isRevoked: () => (revocations.get(key) ?? 0) !== count,
      authorize: async (action, run) =>
        allow({
          principal,
          action,
          threadId,
          entry: await index.get({ tenantId: principal.tenantId, threadId }),
          ...(run ? { run } : {}),
        }),
    }
  }

  /**
   * `openSession` with the checks of `host.open`: with access, a thread that
   * exists needs the `read` action, and a new thread is checked unless its
   * open made the principal its owner. Hold the key first.
   */
  const openChecked = async <THarness extends AnyHarness>(
    harness: THarness,
    openOptions: OpenSessionOptions<P>,
  ) => {
    if (!access) {
      return openSession(harness, openOptions, openOptions.principal?.tenantId)
    }
    const principal = need(openOptions.principal, 'host.open')
    const { threadId } = openOptions
    const ids = { tenantId: principal.tenantId, threadId }
    const before = await index.get(ids)
    // The open refuses a child thread, and says why.
    const isRoot = before !== undefined && before.parentThreadId === undefined
    if (isRoot) {
      await allow({ principal, action: 'read', threadId, entry: before })
    }
    const session = await openSession(harness, openOptions, principal.tenantId)
    if (!before) {
      // Two users can create one thread at once. Only the user whose open
      // wrote the entry needs no check.
      const created = await index.get(ids)
      if (created?.ownerId !== principal.id) {
        await allow({ principal, action: 'read', threadId, entry: created })
      }
    }
    return session
  }

  /**
   * The handle of the session of `key` for the principal of `openOptions`.
   * It holds the key already (`hold`), and releases it on close. With access,
   * it checks. A call on it after the session closed opens it again with
   * `openOptions`.
   */
  const handleOf = <THarness extends AnyHarness>({
    harness,
    session,
    openOptions,
    key,
  }: {
    harness: THarness
    session: SessionImpl<THarness>
    openOptions: OpenSessionOptions<P>
    key: string
  }) => {
    const { principal } = openOptions
    const { threadId } = session
    return sessionHandle({
      session,
      principal,
      ...(access && principal ? { guard: guardOf(principal, threadId) } : {}),
      lease: {
        current: () => {
          // After `host.close()`, a call refuses at once.
          const open = isClosed ? undefined : live.get(key)
          // The key names the harness, so the session is a session of
          // `harness`, as in `openSession`.
          return open && !open.isClosing()
            ? (open as SessionImpl<THarness>)
            : undefined
        },
        reopen: () => {
          if (isClosed) throw hostClosed()
          return openChecked(harness, openOptions)
        },
        hold: () => hold(key),
        release: (releaseOptions) => {
          if (releaseOptions?.dropped) warnDropped(key, threadId)
          return release(key)
        },
      },
    })
  }

  /** The session keys of a thread of a tenant on this host, of any harness. */
  const keysOf = (tenantId: string | undefined, threadId: string) => {
    const suffix = `\u0000${logIdOf({ tenantId, logId: threadId })}`
    return [...sessions.keys()].filter((key) => key.endsWith(suffix))
  }

  /** The open sessions of a thread of a tenant on this host, of any harness. */
  const openSessionsOf = async (
    tenantId: string | undefined,
    threadId: string,
  ) => {
    const opened = await Promise.allSettled(
      keysOf(tenantId, threadId).flatMap((key) => sessions.get(key) ?? []),
    )
    return opened.flatMap((entry) =>
      entry.status === 'fulfilled' ? [entry.value] : [],
    )
  }

  /** The thread ids of the index entries with `threadId` as parent. */
  const childrenOf = async (tenantId: string | undefined, threadId: string) => {
    if (!sessionStore) return []
    const children: Array<string> = []
    let cursor: string | undefined
    do {
      const page = await sessionStore.list({
        tenantId,
        parentThreadId: threadId,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      children.push(...page.entries.map((entry) => entry.threadId))
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor !== undefined)
    return children
  }

  /**
   * `host.sessions.delete` after its check: close the open sessions of the
   * thread, purge its children depth first, then delete its data and its
   * entry. `seen` stops a loop of parent ids.
   */
  const purge = async (
    tenantId: string | undefined,
    threadId: string,
    seen: Set<string>,
  ): Promise<void> => {
    if (seen.has(threadId)) return
    seen.add(threadId)
    // First, so no session of the thread writes or starts a child while
    // the purge runs. For every handle.
    const keys = keysOf(tenantId, threadId)
    for (const key of keys) {
      const session = await sessions.get(key)?.catch(() => undefined)
      if (session) await closeShared(key, session)
    }
    const children = await childrenOf(tenantId, threadId)
    for (const child of children) await purge(tenantId, child, seen)
    const storeId = logIdOf({ tenantId, logId: threadId })
    // A `host.observe` view can still hold the shared log of the thread.
    // Its reads end, and the next open folds the log from the store.
    resolved.get(storeId)?.log.stopReaders()
    logs.delete(storeId)
    resolved.delete(storeId)
    await purgeThreadData({
      storeId,
      stores: persistence.stores,
      media: media.stores,
    })
    await index.remove({ tenantId, threadId })
  }

  /**
   * `host.fork` after its checks: the session class of the new thread, and
   * its key, which the fork holds. Give the hold to a handle, or release it.
   */
  const forkInto = async <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, newThreadId, at, principal, logId }: ForkSessionOptions<P>,
  ) => {
    if (newThreadId === threadId) {
      throw new Error('A fork needs a new thread: newThreadId is threadId.')
    }
    const tenantId = principal?.tenantId
    // The fork holds the source while it reads it.
    const sourceKey = sessionKey(harness.name, tenantId, threadId)
    hold(sourceKey)
    try {
      // In the tenant of the fork, with no principal: the fork does not
      // become the owner of a source with no owner.
      const source = await openSession(
        harness,
        { threadId, ...(logId ? { logId } : {}) },
        tenantId,
      )
      const transcript = await source.transcript()
      const end =
        at === undefined
          ? transcript.length
          : at === null
            ? 0
            : transcript.findIndex((message) => message.id === at) + 1
      if (typeof at === 'string' && end === 0) {
        throw new Error(
          `Thread ${JSON.stringify(threadId)} has no message ${JSON.stringify(at)}.`,
        )
      }
      // The new thread opens with no `logId`, so its log is its own. Its
      // transcript key in `stores.messages` is the same id.
      const newLogId = logIdOf({ tenantId, logId: newThreadId })
      // With access, a thread with an entry belongs to someone already.
      const isTaken =
        access !== undefined &&
        (await index.get({ tenantId, threadId: newThreadId })) !== undefined
      const isUsed =
        isTaken ||
        (logStore
          ? (await logStore.read({ logId: newLogId, limit: 1 })).length > 0
          : ((await persistence.stores.messages?.loadThread(newLogId))
              ?.length ?? 0) > 0)
      if (isUsed) {
        throw new Error(
          `Thread ${JSON.stringify(newThreadId)} is not empty. Fork into a new thread.`,
        )
      }
      const key = sessionKey(harness.name, tenantId, newThreadId)
      hold(key)
      try {
        const fork = await openSession(
          harness,
          { threadId: newThreadId, ...(principal ? { principal } : {}) },
          tenantId,
        )
        await fork.adoptFork(source, transcript.slice(0, end))
        return { fork, key }
      } catch (error) {
        await release(key)
        throw error
      }
    } finally {
      // A source that only this fork opened closes on idle.
      await release(sourceKey)
    }
  }

  /**
   * A reader of the log `ids` for the thread `threadId`, on a durable host,
   * and the reduce that folds the log. It shares the log of the open
   * sessions and the other readers. Close it after the read.
   */
  const readLog = async (
    store: LogStore,
    ids: { logId: string; rootThread: string },
    harness: AnyHarness,
    threadId: string,
  ) => {
    let log = await sharedLog(store, ids, harness)
    // The log closed while this read waited, and the host dropped it.
    while (!log.isOpen) log = await sharedLog(store, ids, harness)
    // `host.close()` ran while the log loaded: it stopped the readers.
    if (isClosed) throw hostClosed()
    return {
      reader: log.reader(threadId),
      reduce: resolved.get(ids.logId)?.reduce,
    }
  }

  const host: HarnessHost<P> = {
    async open(harness, openOptions) {
      if (isClosed) throw hostClosed()
      const tenantId = openOptions.principal?.tenantId
      const key = sessionKey(harness.name, tenantId, openOptions.threadId)
      // Before the open, so the session never closes on idle under it.
      hold(key)
      try {
        const session = await openChecked(harness, openOptions)
        return handleOf({ harness, session, openOptions, key })
      } catch (error) {
        await release(key)
        throw error
      }
    },
    async observe(harness, { threadId, principal, logId: openLogId }) {
      if (isClosed) throw hostClosed()
      const tenantId = principal?.tenantId
      if (access) {
        const user = need(principal, 'host.observe')
        const entry = await index.get({ tenantId, threadId })
        // No entry is not found: the same answer as a refusal.
        if (!entry) throw new AccessDeniedError({ action: 'read', threadId })
        // `allow` checks a child thread through its root thread.
        await allow({ principal: user, action: 'read', threadId, entry })
      }
      const key = sessionKey(harness.name, tenantId, threadId)
      const logId = openLogId ?? threadId
      const ids = { logId: logIdOf({ tenantId, logId }), rootThread: logId }
      return observedSession({
        harness,
        threadId,
        tenantId,
        live: () => {
          const open = isClosed ? undefined : live.get(key)
          // The key names the harness, so the session is a session of
          // `harness`, as in `openSession`.
          return open && !open.isClosing()
            ? (open as SessionImpl<typeof harness>)
            : undefined
        },
        check: () => {
          if (isClosed) throw hostClosed()
        },
        index,
        persistence,
        media,
        readLog: logStore
          ? () => readLog(logStore, ids, harness, threadId)
          : undefined,
      })
    },
    isOpen(harness, { threadId, principal }) {
      if (access) need(principal, 'host.isOpen')
      return sessions.has(
        sessionKey(harness.name, principal?.tenantId, threadId),
      )
    },
    async fork(harness, forkOptions) {
      await checkFork('host.fork', forkOptions)
      const { fork, key } = await forkInto(harness, forkOptions)
      const { principal } = forkOptions
      const openOptions = {
        threadId: fork.threadId,
        ...(principal ? { principal } : {}),
      }
      return handleOf({ harness, session: fork, openOptions, key })
    },
    revoke: ({ threadId, principal }) =>
      revokeUser({
        tenantId: principal.tenantId,
        threadId,
        principalId: principal.id,
      }),
    hasAccess: access !== undefined,
    async identify({ request }) {
      if (!access) {
        throw new Error(
          'host.identify needs host access ({ identify, authorize }).',
        )
      }
      return await access.identify({ request })
    },
    async resumePending({ harnesses, close = 'whenIdle', limit = 100 }) {
      const claims = persistence.stores.workClaims
      if (!claims) throw new Error('resumePending needs stores.workClaims.')
      const ttlMs = options.ownership?.ttlMs ?? LEASE.ttlMs
      const byName = new Map(
        harnesses.map((harness) => [harness.name, harness]),
      )
      // `listExpired` has no cursor, and claims of other harnesses come back
      // too. Read more until `limit` are ours or the store has no more.
      // ponytail: re-reads the first claims each round. Add a harness filter
      // to the store if many claims of other harnesses pile up.
      const now = Date.now()
      let expired: Array<{ threadId: string; harness: string }> = []
      for (let size = limit; ; size *= 2) {
        const page = await claims.listExpired({ now, limit: size })
        expired = page.filter((claim) => byName.has(claim.harness))
        if (expired.length >= limit || page.length < size) break
      }
      expired = expired.slice(0, limit)
      const opened: Array<{ threadId: string; harness: string }> = []
      const failures: Array<unknown> = []
      for (const { threadId: claimed, harness: name } of expired) {
        const harness = byName.get(name)
        if (!harness) continue
        // Compare-and-set: of two hosts that sweep at once, one gets it.
        const isMine = await claims.claim({
          threadId: claimed,
          harness: name,
          ownerId: hostId,
          until: Date.now() + ttlMs,
        })
        if (!isMine) continue
        // A claim is on the store key of the thread: its tenant and its id.
        const { tenantId, logId: threadId } = parseLogId(claimed)
        const key = sessionKey(name, tenantId, threadId)
        // Only a session that this sweep opens closes at once when idle. A
        // session that the app has open stays open. No handle holds the
        // session, so it closes on idle in any case.
        const isOwn = close === 'whenIdle' && !sessions.has(key)
        if (isOwn) sweptOnly.add(key)
        try {
          await openSession(harness, { threadId }, tenantId)
        } catch (error) {
          // One thread that cannot open must not stop the sweep. The claim
          // goes back, so the next sweep tries again.
          sweptOnly.delete(key)
          await claims
            .release({ threadId: claimed, ownerId: hostId })
            .catch(() => {})
          failures.push(error)
          continue
        }
        opened.push({ threadId, harness: name })
      }
      if (failures.length > 0) {
        // `opened` says which threads did start.
        throw Object.assign(
          new AggregateError(
            failures,
            `resumePending opened ${opened.length} threads; ${failures.length} failed to open.`,
          ),
          { opened },
        )
      }
      return opened
    },
    async recover(threadId) {
      const opened = await Promise.allSettled(sessions.values())
      await Promise.all(
        opened.flatMap((entry) =>
          entry.status === 'fulfilled' &&
          (threadId === undefined || entry.value.threadId === threadId)
            ? [entry.value.recover()]
            : [],
        ),
      )
    },
    async reload(harness) {
      const prefix = `${harness.name}\u0000`
      const opened = await Promise.allSettled(
        [...sessions].flatMap(([key, session]) =>
          key.startsWith(prefix) ? [session] : [],
        ),
      )
      const results = await Promise.allSettled(
        opened.flatMap((entry) =>
          entry.status === 'fulfilled' ? [entry.value.reload()] : [],
        ),
      )
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason
      }
    },
    async close(closeOptions) {
      // First: no open starts while the sessions close.
      isClosed = true
      for (const key of holds.keys()) cancelIdle(key)
      // The event reads of `host.observe` views end.
      for (const { log } of resolved.values()) log.stopReaders()
      await Promise.allSettled(closing.values())
      const opened = await Promise.allSettled(sessions.values())
      await Promise.all(
        opened
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close(closeOptions)),
      )
      // After the sessions: each one gave its host plugins back.
      await hostPlugins.close()
    },
    logState: ({ harness, logId, principal }) => {
      if (access) need(principal, 'host.logState')
      const folded = resolved.get(
        logIdOf({ tenantId: principal?.tenantId, logId }),
      )
      // The reduce of another harness folded this log: its state has
      // another type.
      if (folded?.reduce !== harness.durability?.reduce) return undefined
      // The reduce of `harness` folded the state, so it has that type. A
      // map of logs cannot carry a state type per log.
      return folded?.log.state.reduced as
        | HarnessLogStateOf<typeof harness>
        | undefined
    },
    sessions: {
      async list({ principal, ...filters } = {}) {
        if (!sessionStore) return { entries: [] }
        // Last, so a filter never names another tenant.
        const tenantId = principal?.tenantId
        if (!access) {
          return sessionStore.list({
            parentThreadId: null,
            ...filters,
            tenantId,
          })
        }
        const user = need(principal, 'host.sessions.list')
        const parent = filters.parentThreadId
        // The children of a thread are read through their root: one check,
        // and no member filter, as a child has no members.
        if (typeof parent === 'string') {
          await checkEntry('host.sessions.list', 'list', {
            threadId: parent,
            principal: user,
          })
          return sessionStore.list({ ...filters, tenantId })
        }
        const page = await sessionStore.list({
          parentThreadId: null,
          ...filters,
          tenantId,
          // The store keeps only the sessions of the member, so a page of
          // `membersOnly()` stays full.
          ...(policy ? { memberId: user.id } : {}),
        })
        const allowed = await Promise.all(
          page.entries.map(async (session) =>
            access.authorize({ principal: user, action: 'list', session }),
          ),
        )
        return {
          ...page,
          entries: page.entries.filter((_entry, at) => allowed[at]),
        }
      },
      get: (target) => checkEntry('host.sessions.get', 'read', target),
      async rename({ threadId, title, principal }) {
        const call = 'host.sessions.rename'
        await checkEntry(call, 'configure', { threadId, principal })
        return index.update(
          { tenantId: principal?.tenantId, threadId },
          (entry) => entry && { ...entry, title, updatedAt: Date.now() },
        )
      },
      async update({ harness, threadId, update, principal }) {
        const call = 'host.sessions.update'
        await checkEntry(call, 'configure', { threadId, principal })
        // The schema checked the metadata, so it has the harness type.
        return (await index.update(
          { tenantId: principal?.tenantId, threadId },
          (entry) => {
            checkHarness(entry, harness)
            return changedEntry(
              entry,
              update as SessionEntryUpdate<any, SessionEntryChange<any>>,
              harness.metadataSchema,
            )
          },
        )) as SessionIndexEntry<SessionMetadataOf<typeof harness>> | undefined
      },
      async delete({ threadId, principal }) {
        await checkEntry('host.sessions.delete', 'delete', {
          threadId,
          principal,
        })
        await purge(principal?.tenantId, threadId, new Set())
      },
      async fork({ harness, threadId, at, members, principal }) {
        const tenantId = principal?.tenantId
        // Check before a session opens. Without a sessions store there is no
        // entry, so there is nothing to check.
        const source = await checkFork('host.sessions.fork', {
          threadId,
          principal,
        })
        checkHarness(source, harness)
        // `host.fork` takes the last message to copy, so `before` becomes
        // the message just before it, or `null` before the first one.
        let last: string | null = 'through' in at ? at.through : null
        // The source stays open from the read of `before` to the fork.
        const sourceKey = sessionKey(harness.name, tenantId, threadId)
        hold(sourceKey)
        let forked: SessionImpl
        try {
          if ('before' in at) {
            // With no principal, as `host.fork` opens the source.
            const opened = await openSession(harness, { threadId }, tenantId)
            const transcript = await opened.transcript()
            const position = transcript.findIndex(({ id }) => id === at.before)
            if (position === -1) {
              throw new Error(
                `The transcript has no message with id ${at.before}.`,
              )
            }
            if (position > 0) {
              const previous = transcript[position - 1]?.id
              if (!previous) {
                throw new Error(`The message before ${at.before} has no id.`)
              }
              last = previous
            }
          }
          const { fork, key } = await forkInto(harness, {
            threadId,
            newThreadId: `thread-${crypto.randomUUID()}`,
            at: last,
            ...(principal ? { principal } : {}),
          })
          forked = fork
          // No handle takes the fork: it closes on idle.
          await release(key)
        } finally {
          await release(sourceKey)
        }
        const mode =
          members ?? (access ? (policy?.fork.members ?? 'self') : undefined)
        const { ownerId, members: people } = forkedMembers(
          source,
          principal,
          mode,
        )
        const now = Date.now()
        // A sibling of the old thread, not a child: no parentThreadId.
        const entry: SessionIndexEntry = {
          ...(tenantId !== undefined ? { tenantId } : {}),
          threadId: forked.threadId,
          ...(ownerId !== undefined ? { ownerId } : {}),
          members: people,
          createdAt: now,
          updatedAt: now,
          harness: harness.name,
          ...(source?.title ? { title: `${source.title} (fork)` } : {}),
        }
        return (
          (await index.update(
            { tenantId, threadId: entry.threadId },
            (current) => {
              // The open of the fork wrote an entry already: keep what it
              // holds, but not its owner. The owner and the members come
              // from `members`.
              const { ownerId: _opener, ...opened } = current ?? entry
              return {
                ...entry,
                ...opened,
                ...(entry.title ? { title: entry.title } : {}),
                members: entry.members,
                updatedAt: now,
              }
            },
          )) ?? entry
        )
      },
      async share({ threadId, userId, role, principal }) {
        const call = 'host.sessions.share'
        const user = await checkShare(call, { threadId, principal })
        return index.update(
          { tenantId: user.tenantId, threadId },
          (entry) =>
            entry && {
              ...entry,
              members: [
                ...entry.members.filter((member) => member.userId !== userId),
                { userId, role },
              ],
              updatedAt: Date.now(),
            },
        )
      },
      async unshare({ threadId, userId, principal }) {
        const call = 'host.sessions.unshare'
        const user = await checkShare(call, { threadId, principal })
        const { tenantId } = user
        const changed = await index.update({ tenantId, threadId }, (entry) => {
          if (!entry) return undefined
          if (entry.ownerId === userId) {
            throw new Error(
              `${JSON.stringify(userId)} owns thread ${JSON.stringify(threadId)}: the owner cannot be removed.`,
            )
          }
          return {
            ...entry,
            members: entry.members.filter((member) => member.userId !== userId),
            updatedAt: Date.now(),
          }
        })
        // After the write, so no new work of the user gets through. The log
        // keeps who cancelled it.
        const open = await openSessionsOf(tenantId, threadId)
        for (const session of open) {
          await session.cancelWorkOf({ userId, principal: user })
        }
        revokeUser({ tenantId, threadId, principalId: userId })
        return changed
      },
    },
    async *events({ signal } = {}) {
      // The current statuses first. A change while the reader handles an
      // event waits in the queue.
      const queue: Array<HostEvent> = [...statuses.values()]
      let wake = () => {}
      const listener = (event: HostEvent) => {
        queue.push(event)
        wake()
      }
      const onAbort = () => wake()
      listeners.add(listener)
      signal?.addEventListener('abort', onAbort)
      try {
        while (!signal?.aborted) {
          const next = queue.shift()
          if (next) {
            yield next
            continue
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      } finally {
        // A loop that ends (break, return, throw, abort) stops listening.
        listeners.delete(listener)
        signal?.removeEventListener('abort', onAbort)
      }
    },
  }
  if (logStore) {
    const { runs } = persistence.stores
    durableStores.set(host, { log: logStore, ...(runs ? { runs } : {}) })
  }
  if (access) accesses.set(host, access)
  counters.set(host, () => ({
    sessions: sessions.size,
    handles: [...holds.values()].reduce(
      (total, held) => total + held.handles,
      0,
    ),
    holds: holds.size,
    statuses: statuses.size,
    closing: closing.size,
  }))
  turnFinders.set(host, async ({ harness, tenantId, operationId }) => {
    // The key of a session with an empty thread id is the start of the keys
    // of the harness and tenant: the encoded tenant has no `:`.
    const prefix = sessionKey(harness.name, tenantId, '')
    for (const [key, opening] of sessions) {
      if (!key.startsWith(prefix)) continue
      const session = await opening.catch(() => undefined)
      if (session?.operation(operationId)?.kind === 'chat') return session
    }
    return undefined
  })
  return host
}
