import { EventType } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import { AccessDeniedError, membersOnlyPolicyOf } from './access'
import {
  SharedLog,
  loadLogState,
  logIdOf,
  loggedTargetOf,
  parseLogId,
  sessionOf,
} from './log'
import { HostEventBus, tenantOfHostEvent } from './host-event-bus'
import { refreshFlights } from './auth'
import { HostPlugins } from './host-plugins'
import { purgeThreadData } from './purge'
import { HostOwnership, OPEN_RETRY_MS } from './ownership'
import { withSpan } from './observability'
import { SessionImpl } from './session/harness-session'
import { authorizeInput, sessionHandle } from './session/handle'
import {
  WORK_OPS,
  createInputId,
  createMessageId,
  offeredInputRecord,
  storedPrincipal,
} from './session/helpers'
import { observedSession } from './session/observed-session'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import { changedEntry } from './session-entry'
import type {
  ModelMessage,
  PromptCacheOptions,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AIPersistence,
  ArtifactStore,
  BlobStore,
  GenerationRunStore,
  LogStore,
  MetadataStore,
  OrphanedLog,
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
  AccessWait,
  HarnessAccess,
} from './access'
import type { HandleGuard } from './session/handle'
import type { OpenChildSession } from './session/types'
import type { AnyHarness, SessionMetadataOf } from './define'
import type { SessionEntryChange, SessionEntryUpdate } from './session-entry'
import type {
  LogRecordRetention,
  LogViewHooks,
  ReduceOptions,
  SnapshotTiming,
} from './log'
import type { OwnershipOptions } from './ownership'
import type { ObservabilityOptions } from './observability'
import type { HarnessSession } from './session/index'
import type { ObservedSession } from './session/observed-session'
import type {
  ForkPoint,
  HarnessInput,
  Principal,
  Receipt,
  TransferOptions,
  TransferResult,
} from './types'

type SharedStores = {
  artifacts?: ArtifactStore
  blobs?: BlobStore
  generationRuns?: GenerationRunStore
  /** The session index that `host.sessions` reads. */
  sessions?: SessionIndexStore
}

/**
 * The stores a host needs: a `log`. It holds the events, transcript, inputs,
 * runs, interrupts, and tool steps of each thread, and which host owns each
 * thread. In development, use `memoryPersistence()` from
 * `@tanstack/ai-persistence`: it has a memory log. The host does not use the
 * other chat stores of that object (`messages`, `runs`, `interrupts`).
 *
 * With several hosts on one log store, an input that reaches a host while
 * another host owns the thread waits in the log for the owner (receipt
 * `queued`), and the owner runs it.
 *
 * Without `artifacts`, `blobs`, and `generationRuns`, media is kept in memory.
 * With `sessions`, the host keeps one index entry per tenant and thread (see
 * `host.sessions`). The store needs `getVersioned` and `upsertIf`, or the host
 * throws at the start.
 *
 * The log keeps the state of each thread. `metadata` is for data that is
 * wider than one thread, for example the saved rules of `permissions()`.
 * It needs `getVersioned` and `setIf`, or the host throws at the start.
 */
export type HarnessPersistence = AIPersistence<
  {
    log: LogStore
    metadata?: MetadataStore
  } & SharedStores
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
   * How the host appends to the log. Leave it out for the defaults.
   */
  log?: {
    /**
     * How long the host merges streamed text before it appends it, in
     * milliseconds. Boundaries (a message start or end, a tool call, a run
     * event) append at once. Default 100.
     */
    coalesceMs?: number
    /**
     * When the owner of a log saves a snapshot of its whole fold (every
     * thread of the session tree) in the log store, at the first limit it
     * meets. A new host opens from the snapshot, and reads only the records
     * after it.
     *
     * - `afterBytes`: after this many bytes of new records, as the JSON
     *   length of each. Default 1 000 000.
     * - `afterMs`: this many milliseconds after the first record with no
     *   snapshot. Default 300 000 (5 minutes).
     */
    snapshot?: SnapshotTiming
  }
  /**
   * How this host owns the threads it writes to. A host owns a thread from
   * its first write until the thread has no work. `ttlMs`: how long the
   * ownership lasts after each renewal (default 30000 ms). After it, another
   * host can take the thread. `renewMs`: how often one timer renews every
   * thread that the host owns (default 10000 ms). `hostId`: a stable id
   * for this host, for example the machine or pod name. With it, a thread
   * that uses a local folder is pinned to this host, and another host
   * refuses the thread. Leave it out for the defaults: no pins.
   */
  ownership?: OwnershipOptions
  /** How the sessions of this host live. Leave it out for the defaults. */
  lifecycle?: HostLifecycleOptions
  /**
   * Spans and operation reports. `tracer`: an OpenTelemetry tracer, or any
   * object with the same `startSpan`. The host writes a `harness.operation`
   * span for each turn, agent run, and command that it runs, and
   * `harness.recovery`, `harness.wait`, and `harness.transfer` spans. A
   * `traceparent` of the caller becomes a link of the span of its turn.
   * `onOperation`: called when an operation that this host runs starts and
   * when it settles, with its status, duration, and usage. Without it, the
   * host writes no spans and reports nothing.
   *
   * @example
   * ```ts
   * import { trace } from '@opentelemetry/api'
   *
   * const host = createHarnessHost({
   *   observability: {
   *     tracer: trace.getTracer('my-app'),
   *     onOperation: ({ phase, operation }) => {
   *       if (phase === 'settled') metrics.record(operation)
   *     },
   *   },
   * })
   * ```
   */
  observability?: ObservabilityOptions
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
  /** How much each session keeps in memory, and which records a log keeps. */
  retention?: RetentionLimits
}

/**
 * How much each session keeps in memory, so a long-lived session does not
 * grow, and which records its log keeps. Leave a field out for its default.
 */
