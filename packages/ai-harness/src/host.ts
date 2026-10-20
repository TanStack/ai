import { EventType } from '@tanstack/ai'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { memoryPersistence } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import { AccessDeniedError, ownerOf } from './access'
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
  storedUser,
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
  HarnessUser,
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

/**
 * The options of `createHarnessHost`. Leave out an option to get its
 * default. See https://tanstack.com/ai/latest/docs/harness/host-options.
 */
export interface HarnessHostOptions<U extends HarnessUser = HarnessUser> {
  /** Where sessions keep their state. Default: in memory, lost on restart. */
  persistence?: HarnessPersistence
  /**
   * Who may use the sessions, and what they may do: `getUser` reads the
   * user of a request, and `isAllowed` decides each action. The user
   * type of the host comes from what `getUser` returns. With it, every
   * public host call needs a `user`, a session is reached only from
   * its own tenant, and keyed adapters do not read env vars unless
   * `allowServerEnvKeys` is `true`. It needs `stores.sessions`, where each session
   * keeps its owner and members. Without it, there is no check: one user
   * runs the host.
   *
   * @example
   * ```ts
   * const host = createHarnessHost({
   *   access: {
   *     getUser: async ({ request }) => findUser(request),
   *     rules: membersOnly(),
   *   },
   * })
   * ```
   */
  access?: HarnessAccess<U>
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
    bufferStreamWriteMs?: number
    /**
     * When the owner of a log saves a snapshot of its whole fold (every
     * thread of the session tree) in the log store, at the first limit it
     * meets. A new host opens from the snapshot, and reads only the records
     * after it.
     *
     * - `bytes`: after this many bytes of new records, as the JSON
     *   length of each. Default 1 000 000.
     * - `ms`: this many milliseconds after the first record with no
     *   snapshot. Default 300 000 (5 minutes).
     */
    saveSnapshotAfter?: SnapshotTiming
  }
  /**
   * How this host owns the threads it writes to. A host owns a thread from
   * its first write until the thread has no work. `expiresAfterMs`: how long the
   * ownership lasts after each renewal (default 30000 ms). After it, another
   * host can take the thread. `renewEveryMs`: how often one timer renews every
   * thread that the host owns (default 10000 ms). `hostId`: a stable id
   * for this host, for example the machine or pod name. With it, a thread
   * that uses a local folder is pinned to this host, and another host
   * refuses the thread. The host sends a heartbeat each `renewEveryMs`. When no
   * heartbeat came for `expiresAfterMs`, the pin does not count, and another host
   * can reattach the thread. Leave it out for the defaults: no pins.
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
  /**
   * The harnesses whose threads this host may delete without an open first.
   * `host.sessions.delete` ends a thread in the plugins of its harness, so
   * they free what lives as long as the thread (an owned sandbox, a shadow
   * repository). It finds the harness by the name in the index entry, among
   * these and the harnesses that this host opened. A thread whose harness
   * it does not know skips that step, with a warning.
   *
   * @example
   * ```ts
   * const host = createHarnessHost({ harnesses: [assistant] })
   * ```
   */
  harnesses?: ReadonlyArray<AnyHarness>
  /**
   * Hooks for the event streams of clients: `GET events` and the socket of
   * `handleHarnessSocket`, after its subscribe. `onConnect` runs when a
   * stream starts, and `onDisconnect` runs once when it ends. Each stream
   * gets its own `connectionId`, so two tabs are two connections. A host
   * reports only the streams that it serves. Reads from your own code and
   * `POST run` streams do not count. The host does not wait for a hook: a
   * hook that throws or rejects only logs a warning.
   *
   * @example
   * ```ts
   * const host = createHarnessHost({
   *   presence: {
   *     onConnect: ({ threadId, user }) => online.add(threadId, user?.id),
   *     onDisconnect: ({ threadId, user }) => online.remove(threadId, user?.id),
   *   },
   * })
   * ```
   */
  presence?: {
    onConnect?: (event: PresenceEvent<U>) => void | Promise<void>
    onDisconnect?: (
      event: PresenceEvent<U> & { reason: PresenceEndReason },
    ) => void | Promise<void>
  }
}

/** An event stream of a client on a thread. See `HarnessHostOptions.presence`. */
export interface PresenceEvent<U extends HarnessUser = HarnessUser> {
  /** The user of the stream. */
  user?: U
  threadId: string
  tenantId?: string
  /** The name of the harness that the handler serves. */
  harness: string
  /** A new id for each stream. A reconnect gets a new one too. */
  connectionId: string
  transport: 'sse' | 'websocket'
  /** The stream goes on from a cursor: `Last-Event-ID`, or `from`. */
  resumed: boolean
}

/**
 * Why a stream ended. `closed`: the client left, or the server closed the
 * stream. `revoked`: `host.revoke` or `unshare` took the access of the user.
 * `error`: the read of the events failed, or the client read too slowly.
 */
export type PresenceEndReason = 'closed' | 'revoked' | 'error'

/** How the sessions of a host live. */
export interface HostLifecycleOptions {
  /**
   * How long a session that no handle holds stays open after it goes idle,
   * in milliseconds. Then the host closes it, and the next `host.open`
   * opens it again. `0` closes it at once. Default 60 000.
   */
  closeIdleSessionsAfterMs?: number
  /**
   * How many sessions the host keeps open. An open past it first closes the
   * least recently used sessions that no handle holds and that are idle.
   * When there are none, the open goes on, with one warning. Default 500.
   */
  maxOpenSessions?: number
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
  keepSettledOperations?: number
  /**
   * How many settled agent runs a session keeps. Past it, `agentRun(id)`
   * and `agentRuns()` leave out the oldest, except what the log has.
   * Default 500.
   */
  keepSettledAgentRuns?: number
  /**
   * How many bytes of events a session keeps in memory for `events()`, as
   * the JSON length of each event. A reader whose cursor is older reads
   * the older events from the log. Default 8 000 000.
   */
  maxEventBytesInMemory?: number
  /**
   * Which records the log store keeps. `'all'` (the default) keeps every
   * record. `'since-snapshot'`: after each snapshot (see `log.saveSnapshotAfter`),
   * the owner truncates the records before it. A reader whose cursor is
   * before the cut then gets one `harness.gap` event, and goes on from the
   * first stored record.
   */
  keepLogRecords?: LogRecordRetention
}

/** {@link RetentionLimits} with every default filled in. */
export type Retention = Required<RetentionLimits>

