import { EventType } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import { AccessDeniedError, membersOnlyPolicyOf } from './access'
import { SharedLog, loadLogState, logIdOf, parseLogId } from './log'
import { LEASE } from './resume'
import { SessionImpl } from './session/harness-session'
import { sessionHandle } from './session/handle'
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
}

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
 * and `rename` and `delete` write nothing.
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
   * Remove the index entry of a thread. After it, `get` is `undefined`, and
   * the next open of the thread writes a new entry. Only the entry goes: the
   * transcript, the log, and the other data of the thread stay in their
   * stores.
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
   * (default): it closes when its pending work ends, unless the app opened
   * the thread too. `'never'`: it stays open, like any opened session.
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
   * Is a session of `harness` open on `threadId` on this host, in the tenant
   * of `principal`?
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
   * Close every live session. With `recoverable`, their running work stops
   * with no settlement, and the next host that opens a thread runs it again.
   * See `session.close`.
   *
   * @example
   * ```ts
   * await host.close({ recoverable: true })
   * ```
   */
  close: (options?: { recoverable?: boolean }) => Promise<void>
  /**
   * The `durability.reduce` fold of `harness` for a log that has an open
   * session in this host. `logId` is the `logId` of `open`, in the tenant of
   * `principal`. `undefined` when no session has the log open, or when the
   * reduce of another harness folded the log (the harness of its first
   * session folds a shared log).
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
  /**
   * The keys of sessions that only a `resumePending` sweep opened. With
   * `close: 'whenIdle'`, the sweep closes only these. An open by the app
   * takes a key out.
   */
  const sweptOnly = new Set<string>()
  /** The closes of swept sessions that left the cache, by key. */
  const closing = new Map<string, Promise<void>>()
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

  /** Throw when the index entry of the thread names a parent thread. */
  const refuseChild = async (key: SessionIndexKey) => {
    const parent = (await index.get(key))?.parentThreadId
    if (parent === undefined) return
    throw new Error(
      `${JSON.stringify(key.threadId)} is a child thread of ${JSON.stringify(parent)}. Open the root thread and read the child through it.`,
    )
  }

  /**
   * `host.open`, in the tenant `tenantId`. It gives the session class, so
   * the host can call the members that the `HarnessSession` type does not
   * have. An internal open can pass a tenant with no principal, so it does
   * not claim an entry with no owner.
   */
  const openSession = <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, principal, logId: openLogId, promptCache }: OpenSessionOptions,
    tenantId: string | undefined,
  ) => {
    const key = sessionKey(harness.name, tenantId, threadId)
    const of = { tenantId, threadId }
    let session = sessions.get(key)
    // The app opened a thread that a sweep opened: it stays open.
    if (session) sweptOnly.delete(key)
    if (!session) {
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
          const status = statusAfter(created, event)
          if (status) setStatus(key, of, status)
        },
        onClose: () => {
          // A sweep may have put a new session under this key already. It
          // opens only after this one closed, so its status is not set yet.
          if (sessions.get(key) === session) sessions.delete(key)
          statuses.delete(key)
        },
      })
      // A swept session under this key may still close: it lets go of
      // the thread first.
      const closed = closing.get(key) ?? Promise.resolve()
      session = closed
        .then(() => refuseChild(of))
        .then(() => created.open())
        .then(
          () => {
            // A recovered turn can run already. Else the new session is
            // idle.
            if (!statuses.has(key)) setStatus(key, of, 'idle')
            return created
          },
          (error: unknown) => {
            sessions.delete(key)
            statuses.delete(key)
            throw error
          },
        )
      sessions.set(key, session)
    }
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

  /** The handle of `session` for `principal`. With access, it checks. */
  const handleOf = <THarness extends AnyHarness>(
    session: SessionImpl<THarness>,
    principal: P | undefined,
  ) =>
    sessionHandle({
      session,
      principal,
      ...(access && principal
        ? { guard: guardOf(principal, session.threadId) }
        : {}),
    })

  /** The open sessions of a thread of a tenant on this host, of any harness. */
  const openSessionsOf = async (
    tenantId: string | undefined,
    threadId: string,
  ) => {
    const suffix = `\u0000${logIdOf({ tenantId, logId: threadId })}`
    const live = await Promise.allSettled(
      [...sessions].flatMap(([key, session]) =>
        key.endsWith(suffix) ? [session] : [],
      ),
    )
    return live.flatMap((entry) =>
      entry.status === 'fulfilled' ? [entry.value] : [],
    )
  }

  /** `host.fork` after its checks: the session class of the new thread. */
  const forkInto = async <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, newThreadId, at, principal, logId }: ForkSessionOptions<P>,
  ) => {
    if (newThreadId === threadId) {
      throw new Error('A fork needs a new thread: newThreadId is threadId.')
    }
    const tenantId = principal?.tenantId
    // A source that only this fork opens closes again at the end.
    const wasOpen = sessions.has(sessionKey(harness.name, tenantId, threadId))
    // In the tenant of the fork, with no principal: the fork does not
    // become the owner of a source with no owner.
    const source = await openSession(
      harness,
      { threadId, ...(logId ? { logId } : {}) },
      tenantId,
    )
    try {
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
      const fork = await openSession(
        harness,
        { threadId: newThreadId, ...(principal ? { principal } : {}) },
        tenantId,
      )
      await fork.adoptFork(source, transcript.slice(0, end))
      return fork
    } finally {
      // A failed close must not hide the fork's own error.
      if (!wasOpen)
        await source
          .close()
          .catch((error: unknown) =>
            console.error(
              '[@tanstack/ai-harness] The source session did not close.',
              error,
            ),
          )
    }
  }

  const host: HarnessHost<P> = {
    async open(harness, openOptions) {
      if (!access) {
        const { principal } = openOptions
        const session = await openSession(
          harness,
          openOptions,
          principal?.tenantId,
        )
        return handleOf(session, principal)
      }
      const principal = need(openOptions.principal, 'host.open')
      const { threadId } = openOptions
      const key = { tenantId: principal.tenantId, threadId }
      const before = await index.get(key)
      // The open refuses a child thread, and says why.
      const isRoot = before !== undefined && before.parentThreadId === undefined
      if (isRoot) {
        await allow({ principal, action: 'read', threadId, entry: before })
      }
      const session = await openSession(
        harness,
        openOptions,
        principal.tenantId,
      )
      if (!before) {
        // Two users can create one thread at once. Only the user whose open
        // wrote the entry needs no check.
        const created = await index.get(key)
        if (created?.ownerId !== principal.id) {
          await allow({ principal, action: 'read', threadId, entry: created })
        }
      }
      return handleOf(session, principal)
    },
    isOpen(harness, { threadId, principal }) {
      if (access) need(principal, 'host.isOpen')
      return sessions.has(
        sessionKey(harness.name, principal?.tenantId, threadId),
      )
    },
    async fork(harness, forkOptions) {
      await checkFork('host.fork', forkOptions)
      return handleOf(
        await forkInto(harness, forkOptions),
        forkOptions.principal,
      )
    },
    revoke: ({ threadId, principal }) =>
      revokeUser({
        tenantId: principal.tenantId,
        threadId,
        principalId: principal.id,
      }),
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
        // Only a session that this sweep opens closes when idle. A session
        // that the app has open stays open.
        const isOwn = close === 'whenIdle' && !sessions.has(key)
        if (isOwn) sweptOnly.add(key)
        let session: SessionImpl
        try {
          session = await openSession(harness, { threadId }, tenantId)
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
        if (isOwn) {
          const stop = session.onIdle(() => {
            stop()
            // The app opened it since: it stays open.
            if (!sweptOnly.delete(key)) return
            // From here on, an open gets a new session, so a new prompt
            // never reaches this one while it closes.
            sessions.delete(key)
            // ponytail: a failed close is dropped, as an idle session has no
            // work to lose.
            const closed = session.close().catch(() => {})
            closing.set(key, closed)
            void closed.then(() => {
              if (closing.get(key) === closed) closing.delete(key)
            })
          })
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
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live.flatMap((entry) =>
          entry.status === 'fulfilled' &&
          (threadId === undefined || entry.value.threadId === threadId)
            ? [entry.value.recover()]
            : [],
        ),
      )
    },
    async reload(harness) {
      const prefix = `${harness.name}\u0000`
      const live = await Promise.allSettled(
        [...sessions].flatMap(([key, session]) =>
          key.startsWith(prefix) ? [session] : [],
        ),
      )
      const results = await Promise.allSettled(
        live.flatMap((entry) =>
          entry.status === 'fulfilled' ? [entry.value.reload()] : [],
        ),
      )
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason
      }
    },
    async close(closeOptions) {
      await Promise.allSettled(closing.values())
      const live = await Promise.allSettled(sessions.values())
      await Promise.all(
        live
          .filter((entry) => entry.status === 'fulfilled')
          .map((entry) => entry.value.close(closeOptions)),
      )
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
        await index.remove({ tenantId: principal?.tenantId, threadId })
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
        const forked = await forkInto(harness, {
          threadId,
          newThreadId: `thread-${crypto.randomUUID()}`,
          at: last,
          ...(principal ? { principal } : {}),
        })
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