export interface RetentionLimits {
  /**
   * How many settled operations (turns, commands, resets) a session keeps,
   * with their receipts and settlements. Inputs with no turn (agent runs,
   * messages to them, commands, cancels) have a window of the same size.
   * Past it, `session.operation(id)` is `undefined` for the oldest, and
   * `settled()` of its input reads the log. Default 500.
   */
  settledOperations?: number
  /**
   * How many settled agent runs a session keeps. Past it, `agentRun(id)`
   * and `agentRuns()` leave out the oldest, except what the log has.
   * Default 500.
   */
  settledAgentRuns?: number
  /**
   * How many bytes of events a session keeps in memory for `events()`, as
   * the JSON length of each event. A reader whose cursor is older reads
   * the older events from the log. Default 8 000 000.
   */
  eventBytes?: number
  /**
   * Which records the log store keeps. `'all'` (the default) keeps every
   * record. `'since-snapshot'`: after each snapshot (see `log.snapshot`),
   * the owner truncates the records before it. A reader whose cursor is
   * before the cut then gets one `harness.gap` event, and goes on from the
   * first stored record.
   */
  logRecords?: LogRecordRetention
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
   * it runs again when another host wrote first, so neither change is lost. The harness `metadataSchema` checks
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
   * - deletes its log, with its thread settings, plugin config, plugin
   *   state, interrupted turn, runs, interrupts, and the inputs that wait
   *   for an owner.
   * - deletes its media: the uploads and the generated files, records and
   *   bytes.
   * - removes its index entry. Then `get` is `undefined`, and the next open
   *   of the thread writes a new entry.
   *
   * A store the host does not have is skipped. Only the tenant of
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
   * `membersOnly()`, and the `share` action. The running and queued work
   * that the user started on the thread stops, on any host, their schedules
   * do not run, and `host.revoke` runs for the user.
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

/**
 * `host.transfer` moved a conversation from one thread to another. Your app
 * can copy its own access rows for the target thread here. A retry of the
 * same transfer yields it again, with the same `transferId`.
 */
export interface HostTransferredEvent {
  type: 'transferred'
  transferId: string
  tenantId?: string
  /** The source thread, and the name of its harness. */
  from: { harness: string; threadId: string }
  /** The target thread, and the name of its harness. */
  to: { harness: string; threadId: string }
  /** The id of the principal who made the transfer. */
  principalId?: string
  at: number
}

/** What `host.events()` yields. */
export type HostEvent =
  | HostStatusEvent
  | HostSessionEvent
  | HostSessionDeletedEvent
  | HostRevokedEvent
  | HostTransferredEvent

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
   * At most how many logs of `harnesses` one call takes. Default 100.
   */
  limit?: number
}

/** A thread that `host.resumePending` took over. */
export interface ResumedThread {
  threadId: string
  /** The name of the harness that runs the thread. */
  harness: string
  /** The tenant of the thread. Without it, the default tenant. */
  tenantId?: string
}

/** An input for `host.submit`: every input that runs on the owner of a log. */
export type SubmitInput = Exclude<
  HarnessInput,
  { op: 'revert' | 'unrevert' | 'background' | 'append' }
>