export interface OpenSessionOptions<U extends HarnessUser = HarnessUser> {
  /** The conversation id. Opening the same id again returns the live session. */
  threadId: string
  /**
   * The user that the call acts for. Only needed when the host has
   * `access`. Without `access`, leave it out.
   *
   * The session that `open` returns acts as this user: a call that passes
   * no `user` stores it on the input. Its `tenantId` is the tenant of the
   * session (without it, the default tenant): one `threadId` in two tenants
   * is two sessions, with two index entries and two logs.
   */
  user?: U
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
 * Each method takes a `user`: the user that the call acts for. Only needed
 * when the host has `access`. Without `access`, leave it out. Its
 * `tenantId` picks the tenant (without it, the default tenant), as in
 * `host.open`. A method never reads or changes the entries of another
 * tenant. With host `access`, each method asks `isAllowed` first: `get` reads, `list`
 * lists, `rename` and `update` configure, `delete` deletes, `fork` forks, and
 * `share` and `unshare` share. A refused action throws `AccessDeniedError`.
 * A child thread is checked through its root thread.
 */
export interface HostSessions<U extends HarnessUser = HarnessUser> {
  /**
   * The entries of the tenant of `user`, newest `updatedAt` first.
   * Default: only top-level sessions (`parentThreadId: null`). Pass a thread
   * id to get its child sessions. With access, only the entries that
   * `isAllowed` lets the user list.
   *
   * @example
   * ```ts
   * const page = await host.sessions.list({ user, limit: 20 })
   * ```
   */
  list: (
    options?: Omit<SessionIndexListOptions, 'tenantId' | 'memberId'> & {
      user?: U
    },
  ) => Promise<SessionIndexPage>
  /**
   * The entry of a thread, or `undefined`.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.get({ threadId: 't-1', user })
   * ```
   */
  get: (options: {
    threadId: string
    user?: U
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Set the title of a thread. Resolves to the changed entry, or to
   * `undefined` for a thread that has no entry.
   */
  rename: (change: {
    threadId: string
    title: string
    user?: U
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Change the entry of a thread from app code, with no session open: its
   * `title`, `pinned`, or `metadata`. Each field you pass replaces the stored
   * one. Pass a function of the current entry to change part of `metadata`:
   * it runs again when another host wrote first, so neither change is lost.
   * The harness `metadataSchema` checks `metadata`, and types it. Resolves
   * to the changed entry, or `undefined` for a thread that has no entry.
   * Throws `SessionMetadataError` for metadata the schema refuses, and an
   * error when the entry names another harness.
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
    user?: U
  }) => Promise<SessionIndexEntry<SessionMetadataOf<THarness>> | undefined>
  /**
   * Delete a thread and its child threads (the entries with this thread as
   * `parentThreadId`, and their children). For each thread, it:
   *
   * - closes its open sessions on this host, of every harness, for every
   *   handle. Until the delete ends, an open of the thread throws. After
   *   it, a live handle that calls again opens an empty thread.
   * - deletes its log, with its thread settings, plugin config, plugin
   *   state, interrupted turn, runs, interrupts, and the inputs that wait
   *   for an owner.
   * - deletes its media: the uploads and the generated files, records and
   *   bytes.
   * - removes its index entry. Then `get` is `undefined`, and the next open
   *   of the thread writes a new entry.
   *
   * A store the host does not have is skipped. Only the tenant of
   * `user` is touched. With access, a thread with no index entry
   * throws `AccessDeniedError`.
   *
   * @example
   * ```ts
   * await host.sessions.delete({ threadId: 't-1', user })
   * ```
   */
  delete: (options: { threadId: string; user?: U }) => Promise<void>
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
   * access, the default is `access.rules.members.fork` (see `membersOnly()`),
   * else `'self'`. Without access and without `members`, the fork gets the owner
   * and members of the old thread.
   *
   * @example
   * ```ts
   * const entry = await host.sessions.fork({
   *   harness: assistant,
   *   threadId: 't-1',
   *   at: { before: messageId },
   *   user,
   * })
   * const fork = await host.open(assistant, { threadId: entry.threadId, user })
   * ```
   */
  fork: (options: {
    harness: AnyHarness
    threadId: string
    at: ForkPoint
    members?: 'self' | 'all'
    user?: U
  }) => Promise<SessionIndexEntry>
  /**
   * Add the user `userId` to the members of a thread with `role`, or change
   * the role of a member. Needs `access.rules.members` (`membersOnly()` has it),
   * and the `share` action (the owner). The role of the owner does not
   * change. Resolves to the changed entry, or `undefined` for a thread that
   * has no entry.
   *
   * @example
   * ```ts
   * await host.sessions.share({ threadId, userId: 'u3', role: 'member', user })
   * ```
   */
  share: (options: {
    threadId: string
    userId: string
    role: SessionMember['role']
    user?: U
  }) => Promise<SessionIndexEntry | undefined>
  /**
   * Remove the user `userId` from the members of a thread. Needs
   * `access.rules.members`, and the `share` action. The running and queued work
   * that the user started on the thread stops, on any host, their schedules
   * do not run, and `host.revoke` runs for the user. When that work does
   * not stop, it rejects after the member is removed: call `host.revoke`
   * for the user to stop it. The owner cannot be removed. Resolves to the
   * changed entry, or `undefined` for a thread that has no entry.
   *
   * @example
   * ```ts
   * await host.sessions.unshare({ threadId, userId: 'u3', user })
   * ```
   */
  unshare: (options: {
    threadId: string
    userId: string
    user?: U
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
 * `host.revoke` took the access of the user `userId` to a thread, or
 * `host.sessions.unshare` removed the user. The streams of that user on the
 * thread close.
 */
export interface HostRevokedEvent {
  type: 'revoked'
  tenantId?: string
  threadId: string
  userId: string
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
  /** The id of the user who made the transfer. */
  userId?: string
  at: number
}

/** What `host.events()` yields. */
export type HostEvent =
  | HostStatusEvent
  | HostSessionEvent
  | HostSessionDeletedEvent
  | HostRevokedEvent
  | HostTransferredEvent

export interface ForkSessionOptions<U extends HarnessUser = HarnessUser> {
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
  user?: U
}

export interface ResumePendingOptions {
  /** The harnesses whose threads this sweep may open, matched by name. */
  harnesses: ReadonlyArray<AnyHarness>
  /**
   * What happens to a session that the sweep opened. `'whenIdle'`
   * (default): it closes as soon as its pending work ends, unless the app
   * opened the thread too. `'never'`: it closes like any session that no
   * handle holds, after `lifecycle.closeIdleSessionsAfterMs`.
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

export interface SubmitOptions<U extends HarnessUser = HarnessUser> {
  /** The harness that runs the thread. */
  harness: AnyHarness
  threadId: string
  input: SubmitInput
  /**
   * The user that the call acts for: who sends the input. Only needed when
   * the host has `access`. Without `access`, leave it out. Its `tenantId`
   * is the tenant of the thread.
   */
  user?: U
  /**
   * The id of the input, so a retry is safe: a second submit with the same
   * id and input is a duplicate. Default: a new id.
   */
  inputId?: string
}

/**
 * Runs sessions for one or more harnesses in this process. `U` is the
 * user type: what `access.getUser` returns.
 */
export interface HarnessHost<U extends HarnessUser = HarnessUser> {
  /**
   * Open a session of `harness` for `user`. Each open gives its own
   * handle to the live session of this harness, tenant, and thread: a call
   * that passes no `user` acts as the user of the open. Session
   * plugins are set up on the first open, so a plugin error rejects the
   * promise. A subagent child thread (its index entry has a
   * `parentThreadId`) does not open: open its root thread, and read the
   * child with `session.agentTranscript`.
   *
   * Release the handle with `session.close()`, or with `await using`. Then
   * each call on the handle throws: call `host.open` again. The session
   * closes when no handle holds it and it was idle for
   * `lifecycle.closeIdleSessionsAfterMs`. When the session closes under a live handle
   * (its log failed, or `host.sessions.delete` ran), the next call on the
   * handle opens it again. Throws after `host.close()`.
   *
   * `user` is the user that the call acts for. Only needed when the host
   * has `access`. Without `access`, leave it out. With access, a thread
   * that exists needs the `read` action, else the open throws
   * `AccessDeniedError`. A new thread
   * gets the user as its owner. Then each action of the handle asks
   * `isAllowed`, and the handle acts only as its user.
   *
   * @example
   * ```ts
   * const session = await host.open(assistant, { threadId: 't-1', user })
   * ```
   */
  open: <THarness extends AnyHarness>(
    harness: THarness,
    options: OpenSessionOptions<U>,
  ) => Promise<HarnessSession<THarness>>
  /**
   * A read-only view of a thread of `harness`, for `user`: its events,
   * transcript, snapshot, media, usage, and index entry (see
   * `ObservedSession`). It mounts no plugins, writes nothing (no index entry, no
   * metadata), claims nothing, and runs no recovery, so a read of an idle
   * thread costs only store reads. When the session of the thread is open on
   * this host, the view reads through it, and it never holds it open. The
   * views of one log share its fold and its events. Use `open` for a write,
   * or for what needs plugins (`describe`).
   *
   * `user` is the user that the call acts for. Only needed when the host
   * has `access`. Without `access`, leave it out. With access, the thread
   * needs the `read` action, else the call throws `AccessDeniedError`. A child thread is
   * checked through its root thread. A thread with no index entry gets the
   * same answer as a refusal: a read creates no thread. Throws after
   * `host.close()`.
   *
   * @example
   * ```ts
   * const view = await host.observe(assistant, { threadId: 't-1', user })
   * const snapshot = await view.snapshot()
   * ```
   */
  observe: <THarness extends AnyHarness>(
    harness: THarness,
    options: Pick<OpenSessionOptions<U>, 'threadId' | 'user'>,
  ) => Promise<ObservedSession<THarness>>
  /**
   * Is a session of `harness` open on `threadId` on this host, in the tenant
   * of `user`? A session that closed on idle is not open, also when a
   * handle of it still exists.
   */
  isOpen: (
    harness: AnyHarness,
    options: { threadId: string; user?: U },
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
    options: ForkSessionOptions<U>,
  ) => Promise<HarnessSession<THarness>>
  /**
   * Move a conversation to another thread, maybe of another harness: a new
   * thread by default. Only the `envelope` moves: the note, then no
   * message, a summary, or the settled transcript with its media. Plugin
   * state, shared state, credentials, waits, settings, and plugin config
   * stay with the source. The source keeps running.
   *
   * Both threads are in the tenant of `user`: a transfer to another
   * tenant cannot be named. A new target has the user as its owner and
   * only member. Both logs get a `harness.transferred` record with the same
   * `transferId`, and the index entries link the threads in `metadata`
   * (`harness:transferredFrom` on the target, `harness:transferredTo` on
   * the source). `host.events()` yields a `transferred` event. A retry with
   * the same `transferId` makes no second thread and copies nothing again.
   * When another host owns the source log, the source record goes to it
   * through the input lane.
   *
   * With access, `user` is required. It needs the `transfer` action on
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
   *   user,
   * })
   * const session = await host.open(billing, { threadId, user })
   * ```
   */
  transfer: (options: TransferOptions<U>) => Promise<TransferResult>
  /**
   * Store an input for a thread, and run nothing. The input waits in the log
   * of the thread until a host owns the log and runs it: the host that runs
   * the thread now, a later `resumePending`, or a `createHarnessWorker`. Resolves with the receipt:
   * `queued`, or `rejected` with `conflict` for an id that another input
   * has.
   *
   * `user` is the user that the call acts for. Only needed when the host
   * has `access`. Without `access`, leave it out. With access, the input
   * needs the same action as on a handle (`send` for a prompt, `answer` for an answer). A
   * refused input throws `AccessDeniedError`, and nothing is stored.
   *
   * @example
   * ```ts
   * const receipt = await host.submit({
   *   harness: assistant,
   *   threadId: 't-1',
   *   input: { op: 'prompt', message: 'Write the weekly report.' },
   *   user,
   * })
   * ```
   */
  submit: (options: SubmitOptions<U>) => Promise<Receipt>
  /**
   * Continue the work that no live host runs. It lists the logs with work
   * and no live owner (an owner that stopped, inputs that wait, or a
   * schedule that is due), for a harness in `harnesses`. It gets each log, opens its thread, recovers the
   * work, and runs the inputs that wait. Two hosts can call it at once: each
   * log goes to one of them. Call it at boot, and from a cron job or a
   * Durable Object alarm. Resolves with the threads it took over.
   *
   * Each thread opens in its own tenant, with no user.
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
   * Run `session.recoverPendingWork()` on the open sessions of `threadId`, or on every
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
   * Run `session.reloadPlugins()` on every open session of `harness`. Rejects when
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
  sessions: HostSessions<U>
  /**
   * Take the access of `user` to a thread, after your app
   * changed its own access tables. `host.events()` yields a `revoked`
   * event, so the user's streams close. On a host with access, the open
   * handles and `host.observe` views of that user on the thread throw
   * `AccessDeniedError` from now on, their running `events()` reads end
   * with it, and a new `host.open` asks `isAllowed` again. The running and
   * queued work of the user on the thread is cancelled on any host, and
   * their schedules do not run. Resolves when the cancels are sent, and
   * rejects when they could not be sent: the access is gone already, so
   * call it again to stop the work. The `tenantId` of `user` picks
   * the tenant. Only `id` and `tenantId` are read.
   *
   * @example
   * ```ts
   * host.revoke({ threadId, user: { id: 'u3', tenantId: 'acme' } })
   * ```
   */
  revoke: (options: {
    threadId: string
    user: { id: string; tenantId?: string }
  }) => Promise<void>
  /**
   * Unpin the thread `threadId` from the host that its folder binding pins
   * it to, for example a host that does not come back. Then any host can
   * take the thread. Its `workspace.reattach` gets the folder binding of the
   * old host: give a new workspace to move the thread there, or `'pinned'`
   * to pin it again. The ownership of the old host must have expired:
   * while it is live, this rejects. A thread with no pin does nothing. With
   * access, the user needs the `delete` action. The `tenantId` of
   * `user` picks the tenant.
   *
   * @example
   * ```ts
   * await host.unpin({ harness: coder, threadId: 't-1', user })
   * ```
   */
  unpin: (options: {
    harness: AnyHarness
    threadId: string
    user?: U
  }) => Promise<void>
  /**
   * The user of `request`, from `access.getUser`, or `null` when
   * `getUser` refuses it. Network code other than the HTTP handler (an MCP
   * server, your own route) uses it. Throws on a host with no `access`.
   */
  getUserOfRequest: (options: { request: Request }) => Promise<U | null>
  /** `true` when the host was made with `access`, so every call needs a user. */
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

/**
 * @internal The thread of the inner session of `harnessText` in the outer
 * thread `outerThread`. Only an open marked with `throughOuterThread` for
 * that outer thread opens it.
 */
export const innerThreadOf = (outerThread: string, harnessName: string) =>
  `${outerThread}/inner/${harnessName}`

/** The index `metadata` key that links an inner thread to its outer thread. */
const OUTER_THREAD = 'harness:outerThread'

/**
 * The key of an open session in the host: the harness, the tenant, and the
 * thread. One thread id in two tenants is two sessions.
 */
/**
 * The `affinity` of a `listLogsWithoutOwner` query of this host: a log pinned to
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
 * The questions of the snapshot come from the folded log, so the questions
 * of every host count. Its operations are only the work of this host:
 * `seen.running` keeps the operations that run from the events, so the
 * events that another host wrote count too.
 */
function statusAfter(
  session: HarnessSession,
  event: StreamChunk,
  seen: { running: Set<string> },
) {
  if (event.type !== EventType.CUSTOM) return undefined
  const value = isRecord(event.value) ? event.value : {}
  const { operationId } = value
  switch (event.name) {
    case HARNESS_EVENTS.operationStarted:
      if (typeof operationId === 'string') seen.running.add(operationId)
      return 'running'
    case HARNESS_EVENTS.ownershipChanged:
      // The old owner stopped: its operations never finish.
      if (value.reason === 'taken_over') seen.running.clear()
      return undefined
    case HARNESS_EVENTS.operationResumed:
      // The input of a stopped host runs again as a new operation. The old
      // operation never finishes.
      if (typeof value.resumedFrom === 'string') {
        seen.running.delete(value.resumedFrom)
      }
      return undefined
    case HARNESS_EVENTS.question:
      return 'waiting'
    case HARNESS_EVENTS.operationFinished:
    case HARNESS_EVENTS.questionAnswered: {
      if (typeof operationId === 'string') seen.running.delete(operationId)
      const { pendingWaits, activeOperations } = session.snapshot()
      const isInterrupted = value.status === 'interrupted'
      const stillWaits = isInterrupted || pendingWaits.length > 0
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
export function sessionOfTurn<U extends HarnessUser>(
  host: HarnessHost<U>,
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
export function tenantEventsOf<U extends HarnessUser>(host: HarnessHost<U>) {
  return tenantEventReaders.get(host)
}

/** What a transport tells the host of a stream. Not public API. */
interface PresenceReporter<U extends HarnessUser> {
  /** A stream started. Call the result once, when it ends. */
  connect: (
    event: Omit<PresenceEvent<U>, 'connectionId'>,
  ) => (reason: PresenceEndReason) => void
}

/**
 * The presence hooks of each host that has them. Not public API. `never`
 * takes the reporter of a host of any user type.
 */
const presences = new WeakMap<object, PresenceReporter<never>>()

/**
 * @internal The reporter of the client streams of `host`, or `undefined`
 * when the host has no `presence` hooks.
 */
export function presenceOf<U extends HarnessUser>(host: HarnessHost<U>) {
  // `createHarnessHost` keyed the reporter by this host, so it takes `U`.
  return presences.get(host) as PresenceReporter<U> | undefined
}

/** Call a presence hook. A hook that throws or rejects only warns. */
function callPresence<T>(
  hook: ((event: T) => void | Promise<void>) | undefined,
  event: T,
) {
  const warn = (error: unknown) =>
    console.warn(
      `[@tanstack/ai-harness] A presence hook failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  try {
    const done = hook?.(event)
    if (done) done.then(undefined, warn)
  } catch (error) {
    warn(error)
  }
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
  listLogsWithoutOwner: (query: {
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
export function sweepOf<U extends HarnessUser>(host: HarnessHost<U>) {
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
export function hostCountsOf<U extends HarnessUser>(host: HarnessHost<U>) {
  const count = counters.get(host)
  if (!count) throw new Error('Not a host of createHarnessHost.')
  return count()
}

/** The `access` of each host that has one. Not public API. */
const accesses = new WeakMap<object, unknown>()

/** The hosts with `ownership` options: many instances. Not public API. */
const sharedHosts = new WeakSet<object>()

/**
 * @internal Does `host` have `ownership` options, so other instances serve
 * its threads? Then the HTTP handler needs `media`, so each instance
 * verifies the media URLs of the others.
 */
export const isSharedHost = (host: object) => sharedHosts.has(host)

/**
 * @internal The `access` of `host`, or `undefined` for a host with no
 * checks. The HTTP handler reads `getUser` from it.
 */
export function accessOf<U extends HarnessUser>(host: HarnessHost<U>) {
  // The host stored its own access under its own key, so it has type U.
  return accesses.get(host) as HarnessAccess<U> | undefined
}

/** The key of what `host.revoke` took: one user on one thread of a tenant. */
const revokedKey = (
  tenantId: string | undefined,
  threadId: string,
  userId: string,
) => `${logIdOf({ tenantId, logId: threadId })}\u0000${userId}`

/** Only the `memberId` of an `access.rules.filterSessionList` result. */
const memberFilterOf = (filter: { memberId?: string } | undefined) =>
  filter?.memberId === undefined ? {} : { memberId: filter.memberId }

/**
 * The members of a fork. `'self'`: the forker alone, as the owner. `'all'`:
 * the forker as the owner, and the other members with their roles, the old
 * owner as a `member`. Without a mode or a forker: those of the source.
 */
function forkedMembers(
  source: SessionIndexEntry | undefined,
  forker: HarnessUser | undefined,
  mode: 'self' | 'all' | undefined,
): Array<SessionMember> {
  if (mode === undefined || forker === undefined) return source?.members ?? []
  const owner: SessionMember = { userId: forker.id, role: 'owner' }
  if (mode === 'self') return [owner]
  const others = (source?.members ?? [])
    .filter((member) => member.userId !== forker.id)
    .map(
      (member): SessionMember =>
        member.role === 'owner' ? { ...member, role: 'member' } : member,
    )
  return [owner, ...others]
}

/**
 * The host records that the log fold of `harness` keeps: the `keepRecords`
 * of its plugins, with the larger count for a type in two plugins.
 */
function keptRecordsOf(harness: AnyHarness) {
  const keep = new Map<string, number>()
  for (const plugin of harness.plugins?.() ?? []) {
    for (const [type, count] of Object.entries(plugin.keepRecords ?? {})) {
      keep.set(type, Math.max(keep.get(type) ?? 0, count))
    }
  }
  return keep
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

const accessThreads = new WeakMap<object, string>()

/**
 * @internal Mark `openOptions` for the inner session of `harnessText`, with
 * the thread id from `innerThreadOf(outerThread, ...)`. On a host with access
 * that has an entry for `outerThread`, `host.open` with these options checks
 * the session through that thread, as a child thread is checked through its
 * root, so every user of the outer thread can use it. The first open links
 * the inner entry to `outerThread`. An inner entry with another link gets
 * the usual checks.
 */
export function throughOuterThread(
  openOptions: OpenSessionOptions,
  outerThread: string,
) {
  accessThreads.set(openOptions, outerThread)
  return openOptions
}

/**
 * Create a host for harness sessions. Every option is optional: a local app
 * with one user needs none. With `access`, the user type of
 * the host is what `access.getUser` returns, and each call is checked (see
 * `HarnessHostOptions.access`). Throws when `access` has no
 * `stores.sessions` to keep the owner and members in.
 *
 * See https://tanstack.com/ai/latest/docs/harness/host-options for every
 * option, its default, and when you need it.
 *
 * @example
 * ```ts
 * const host = createHarnessHost({ persistence })
 * const session = await host.open(studio, { threadId: 'thread-1' })
 * const turn = await session.send('Write a haiku about the sea.')
 * ```
 */
export function createHarnessHost<U extends HarnessUser = HarnessUser>(
  options: HarnessHostOptions<U> = {},
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
  const coalesceMs = options.log?.bufferStreamWriteMs ?? 100
  const limits = options.lifecycle?.retention
  const retention = {
    keepSettledOperations: limits?.keepSettledOperations ?? 500,
    keepSettledAgentRuns: limits?.keepSettledAgentRuns ?? 500,
    maxEventBytesInMemory: limits?.maxEventBytesInMemory ?? 8_000_000,
    keepLogRecords: limits?.keepLogRecords ?? 'all',
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
  /** The harness whose `addRecordsToModelContext` and `logState` fold each open shared log. */
  const foldedBy = new WeakMap<Promise<SharedLog>, AnyHarness>()
  /**
   * The shared log with the store log id `logId`, whose records with no
   * `thread` field belong to `rootThread`. The harness of the session that
   * opens it gives the `addRecordsToModelContext` and `logState` that fold it. It throws when
   * the log is open with another `addRecordsToModelContext` or `logState`.
   */
  const sharedLog = (
    store: LogStore,
    { logId, rootThread }: { logId: string; rootThread: string },
    harness: AnyHarness,
  ) => {
    const project = harness.durability?.addRecordsToModelContext
    const reduce = harness.durability?.logState
    const open = logs.get(logId)
    if (open) {
      const folder = foldedBy.get(open)
      if (
        folder &&
        (folder.durability?.addRecordsToModelContext !== project ||
          folder.durability?.logState !== reduce)
      ) {
        throw new Error(
          `The harness "${harness.name}" has another durability.addRecordsToModelContext or durability.logState than the harness "${folder.name}", which folds the log of thread ${JSON.stringify(rootThread)}. Pass the same addRecordsToModelContext and logState objects to every harness that shares a log.`,
        )
      }
      return open
    }
    const keep = keptRecordsOf(harness)
    const loaded = loadLogState({
      store,
      logId,
      rootThread,
      ...(project ? { project } : {}),
      ...(reduce ? { reduce } : {}),
      keep,
    }).then((state) => {
      const log = new SharedLog({
        store,
        ownership,
        harness: harness.name,
        logId,
        rootThread,
        state,
        coalesceMs,
        eventBytes: retention.maxEventBytesInMemory,
        ...(project ? { project } : {}),
        ...(reduce ? { reduce } : {}),
        keep,
        ...(options.log?.saveSnapshotAfter
          ? { snapshot: options.log.saveSnapshotAfter }
          : {}),
        logRecords: retention.keepLogRecords,
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
    foldedBy.set(loaded, harness)
    return loaded
  }
  const sessions = new Map<string, Promise<SessionImpl>>()
  /**
   * The last harness definition that this host opened under each name,
   * first from the `harnesses` option. A thread purge reads the harness
   * name in the index entry, and mounts the plugins of that definition to
   * end the thread (see `endThread`).
   */
  const harnessesByName = new Map<string, AnyHarness>(
    (options.harnesses ?? []).map((harness) => [harness.name, harness]),
  )
  /** The plugins with `lifetime: 'host'`, shared by the sessions of a harness. */
  const hostPlugins = new HostPlugins()
  /** The sessions of `sessions` that finished opening, by key. */
  const live = new Map<string, SessionImpl>()
  /**
   * The threads that `host.sessions.delete` purges now, by `logIdOf`. No
   * session of them opens until the purge ends, so no handle writes to a
   * thread whose data goes away.
   */
  const purging = new Set<string>()
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
  const closeIdleSessionsAfterMs =
    options.lifecycle?.closeIdleSessionsAfterMs ?? 60_000
  const maxOpenSessions = options.lifecycle?.maxOpenSessions ?? 500
  /** `host.close()` ran: no session opens any more. */
  let isClosed = false
  /**
   * The handles and the idle timer of each session key, the least recently
   * used key first. Each open session has one.
   */
  const holds = new Map<string, Hold>()
  /** The open went past `maxOpenSessions` with no session to close, and warned. */
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
    const delay = sweptOnly.has(key) ? 0 : closeIdleSessionsAfterMs
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
    // `host.close()` closed every session: a dropped handle loses nothing.
    if (isClosed) return
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
    let excess = sessions.size + 1 - maxOpenSessions
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
      `[@tanstack/ai-harness] The host has ${sessions.size} open sessions, more than lifecycle.maxOpenSessions (${maxOpenSessions}), and each one is busy or held by a handle. Release handles with session.close().`,
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
    ...(access
      ? { access: { allowServerEnvKeys: access.allowServerEnvKeys === true } }
      : {}),
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
    async (harness, { threadId, user, child }) => {
      if (isClosed) throw hostClosed()
      harnessesByName.set(harness.name, harness)
      const created: SessionImpl = new SessionImpl({
        ...sessionDeps(ids, rootHarness, tenantId),
        harness,
        threadId,
        ...(user ? { user } : {}),
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

  /**
   * Is `threadId` a thread that the host derives under `marker`? A
   * `harnessText` inner session (`<outer>/inner/<harness>`): any id with
   * `/inner/`, which only `throughOuterThread` opens. A `harnessAgent` child
   * (`<root>/agent/<run id>`): only when the part before a `/agent/` is a
   * thread of the index, so an app id such as `org/agent/notes` opens.
   */
  const isDerivedThread = async (
    key: SessionIndexKey,
    marker: '/agent/' | '/inner/',
  ) => {
    if (marker === '/inner/') return key.threadId.includes(marker)
    for (
      let at = key.threadId.indexOf(marker);
      at > 0;
      at = key.threadId.indexOf(marker, at + 1)
    ) {
      const base = { ...key, threadId: key.threadId.slice(0, at) }
      if ((await index.get(base)) !== undefined) return true
    }
    return false
  }

  /** Throw for the thread of a `harnessText` inner session, from app code. */
  const refuseInner = async (key: SessionIndexKey) => {
    if (!(await isDerivedThread(key, '/inner/'))) return
    throw new Error(
      `${JSON.stringify(key.threadId)} is the thread of a harnessText inner session. Open its outer thread, and use the harness there.`,
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
   * with no user, so it does not claim an entry with no owner. Hold the
   * key first (`hold`), or the session can close on idle at once.
   */
  const openSession = <THarness extends AnyHarness>(
    harness: THarness,
    { threadId, user, promptCache }: OpenSessionOptions,
    tenantId: string | undefined,
  ) => {
    if (isClosed) return Promise.reject(hostClosed())
    if (purging.has(logIdOf({ tenantId, logId: threadId }))) {
      return Promise.reject(
        new Error(
          `Thread ${JSON.stringify(threadId)} is being deleted. Open it again after host.sessions.delete ends.`,
        ),
      )
    }
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
      const seen = { running: new Set<string>() }
      const created = new SessionImpl({
        ...sessionDeps(
          { logId: storeLogId, rootThread: threadId },
          harness,
          tenantId,
        ),
        harness,
        threadId,
        ...(user ? { user } : {}),
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
        // A long sleep in a session that only a worker holds: the session
        // closes as on a deploy, and the log goes back with the wake. So
        // the sleep does not keep a worker slot or `worker.stop()`.
        onLongSleep: () =>
          queueMicrotask(() => {
            const isSweptOnly =
              live.get(key) === created &&
              sweptOnly.has(key) &&
              (holds.get(key)?.handles ?? 0) === 0
            if (!isSweptOnly) return
            closeShared(key, created, { recoverable: true }).catch(
              (error: unknown) =>
                console.error(
                  '[@tanstack/ai-harness] A sleeping session did not close.',
                  error,
                ),
            )
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
    userId,
  }: {
    tenantId: string | undefined
    threadId: string
    userId: string
  }) => {
    const key = revokedKey(tenantId, threadId, userId)
    revocations.set(key, (revocations.get(key) ?? 0) + 1)
    for (const listener of [...(revokeListeners.get(key) ?? [])]) listener()
    emit({
      type: 'revoked',
      ...(tenantId !== undefined ? { tenantId } : {}),
      threadId,
      userId,
      at: Date.now(),
    })
  }

  /** With access, the user of a public call: it is required. */
  const need = (user: U | undefined, call: string) => {
    if (user === undefined) {
      throw new Error(`${call} needs a user: the host has access.`)
    }
    return user
  }

  /**
   * The entry of the root thread of `entry`. A child is checked through it.
   * A parent with no entry throws: the child is not its own root.
   */
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
      if (!parent) {
        throw new Error(
          `The session index has no entry for thread ${JSON.stringify(root.parentThreadId)}, the parent of thread ${JSON.stringify(root.threadId)}, so the host cannot find the root of ${JSON.stringify(entry.threadId)}.`,
        )
      }
      root = parent
    }
    return root
  }

  /**
   * Throw `AccessDeniedError` unless `isAllowed` lets `user` do
   * `action` on the thread of `entry`. Without access, it allows all. The
   * entries are read in the tenant of the user, so a session of
   * another tenant is never found.
   */
  const allow = async ({
    user,
    action,
    threadId,
    entry,
    run,
    wait,
  }: {
    user: U
    action: AccessAction
    threadId: string
    entry: SessionIndexEntry | undefined
    run?: AccessRun
    wait?: AccessWait
  }) => {
    if (!access) return
    const { tenantId } = user
    // A child with no root is refused: its error would name the parent.
    const root = entry && (await rootOf(entry).catch(() => undefined))
    if (entry && !root) throw new AccessDeniedError({ action, threadId })
    // A thread with no entry has no owner and no members.
    const session: AccessSession = root ?? {
      ...(tenantId !== undefined ? { tenantId } : {}),
      threadId,
      members: [],
    }
    const allowed = await access.rules.isAllowed({
      user,
      action,
      session,
      ...(run ? { run } : {}),
      ...(wait ? { wait } : {}),
    })
    if (!allowed) throw new AccessDeniedError({ action, threadId })
  }

  /**
   * The entry of a thread for a public call, after the check of `action`.
   * With access, the user is required, and a thread with no entry
   * needs no check: the call finds nothing.
   */
  const checkEntry = async (
    call: string,
    action: AccessAction,
    { threadId, user }: { threadId: string; user?: U | undefined },
  ) => {
    const checked = access ? need(user, call) : undefined
    const entry = await index.get({ tenantId: user?.tenantId, threadId })
    if (checked && entry)
      await allow({ user: checked, action, threadId, entry })
    return entry
  }

  /** With access, the source of a fork needs an entry and the `fork` action. */
  const checkFork = async (
    call: string,
    target: { threadId: string; user?: U | undefined },
  ) => {
    const source = await checkEntry(call, 'fork', target)
    // No entry is not found: the same answer as a refusal.
    if (access && !source) {
      throw new AccessDeniedError({ action: 'fork', threadId: target.threadId })
    }
    return source
  }

  /** `share` and `unshare` change the members list: `access.rules.members`. */
  const checkShare = async (
    call: string,
    target: { threadId: string; user?: U | undefined },
  ) => {
    if (!access?.rules.members) {
      throw new Error(
        `${call} needs access.rules.members (membersOnly() has it). With your own access tables, change them and call host.revoke.`,
      )
    }
    await checkEntry(call, 'share', target)
    return need(target.user, call)
  }

  /** The checks of a handle of `user` on `threadId`. */
  const guardOf = (user: U, threadId: string): HandleGuard => {
    const key = revokedKey(user.tenantId, threadId, user.id)
    const count = revocations.get(key) ?? 0
    return {
      isRevoked: () => (revocations.get(key) ?? 0) !== count,
      onRevoke: (listener) => onRevoke(key, listener),
      authorize: async (action, run, wait) =>
        allow({
          user,
          action,
          threadId,
          entry: await index.get({ tenantId: user.tenantId, threadId }),
          ...(run ? { run } : {}),
          ...(wait ? { wait } : {}),
        }),
    }
  }

  /**
   * `openSession` with the checks of `host.open`: with access, a thread that
   * exists needs the `read` action, and a new thread is checked unless its
   * open made the user its owner. Hold the key first.
   *
   * With `accessThread` (the inner session of `harnessText`), a thread of
   * that id on this host is checked instead, as a child thread is checked
   * through its root. Without an entry for it, the checks are the usual ones.
   */
  const openChecked = async <THarness extends AnyHarness>(
    harness: THarness,
    openOptions: OpenSessionOptions<U>,
    accessThread?: string,
  ) => {
    if (!access) {
      return openSession(harness, openOptions, openOptions.user?.tenantId)
    }
    const user = need(openOptions.user, 'host.open')
    const { threadId } = openOptions
    const ids = { tenantId: user.tenantId, threadId }
    const outer =
      accessThread === undefined
        ? undefined
        : await index.get({
            tenantId: user.tenantId,
            threadId: accessThread,
          })
    if (outer && accessThread !== undefined) {
      await allow({
        user,
        action: 'read',
        threadId: accessThread,
        entry: outer,
      })
      return openSession(harness, openOptions, user.tenantId)
    }
    const before = await index.get(ids)
    // A child is checked through its root first: only a user who may read
    // it learns why the open refuses a child.
    if (before) {
      await allow({ user, action: 'read', threadId, entry: before })
    }
    const session = await openSession(harness, openOptions, user.tenantId)
    if (!before) {
      // Two users can create one thread at once. Only the user whose open
      // wrote the entry needs no check.
      const created = await index.get(ids)
      if (!created || ownerOf(created) !== user.id) {
        await allow({ user, action: 'read', threadId, entry: created })
      }
    }
    return session
  }

  /**
   * The handle of the session of `key` for the user of `openOptions`.
   * It holds the key already (`hold`), and releases it on close. With access,
   * it checks. A call on it after the session closed under it opens it again
   * with `openOptions`.
   */
  const handleOf = <THarness extends AnyHarness>({
    harness,
    session,
    openOptions,
    key,
    accessThread,
  }: {
    harness: THarness
    session: SessionImpl<THarness>
    openOptions: OpenSessionOptions<U>
    key: string
    /** See `openChecked`. The handle checks each action on this thread. */
    accessThread?: string
  }) => {
    const { user } = openOptions
    const { threadId } = session
    const guarded = accessThread ?? threadId
    return sessionHandle({
      session,
      user,
      ...(access && user ? { guard: guardOf(user, guarded) } : {}),
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
          return openChecked(harness, openOptions, accessThread)
        },
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
   * runs: the store keeps each input id once. `user` is who stops the
   * work, and the log keeps it. A failure rejects: the access is gone
   * already, so the caller can stop the work again.
   */
  const stopWorkOf = async ({
    tenantId,
    threadId,
    userId,
    user,
  }: {
    tenantId: string | undefined
    threadId: string
    userId: string
    user: U | undefined
  }) => {
    try {
      const open = await openSessionsOf(tenantId, threadId)
      for (const session of open) {
        await session.cancelWorkOf({ userId, user })
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
        record: Parameters<LogStore['offerInput']>[0]['record'],
      ) => logStore.offerInput({ logId, harness, inputId, record })
      for (const logged of root.inputs.values()) {
        const isTheirs =
          logged.user?.id === userId && WORK_OPS.has(logged.input.op)
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
        await offer(inputId, offeredInputRecord({ inputId, input, user }))
      }
      for (const [scheduleId, schedule] of root.thread.schedules) {
        if (schedule.user?.id !== userId || !schedule.input) continue
        // The id that the schedule offers its input with when it fires.
        await offer(`schedule:${scheduleId}`, {
          type: 'harness.schedule.done',
          scheduleId,
        })
      }
    } catch (error) {
      throw new Error(
        `The access of ${JSON.stringify(userId)} to thread ${JSON.stringify(threadId)} is gone, but their work did not stop: ${String(error)}. Call host.revoke again to stop it.`,
        { cause: error },
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
   * the handlers, and closes again. A child thread lives in the log of its
   * root, so the session reads that log. It needs the harness definition
   * that the index entry names, from the `harnesses` option or an open on
   * this host. Without it, it warns and runs nothing. With no entry, there
   * is nothing to run. A failed handler only warns: the purge of the data
   * goes on.
   */
  const endThread = async (tenantId: string | undefined, threadId: string) => {
    const entry = await index.get({ tenantId, threadId })
    const name = entry?.harness
    if (!entry || name === undefined) return
    const harness = harnessesByName.get(name)
    if (!harness) {
      console.warn(
        `[@tanstack/ai-harness] Thread ${JSON.stringify(threadId)} is deleted, but its plugins did not end it: this host does not know the harness ${JSON.stringify(name)}. What lives as long as the thread (an owned sandbox, a shadow repository) is not freed. Pass the harness in the \`harnesses\` option of createHarnessHost, or open it on this host first.`,
      )
      return
    }
    const root = await rootOf(entry)
    // The harness of the root folds the log, as in `openChildIn`.
    const rootHarness = harnessesByName.get(root.harness ?? name) ?? harness
    const session = new SessionImpl({
      ...sessionDeps(
        {
          logId: logIdOf({ tenantId, logId: root.threadId }),
          rootThread: root.threadId,
        },
        rootHarness,
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
    // `host.sessions.delete` takes it out when the whole purge ends.
    purging.add(logIdOf({ tenantId, logId: threadId }))
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
    { threadId, newThreadId, at, user }: ForkSessionOptions<U>,
  ) => {
    if (newThreadId === threadId) {
      throw new Error('A fork needs a new thread: newThreadId is threadId.')
    }
    const tenantId = user?.tenantId
    await refuseInner({ tenantId, threadId: newThreadId })
    // Before the open, so no plugin of `harness` mounts on a thread of
    // another harness. A move to another harness is `host.transfer`.
    checkHarness(await index.get({ tenantId, threadId }), harness)
    // The fork holds the source while it reads it.
    const sourceKey = sessionKey(harness.name, tenantId, threadId)
    hold(sourceKey)
    try {
      // In the tenant of the fork, with no user: the fork does not
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
          { threadId: newThreadId, ...(user ? { user } : {}) },
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

  /** `host.transfer` without its span. */
  const transferThread = async ({
    from,
    to,
    envelope,
    user,
    transferId: id,
  }: TransferOptions<U>): Promise<TransferResult> => {
    if (isClosed) throw hostClosed()
    const transferId = id ?? crypto.randomUUID()
    // The tenant of the user is the tenant of both threads.
    const tenantId = user?.tenantId
    const threadId = to.threadId ?? `thread-${transferId}`
    if (threadId === from.threadId) {
      throw new Error('A transfer needs another thread: to is from.')
    }
    await refuseInner({ tenantId, threadId })
    const checked = access ? need(user, 'host.transfer') : undefined
    const sourceEntry = await index.get({ tenantId, threadId: from.threadId })
    const targetEntry = await index.get({ tenantId, threadId })
    if (!sourceEntry) {
      // With access, not found is the same answer as a refusal.
      if (checked) {
        throw new AccessDeniedError({
          action: 'transfer',
          threadId: from.threadId,
        })
      }
      throw new Error(`Thread ${JSON.stringify(from.threadId)} does not exist.`)
    }
    if (checked) {
      await allow({
        user: checked,
        action: 'transfer',
        threadId: from.threadId,
        entry: sourceEntry,
      })
      // A target that exists has members already: the user must
      // be one who may send to it. A retry finds its own new target.
      if (targetEntry) {
        await allow({
          user: checked,
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
      // With no user, as `host.fork` opens its source. The open does
      // not take the log from a host that owns it.
      const sourceSession = await openSession(
        from.harness,
        { threadId: from.threadId },
        tenantId,
      )
      const targetKey = sessionKey(to.harness.name, tenantId, threadId)
      hold(targetKey)
      try {
        // A new target gets the user as its owner and only member.
        const targetSession = await openSession(
          to.harness,
          { threadId, ...(user ? { user } : {}) },
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
                      content: `Summary of the conversation so far:\n${await sourceSession.transferSummary(user, settled)}`,
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
            ...storedUser(user),
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
          ...(end.user ? { user: end.user } : {}),
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
          ...(end.user ? { userId: end.user.id } : {}),
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
  }

  const tracer = options.observability?.tracer

  const host: HarnessHost<U> = {
    async open(harness, openOptions) {
      if (isClosed) throw hostClosed()
      const { threadId } = openOptions
      const tenantId = openOptions.user?.tenantId
      const ids = { tenantId, threadId }
      // A child of `harnessAgent` opens only through the run that starts it.
      if (await isDerivedThread(ids, '/agent/')) {
        throw new Error(
          `${JSON.stringify(threadId)} is the thread of a harnessAgent child. Open its root thread and read the child through it.`,
        )
      }
      // See `throughOuterThread`. An inner thread opens only through the
      // outer thread that its id names.
      const outerThread = accessThreads.get(openOptions)
      const isOwnInner =
        outerThread !== undefined &&
        threadId.startsWith(`${outerThread}/inner/`)
      if (!isOwnInner) await refuseInner(ids)
      const key = sessionKey(harness.name, tenantId, threadId)
      // Before the open, so the session never closes on idle under it.
      hold(key)
      try {
        const [outer, inner] =
          access && isOwnInner
            ? await Promise.all([
                index.get({ tenantId, threadId: outerThread }),
                index.get({ tenantId, threadId }),
              ])
            : []
        // A new inner thread, or one linked to this outer thread.
        const isLinked =
          inner === undefined || inner.metadata?.[OUTER_THREAD] === outerThread
        const accessThread = outer && isLinked ? outerThread : undefined
        const session = await openChecked(harness, openOptions, accessThread)
        if (accessThread !== undefined && inner === undefined) {
          await index.update({ tenantId, threadId }, (entry) =>
            entry && entry.metadata?.[OUTER_THREAD] === undefined
              ? {
                  ...entry,
                  metadata: { ...entry.metadata, [OUTER_THREAD]: accessThread },
                }
              : undefined,
          )
        }
        return handleOf({ harness, session, openOptions, key, accessThread })
      } catch (error) {
        await release(key)
        throw error
      }
    },
    async observe(harness, { threadId, user }) {
      if (isClosed) throw hostClosed()
      const tenantId = user?.tenantId
      // ponytail: without an index, a child is known only by its id
      // (`<root>/agent/<run id>`), so an app id with `/agent/` throws too.
      if (!sessionStore && threadId.includes('/agent/')) {
        throw new Error(
          `host.observe: ${JSON.stringify(threadId)} is the thread of a harnessAgent child. The host finds the root of a child thread through the session index: a child thread needs stores.sessions.`,
        )
      }
      const entry = await index.get({ tenantId, threadId })
      let checked: U | undefined
      if (access) {
        checked = need(user, 'host.observe')
        // No entry is not found: the same answer as a refusal.
        if (!entry) throw new AccessDeniedError({ action: 'read', threadId })
        // `allow` checks a child thread through its root thread.
        await allow({ user: checked, action: 'read', threadId, entry })
      }
      const key = sessionKey(harness.name, tenantId, threadId)
      // A child thread has its records in the log of its root, with its
      // thread on each. A thread with no entry is a root.
      const root = entry ? (await rootOf(entry)).threadId : threadId
      // A revoke of the user on the thread (its root) ends the view: each
      // later call throws, and a read that runs now stops.
      const revoked = checked && guardOf(checked, root)
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
    isOpen(harness, { threadId, user }) {
      if (access) need(user, 'host.isOpen')
      return sessions.has(sessionKey(harness.name, user?.tenantId, threadId))
    },
    async fork(harness, forkOptions) {
      await checkFork('host.fork', forkOptions)
      const { fork, key } = await forkInto(harness, forkOptions)
      const { user } = forkOptions
      const openOptions = {
        threadId: fork.threadId,
        ...(user ? { user } : {}),
      }
      return handleOf({ harness, session: fork, openOptions, key })
    },
    // Each transfer runs in a `harness.transfer` span.
    transfer: (transferOptions) =>
      tracer
        ? withSpan(
            {
              tracer,
              name: 'harness.transfer',
              attributes: {
                'harness.thread_id': transferOptions.from.threadId,
                ...(transferOptions.to.threadId !== undefined
                  ? {
                      'harness.transfer.to_thread_id':
                        transferOptions.to.threadId,
                    }
                  : {}),
                ...(transferOptions.user?.tenantId !== undefined
                  ? { 'harness.tenant_id': transferOptions.user.tenantId }
                  : {}),
              },
            },
            async (span) => {
              const result = await transferThread(transferOptions)
              span.setAttribute('harness.transfer.id', result.transferId)
              span.setAttribute(
                'harness.transfer.to_thread_id',
                result.threadId,
              )
              return result
            },
          )
        : transferThread(transferOptions),
    revoke: async ({ threadId, user }) => {
      // At once, so the handles of the user refuse each call from now on.
      revokeUser({
        tenantId: user.tenantId,
        threadId,
        userId: user.id,
      })
      // No user stops it: the app changed its own access tables.
      await stopWorkOf({
        tenantId: user.tenantId,
        threadId,
        userId: user.id,
        user: undefined,
      })
    },
    async unpin({ harness, threadId, user }) {
      if (isClosed) throw hostClosed()
      await checkEntry('host.unpin', 'delete', { threadId, user })
      const logId = logIdOf({ tenantId: user?.tenantId, logId: threadId })
      const state = await loadLogState({
        store: logStore,
        logId,
        rootThread: threadId,
      })
      // The pin is the host of a folder binding of a thread of the log.
      const pins = new Set(
        [...state.sessions.values()].flatMap(({ thread }) =>
          thread.workspace?.kind === 'host' && thread.workspace.hostId
            ? [thread.workspace.hostId]
            : [],
        ),
      )
      for (const pin of pins) {
        if (await ownership.unpin(logId, harness.name, pin)) return
      }
      if (pins.size > 0) {
        throw new Error(
          `The host of the thread ${threadId} still owns it, so it stays pinned. Try again when its ownership expired.`,
        )
      }
    },
    hasAccess: access !== undefined,
    async getUserOfRequest({ request }) {
      if (!access) {
        throw new Error(
          'host.getUserOfRequest needs host access ({ getUser, rules }).',
        )
      }
      return await access.getUser({ request })
    },
    async submit({ harness, threadId, input, user, inputId }) {
      if (isClosed) throw hostClosed()
      const tenantId = user?.tenantId
      const of = { tenantId, threadId }
      await refuseInner(of)
      const id = inputId ?? createInputId()
      // An answer or a cancel is checked with the run that it targets, from
      // the log. `null`: the log does not have that run.
      let run: AccessRun | null | undefined
      const entry = await index.get(of)
      if (access) {
        const checked = need(user, 'host.submit')
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
              user: checked,
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
      // After the access check, so a refused user does not learn the
      // harness. The offer names the harness of the log for the sweep.
      checkHarness(entry, harness)
      await refuseChild(of)
      if (run === null) {
        const refused: Receipt = {
          inputId: id,
          status: 'rejected',
          reason: 'unknown_run',
        }
        return refused
      }
      const record = offeredInputRecord({ inputId: id, input, user })
      const offered = await logStore.offerInput({
        logId: logIdOf({ tenantId, logId: threadId }),
        harness: harness.name,
        inputId: id,
        record,
      })
      // A thread that another host deleted takes no input.
      const isRefused = offered === 'conflict' || offered === 'deleted'
      const receipt: Receipt = isRefused
        ? { inputId: id, status: 'rejected', reason: offered }
        : { inputId: id, status: 'queued' }
      return receipt
    },
    async resumePending({ harnesses, close = 'whenIdle', limit = 100 }) {
      const byName = new Map(
        harnesses.map((harness) => [harness.name, harness]),
      )
      // A log pinned to another host is not listed.
      const orphaned = await logStore.listLogsWithoutOwner({
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
            ? [entry.value.recoverPendingWork()]
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
          entry.status === 'fulfilled' ? [entry.value.reloadPlugins()] : [],
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
      async list({ user, ...filters } = {}) {
        if (!sessionStore) return { entries: [] }
        // Last, so a filter never names another tenant.
        const tenantId = user?.tenantId
        if (!access) {
          return sessionStore.list({
            parentThreadId: null,
            ...filters,
            tenantId,
          })
        }
        const checked = need(user, 'host.sessions.list')
        const parent = filters.parentThreadId
        // The children of a thread are read through their root: one check,
        // and no member filter, as a child has no members.
        if (typeof parent === 'string') {
          await checkEntry('host.sessions.list', 'list', {
            threadId: parent,
            user: checked,
          })
          return sessionStore.list({ ...filters, tenantId })
        }
        const page = await sessionStore.list({
          parentThreadId: null,
          ...filters,
          tenantId,
          // The store keeps only the sessions that the filter names, so a
          // page stays full. Only `memberId`: no filter names a tenant.
          ...memberFilterOf(access.rules.filterSessionList?.(checked)),
        })
        const allowed = await Promise.all(
          page.entries.map(async (session) =>
            access.rules.isAllowed({
              user: checked,
              action: 'list',
              session,
            }),
          ),
        )
        return {
          ...page,
          entries: page.entries.filter((_entry, at) => allowed[at]),
        }
      },
      get: (target) => checkEntry('host.sessions.get', 'read', target),
      async rename({ threadId, title, user }) {
        const call = 'host.sessions.rename'
        await checkEntry(call, 'configure', { threadId, user })
        return index.update(
          { tenantId: user?.tenantId, threadId },
          (entry) => entry && { ...entry, title, updatedAt: Date.now() },
        )
      },
      async update({ harness, threadId, update, user }) {
        const call = 'host.sessions.update'
        await checkEntry(call, 'configure', { threadId, user })
        // The schema checked the metadata, so it has the harness type.
        return (await index.update(
          { tenantId: user?.tenantId, threadId },
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
      async delete({ threadId, user }) {
        const entry = await checkEntry('host.sessions.delete', 'delete', {
          threadId,
          user,
        })
        // With access, no entry is a refusal: a new thread that still opens
        // has no entry yet, and only its owner may delete it.
        if (access && !entry) {
          throw new AccessDeniedError({ action: 'delete', threadId })
        }
        const tenantId = user?.tenantId
        const seen = new Set<string>()
        try {
          await purge(tenantId, threadId, seen)
        } finally {
          for (const id of seen)
            purging.delete(logIdOf({ tenantId, logId: id }))
        }
      },
      async fork({ harness, threadId, at, members, user }) {
        const tenantId = user?.tenantId
        // Check before a session opens. Without a sessions store there is no
        // entry, so there is nothing to check.
        const source = await checkFork('host.sessions.fork', {
          threadId,
          user,
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
            // With no user, as `host.fork` opens the source.
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
            ...(user ? { user } : {}),
          })
          forked = fork
          // No handle takes the fork: it closes on idle.
          await release(key)
        } finally {
          await release(sourceKey)
        }
        const mode =
          members ??
          (access ? (access.rules.members?.fork ?? 'self') : undefined)
        const people = forkedMembers(source, user, mode)
        const now = Date.now()
        // A sibling of the old thread, not a child: no parentThreadId.
        const entry: SessionIndexEntry = {
          ...(tenantId !== undefined ? { tenantId } : {}),
          threadId: forked.threadId,
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
              // holds, but not its members: they come from `members`.
              return {
                ...entry,
                ...current,
                ...(entry.title ? { title: entry.title } : {}),
                members: entry.members,
                updatedAt: now,
              }
            },
          )) ?? entry
        )
      },
      async share({ threadId, userId, role, user }) {
        const call = 'host.sessions.share'
        const checked = await checkShare(call, { threadId, user })
        return index.update(
          { tenantId: checked.tenantId, threadId },
          (entry) => {
            if (!entry) return undefined
            if (ownerOf(entry) === userId && role !== 'owner') {
              throw new Error(
                `${JSON.stringify(userId)} owns thread ${JSON.stringify(threadId)}: the role of the owner cannot change.`,
              )
            }
            return {
              ...entry,
              members: [
                ...entry.members.filter((member) => member.userId !== userId),
                { userId, role },
              ],
              updatedAt: Date.now(),
            }
          },
        )
      },
      async unshare({ threadId, userId, user }) {
        const call = 'host.sessions.unshare'
        const checked = await checkShare(call, { threadId, user })
        const { tenantId } = checked
        const changed = await index.update({ tenantId, threadId }, (entry) => {
          if (!entry) return undefined
          if (ownerOf(entry) === userId) {
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
        // After the write, so no new work of the user gets through. At
        // once, so the reads of the user end before the work stops. The log
        // keeps who cancelled it.
        revokeUser({ tenantId, threadId, userId: userId })
        await stopWorkOf({ tenantId, threadId, userId, user: checked })
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
  if (options.ownership) sharedHosts.add(host)
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
  const { presence } = options
  if (presence) {
    presences.set(host, {
      connect: (event: Omit<PresenceEvent<U>, 'connectionId'>) => {
        const connected = { ...event, connectionId: crypto.randomUUID() }
        callPresence(presence.onConnect, connected)
        let isEnded = false
        return (reason) => {
          if (isEnded) return
          isEnded = true
          callPresence(presence.onDisconnect, { ...connected, reason })
        }
      },
    })
  }
  sweeps.set(host, {
    listLogsWithoutOwner: (query) =>
      logStore.listLogsWithoutOwner({ ...query, ...pinOf(ownership) }),
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
  return host
}