export interface SubmitOptions<P extends Principal = Principal> {
  /** The harness that runs the thread. */
  harness: AnyHarness
  threadId: string
  input: SubmitInput
  /**
   * Who sends the input. Its `tenantId` is the tenant of the thread.
   * Required when the host has `access`.
   */
  principal?: P
  /**
   * The id of the input, so a retry is safe: a second submit with the same
   * id and input is a duplicate. Default: a new id.
   */
  inputId?: string
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
   * this host, the view reads through it, and it never holds it open. The
   * views of one log share its fold and its events. Use `open` for a write,
   * or for what needs plugins (`describe`).
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
    options: Pick<OpenSessionOptions<P>, 'threadId' | 'principal'>,
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
   * the plugin config, and the state that agents share
   * (`ctx.harness.state`). It does not copy plugin state, pending
   * interrupts, queued inputs, or running work. A `newThreadId` with
   * messages is refused. A fork stays in its harness: a thread whose index
   * entry names another harness throws. To move a conversation to another
   * harness, use `transfer`.
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
   * Move a conversation to another thread, maybe of another harness: a new
   * thread by default. Only the `envelope` moves: the note, then no
   * message, a summary, or the settled transcript with its media. Plugin
   * state, shared state, credentials, waits, settings, and plugin config
   * stay with the source. The source keeps running.
   *
   * Both threads are in the tenant of `principal`: a transfer to another
   * tenant cannot be named. A new target has the principal as its owner and
   * only member. Both logs get a `harness.transferred` record with the same
   * `transferId`, and the index entries link the threads in `metadata`
   * (`harness:transferredFrom` on the target, `harness:transferredTo` on
   * the source). `host.events()` yields a `transferred` event. A retry with
   * the same `transferId` makes no second thread and copies nothing again.
   * When another host owns the source log, the source record goes to it
   * through the input lane.
   *
   * With access, `principal` is required. It needs the `transfer` action on
   * the source, and `send` on a target that exists. A refusal throws
   * `AccessDeniedError`. Throws when a thread belongs to another harness,
   * or when a new target has messages that are not from this transfer.
   *
   * @example
   * ```ts
   * const { threadId } = await host.transfer({
   *   from: { harness: support, threadId: 't-1' },
   *   to: { harness: billing },
   *   envelope: { note: 'Refund for order 42.', messages: 'summary' },
   *   principal,
   * })
   * const session = await host.open(billing, { threadId, principal })
   * ```
   */
  transfer: (options: TransferOptions<P>) => Promise<TransferResult>
  /**
   * Store an input for a thread, and run nothing. The input waits in the log
   * of the thread until a host owns the log and runs it: the host that runs
   * the thread now, a later `resumePending`, or a `createHarnessWorker`. Resolves with the receipt:
   * `queued`, or `rejected` with `conflict` for an id that another input
   * has.
   *
   * With access, `principal` is required, and the input needs the same
   * action as on a handle (`send` for a prompt, `answer` for an answer). A
   * refused input throws `AccessDeniedError`, and nothing is stored.
   *
   * @example
   * ```ts
   * const receipt = await host.submit({
   *   harness: assistant,
   *   threadId: 't-1',
   *   input: { op: 'prompt', message: 'Write the weekly report.' },
   *   principal,
   * })
   * ```
   */
  submit: (options: SubmitOptions<P>) => Promise<Receipt>
  /**
   * Continue the work that no live host runs. It lists the logs with work
   * and no live owner (an owner that stopped, inputs that wait, or a
   * schedule that is due), for a harness in `harnesses`. It gets each log, opens its thread, recovers the
   * work, and runs the inputs that wait. Two hosts can call it at once: each
   * log goes to one of them. Call it at boot, and from a cron job or a
   * Durable Object alarm. Resolves with the threads it took over.
   *
   * Each thread opens in its own tenant, with no principal.
   *
   * @example
   * ```ts
   * await host.resumePending({ harnesses: [assistant] })
   * ```
   */
  resumePending: (
    options: ResumePendingOptions,
  ) => Promise<Array<ResumedThread>>
  /**
   * Run `session.recover()` on the open sessions of `threadId`, or on every
   * open session without it. Work that another host ran when its session
   * opened runs here once that host's ownership of the log expires.
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
   * host that opens a thread runs it again: use it when a host shuts down,
   * for example for a deploy. Without it, the running work is
   * cancelled.
   *
   * @example
   * ```ts
   * await host.close({ recoverable: true })
   * ```
   */
  close: (options?: { recoverable?: boolean }) => Promise<void>
  /** The session index: list, rename, delete, fork, and share sessions. */
  sessions: HostSessions<P>
  /**
   * Take the access of the user `principal` to a thread, after your app
   * changed its own access tables. `host.events()` yields a `revoked`
   * event, so the user's streams close. On a host with access, the open
   * handles and `host.observe` views of that user on the thread throw
   * `AccessDeniedError` from now on, their running `events()` reads end
   * with it, and a new `host.open` asks `authorize` again. The running and
   * queued work of the user on the thread is cancelled on any host, and
   * their schedules do not run. Resolves when the cancels are sent. The
   * `tenantId` of `principal` picks the tenant. Only `id` and `tenantId`
   * are read.
   *
   * @example
   * ```ts
   * host.revoke({ threadId, principal: { id: 'u3', tenantId: 'acme' } })
   * ```
   */
  revoke: (options: {
    threadId: string
    principal: { id: string; tenantId?: string }
  }) => Promise<void>
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
   * The read stops when `signal` aborts or the loop ends. It also stops when
   * more than 1 000 events wait for a slow reader: read again to get the
   * current statuses.
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
/**
 * Throw a clear error for a metadata store with no compare-and-set. Its data
 * is wider than one thread, so two hosts can change one key.
 */
function checkMetadataStore(store: MetadataStore | undefined) {
  if (store === undefined) return
  const hasCompareAndSet =
    typeof store.getVersioned === 'function' &&
    typeof store.setIf === 'function'
  if (!hasCompareAndSet) {
    throw new Error(
      'stores.metadata needs getVersioned and setIf. Its data is shared by every thread, so a change uses compare-and-set, and two hosts do not lose the changes of each other.',
    )
  }
}

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

/** A thread id that `harnessAgent` derives for a child: `.../agent/...`. */
const isHarnessChildThread = (threadId: string) => threadId.includes('/agent/')

/**
 * The key of an open session in the host: the harness, the tenant, and the
 * thread. One thread id in two tenants is two sessions.
 */
/**
 * The `affinity` of a `listOrphaned` query of this host: a log pinned to
 * another host is not listed.
 */
const pinOf = ({ affinity }: HostOwnership) =>
  affinity !== undefined ? { affinity } : {}

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
 *
 * The snapshot has only the work of this host. `seen` keeps the operations
 * that run and the questions that wait from the events, so the events that
 * another host wrote count too.
 */
function statusAfter(
  session: HarnessSession,
  event: StreamChunk,
  seen: { running: Set<string>; asked: Set<string> },
) {
  if (event.type !== EventType.CUSTOM) return undefined
  const value = isRecord(event.value) ? event.value : {}
  const { operationId, questionId } = value
  switch (event.name) {
    case HARNESS_EVENTS.operationStarted:
      if (typeof operationId === 'string') seen.running.add(operationId)
      return 'running'
    case HARNESS_EVENTS.question:
      if (typeof questionId === 'string') seen.asked.add(questionId)
      return 'waiting'
    case HARNESS_EVENTS.operationFinished:
    case HARNESS_EVENTS.questionAnswered: {
      if (typeof operationId === 'string') seen.running.delete(operationId)
      if (typeof questionId === 'string') seen.asked.delete(questionId)
      // An operation asks each question, so with no operation, none waits.
      if (seen.running.size === 0) seen.asked.clear()
      const { pendingQuestions, pendingInterrupts, activeOperations } =
        session.snapshot()
      const isInterrupted = value.status === 'interrupted'
      const stillWaits =
        isInterrupted ||
        pendingQuestions.length > 0 ||
        pendingInterrupts.length > 0 ||
        seen.asked.size > 0
      if (stillWaits) return 'waiting'
      const isRunning = activeOperations.length > 0 || seen.running.size > 0
      return isRunning ? 'running' : 'idle'
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

/** A read of the host events of one tenant. */
export interface TenantEventsRead {
  /** The tenant to read. `undefined` is the default tenant. */
  tenantId: string | undefined
  /** Runs before the queue: an event it rejects takes no memory. */
  filter: (event: HostEvent) => boolean
  signal?: AbortSignal
}

/** How each host reads its events for one tenant. Not public API. */
const tenantEventReaders = new WeakMap<
  object,
  (read: TenantEventsRead) => AsyncIterable<HostEvent>
>()

/**
 * @internal The `host.events()` of one tenant, with the statuses of that
 * tenant first. `filter` runs before the queue. `undefined` for a host that
 * `createHarnessHost` did not make.
 */
export function tenantEventsOf<P extends Principal>(host: HarnessHost<P>) {
  return tenantEventReaders.get(host)
}

/** A log that a sweep took over, and the end of what the sweep opened. */
export interface TakenLog {
  thread: ResumedThread
  /**
   * Resolves when the session that the sweep opened closed, or when the app
   * opened the thread too. At once when the app had the thread open.
   */
  released: Promise<void>
}

/** What `createHarnessWorker` needs of a host. Not public API. */
export interface HostSweep {
  /** The logs of the harnesses named in `harnesses` with work and no live owner. */
  listOrphaned: (query: {
    limit: number
    harnesses: ReadonlyArray<string>
  }) => Promise<Array<OrphanedLog>>
  /**
   * Acquire the log of `orphan`, open its thread with `harness`, and take
   * its work over, as `host.resumePending` does for each log. Resolves
   * `null` when another host got the log. Rejects when the thread does not
   * open: the log goes back with a wake of `OPEN_RETRY_MS`, so a sweep
   * after that time tries again.
   */
  takeOver: (
    orphan: OrphanedLog,
    harness: AnyHarness,
    close: 'whenIdle' | 'never',
  ) => Promise<TakenLog | null>
}

/** The sweep of each host. Not public API. */
const sweeps = new WeakMap<object, HostSweep>()

/**
 * @internal The sweep of `host`: what `createHarnessWorker` lists and takes
 * over.
 */
export function sweepOf<P extends Principal>(host: HarnessHost<P>) {
  const sweep = sweeps.get(host)
  if (!sweep) throw new Error('Not a host of createHarnessHost.')
  return sweep
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
  /** Child sessions of `harnessAgent` that are open. */
  children: number
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

/**
 * The messages of `messages` up to the last point where each tool call has
 * its result. A running turn can have a call with no result yet: it does
 * not move.
 */
function settledMessages(messages: ReadonlyArray<ModelMessage>) {
  const open = new Set<string>()
  let end = 0
  messages.forEach((message, index) => {
    for (const call of message.toolCalls ?? []) open.add(call.id)
    if (message.role === 'tool' && message.toolCallId) {
      open.delete(message.toolCallId)
    }
    if (open.size === 0) end = index + 1
  })
  return messages.slice(0, end)
}

/** One link of the index `metadata` of a transfer. */
interface TransferMetadataLink {
  transferId: string
  harness: string
  threadId: string
}

/**
 * `entry` with `link` in the list `metadata[key]`, once per transfer id.
 * `undefined` for no entry, so the index writes nothing.
 */
function withTransferLink(
  entry: SessionIndexEntry | undefined,
  key: 'harness:transferredFrom' | 'harness:transferredTo',
  link: TransferMetadataLink,
) {
  if (!entry) return undefined
  const current = entry.metadata?.[key]
  const links = Array.isArray(current) ? current : []
  const isKnown = links.some(
    (known) => isRecord(known) && known.transferId === link.transferId,
  )
  if (isKnown) return entry
  return {
    ...entry,
    metadata: { ...entry.metadata, [key]: [...links, link] },
    updatedAt: Date.now(),
  }
}

/** Throw a clear error for a store set that cannot work. */
function checkDurableStores(persistence: HarnessPersistence) {
  // The type needs a log. A JavaScript caller can still leave it out.
  const stores: Partial<HarnessPersistence['stores']> = persistence.stores
  if (stores.log === undefined) {
    throw new Error(
      'The harness needs stores.log: each session keeps its events, transcript, and inputs there. In development, use memoryPersistence() from @tanstack/ai-persistence.',
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
  checkMetadataStore(persistence.stores.metadata)
  const { access } = options
  if (access && !persistence.stores.sessions) {
    throw new Error(
      'Host access needs stores.sessions: each session keeps its owner and members there.',
    )
  }
  const affinity = options.ownership?.hostId
  if (
    affinity !== undefined &&
    (typeof affinity !== 'string' || affinity.trim() === '')
  ) {
    throw new Error(
      'ownership.hostId must be a non-empty string, for example the machine or pod name. Leave it out when the host has no stable id.',
    )
  }
  const policy = access && membersOnlyPolicyOf(access.authorize)
  const memory = memoryPersistence().stores
  // ponytail: memory credentials when none are given. Pass `credentials`
  // to keep sign-ins across restarts.
  const credentials = options.credentials ?? memoryCredentialStore()
  // One OAuth refresh at a time per saved credential, for all sessions.
  // `close()` aborts the refreshes that run.
  const stopRefreshes = new AbortController()
  const refreshes = refreshFlights(stopRefreshes)
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
  const { sessions: sessionStore } = persistence.stores
  /** The readers of `host.events()`. */
  const bus = new HostEventBus()
  const emit = (event: HostEvent) => bus.emit(event)
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
    logRecords: limits?.logRecords ?? 'all',
  }
  const hostId = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  /** The logs that this host owns. One timer renews them all. */
  const ownership = new HostOwnership({
    store: logStore,
    ownerId: hostId,
    // With a stable host id, folder bindings pin their logs to this host.
    ...(affinity !== undefined ? { affinity } : {}),
    ...(options.ownership ? { timing: options.ownership } : {}),
  })
  /** The shared log of each log with an open session, by its store log id. */
  const logs = new Map<string, Promise<SharedLog>>()
  /** The resolved shared logs, and the reduce that folds each one, for `observe`. */
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
      ...(project ? { project } : {}),
      ...(reduce ? { reduce } : {}),
    }).then((state) => {
      const log = new SharedLog({
        store,
        ownership,
        harness: harness.name,
        logId,
        rootThread,
        state,
        coalesceMs,
        eventBytes: retention.eventBytes,
        ...(project ? { project } : {}),
        ...(reduce ? { reduce } : {}),
        ...(options.log?.snapshot ? { snapshot: options.log.snapshot } : {}),
        logRecords: retention.logRecords,
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
   * The last harness definition that this host opened under each name. A
   * thread purge reads the harness name in the index entry, and mounts the
   * plugins of that definition to end the thread (see `endThread`).
   */
  const harnessesByName = new Map<string, AnyHarness>()
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
  /**
   * Called when the session of a key in `sweptOnly` leaves the sweep: it
   * closed, or the app opened its thread. By key.
   */
  const sweepEnds = new Map<string, () => void>()
  /** The session of `key` left the sweep. */
  const endSweep = (key: string) => {
    sweptOnly.delete(key)
    const end = sweepEnds.get(key)
    sweepEnds.delete(key)
    end?.()
  }
  /** The closes of sessions that left the cache, by key. */
  const closing = new Map<string, Promise<void>>()
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
    endSweep(key)
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

  /**
   * The child sessions of `harnessAgent` that are open now. A run of a
   * session opens and closes each one. `host.close()` closes them too.
   */
  const childSessions = new Set<SessionImpl>()

  /**
   * What every session in the log `ids` gets from the host. `harness` is
   * the harness of the root thread: it folds the log.
   */
  const sessionDeps = (
    ids: { logId: string; rootThread: string },
    harness: AnyHarness,
    tenantId: string | undefined,
  ) => ({
    storeLogId: ids.logId,
    ...(tenantId !== undefined ? { tenantId } : {}),
    persistence,
    credentials,
    ...(options.credentials ? { sharedCredentials: options.credentials } : {}),
    refreshes,
    media,
    index,
    retention,
    hostPlugins,
    log: {
      store: logStore,
      open: async (sessionThread: string, hooks: LogViewHooks) => {
        let log = await sharedLog(logStore, ids, harness)
        // The log closed while this open waited, and the host dropped it.
        while (!log.isOpen) log = await sharedLog(logStore, ids, harness)
        return log.view(sessionThread, hooks)
      },
    },
    ...(access ? { access: { envKeys: access.envKeys === true } } : {}),
    openChild: openChildIn(ids, harness, tenantId),
    ...(options.observability ? { observability: options.observability } : {}),
  })

  /**
   * Open a child session of `harnessAgent` in the log `ids`, with no handle
   * and no checks: the run that opens it closes it. It is not in `sessions`,
   * so `host.open` never gives it.
   */
  const openChildIn =
    (
      ids: { logId: string; rootThread: string },
      rootHarness: AnyHarness,
      tenantId: string | undefined,
    ): OpenChildSession =>
    async (harness, { threadId, principal, child }) => {
      if (isClosed) throw hostClosed()
      harnessesByName.set(harness.name, harness)
      const created: SessionImpl = new SessionImpl({
        ...sessionDeps(ids, rootHarness, tenantId),
        harness,
        threadId,
        ...(principal ? { principal } : {}),
        child,
        // The run that opened the child streams its events.
        onEvent: () => {},
        onClose: () => childSessions.delete(created),
      })
      childSessions.add(created)
      // A failed open closes the session, and so leaves `children`.
      await created.open()
      return created
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
    { threadId, principal, promptCache }: OpenSessionOptions,
    tenantId: string | undefined,
  ) => {
    if (isClosed) return Promise.reject(hostClosed())
    harnessesByName.set(harness.name, harness)
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
    if (session) endSweep(key)
    if (!session) {
      makeRoom()
      // The log of a session tree has the id of its root thread, in its
      // tenant. Only a root opens: its child threads write to this log.
      const storeLogId = logIdOf({ tenantId, logId: threadId })
      // For the status rule. See `statusAfter`.
      const seen = { running: new Set<string>(), asked: new Set<string>() }
      const created = new SessionImpl({
        ...sessionDeps(
          { logId: storeLogId, rootThread: threadId },
          harness,
          tenantId,
        ),
        harness,
        threadId,
        ...(principal ? { principal } : {}),
        ...(promptCache ? { promptCache } : {}),
        onEvent: (event) => {
          // A session that left the cache has no status any more.
          if (sessions.get(key) !== session) return
          const status = statusAfter(created, event, seen)
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

  /** See {@link HostSweep.takeOver}. */
  const takeOver: HostSweep['takeOver'] = async (orphan, harness, close) => {
    const { logId: storeLogId, harness: name } = orphan
    // A log that this host owns already keeps its epoch, also when its
    // record expired in a store outage: the open session writes at that
    // epoch. A new acquire would give a new epoch and fence that session.
    const held = ownership.epochOf(storeLogId)
    // Of two hosts that sweep at once, one gets the log.
    const epoch = held ?? (await ownership.acquire(storeLogId, name))
    if (epoch === null) return null
    // Only an ownership that this sweep acquired goes back here. `wakeIn`
    // lists the log again after that time, so a later sweep tries again.
    const giveBack = (wakeIn?: number) =>
      held === undefined
        ? ownership.release(storeLogId, epoch, wakeIn)
        : Promise.resolve()
    // The store id of a log is its tenant and its root thread.
    const { tenantId, logId: threadId } = parseLogId(storeLogId)
    const key = sessionKey(name, tenantId, threadId)
    // Only a session that this sweep opens closes at once when idle. A
    // session that the app has open stays open. No handle holds the
    // session, so it closes on idle in any case.
    const isOwn = close === 'whenIdle' && !sessions.has(key)
    let released = Promise.resolve()
    if (isOwn) {
      sweptOnly.add(key)
      // Before the open: a session with no work closes in the open.
      const ended = new Promise<void>((resolve) => sweepEnds.set(key, resolve))
      released = ended.then(() => closing.get(key))
    }
    try {
      const session = await openSession(harness, { threadId }, tenantId)
      // Also a session that was open already: it recovers again. The log
      // goes back when the thread has no work.
      if (!(await session.takeOver())) {
        // Another host got the log in between.
        await giveBack()
        return null
      }
    } catch (error) {
      // The log goes back with a wake, so a sweep after the wait tries
      // again. With no wake, no sweep lists the log again.
      if (isOwn) endSweep(key)
      await giveBack(OPEN_RETRY_MS).catch(() => {})
      throw error
    }
    const thread: ResumedThread = {
      threadId,
      harness: name,
      ...(tenantId !== undefined ? { tenantId } : {}),
    }
    return { thread, released }
  }

  /**
   * How often `host.revoke` took each user's access to each thread. A handle
   * keeps the count of its open, and refuses each call once it changed.
   */
  // ponytail: one count per revoked user and thread, for the life of the
  // host. Drop the old ones if a host revokes millions.
  const revocations = new Map<string, number>()
  /**
   * The reads that run now (`handle.events()`, a view of `host.observe`),
   * by revoked key: a revoke ends them.
   */
  const revokeListeners = new Map<string, Set<() => void>>()
  /** Call `listener` at the next revoke of `key`. Returns the stop. */
  const onRevoke = (key: string, listener: () => void) => {
    let listeners = revokeListeners.get(key)
    if (!listeners) {
      listeners = new Set()
      revokeListeners.set(key, listeners)
    }
    const set = listeners
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0 && revokeListeners.get(key) === set) {
        revokeListeners.delete(key)
      }
    }
  }

  /** Count a revoke, end the reads of the user, and tell `host.events()`. */
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
    for (const listener of [...(revokeListeners.get(key) ?? [])]) listener()
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
    wait,
  }: {
    principal: P
    action: AccessAction
    threadId: string
    entry: SessionIndexEntry | undefined
    run?: AccessRun
    wait?: AccessWait
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
      ...(wait ? { wait } : {}),
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
      onRevoke: (listener) => onRevoke(key, listener),
      authorize: async (action, run, wait) =>
        allow({
          principal,
          action,
          threadId,
          entry: await index.get({ tenantId: principal.tenantId, threadId }),
          ...(run ? { run } : {}),
          ...(wait ? { wait } : {}),
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

  /**
   * Stop the work of the user `userId` on a thread, on any host, after
   * `unshare` or `revoke` took their access. The sessions open here cancel
   * it at once. Then each input of the user that did not end gets a cancel
   * through the input lane, so the owner of the log stops it, on any host.
   * Each schedule of the user takes its input id in the lane, so it never
   * runs: the store keeps each input id once. `principal` is who stops the
   * work, and the log keeps it. A failure is a warning: the access is gone
   * already.
   */
  const stopWorkOf = async ({
    tenantId,
    threadId,
    userId,
    principal,
  }: {
    tenantId: string | undefined
    threadId: string
    userId: string
    principal: P | undefined
  }) => {
    try {
      const open = await openSessionsOf(tenantId, threadId)
      for (const session of open) {
        await session.cancelWorkOf({ userId, principal })
      }
      const entry = await index.get({ tenantId, threadId })
      // The lane needs the harness of the log.
      if (entry?.harness === undefined) return
      const harness = entry.harness
      const logId = logIdOf({ tenantId, logId: threadId })
      const state = await loadLogState({
        store: logStore,
        logId,
        rootThread: threadId,
      })
      const root = sessionOf(state, threadId)
      /** The sessions here stopped the operations that they know. */
      const isKnownHere = (operationId: string) =>
        open.some((session) => session.operation(operationId) !== undefined)
      const offer = (
        inputId: string,
        record: Parameters<LogStore['offer']>[0]['record'],
      ) => logStore.offer({ logId, harness, inputId, record })
      for (const logged of root.inputs.values()) {
        const isTheirs =
          logged.principal?.id === userId && WORK_OPS.has(logged.input.op)
        const hasEnded =
          logged.status === 'settled' ||
          logged.status === 'rejected' ||
          logged.status === 'joined'
        if (!isTheirs || hasEnded) continue
        const { operationId } = logged
        if (operationId !== undefined && isKnownHere(operationId)) continue
        const input: HarnessInput =
          operationId === undefined
            ? { op: 'cancelInput', inputId: logged.inputId }
            : { op: 'cancel', operationId }
        const inputId = createInputId()
        await offer(inputId, offeredInputRecord({ inputId, input, principal }))
      }
      for (const [scheduleId, schedule] of root.thread.schedules) {
        if (schedule.principal?.id !== userId || !schedule.input) continue
        // The id that the schedule offers its input with when it fires.
        await offer(`schedule:${scheduleId}`, {
          type: 'harness.schedule.done',
          scheduleId,
        })
      }
    } catch (error) {
      console.warn(
        `[@tanstack/ai-harness] The work of ${JSON.stringify(userId)} on thread ${JSON.stringify(threadId)} did not stop: ${String(error)}`,
      )
    }
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
   * Tell the plugins of a thread that it ends for good (`ThreadEnds`), so
   * they free what lives as long as the thread: an owned sandbox, a shadow
   * repository. The sessions of the thread are closed already, so no turn
   * runs. A short session with only the log and the session plugins runs
   * the handlers, and closes again. It needs the harness definition that
   * the index entry names, from an open on this host. Without it, or with
   * no entry, there is nothing to run. A failed handler only warns: the
   * purge of the data goes on.
   *
   * ponytail: a host that never opened the harness of the thread cannot
   * reach its plugins. Open it once on the host that deletes, if that
   * matters.
   */
  const endThread = async (tenantId: string | undefined, threadId: string) => {
    const name = (await index.get({ tenantId, threadId }))?.harness
    const harness = name === undefined ? undefined : harnessesByName.get(name)
    if (!harness) return
    const session = new SessionImpl({
      ...sessionDeps(
        { logId: logIdOf({ tenantId, logId: threadId }), rootThread: threadId },
        harness,
        tenantId,
      ),
      harness,
      threadId,
      onEvent: () => {},
      onClose: () => {},
    })
    try {
      await session.openToEnd()
      await session.endThread()
    } catch (error) {
      console.warn(
        `[@tanstack/ai-harness] A plugin did not end thread ${JSON.stringify(threadId)}: ${String(error)}`,
      )
    } finally {
      // As on a crash: the log gets no write of this short session.
      await session.close({ recoverable: true }).catch(() => {})
    }
  }

  /**
   * `host.sessions.delete` after its check: close the open sessions of the
   * thread, end it in its plugins, purge its children depth first, then
   * delete its data and its entry. `seen` stops a loop of parent ids.
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
    await endThread(tenantId, threadId)
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
    { threadId, newThreadId, at, principal }: ForkSessionOptions<P>,
  ) => {
    if (newThreadId === threadId) {
      throw new Error('A fork needs a new thread: newThreadId is threadId.')
    }
    const tenantId = principal?.tenantId
    // Before the open, so no plugin of `harness` mounts on a thread of
    // another harness. A move to another harness is `host.transfer`.
    checkHarness(await index.get({ tenantId, threadId }), harness)
    // The fork holds the source while it reads it.
    const sourceKey = sessionKey(harness.name, tenantId, threadId)
    hold(sourceKey)
    try {
      // In the tenant of the fork, with no principal: the fork does not
      // become the owner of a source with no owner.
      const source = await openSession(harness, { threadId }, tenantId)
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
      // The new thread is a new root, so its log is its own.
      const newLogId = logIdOf({ tenantId, logId: newThreadId })
      // With access, a thread with an entry belongs to someone already.
      const isTaken =
        access !== undefined &&
        (await index.get({ tenantId, threadId: newThreadId })) !== undefined
      const isUsed =
        isTaken ||
        (await logStore.read({ logId: newLogId, limit: 1 })).length > 0
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
   * A reader of the log `ids` for the thread `threadId`, and the reduce
   * that folds the log. It shares the log of the open
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
      // A child of `harnessAgent` opens only through the run that starts it.
      if (isHarnessChildThread(openOptions.threadId)) {
        throw new Error(
          `${JSON.stringify(openOptions.threadId)} is the thread of a harnessAgent child. Open its root thread and read the child through it.`,
        )
      }
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
    async observe(harness, { threadId, principal }) {
      if (isClosed) throw hostClosed()
      const tenantId = principal?.tenantId
      const entry = await index.get({ tenantId, threadId })
      let user: P | undefined
      if (access) {
        user = need(principal, 'host.observe')
        // No entry is not found: the same answer as a refusal.
        if (!entry) throw new AccessDeniedError({ action: 'read', threadId })
        // `allow` checks a child thread through its root thread.
        await allow({ principal: user, action: 'read', threadId, entry })
      }
      const key = sessionKey(harness.name, tenantId, threadId)
      // A child thread has its records in the log of its root, with its
      // thread on each. A thread with no entry is a root.
      const root = entry ? (await rootOf(entry)).threadId : threadId
      // A revoke of the user on the thread (its root) ends the view: each
      // later call throws, and a read that runs now stops.
      const revoked = user && guardOf(user, root)
      const ids = {
        logId: logIdOf({ tenantId, logId: root }),
        rootThread: root,
      }
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
          if (revoked?.isRevoked()) {
            throw new AccessDeniedError({ action: 'read', threadId })
          }
        },
        ...(revoked ? { onRevoke: revoked.onRevoke } : {}),
        index,
        media,
        readLog: () => readLog(logStore, ids, harness, threadId),
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
    async transfer({ from, to, envelope, principal, transferId: id }) {
      if (isClosed) throw hostClosed()
      const transferId = id ?? crypto.randomUUID()
      // The tenant of the principal is the tenant of both threads.
      const tenantId = principal?.tenantId
      const threadId = to.threadId ?? `thread-${transferId}`
      if (threadId === from.threadId) {
        throw new Error('A transfer needs another thread: to is from.')
      }
      const user = access ? need(principal, 'host.transfer') : undefined
      const sourceEntry = await index.get({ tenantId, threadId: from.threadId })
      const targetEntry = await index.get({ tenantId, threadId })
      if (user) {
        // No entry is not found: the same answer as a refusal.
        if (!sourceEntry) {
          throw new AccessDeniedError({
            action: 'transfer',
            threadId: from.threadId,
          })
        }
        await allow({
          principal: user,
          action: 'transfer',
          threadId: from.threadId,
          entry: sourceEntry,
        })
        // A target that exists has members already: the principal must
        // be one who may send to it. A retry finds its own new target.
        if (targetEntry) {
          await allow({
            principal: user,
            action: 'send',
            threadId,
            entry: targetEntry,
          })
        }
      }
      checkHarness(sourceEntry, from.harness)
      checkHarness(targetEntry, to.harness)
      const source = { harness: from.harness.name, threadId: from.threadId }
      const target = { harness: to.harness.name, threadId }
      const sourceKey = sessionKey(from.harness.name, tenantId, from.threadId)
      hold(sourceKey)
      try {
        // With no principal, as `host.fork` opens its source. The open does
        // not take the log from a host that owns it.
        const sourceSession = await openSession(
          from.harness,
          { threadId: from.threadId },
          tenantId,
        )
        const targetKey = sessionKey(to.harness.name, tenantId, threadId)
        hold(targetKey)
        try {
          // A new target gets the principal as its owner and only member.
          const targetSession = await openSession(
            to.harness,
            { threadId, ...(principal ? { principal } : {}) },
            tenantId,
          )
          // First the target, then the source: a retry after a crash in
          // between finds the target end, and writes only the source end.
          let end = targetSession.transferOf(transferId)
          if (!end) {
            const isUsed =
              to.threadId === undefined &&
              (await targetSession.transcript()).length > 0
            if (isUsed) {
              throw new Error(
                `Thread ${JSON.stringify(threadId)} is not empty, and has no transfer ${JSON.stringify(transferId)}.`,
              )
            }
            const settled = settledMessages(await sourceSession.transcript())
            const mode = envelope.messages ?? 'none'
            const moved: Array<ModelMessage> =
              mode === 'all'
                ? // New ids: the target may have these messages from an
                  // earlier transfer.
                  settled.map((message) => ({
                    ...message,
                    id: createMessageId(),
                  }))
                : mode === 'summary'
                  ? [
                      {
                        id: createMessageId(),
                        role: 'assistant',
                        content: `Summary of the conversation so far:\n${await sourceSession.transferSummary(principal, settled)}`,
                      },
                    ]
                  : []
            const note: ModelMessage = {
              id: createMessageId(),
              role: 'user',
              content: envelope.note,
            }
            end = {
              from: source,
              ...storedPrincipal(principal),
              at: Date.now(),
            }
            // One append: the messages and the record, or neither.
            await targetSession.adoptMessages(
              sourceSession,
              [note, ...moved],
              [{ type: 'harness.transferred', transferId, ...end }],
            )
          }
          // The same record on each retry, so the input lane takes it as a
          // duplicate.
          await sourceSession.recordTransfer({
            type: 'harness.transferred',
            transferId,
            to: target,
            ...(end.principal ? { principal: end.principal } : {}),
            at: end.at,
          })
          await index.update({ tenantId, threadId }, (entry) =>
            withTransferLink(entry, 'harness:transferredFrom', {
              transferId,
              ...source,
            }),
          )
          await index.update({ tenantId, threadId: from.threadId }, (entry) =>
            withTransferLink(entry, 'harness:transferredTo', {
              transferId,
              ...target,
            }),
          )
          emit({
            type: 'transferred',
            transferId,
            ...(tenantId !== undefined ? { tenantId } : {}),
            from: source,
            to: target,
            ...(end.principal ? { principalId: end.principal.id } : {}),
            at: end.at,
          })
          return { transferId, threadId }
        } finally {
          // A target that only this transfer opened closes on idle.
          await release(targetKey)
        }
      } finally {
        await release(sourceKey)
      }
    },
    revoke: async ({ threadId, principal }) => {
      // At once, so the handles of the user refuse each call from now on.
      revokeUser({
        tenantId: principal.tenantId,
        threadId,
        principalId: principal.id,
      })
      // No principal stops it: the app changed its own access tables.
      await stopWorkOf({
        tenantId: principal.tenantId,
        threadId,
        userId: principal.id,
        principal: undefined,
      })
    },
    hasAccess: access !== undefined,
    async identify({ request }) {
      if (!access) {
        throw new Error(
          'host.identify needs host access ({ identify, authorize }).',
        )
      }
      return await access.identify({ request })
    },
    async submit({ harness, threadId, input, principal, inputId }) {
      if (isClosed) throw hostClosed()
      const tenantId = principal?.tenantId
      const of = { tenantId, threadId }
      const id = inputId ?? createInputId()
      // An answer or a cancel is checked with the run that it targets, from
      // the log. `null`: the log does not have that run.
      let run: AccessRun | null | undefined
      if (access) {
        const user = need(principal, 'host.submit')
        const entry = await index.get(of)
        const target = await loggedTargetOf({
          store: logStore,
          logId: logIdOf({ tenantId, logId: threadId }),
          rootThread: threadId,
          input,
        })
        run = target.run
        // The same check as on a handle: a `human` wait takes an operator.
        await authorizeInput({
          authorize: (action, accessRun, wait) =>
            allow({
              principal: user,
              action,
              threadId,
              entry,
              ...(accessRun ? { run: accessRun } : {}),
              ...(wait ? { wait } : {}),
            }),
          input,
          run: run ?? undefined,
          wait: target.wait,
        })
      }
      await refuseChild(of)
      if (run === null) {
        const refused: Receipt = {
          inputId: id,
          status: 'rejected',
          reason: 'unknown_run',
        }
        return refused
      }
      const record = offeredInputRecord({ inputId: id, input, principal })
      const offered = await logStore.offer({
        logId: logIdOf({ tenantId, logId: threadId }),
        harness: harness.name,
        inputId: id,
        record,
      })
      const receipt: Receipt =
        offered === 'conflict'
          ? { inputId: id, status: 'rejected', reason: 'conflict' }
          : { inputId: id, status: 'queued' }
      return receipt
    },
    async resumePending({ harnesses, close = 'whenIdle', limit = 100 }) {
      const byName = new Map(
        harnesses.map((harness) => [harness.name, harness]),
      )
      // A log pinned to another host is not listed.
      const orphaned = await logStore.listOrphaned({
        limit,
        harnesses: [...byName.keys()],
        ...pinOf(ownership),
      })
      const opened: Array<ResumedThread> = []
      const failures: Array<unknown> = []
      for (const orphan of orphaned) {
        const harness = byName.get(orphan.harness)
        if (!harness) continue
        try {
          const taken = await takeOver(orphan, harness, close)
          if (taken) opened.push(taken.thread)
        } catch (error) {
          // One thread that cannot open must not stop the sweep.
          failures.push(error)
        }
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
      stopRefreshes.abort(hostClosed())
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
      // A child that its run did not close yet.
      await Promise.all(
        [...childSessions].map((child) => child.close(closeOptions)),
      )
      // After the sessions: each one gave its host plugins back.
      await hostPlugins.close()
      // The sessions gave their logs back. A release that did not land yet
      // goes now, and the renewal timer stops.
      await ownership.close()
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
        await stopWorkOf({ tenantId, threadId, userId, principal: user })
        revokeUser({ tenantId, threadId, principalId: userId })
        return changed
      },
    },
    events({ signal } = {}) {
      // The current statuses first. A change while the reader handles an
      // event waits in the queue.
      return bus.read({
        initial: [...statuses.values()],
        ...(signal ? { signal } : {}),
      })
    },
  }
  if (access) accesses.set(host, access)
  tenantEventReaders.set(host, ({ tenantId, filter, signal }) =>
    bus.read({
      tenant: { tenantId },
      filter,
      initial: [...statuses.values()].filter(
        (event) => tenantOfHostEvent(event) === tenantId && filter(event),
      ),
      ...(signal ? { signal } : {}),
    }),
  )
  sweeps.set(host, {
    listOrphaned: (query) =>
      logStore.listOrphaned({ ...query, ...pinOf(ownership) }),
    takeOver,
  })
  counters.set(host, () => ({
    sessions: sessions.size,
    handles: [...holds.values()].reduce(
      (total, held) => total + held.handles,
      0,
    ),
    holds: holds.size,
    statuses: statuses.size,
    closing: closing.size,
    children: childSessions.size,
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
  // Each transfer runs in a `harness.transfer` span.
  const tracer = options.observability?.tracer
  if (tracer) {
    const transfer = host.transfer
    host.transfer = (transferOptions) =>
      withSpan(
        {
          tracer,
          name: 'harness.transfer',
          attributes: {
            'harness.thread_id': transferOptions.from.threadId,
            ...(transferOptions.to.threadId !== undefined
              ? { 'harness.transfer.to_thread_id': transferOptions.to.threadId }
              : {}),
            ...(transferOptions.principal?.tenantId !== undefined
              ? { 'harness.tenant_id': transferOptions.principal.tenantId }
              : {}),
          },
        },
        async (span) => {
          const result = await transfer(transferOptions)
          span.setAttribute('harness.transfer.id', result.transferId)
          span.setAttribute('harness.transfer.to_thread_id', result.threadId)
          return result
        },
      )
  }
  return host
}
