import {
  INTERRUPT_BINDING_METADATA_KEY,
  convertSchemaToJsonSchema,
  validateJsonSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { NO_OWNER_EPOCH, loadChildTranscript } from '@tanstack/ai-persistence'
import { ownerOf } from '../access'
import { checkConfigValue } from '../config'
import { transcriptText } from '../first-party/session-tools'
import { LogOwnedElsewhereError } from '../ownership'
import { isRecord } from '../utils'
import { changedEntry } from '../session-entry'
import { stableJson, visibleMessages } from '../log'
import { agentRunThread, isHumanTarget } from '../log-records'
import { mediaIdOf, mediaOfMessage, mediaPart } from '../media-ref'
import {
  BackgroundJobs,
  CapabilityValues,
  RevertFiles,
  RevertStanding,
  SessionMetadata,
  SessionScrub,
  SessionSignal,
  ThreadEnds,
  WorkspaceLog,
} from '../plugins'
import { HARNESS_EVENTS } from '../types'
import { SECRET_ANSWER_PREFIX } from '../auth'
import {
  expiryOf,
  interruptExpiry,
  openWaits,
  waitFromQuestion,
} from '../waits'
import {
  createInputId,
  customEvent,
  isOfferedInputRecord,
  scopeOf,
  loggedChildWaits,
  snapshotFrom,
  storedUser,
  changeSettings,
} from './helpers'
import { SessionInputs } from './inputs'
import type { OperationImpl } from '../operation'
import type {
  Interrupt,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai'
import type {
  BlobBody,
  BlobRange,
  LogRecord,
  SessionIndexEntry,
} from '@tanstack/ai-persistence'
import type { RevertState } from '../log'
import type { ThreadEndHandler } from '../plugins'
import type {
  HandoffRecord,
  RecordUser,
  ThreadRecord,
  WaitRecord,
  WaitState,
} from '../log-records'
import type { Wait, WaitOutcome } from '../waits'
import type { Question } from '../commands'
import type { ConfigOption } from '../config'
import type {
  AnyHarness,
  HarnessLogStateOf,
  SessionMetadataOf,
} from '../define'
import type { SessionEntryChange, SessionEntryUpdate } from '../session-entry'
import type {
  ChatTurnResult,
  ConfigureOptions,
  OfferedHarnessInput,
  MediaRecord,
  MediaUpload,
  PendingQuestion,
  HarnessUser,
  Receipt,
  ThreadSettings,
} from '../types'
import type {
  SessionSnapshot,
  SessionDescription,
  InterruptedTurn,
} from './types'
import type { SettingNames } from './helpers'
import type { HarnessSession, SessionImpl } from './harness-session'
import type { Credential } from '@tanstack/ai/byok'

/** What the model of the source gets for a `'summary'` transfer. */
const TRANSFER_SUMMARY_PROMPT =
  'Summarize this conversation for the agent that takes it over. Keep the request, decisions, open tasks, and facts it needs. Leave out small talk.'

/** What the log keeps in place of a secret answer. */
const SECRET_ANSWER = '[secret]'

/** A secret answer that cannot go to the owner of the log. */
class AnswerRefused extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

/**
 * A layer of {@link HarnessSession}: config, thread settings, revert,
 * interrupts, media, and the snapshot.
 */
export abstract class SessionState<
  THarness extends AnyHarness = AnyHarness,
> extends SessionInputs<THarness> {
  /**
   * The `step.ask` calls of this host that wait, by wait id: each one goes
   * on when the log ends its wait (see `afterWaitEnd`).
   */
  protected readonly waitEnds = new Map<string, () => void>()
  /** The secret answers to `step.ask` waits that this host kept, by wait id. */
  protected readonly keptAnswers = new Map<string, unknown>()
  /**
   * The logged waits that an answer of this host ends now, by wait id. A
   * second answer to one of them is refused, so only one gets `accepted`.
   */
  protected readonly answering = new Set<string>()
  /** The handlers that plugins added to `ThreadEnds`, oldest first. */
  protected readonly threadEnds = new Set<ThreadEndHandler>()

  /** The stores that first-party plugins read as capabilities. */
  protected storeCapabilities() {
    const values = new CapabilityValues()
    const { metadata } = this.persistence.stores
    if (metadata) values.provide(SessionMetadata, metadata)
    values.provide(RevertStanding, () => this.reverted !== undefined)
    values.provide(SessionSignal, this.lifetime.signal)
    values.provide(SessionScrub, (text) => this.scrub(text))
    values.provide(ThreadEnds, {
      add: (handler) => {
        this.threadEnds.add(handler)
        return () => this.threadEnds.delete(handler)
      },
    })
    values.provide(BackgroundJobs, {
      started: (job) => this.logJob(job, false),
      ended: (job) => this.logJob(job, true),
    })
    values.provide(WorkspaceLog, {
      hostId: () => this.writer.hostId,
      bound: (threadId) =>
        this.writer.stateOf(threadId).thread.workspace ?? undefined,
      bind: ({ threadId, binding }) =>
        this.writer.append([
          {
            type: 'harness.workspace.bound',
            binding,
            ...(threadId === this.threadId ? {} : { thread: threadId }),
          },
        ]),
      pin: (hostId) => this.writer.pin(hostId),
      lostJobs: (threadId) =>
        [...this.writer.stateOf(threadId).jobs].flatMap(
          ([jobId, { backendId }]) =>
            backendId === undefined || this.liveJobs.has(jobId)
              ? []
              : [{ jobId, backendId }],
        ),
      stranded: ({ operationId, hostId }) =>
        this.feed.publish(
          operationId,
          customEvent(HARNESS_EVENTS.stranded, {
            operationId,
            ...(hostId !== undefined ? { hostId } : {}),
          }),
        ),
    })
    return values
  }

  /**
   * Write the index entry of this thread on open: a new entry the first
   * time, in the tenant of this session, else a new `updatedAt`. The owner
   * is who opened the thread first, so an open by another user does not
   * change it. The owner is the first member, with the role `owner`.
   */
  protected async openEntry() {
    const now = Date.now()
    const { user, tenantId, threadId } = this
    // A child of `harnessAgent` names its parent thread and has no owner:
    // access is checked on its root thread.
    const parent = this.childLink?.parentThreadId
    const opened = await this.index.update(this.indexKey, (entry) => {
      const current: SessionIndexEntry = entry ?? {
        ...(tenantId !== undefined ? { tenantId } : {}),
        threadId,
        ...(parent !== undefined ? { parentThreadId: parent } : {}),
        members: [],
        createdAt: now,
        updatedAt: now,
      }
      // A new entry belongs to its opener. Without access, an entry with no
      // owner goes to the next opener with a user too. With access, it
      // stays without an owner: `isAllowed` decides who may open it.
      const isClaim =
        parent === undefined &&
        user !== undefined &&
        (entry === undefined ||
          (ownerOf(current) === undefined && !this.hasAccess))
      return {
        ...current,
        harness: current.harness ?? this.harness.name,
        updatedAt: now,
        ...(isClaim
          ? { members: [{ userId: user.id, role: 'owner' as const }] }
          : {}),
      }
    })
    const ownerId = opened && ownerOf(opened)
    if (ownerId !== undefined) {
      this.owner = {
        id: ownerId,
        ...(tenantId !== undefined ? { tenantId } : {}),
      }
    }
  }

  /**
   * The interrupted turn that the snapshot shows. The owner of the log and a
   * session with a running turn keep it in memory. Another session reads it
   * from the fold of the log, so it sees the interrupts that another host
   * opens and ends. After a failed write the fold is behind, so memory wins.
   */
  protected stoppedTurn(): InterruptedTurn | undefined {
    const writer = this.logWriter
    if (
      !writer ||
      this.logFailure ||
      this.activeTurn ||
      writer.epoch !== NO_OWNER_EPOCH
    ) {
      return this.interrupted
    }
    return writer.state.thread.interrupted ?? undefined
  }

  snapshot(): SessionSnapshot {
    const active = [...this.operations.values()].filter(
      (operation) => !operation.isSettled(),
    )
    const stopped = this.stoppedTurn()
    const pendingInterrupts =
      this.activeResume && !this.activeTurn?.isSettled()
        ? []
        : (stopped?.interrupts ?? [])
    return snapshotFrom({
      threadId: this.threadId,
      thread: this.logWriter?.state.thread,
      stopped,
      interrupts: pendingInterrupts,
      plugins: { ...this.stateDoc },
      usage: this.usage(),
      cursor: this.feed.head(),
      // The waits of the children that another host runs.
      childWaits: this.logWriter
        ? loggedChildWaits(this.logWriter, this.threadId)
        : [],
      live: {
        isRunning: this.activeTurn !== undefined,
        activeOperations: active.map((operation) => ({
          id: operation.id,
          kind: operation.kind,
          ...(operation.agent ? { agent: operation.agent } : {}),
          startedCursor: operation.startedCursor,
        })),
        // A steer that waits to join the running turn waits too.
        queuedTurns: this.queue.length + this.steerQueue.length,
        waitingInputs: this.waitingInputs(),
        // The waits of the `harnessAgent` children of the runs: an answer
        // here goes to the child (see `resolve`). No turn of this session
        // holds them.
        childWaits: [...this.harnessChildren.values()].flatMap((child) =>
          child.session
            .snapshot()
            .pendingWaits.map(({ turn: _turn, ...wait }) => wait),
        ),
      },
    })
  }

  // ===========================
  // Media
  // ===========================

  /**
   * Store a file in the media store of this thread. Send it to a turn with
   * `mediaPart(record)`. Throws a `MediaError`: 413 when the file is bigger
   * than `media.maxBytes`, 415 for a type or kind the harness does not take.
   *
   * @example
   * const record = await session.putMedia({ body: bytes, mimeType: 'image/png', name: 'cat.png' })
   * session.send([{ type: 'text', content: 'What is this?' }, mediaPart(record)])
   */
  putMedia({ body, mimeType, name }: MediaUpload<BlobBody>) {
    return this.mediaStore.put(body, { mimeType, name })
  }

  /** The record of a media file of this thread, or `null` when it is not found. */
  getMedia({ id }: { id: string }) {
    return this.mediaStore.get(id)
  }

  /**
   * The bytes of the media file `id`, or of one `range` of them. Throws a
   * `MediaError` with 404 when it is not found.
   *
   * @example
   * const bytes = await session.loadMedia({ id: record.id })
   */
  loadMedia({ id, range }: { id: string; range?: BlobRange }) {
    return this.mediaStore.load(id, range)
  }

  /**
   * A URL for a media file, for `<img>`, `<audio>`, or `<video>`. A session
   * has no server, so this is a data URL for a file up to 1 MB, and `{}` for
   * a bigger file (use `loadMedia`).
   */
  async mediaUrl({ id }: { id: string }) {
    const url = await this.mediaStore.dataUrl(id)
    const answer: { url?: string; expiresAt?: number } =
      url === undefined ? {} : { url }
    return answer
  }

  /**
   * @internal Start this new thread as a fork of `source`, before its first
   * turn: `messages` with their media copied to this thread, and the stored
   * settings, plugin config, and shared state of `source`. The log of this thread keeps
   * them. `host.fork` calls it.
   */
  async adoptFork(
    source: SessionImpl,
    messages: ReadonlyArray<ModelMessage>,
  ): Promise<void> {
    await this.adoptMessages(source, messages)
    await this.adoptSettings(source)
  }

  /**
   * @internal Add `messages` after the transcript of this thread, with their
   * media copied from `source` to this thread. `records` go in the same
   * append, so a crash keeps both or neither. A fork and `host.transfer`
   * call it.
   */
  async adoptMessages(
    source: SessionImpl,
    messages: ReadonlyArray<ModelMessage>,
    records: ReadonlyArray<LogRecord> = [],
  ): Promise<void> {
    // A media id belongs to one thread, so each file gets a copy here.
    const copies = new Map<string, MediaRecord | null>()
    const copy = async (id: string) => {
      if (!copies.has(id)) {
        const record = await source.getMedia({ id })
        copies.set(
          id,
          record &&
            (await this.putMedia({
              // A stream, so the copy does not hold the whole file in memory.
              body: await source.mediaStore.open(id),
              mimeType: record.mimeType,
              name: record.name,
            })),
        )
      }
      return copies.get(id) ?? undefined
    }
    const forked: Array<ModelMessage> = []
    for (const message of messages) {
      const content = Array.isArray(message.content)
        ? await Promise.all(
            message.content.map(async (part) => {
              const id = mediaIdOf(part)
              const made = id === undefined ? undefined : await copy(id)
              return made ? mediaPart(made) : part
            }),
          )
        : message.content
      const media = mediaOfMessage(message)
      if (media.length === 0) {
        forked.push({ ...message, content })
        continue
      }
      const harness = {
        ...message.metadata?.harness,
        media: await Promise.all(
          media.map(async (record) => (await copy(record.id)) ?? record),
        ),
      }
      forked.push({
        ...message,
        content,
        metadata: { ...message.metadata, harness },
      })
    }
    await this.writer.commit({
      messages: [...this.writer.state.messages, ...forked],
      records,
    })
    for (const record of records) this.publishTransferred(record)
  }

  /**
   * @internal Copy the stored settings and plugin config of `source` to
   * this thread. Only a fork calls it: a transfer never moves them.
   */
  private async adoptSettings(source: SessionImpl): Promise<void> {
    this.currentSettings = source.threadSettings()
    const records: Array<ThreadRecord> = []
    if (Object.keys(this.currentSettings).length > 0) {
      records.push({ type: 'harness.settings', settings: this.currentSettings })
    }
    for (const [key, value] of source.configValues) {
      if (!this.sessionPlugins?.config.has(key)) continue
      this.configValues.set(key, value)
      records.push({ type: 'harness.config', key, value })
    }
    // The state that the agents share goes with the fork. Plugin state does not.
    for (const [key, value] of source.writer.state.thread.shared) {
      records.push({ type: 'harness.state', key, delta: { path: [], value } })
    }
    if (records.length > 0) await this.writer.append(records)
  }

  /** @internal The end of the transfer `transferId` in the log of this thread. */
  transferOf(transferId: string) {
    return this.writer.state.thread.transfers.get(transferId)
  }

  /**
   * @internal Write the source end of a transfer: its `harness.transferred`
   * record. When another host owns the log, the record goes to that host
   * through the input lane, with an id from the transfer, so a retry offers
   * the same record again. A log that has the transfer already gets nothing.
   */
  async recordTransfer(
    record: Extract<ThreadRecord, { type: 'harness.transferred' }>,
  ): Promise<void> {
    if (this.transferOf(record.transferId)) return
    const isAppended = await this.appendOrOffer(
      record,
      `transfer:${record.transferId}`,
    )
    // An offered record gets its event from the owner, when it appends it.
    if (isAppended) this.publishTransferred(record)
  }

  /**
   * Append `record` to the log of this thread. When another host owns the
   * log, offer it to that host as `inputId`: the owner appends it as it is.
   * Resolves `true` when this host appended it.
   */
  private async appendOrOffer(record: LogRecord, inputId: string) {
    try {
      await this.writer.append([record])
      return true
    } catch (error) {
      if (!(error instanceof LogOwnedElsewhereError)) throw error
    }
    const offered = await this.writer.offer(inputId, record)
    if (offered === 'deleted') {
      throw new Error(
        `The thread ${JSON.stringify(this.threadId)} was deleted.`,
      )
    }
    if (offered === 'conflict') {
      throw new Error(
        `The input lane has another record with id ${JSON.stringify(inputId)}.`,
      )
    }
    return false
  }

  /**
   * @internal A summary of `messages` for `host.transfer`, by the model of
   * this harness, with the keys of `user`. The usage of its model calls
   * goes to the log of this thread at once, under the source `transfer` and
   * the label `summary`, so it counts also when the transfer fails later.
   */
  async transferSummary(
    user: HarnessUser | undefined,
    messages: ReadonlyArray<ModelMessage>,
  ): Promise<string> {
    const named = this.currentSettings.model
    const model =
      (named === undefined ? undefined : this.harness.models?.[named]) ??
      this.harness.adapter
    if (!model) {
      throw new Error(
        `A transfer with messages: 'summary' needs a model: harness ${JSON.stringify(this.harness.name)} has no adapter.`,
      )
    }
    // The call is part of no run. The run gives it the keys of `user`
    // and the signal of the session, and `count` takes its usage.
    const run = this.runContext({
      user,
      runId: 'transfer',
      signal: this.lifetime.signal,
    })
    const result = await this.modelChat({
      adapter: model,
      options: {
        messages: [
          {
            role: 'user',
            content: `${TRANSFER_SUMMARY_PROMPT}\n\n${transcriptText(messages)}`,
          },
        ],
      },
      run,
      source: 'transfer',
      label: 'summary',
      // A new id for each call: a retry that calls the model again pays again.
      count: async (call) => {
        await this.appendOrOffer(
          { type: 'harness.usage', ...call },
          createInputId(),
        )
      },
    })
    const text =
      isRecord(result) && typeof result.text === 'string' ? result.text : ''
    if (!text.trim()) {
      throw new Error('The summary model returned no text. Nothing moved.')
    }
    return text
  }

  // ===========================
  // Config, commands, questions
  // ===========================

  /** Every session setting, with its option and current value. */
  pluginSettings(): Record<
    string,
    { option: ConfigOption; value: unknown; owner: string }
  > {
    const result: Record<
      string,
      { option: ConfigOption; value: unknown; owner: string }
    > = {}
    for (const [key, entry] of this.sessionPlugins?.config ?? []) {
      result[key] = {
        option: entry.option,
        owner: entry.owner,
        // The latest value, also while a turn runs with its own copy.
        value: this.configValue(key, this.configValues),
      }
    }
    return result
  }

  /**
   * Change a session setting. It applies at the next turn. `user` is
   * who changes it. Default: the user that opened the session. The log
   * keeps it.
   */
  setPluginSetting(options: {
    key: string
    value: unknown
    user?: HarnessUser
  }): Promise<Receipt> {
    return this.applyConfig(options)
  }

  /**
   * `setPluginSetting`, with `controlId`: the id of an offered input, so a replay
   * is a duplicate.
   */
  protected override async applyConfig({
    key,
    value,
    controlId: inputId = createInputId(),
    user,
  }: {
    key: string
    value: unknown
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt> {
    const admission = await this.accept(
      inputId,
      { op: 'config', key, value },
      user,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const entry = this.sessionPlugins?.config.get(key)
    if (!entry) return this.reject(inputId, 'unknown_config')
    let checked: unknown
    try {
      checked = checkConfigValue(key, entry.option, value)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return this.reject(inputId, reason)
    }
    this.configValues.set(key, checked)
    // In the append of the applied record: a crash keeps both or neither.
    await this.applied(inputId, 'session', [
      {
        type: 'harness.config',
        key,
        value: checked,
        inputId,
        ...storedUser(user ?? this.user),
      },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.configChanged, { key, value: checked }),
    )
    return { inputId, status: 'accepted' }
  }

  /** The stored settings of this thread. See `updateThreadSettings`. */
  threadSettings(): ThreadSettings {
    return structuredClone(this.currentSettings)
  }

  /**
   * Change the stored settings of this thread: the model by name (from
   * `defineHarness({ models })`), `reasoning`, `instructions`, `tools`,
   * `plugins`, and the working folder `cwd`. A field set to `null` is
   * cleared, and a missing field stays. They apply from the next turn, and
   * the turn's `overrides` win over them. The log keeps them.
   *
   * It is an input, so the log keeps who changed what (`user`). An
   * unknown field, model, or plugin, or a bad value, is rejected.
   *
   * @example
   * ```ts
   * await session.updateThreadSettings({
   *   settings: { model: 'strong', instructions: 'Answer in French.' },
   * })
   * ```
   */
  async updateThreadSettings(
    options: ConfigureOptions & { user?: HarnessUser },
  ): Promise<Receipt> {
    const { settings } = options
    const inputId = options.inputId ?? createInputId()
    const user = options.user ?? this.user
    const admission = await this.accept(
      inputId,
      { op: 'configure', settings },
      user,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    // The store took the input, so this host owns the log, and its fold has
    // the settings that other hosts wrote. The change merges into them.
    const current = this.settingsFromLog()
    let next: ThreadSettings
    try {
      next = changeSettings(current, settings, this.settingNames())
      this.checkRemovable(next)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.reject(inputId, reason)
      return this.keep({ inputId, status: 'rejected', reason })
    }
    const movedFrom = current.cwd
    this.currentSettings = next
    // Tell the model about a new folder, so it stops using the old paths.
    // A new thread gets no note: some providers refuse a conversation that
    // starts with an assistant message.
    const isNew = (await this.messages.loadThread(this.threadId)).length === 0
    if (next.cwd !== movedFrom && !isNew) {
      await this.addNote(
        next.cwd === undefined
          ? 'The working folder is the default folder again.'
          : `The working folder is now ${next.cwd}. Paths are relative to it.`,
      )
    }
    // The checked settings go in the append of the applied record: a crash
    // keeps both or neither.
    await this.applied(inputId, 'session', [
      {
        type: 'harness.settings',
        settings: next,
        inputId,
        ...storedUser(user),
      },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.settingsChanged, { settings: next }),
    )
    return this.keep({ inputId, status: 'accepted' })
  }

  /**
   * Throws when the plugins that `settings` removes provide a capability
   * that a kept plugin (of any lifetime) or a harness middleware requires.
   */
  protected checkRemovable(settings: ThreadSettings) {
    const removed = new Set(settings.plugins?.remove ?? [])
    if (removed.size === 0) return
    const owners = new Map(
      this.plugins.flatMap((plugin) =>
        (plugin.provides ?? []).map((handle) => [handle, plugin.name] as const),
      ),
    )
    const needs = [
      ...this.plugins
        .filter((plugin) => !removed.has(plugin.name))
        .map((plugin) => ({
          who: `plugin ${plugin.name}`,
          requires: plugin.requires,
        })),
      ...(this.harness.middleware ?? []).map((middleware) => ({
        who: middleware.name
          ? `harness middleware ${middleware.name}`
          : 'a harness middleware',
        requires: middleware.requires,
      })),
    ]
    for (const { who, requires } of needs) {
      for (const handle of requires ?? []) {
        const owner = owners.get(handle)
        if (owner === undefined || !removed.has(owner)) continue
        throw new Error(
          `Cannot remove plugin ${owner}: ${who} requires its capability "${handle.capabilityName}".`,
        )
      }
    }
  }

  /** The model and plugin names that a setting can use. */
  protected settingNames(): SettingNames {
    return {
      models: new Set(Object.keys(this.harness.models ?? {})),
      plugins: new Set(this.plugins.map((plugin) => plugin.name)),
    }
  }

  /** The commands of this session, for hosts to list. */
  commands(): Array<{
    name: string
    description: string
    owner: string
    input?: unknown
  }> {
    return [...(this.threadPlugins()?.commands ?? [])].map(([name, entry]) => ({
      name,
      description: entry.command.description,
      owner: entry.owner,
      ...(entry.command.input
        ? { input: convertSchemaToJsonSchema(entry.command.input) }
        : {}),
    }))
  }

  /**
   * The session index entry of this thread, with `metadata` typed by the
   * harness `metadataSchema`. `undefined` without `stores.sessions`, or for
   * a thread with no entry.
   */
  async indexEntry(): Promise<
    SessionIndexEntry<SessionMetadataOf<THarness>> | undefined
  > {
    // The schema checked the metadata on each write.
    return (await this.index.get(this.indexKey)) as
      | SessionIndexEntry<SessionMetadataOf<THarness>>
      | undefined
  }

  /**
   * Change the session index entry of this thread, as
   * `host.sessions.update` does: `title`, `pinned`, and `metadata`, or a
   * function of the current entry. The harness `metadataSchema` checks
   * `metadata`. Resolves to the changed entry, or `undefined` when there is
   * no entry.
   */
  async updateIndexEntry(
    update: SessionEntryUpdate<SessionMetadataOf<THarness>>,
  ): Promise<SessionIndexEntry<SessionMetadataOf<THarness>> | undefined> {
    return (await this.index.update(this.indexKey, (entry) =>
      changedEntry(
        entry,
        update as SessionEntryUpdate<any, SessionEntryChange<any>>,
        this.harness.metadataSchema,
      ),
    )) as SessionIndexEntry<SessionMetadataOf<THarness>> | undefined
  }

  /**
   * The saved messages of this thread, oldest first. While a revert stands,
   * the messages after its message are hidden.
   */
  async transcript() {
    return visibleMessages(
      await this.messages.loadThread(this.threadId),
      this.reverted,
    )
  }

  /**
   * The saved messages of a child agent run of this thread, by its
   * `subagentRunId` or by its `runId`, oldest first.
   *
   * - An agent that the model calls as a tool: it starts with the task of
   *   the agent call. Each message has the child's card (its name and how
   *   it ended) in `metadata.tanstack.subagent`. A child with no messages
   *   has one assistant message with no content that holds only its card. A
   *   nested child is a child of this thread too.
   * - An agent run that code or a background call starts: the transcript of
   *   its chain, which its follow-up runs share. It starts with the messages
   *   that the first run started from.
   *
   * Empty for an unknown id, and for a child of another thread.
   */
  async agentTranscript(
    run: { subagentRunId: string } | { runId: string },
  ): Promise<Array<ModelMessage>> {
    if ('subagentRunId' in run) {
      const child = await loadChildTranscript(
        this.engine,
        run.subagentRunId,
        this.threadId,
      )
      if (child) return child
    }
    const thread = agentRunThread(this.writer.state.thread, this.threadId, run)
    return thread === undefined ? [] : this.engine.loadThread(thread)
  }

  /**
   * The `durability.logState` fold of the harness for the log of this session:
   * every host record of the root thread and of its child threads, in log
   * order. `undefined` for a harness without `durability.logState`. A session of another
   * machine folds the same log, so it gets the same state.
   *
   * @example
   * ```ts
   * const state = await session.logState()
   * ```
   */
  async logState(): Promise<HarnessLogStateOf<THarness> | undefined> {
    // The reduce of `harness` folded the state, so it has that type. A log
    // cannot carry a state type.
    return this.writer.reducedBy(this.harness.durability?.logState) as
      | HarnessLogStateOf<THarness>
      | undefined
  }

  /** The index of the revert message in `messages`, or -1. */
  protected revertedAt(messages: ReadonlyArray<ModelMessage>) {
    const id = this.reverted?.messageId
    return id === undefined
      ? -1
      : messages.findIndex((message) => message.id === id)
  }

  /**
   * Go back to the message `messageId`. The transcript hides the messages
   * after it. With the snapshots plugin, the files that their tool calls
   * changed go back too. `unrevert()` undoes it. The next turn drops the
   * hidden messages for good. The revert state is saved, so it survives a
   * restart. Refused while the session is not idle, or another host runs
   * the thread (`'busy'`), and for a message that is not in the transcript
   * (`'unknown_message'`). `user` is who reverts. Default: the
   * user that opened the session. The `harness.revert` record keeps
   * it. A handle of `host.open` checks that it is the user of the
   * handle.
   *
   * @example
   * ```ts
   * await session.revert({ messageId: message.id })
   * ```
   */
  async revert({
    messageId,
    user,
  }: {
    messageId: string
    user?: HarnessUser
  }): Promise<Receipt> {
    const inputId = createInputId()
    if (!(await this.ownsIdleThread())) {
      return { inputId, status: 'rejected', reason: 'busy' }
    }
    return this.holding(async () => {
      const messages = await this.messages.loadThread(this.threadId)
      const at = messages.findIndex((message) => message.id === messageId)
      if (at < 0)
        return { inputId, status: 'rejected', reason: 'unknown_message' }
      // A revert that stands ends first, so its files come back.
      await this.endRevert()
      const handler = this.sessionPlugins?.values.get(RevertFiles)
      const files = await handler?.revert(
        messages.slice(at + 1),
        async (type) => this.keptRecords(type),
        this.revertRun(user ?? this.user),
      )
      await this.saveRevert(
        { messageId, ...(files !== undefined ? { files } : {}) },
        user ?? this.user,
      )
      return { inputId, status: 'accepted' }
    })
  }

  /** End the revert that stands: its files and messages come back. */
  async unrevert(): Promise<Receipt> {
    const inputId = createInputId()
    if (!(await this.ownsIdleThread())) {
      return { inputId, status: 'rejected', reason: 'busy' }
    }
    return this.holding(async () => {
      if (!this.reverted) return { inputId, status: 'accepted' }
      await this.endRevert()
      // The notes that came during the revert go after the messages again.
      await this.flushNotes()
      return { inputId, status: 'accepted' }
    })
  }

  /** Bring back the files of the revert that stands, and end it. */
  protected async endRevert() {
    const reverted = this.reverted
    if (!reverted) return
    if (reverted.files !== undefined) {
      await this.sessionPlugins?.values
        .get(RevertFiles)
        ?.unrevert(reverted.files, this.revertRun(this.user))
    }
    await this.saveRevert(undefined)
  }

  /**
   * A run for the files of a revert, in the thread of this session. It is
   * part of no turn, so a workspace that no turn opened on this host (after
   * a restart) opens again from the log.
   */
  protected revertRun(user: HarnessUser | undefined) {
    return this.runContext({
      user,
      runId: `revert:${this.threadId}`,
      signal: this.lifetime.signal,
    })
  }

  /** Run `fn` while no new turn starts. A held turn starts after it. */
  protected async holding(fn: () => Promise<Receipt>) {
    this.holdTurns++
    try {
      return await fn()
    } finally {
      this.holdTurns--
      this.drain()
      // `fn` can end with no write. An idle thread gives the log back.
      void this.writer.rest()
    }
  }

  /**
   * The thread is idle, and this host owns its log. A revert changes files
   * here, so it must not run while another host runs the thread.
   */
  protected async ownsIdleThread() {
    if (this.snapshot().status !== 'idle') return false
    return await this.writer.own()
  }

  /** Drop the messages that a standing revert hides, and end the revert. */
  protected async commitRevert() {
    if (!this.reverted) return
    const messages = await this.messages.loadThread(this.threadId)
    const at = this.revertedAt(messages)
    if (at >= 0) {
      await this.messages.saveThread(this.threadId, messages.slice(0, at + 1))
    }
    await this.saveRevert(undefined)
  }

  /** Keep the revert state in the log, with who reverted. */
  protected async saveRevert(
    revert: RevertState | undefined,
    user?: HarnessUser,
  ) {
    this.reverted = revert
    await this.writer.append([
      {
        type: 'harness.revert',
        revert: revert ?? null,
        ...storedUser(user),
      },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.revert, {
        messageId: revert?.messageId ?? null,
      }),
    )
  }

  /**
   * The kept host records of `type` of this thread, oldest first: the last
   * ones that the `keepRecords` of the plugins name. The log snapshot keeps
   * them, so they stay after a truncate of the log.
   */
  protected keptRecords(type: string): Array<LogRecord> {
    return this.writer.state.keptRecords.flatMap(({ record }) =>
      record.type === type ? [record] : [],
    )
  }

  /** The commands, settings, and tools of this session, for a UI. */
  describe() {
    return {
      commands: this.commands(),
      config: Object.entries(this.pluginSettings()).map(([key, entry]) => ({
        key,
        ...entry,
      })),
      tools: this.inspect().tools,
      settings: this.threadSettings(),
      models: Object.keys(this.harness.models ?? {}),
    } satisfies SessionDescription
  }

  /**
   * Answer an open wait: a question from `ctx.session.ask`, or a `human`
   * wait, by its id. `user` is who answers. Default: the user that
   * opened the session. The log keeps it.
   */
  answer(options: {
    questionId: string
    value: unknown
    user?: HarnessUser
  }): Promise<Receipt> {
    return this.applyAnswer(options)
  }

  /**
   * `answer`, with `controlId` (the id of an offered input, so a replay is a
   * duplicate) and `ref` (a secret answer that another host saved, see
   * `answerOffer`).
   */
  protected override async applyAnswer({
    questionId,
    value,
    controlId: inputId = createInputId(),
    user,
    ref,
  }: {
    questionId: string
    value: unknown
    user?: HarnessUser
    controlId?: string
    ref?: string
  }): Promise<Receipt> {
    // A secret (a key or a password) stays out of the log. A restart does
    // not replay an answer, so it never needs it. A host that does not know
    // the wait logs no value either: the wait can ask for a secret. When
    // another host owns the log, `answerOffer` decides what goes to it.
    const asked = this.questions.get(questionId)
    const logged = this.loggedWait(questionId)
    const isSecret = asked?.secret ?? (!logged || logged.secret === true)
    const isHidden = ref !== undefined || isSecret
    if (asked?.secret) this.redactor.add(value)
    const sender = user ?? this.user
    let admission
    try {
      admission = await this.accept(
        inputId,
        { op: 'answer', questionId, value: isHidden ? SECRET_ANSWER : value },
        user,
        isHidden && ref === undefined
          ? {
              offer: () =>
                this.answerOffer({ questionId, value, inputId, sender }),
            }
          : {},
      )
    } catch (error) {
      if (!(error instanceof AnswerRefused)) throw error
      return this.reject(inputId, error.reason)
    }
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    let answered = value
    if (ref !== undefined) {
      // The value leaves the store first, so a ref works only once.
      const secret = await this.takeSecretAnswer({ ref, questionId, sender })
      if (secret === undefined) {
        return this.reject(inputId, 'unknown_secret_answer')
      }
      answered = secret.value
    }
    const question = this.questions.get(questionId)
    if (!question) return this.answerLoggedWait(inputId, questionId, answered)
    let checked: unknown = answered
    if (question.schema !== undefined) {
      const result = await validateWithStandardSchema(question.schema, answered)
      if (!result.success) {
        const reason = `Invalid answer: ${result.issues.map((issue) => issue.message).join(', ')}`
        return this.reject(inputId, reason)
      }
      checked = result.data
    }
    // A cancel or another answer can take the question while the check runs.
    if (this.questions.get(questionId) !== question) {
      return this.reject(inputId, 'unknown_question')
    }
    this.questions.delete(questionId)
    try {
      // In the append of the applied record: a crash keeps both or neither.
      await this.applied(
        inputId,
        'session',
        this.waitEndRecords(questionId, 'answered'),
      )
    } catch (error) {
      // The answer was not stored. The question waits again, unless the
      // session closes: then nobody can answer it.
      if (this.closing) {
        question.release()
        question.reject(new Error('Session closed.'))
      } else this.questions.set(questionId, question)
      throw error
    }
    question.release()
    this.feed.publish(
      question.operationId,
      customEvent(HARNESS_EVENTS.questionAnswered, { questionId }),
    )
    question.resolve(checked)
    await this.afterWaitEnd(questionId)
    // The question no longer holds the thread. The resolved work, if any,
    // marks it busy again first.
    queueMicrotask(() => this.checkIdle())
    return { inputId, status: 'accepted' }
  }

  /**
   * Answer a wait that no promise of this host holds: the log keeps the
   * answer, for the run that waits. A live wait of another host, and a wait
   * that ended, are refused.
   */
  private async answerLoggedWait(
    inputId: string,
    waitId: string,
    value: unknown,
  ): Promise<Receipt> {
    const logged = this.loggedWait(waitId)
    const isOpen =
      logged !== undefined &&
      logged.outcome === undefined &&
      logged.live === undefined
    // Claimed before the first await: a second answer is refused.
    if (!isOpen || this.answering.has(waitId)) {
      return this.reject(inputId, 'unknown_question')
    }
    const handBack = this.humanHandoffEnd(logged.wait, value)
    if (handBack && 'reason' in handBack) {
      return this.reject(inputId, handBack.reason)
    }
    // The log has the JSON Schema of the wait: the answer must fit it.
    const { schema } = logged.wait
    const checked =
      isRecord(schema) || typeof schema === 'boolean'
        ? validateJsonSchema(schema, value)
        : undefined
    if (checked?.issues) {
      const reason = checked.issues.map((issue) => issue.message).join(', ')
      return this.reject(inputId, `Invalid answer: ${reason}`)
    }
    this.answering.add(waitId)
    try {
      // A secret never goes in the log. The run reads it from the store.
      if (logged.secret) await this.keepSecretAnswer(logged, value)
      // The end of a handoff to a person goes in the same append.
      await this.applied(inputId, 'session', [
        ...this.waitEndRecords(
          waitId,
          'answered',
          logged.secret ? undefined : value,
        ),
        ...(handBack
          ? [{ type: 'harness.handoff' as const, ...handBack.record }]
          : []),
      ])
    } finally {
      this.answering.delete(waitId)
    }
    if (handBack) {
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.handoff, { ...handBack.record }),
      )
    }
    // A client that streams the run that waits sees the answer.
    this.feed.publish(
      logged.wait.runId,
      customEvent(HARNESS_EVENTS.questionAnswered, { questionId: waitId }),
    )
    await this.afterWaitEnd(waitId)
    queueMicrotask(() => this.checkIdle())
    return { inputId, status: 'accepted' }
  }

  /**
   * The handoff that ends a handoff to a person, when `wait` is its wait.
   * `{ resume: true }` gives the thread back to the agent that answered
   * before. `{ handBack: name }` gives it to that root agent, or to the main
   * model with `'main'`. Another answer is refused with its reason.
   */
  private humanHandoffEnd(
    wait: Wait,
    value: unknown,
  ): { record: HandoffRecord } | { reason: string } | undefined {
    const active = this.writer.state.thread.activeAgent
    if (!isHumanTarget(active) || active.waitId !== wait.waitId) {
      return undefined
    }
    const answer = isRecord(value) ? value : {}
    const { handBack } = answer
    let to: string | null
    if (typeof handBack === 'string') {
      // The agents that the turn which handed off offered (with those of
      // its turn plugins), and the ones this session has now.
      const names = [
        ...(active.agents ?? []),
        ...[
          ...(this.harness.agents ?? []),
          ...(this.threadPlugins()?.agents ?? []),
        ].map((agent) => agent.name),
      ]
      if (handBack !== 'main' && !names.includes(handBack)) {
        return { reason: 'unknown_agent' }
      }
      to = handBack === 'main' ? null : handBack
    } else if (answer.resume === true && handBack === undefined) {
      to = active.from
    } else {
      return { reason: 'invalid_answer' }
    }
    return {
      record: { from: { human: true }, to, runId: wait.runId, by: 'operator' },
    }
  }

  /**
   * Keep the secret answer to the wait `logged` until its run ends, so a run
   * again (also on another host) can read it: in memory, and in the
   * credential store of the app when it has one, as a credential reference
   * of the user of the run. The session scrubs it from now on.
   */
  private async keepSecretAnswer(logged: WaitState, value: unknown) {
    const { waitId, user } = logged.wait
    this.redactor.add(value)
    this.keptAnswers.set(waitId, value)
    await this.sharedCredentials?.set({
      scope: scopeOf(this.threadId, user),
      id: keptAnswerId(waitId),
      credential: secretAnswerCredential(value),
    })
  }

  /**
   * The secret answer to the wait `logged` that `keepSecretAnswer` kept.
   * `undefined`: no host kept it here, and the store does not have it.
   */
  protected async keptAnswer(
    logged: WaitState,
  ): Promise<{ value: unknown } | undefined> {
    const { waitId, user } = logged.wait
    if (this.keptAnswers.has(waitId)) {
      return { value: this.keptAnswers.get(waitId) }
    }
    const saved = await this.sharedCredentials?.get({
      scope: scopeOf(this.threadId, user),
      id: keptAnswerId(waitId),
    })
    const answer = answerIn(saved)
    if (!answer) return undefined
    this.redactor.add(answer.value)
    this.keptAnswers.set(waitId, answer.value)
    return answer
  }

  /**
   * Delete the kept secret answers of the waits whose id starts with
   * `prefix`: their run ended, so no run again reads them.
   */
  protected async dropKeptAnswers(prefix: string) {
    const ended = [...this.writer.state.thread.waits.values()].filter(
      ({ wait, secret }) => secret && wait.waitId.startsWith(prefix),
    )
    for (const { wait } of ended) {
      this.keptAnswers.delete(wait.waitId)
      await this.sharedCredentials?.delete({
        scope: scopeOf(this.threadId, wait.user),
        id: keptAnswerId(wait.waitId),
      })
    }
  }

  /**
   * What goes to the owner of the log for an answer that this host logs
   * hidden. A plain answer goes as it is. A secret goes to the credential
   * store of the app, and the owner gets only its id, so the input lane
   * never keeps the secret. Without that store, the answer is refused. An
   * answer to a wait that ended is refused, so it leaves no secret behind.
   */
  private async answerOffer({
    questionId,
    value,
    inputId,
    sender,
  }: {
    questionId: string
    value: unknown
    inputId: string
    sender: HarnessUser | undefined
  }): Promise<OfferedHarnessInput> {
    // The wait of another host: read what that host wrote first.
    if (!this.questions.has(questionId)) await this.writer.catchUp()
    const logged = this.loggedWait(questionId)
    if (logged?.outcome !== undefined) {
      throw new AnswerRefused('unknown_question')
    }
    // A wait that the log does not have (not read yet) counts as a secret,
    // so its answer never goes in clear text.
    const isSecret =
      this.questions.get(questionId)?.secret ??
      (!logged || logged.secret === true)
    if (!isSecret) return { op: 'answer', questionId, value }
    const store = this.sharedCredentials
    if (!store) throw new AnswerRefused('secret_answer_needs_credentials')
    // The input id makes the ref unique. A retry with the same input id
    // offers the same record again, so it is a duplicate. A ref that the
    // owner never reads goes when the wait ends (see `dropAnswerRefs`).
    const ref = `${SECRET_ANSWER_PREFIX}${questionId}:${inputId}`
    await store.set({
      scope: scopeOf(this.threadId, sender),
      id: ref,
      credential: secretAnswerCredential(value),
    })
    return { op: 'answer', questionId, value: SECRET_ANSWER, ref }
  }

  /**
   * The secret answer `ref` to `questionId`, saved for `sender`. It is
   * deleted from the store, and the session scrubs it from now on.
   * `undefined`: the store does not have it (it was used, or it belongs to
   * another user).
   */
  private async takeSecretAnswer({
    ref,
    questionId,
    sender,
  }: {
    ref: string
    questionId: string
    sender: HarnessUser | undefined
  }): Promise<{ value: unknown } | undefined> {
    const store = this.sharedCredentials
    if (!store || !ref.startsWith(`${SECRET_ANSWER_PREFIX}${questionId}:`)) {
      return undefined
    }
    const key = { scope: scopeOf(this.threadId, sender), id: ref }
    const saved = await store.get(key)
    if (saved?.type !== 'secret_answer') return undefined
    await store.delete(key)
    const answer = answerIn(saved)
    if (answer) this.redactor.add(answer.value)
    return answer
  }

  // ===========================
  // Waits
  // ===========================

  /**
   * The records that end the wait `waitId`: its end, and the done record of
   * its expiry wake when that did not run yet.
   */
  protected waitEndRecords(
    waitId: string,
    outcome: WaitOutcome,
    value?: unknown,
  ): Array<ThreadRecord> {
    const wake = expiryWakeId(waitId)
    return [
      {
        type: 'harness.wait.settled',
        waitId,
        outcome,
        at: Date.now(),
        ...(value !== undefined ? { value } : {}),
      },
      ...(this.writer.state.thread.schedules.has(wake)
        ? [{ type: 'harness.schedule.done' as const, scheduleId: wake }]
        : []),
    ]
  }

  /**
   * Publish `harness.wait.settled` after the append that ended the wait
   * `waitId`. An interrupt id has no wait in the log, so it gets no event.
   */
  protected publishWaitSettled(waitId: string) {
    const ended = this.writer.state.thread.waits.get(waitId)
    if (!ended || ended.outcome === undefined) return
    this.feed.publish(
      ended.wait.runId,
      customEvent(HARNESS_EVENTS.waitSettled, {
        waitId,
        outcome: ended.outcome,
      }),
    )
  }

  /**
   * The `harness.wait` span of the wait `waitId` that ended. A wait opens
   * and ends on different hosts, so the span is written now, from the time
   * in its log record.
   */
  private traceWait(waitId: string) {
    const ended = this.tracing && this.writer.state.thread.waits.get(waitId)
    if (!ended || ended.outcome === undefined) return
    const span = this.tracing?.span(
      'harness.wait',
      {
        'harness.run_id': ended.wait.runId,
        'harness.wait.id': waitId,
        'harness.wait.kind': ended.wait.kind,
        'harness.wait.outcome': ended.outcome,
      },
      { runId: ended.wait.runId, startTime: ended.at },
    )
    this.tracing?.safely(() => span?.end(ended.settledAt))
  }

  /** After the log ended the wait `waitId`: drop its secrets, and move the timer. */
  protected async afterWaitEnd(waitId: string) {
    this.traceWait(waitId)
    this.publishWaitSettled(waitId)
    // A `step.ask` of this host that waits for it goes on.
    this.waitEnds.get(waitId)?.()
    this.armSchedules()
    await this.dropAnswerRefs(waitId).catch((error: unknown) =>
      this.warnSession('harness:waits', error),
    )
    // An agent run whose last wait ended goes on.
    await this.resumeWaitingRuns().catch((error: unknown) =>
      this.warnSession('harness:agents', error),
    )
  }

  /**
   * Open waits in the log. With `expiresAt`, a wake at that time goes in
   * the same append: a worker opens the session then, and the wait expires,
   * also when no host has the thread open.
   */
  protected async writeWait(...records: Array<WaitRecord>) {
    // A wait that the log has already (a run again) gets no second event.
    const fresh = records.filter(
      ({ wait }) => !this.writer.state.thread.waits.has(wait.waitId),
    )
    // One append: a run that waits for several opens all or none.
    await this.writer.append(
      records.flatMap((record): Array<ThreadRecord> => {
        const { waitId, expiresAt } = record.wait
        return [
          { type: 'harness.wait', ...record },
          ...(expiresAt !== undefined
            ? [
                {
                  type: 'harness.schedule' as const,
                  scheduleId: expiryWakeId(waitId),
                  at: expiresAt,
                },
              ]
            : []),
        ]
      }),
    )
    for (const { wait } of fresh) this.publishWaitOpened(wait)
    if (records.some((record) => record.wait.expiresAt !== undefined)) {
      this.armSchedules()
    }
  }

  /** Publish `harness.wait.opened`, after the append of the wait. */
  private publishWaitOpened(wait: Wait) {
    const { waitId, kind, runId, message, expiresAt } = wait
    this.feed.publish(
      runId,
      customEvent(HARNESS_EVENTS.waitOpened, {
        waitId,
        kind,
        runId,
        ...(message !== undefined ? { message } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      }),
    )
  }

  /**
   * @internal Open a wait that no promise holds, for the run `runId`. The
   * session stays idle: the log keeps the wait, and `answer` from any host
   * ends it with the answer in the log. A `human` wait takes the answer of
   * a user with the `operator` action. `expiresAt` defaults by kind (see
   * `DEFAULT_WAIT_MS`). Resolves with the wait.
   */
  async openWait({
    kind,
    runId,
    user,
    schema,
    message,
    expiresAt,
  }: Omit<Wait, 'waitId'>): Promise<Wait> {
    const expiry = expiryOf(kind, expiresAt)
    const wait: Wait = {
      waitId: createWaitId(),
      kind,
      runId,
      ...(user ? { user } : {}),
      ...(schema !== undefined ? { schema } : {}),
      ...(expiry !== undefined ? { expiresAt: expiry } : {}),
      ...(message !== undefined ? { message } : {}),
    }
    await this.writeWait({ wait, at: Date.now() })
    return wait
  }

  /**
   * @internal Append a handoff record. A handoff to a person opens its
   * `human` wait in the same append: the wait of the run of the record, with
   * the note as its message. `user` started the run, so that user (or
   * the owner, or an operator) may answer. Resolves with the record as the
   * log keeps it.
   */
  protected async appendHandoff(
    record: HandoffRecord,
    user: RecordUser | undefined,
  ): Promise<HandoffRecord> {
    if (!isHumanTarget(record.to)) {
      await this.writer.append([{ type: 'harness.handoff', ...record }])
      return record
    }
    const wait: Wait = {
      waitId: createWaitId(),
      kind: 'human',
      runId: record.runId,
      ...(user ? { user } : {}),
      ...(record.note !== undefined ? { message: record.note } : {}),
    }
    const kept = { ...record, waitId: wait.waitId }
    await this.writer.append([
      { type: 'harness.wait', wait, at: Date.now() },
      { type: 'harness.handoff', ...kept },
    ])
    this.publishWaitOpened(wait)
    return kept
  }

  /**
   * Resolves with the first open wait of the session, or of the run
   * `runId`: one that is open now, else the next one that opens. Rejects
   * with the reason of `signal` when it aborts first, and with an error
   * when the session closes.
   *
   * @example
   * ```ts
   * const turn = session.send('Delete the old logs.')
   * const wait = await session.waitForRun({ runId: turn.id })
   * if (isApproval(wait)) console.log('Approve or reject:', wait.message)
   * ```
   */
  waitForRun({
    runId,
    signal,
  }: { runId?: string; signal?: AbortSignal } = {}): Promise<Wait> {
    const find = () =>
      this.snapshot().pendingWaits.find(
        (wait) => runId === undefined || wait.runId === runId,
      )
    return new Promise<Wait>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      const now = find()
      if (now) return resolve(now)
      const closed = this.lifetime.signal
      const stop = () => {
        stopEvents()
        stopIdle()
        signal?.removeEventListener('abort', onAbort)
        closed.removeEventListener('abort', onClose)
      }
      const onAbort = () => {
        stop()
        reject(signal?.reason)
      }
      const onClose = () => {
        stop()
        reject(new Error('Session closed.'))
      }
      // A wait opens with an event (a question, the end of a turn that
      // stopped), or before the thread goes idle.
      const check = () => {
        const found = find()
        if (!found) return
        stop()
        resolve(found)
      }
      const stopEvents = this.onEvent(check)
      const stopIdle = this.onIdle(check)
      signal?.addEventListener('abort', onAbort, { once: true })
      closed.addEventListener('abort', onClose, { once: true })
    })
  }

  /**
   * End the live question `questionId` with no answer: the log gets the
   * end, and its `ask` rejects with `error`.
   */
  protected async endQuestion(
    questionId: string,
    outcome: 'cancelled' | 'expired',
    error: unknown,
  ) {
    const question = this.questions.get(questionId)
    if (!question) return
    this.questions.delete(questionId)
    question.release()
    question.reject(error)
    try {
      // Not in the log yet: the open of the wait is still on its way.
      if (this.loggedWait(questionId)) {
        await this.writer.append(this.waitEndRecords(questionId, outcome))
        await this.afterWaitEnd(questionId)
      }
    } catch (failure) {
      // A closed log takes no end. The next owner ends the wait, as a live
      // wait of a host that stopped.
      if (!this.closing) this.warnSession('harness:waits', failure)
    }
    queueMicrotask(() => this.checkIdle())
  }

  /**
   * End the open waits that expired, and the live waits that no promise of
   * this host holds: their host stopped, so no answer can reach them. Only
   * the owner of the log ends them.
   */
  protected async endStaleWaits(): Promise<void> {
    const now = Date.now()
    const isExpired = ({ wait }: WaitState) =>
      wait.expiresAt !== undefined && wait.expiresAt <= now
    const isHeld = (waitId: string) =>
      this.questions.has(waitId) || this.signIns.has(waitId)
    const stale = openWaits(this.writer.state.thread.waits).filter(
      (state) =>
        isExpired(state) ||
        (state.live !== undefined && !isHeld(state.wait.waitId)),
    )
    if (stale.length === 0) return
    if (!(await this.writer.own())) return
    for (const state of stale) {
      const { waitId } = state.wait
      const outcome = isExpired(state) ? 'expired' : 'cancelled'
      if (this.questions.has(waitId)) {
        await this.endQuestion(
          waitId,
          outcome,
          new Error('The question expired with no answer.'),
        )
        continue
      }
      const signIn = this.signIns.get(waitId)
      if (signIn) {
        // The login stops with its command.
        await this.endSignIn(waitId, outcome)
        signIn.operation.abortController.abort(
          new Error(`The sign-in to ${signIn.connector} expired.`),
        )
        continue
      }
      // An answer ended it since the read above.
      if (this.loggedWait(waitId)?.outcome !== undefined) continue
      await this.writer.append(this.waitEndRecords(waitId, outcome))
      await this.afterWaitEnd(waitId)
    }
  }

  /**
   * End the waits of each `harnessAgent` child thread of this session that
   * no child of this host runs: the host that ran it stopped. No host runs
   * such a child again, so no answer can reach its waits. Its stopped turn
   * and its open waits end `cancelled`, in its own thread. Only the owner of
   * the log ends them.
   */
  protected async endOrphanChildWaits(): Promise<void> {
    const prefix = `${this.threadId}/agent/`
    const live = [...this.harnessChildren.keys()]
    const at = Date.now()
    const records = this.writer.threads().flatMap((thread) => {
      // A child of a live child is live too.
      const isLive = live.some(
        (child) => thread === child || thread.startsWith(`${child}/`),
      )
      if (!thread.startsWith(prefix) || isLive) return []
      const fold = this.writer.stateOf(thread).thread
      const waitIds = [
        ...(fold.interrupted?.interrupts ?? []).map(({ id }) => id),
        ...openWaits(fold.waits).map(({ wait }) => wait.waitId),
      ]
      const ended: Array<LogRecord> = [
        ...(fold.interrupted
          ? [{ type: 'harness.interrupted', turn: null, thread }]
          : []),
        ...openWaits(fold.waits).map(({ wait }) => ({
          type: 'harness.wait.settled',
          waitId: wait.waitId,
          outcome: 'cancelled',
          at,
          thread,
        })),
        ...waitIds
          .map(expiryWakeId)
          .filter((scheduleId) => fold.schedules.has(scheduleId))
          .map((scheduleId) => ({
            type: 'harness.schedule.done',
            scheduleId,
            thread,
          })),
      ]
      return ended
    })
    if (records.length === 0 || !(await this.writer.own())) return
    await this.writer.append(records)
  }

  /**
   * Open the live `sign-in` wait of an OAuth login that the command
   * `operationId` runs, once for each connector. The log keeps it, so every
   * host shows it, and the command keeps the session on this host. The wait
   * ends with the command: `answered` when it completes, `cancelled` when
   * it fails. At its expiry (default 15 minutes), it ends `expired`, and the
   * command is cancelled.
   */
  protected openSignIn(
    info: {
      connector: string
      url?: string
      userCode?: string
      expiresAt?: number
    },
    operationId: string,
  ) {
    const operation = this.operations.get(operationId)
    if (operation?.kind !== 'command' || operation.isSettled()) return
    const { connector, url, userCode } = info
    const isOpen = [...this.signIns.values()].some(
      (held) => held.operation === operation && held.connector === connector,
    )
    if (isOpen) return
    const expiresAt = expiryOf('sign-in', info.expiresAt)
    const wait: Wait = {
      waitId: createWaitId(),
      kind: 'sign-in',
      runId: operationId,
      ...storedUser(this.userOfRun(operationId)),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      message: userCode
        ? `Sign in to ${connector} with the code ${userCode}.`
        : `Sign in to ${connector}.`,
    }
    const { waitId } = wait
    this.signIns.set(waitId, { connector, operation })
    this.writeWait({
      wait,
      at: Date.now(),
      live: true,
      ...(url ? { url } : {}),
    }).then(
      () =>
        Promise.resolve(operation).then(
          () => this.endSignIn(waitId, 'answered'),
          () => this.endSignIn(waitId, 'cancelled'),
        ),
      (error: unknown) => {
        this.signIns.delete(waitId)
        this.warnSession('harness:waits', error)
      },
    )
  }

  /** End the live sign-in wait `waitId` of this host, once. */
  protected async endSignIn(waitId: string, outcome: WaitOutcome) {
    if (!this.signIns.delete(waitId)) return
    try {
      if (this.loggedWait(waitId)?.outcome !== undefined) return
      await this.writer.append(this.waitEndRecords(waitId, outcome))
      await this.afterWaitEnd(waitId)
    } catch (failure) {
      // A closed log takes no end. The next owner ends the wait, as a live
      // wait of a host that stopped.
      if (!this.closing) this.warnSession('harness:waits', failure)
    }
  }

  /**
   * Delete the secret answers to the wait `waitId` that wait in the
   * credential store: answers that another host saved and that the owner
   * did not read. The wait ended, so nobody reads them now. They belong to
   * the user of the run, the owner, the opener, or the sender of an answer
   * that waits in the input lane.
   */
  // ponytail: the secret answer of another member, whose offer never
  // reached the lane (its host stopped between the two writes), stays.
  private async dropAnswerRefs(waitId: string) {
    const store = this.sharedCredentials
    const logged = this.loggedWait(waitId)
    if (!store || logged?.secret === undefined) return
    const prefix = `${SECRET_ANSWER_PREFIX}${waitId}:`
    const offered = (await this.writer.offered()).flatMap(({ record }) =>
      isOfferedInputRecord(record) &&
      record.input.op === 'answer' &&
      record.input.questionId === waitId
        ? [record.user]
        : [],
    )
    const senders = [logged.wait.user, this.owner, this.user]
    const scopes = new Map(
      [...senders, ...offered].map((sender) => {
        const scope = scopeOf(this.threadId, sender)
        return [stableJson(scope), scope] as const
      }),
    )
    for (const scope of scopes.values()) {
      for (const { id } of await store.list(scope)) {
        if (id.startsWith(prefix)) await store.delete({ scope, id })
      }
    }
  }

  /** Read the config values of this thread from the log. */
  protected loadConfig() {
    for (const [key, value] of this.configSnapshot()) {
      this.configValues.set(key, value)
    }
  }

  /**
   * The config values in the log now. A turn keeps them until it ends, so a
   * change while it runs applies at the next turn.
   */
  protected configSnapshot(): Map<string, unknown> {
    const values = new Map<string, unknown>()
    for (const [key, value] of this.writer.state.thread.config) {
      const entry = this.sessionPlugins?.config.get(key)
      if (!entry) continue
      try {
        values.set(key, checkConfigValue(key, entry.option, value))
      } catch {
        // A stored value an option no longer accepts falls back to the default.
      }
    }
    return values
  }

  /** Read the stored settings of this thread from the log. */
  protected loadSettings() {
    this.currentSettings = this.settingsFromLog(this.currentSettings)
  }

  /** The stored settings in the fold of the log, over `base`. */
  protected settingsFromLog(base: ThreadSettings = {}): ThreadSettings {
    const stored = this.writer.state.thread.settings
    const names = this.settingNames()
    let settings = base
    for (const [key, value] of Object.entries(stored)) {
      try {
        const next = changeSettings(settings, { [key]: value }, names)
        this.checkRemovable(next)
        settings = next
      } catch {
        // A value the harness no longer takes (a removed model or plugin)
        // is dropped.
      }
    }
    return settings
  }

  /**
   * Another host wrote to the log, and this log folded its records. Read
   * the settings, the config values, and the interrupted turn from the fold
   * again, so a turn and a change on this host use what that host wrote.
   */
  protected syncFromLog() {
    // While the plugins mount (an open or a reload), the open reads them.
    if (!this.sessionPlugins) return
    this.currentSettings = this.settingsFromLog()
    this.configValues.clear()
    for (const [key, value] of this.configSnapshot()) {
      this.configValues.set(key, value)
    }
    const logged = this.writer.state.thread.interrupted ?? undefined
    if (stableJson(logged ?? null) !== stableJson(this.interrupted ?? null)) {
      this.interrupted = logged
    }
  }

  /** Restore the interrupted turn that the log keeps for this thread. */
  protected async loadInterrupted(): Promise<void> {
    this.interrupted = this.writer.state.thread.interrupted ?? undefined
    await this.refreshInterrupted()
  }

  /** Keep `turn` as the interrupted turn in the log, when it changed. */
  protected async saveInterrupted(turn: InterruptedTurn | undefined) {
    const logged = this.writer.state.thread.interrupted
    if (stableJson(logged) === stableJson(turn ?? null)) return
    // The expiry wakes of the interrupts that ended: no worker must wake.
    const kept = new Set(turn?.interrupts.map((interrupt) => interrupt.id))
    const { schedules } = this.writer.state.thread
    const wakes = (logged?.interrupts ?? []).flatMap((interrupt) => {
      const scheduleId = expiryWakeId(interrupt.id)
      return kept.has(interrupt.id) || !schedules.has(scheduleId)
        ? []
        : [{ type: 'harness.schedule.done' as const, scheduleId }]
    })
    await this.writer.append([
      { type: 'harness.interrupted', turn: turn ?? null },
      ...wakes,
    ])
    if (wakes.length > 0) this.armSchedules()
  }

  /**
   * Keep the snapshot in line with the pending interrupt records in the
   * fold of the log.
   */
  protected async refreshInterrupted(
    observed?: InterruptedTurn,
    persist = true,
  ): Promise<void> {
    const previous = observed ?? this.interrupted
    const pending = await this.interruptStore.listPending(this.threadId)
    const owned = pending.filter((record) => {
      const payload = record.payload
      const metadata = isRecord(payload.metadata) ? payload.metadata : undefined
      return (
        previous?.interrupts.some((item) => item.id === record.interruptId) ||
        typeof payload.toolCallId === 'string' ||
        metadata?.kind === 'approval' ||
        metadata?.kind === 'client_tool' ||
        (metadata !== undefined &&
          INTERRUPT_BINDING_METADATA_KEY in metadata) ||
        typeof payload.id !== 'string' ||
        typeof payload.reason !== 'string' ||
        typeof payload.message !== 'string'
      )
    })
    if (new Set(owned.map((record) => record.runId)).size > 1) {
      throw new Error('Pending interrupts belong to more than one run.')
    }
    const runId = owned.at(-1)?.runId
    const records = owned.filter((record) => record.runId === runId)
    const interrupts: Array<Interrupt> = []
    for (const record of records) {
      const payload = record.payload
      if (
        payload.id !== record.interruptId ||
        record.threadId !== this.threadId ||
        typeof payload.reason !== 'string' ||
        typeof payload.message !== 'string'
      ) {
        throw new Error('The stored interrupt descriptor is invalid.')
      }
      interrupts.push({
        ...payload,
        id: payload.id,
        reason: payload.reason,
        message: payload.message,
      })
    }
    const savedInput = [...this.writer.state.inputs.values()].find(
      (input) => input.operationId === runId,
    )
    const context =
      previous !== undefined && previous.runId === runId
        ? previous.context
        : savedInput && 'context' in savedInput.input
          ? savedInput.input.context
          : undefined
    const next =
      runId && interrupts.length > 0
        ? {
            runId,
            interrupts,
            ...(previous !== undefined &&
            previous.runId === runId &&
            previous.routed
              ? { routed: previous.routed }
              : {}),
            ...(previous !== undefined &&
            previous.runId === runId &&
            previous.handoff
              ? { handoff: previous.handoff }
              : {}),
            ...storedUser(
              previous !== undefined && previous.runId === runId
                ? previous.user
                : savedInput?.user,
            ),
            ...(context !== undefined ? { context } : {}),
          }
        : undefined
    this.interrupted = next
    if (persist) await this.saveInterrupted(next)
  }

  /**
   * Mark the interrupts of `resume` answered in the log, the same way
   * `withPersistence` commits them at a success boundary. Records that are no
   * longer pending are left as they are.
   */
  protected async consumeResume(resume: ReadonlyArray<RunAgentResumeItem>) {
    const store = this.interruptStore
    for (const item of resume) {
      const record = await store.get(item.interruptId)
      if (record?.status !== 'pending' || record.threadId !== this.threadId) {
        continue
      }
      if (item.status === 'resolved') {
        await store.resolve(item.interruptId, item.payload)
      } else {
        await store.cancel(item.interruptId)
      }
    }
  }

  /** Take the interrupts of `resume` out of the interrupted turn, in memory. */
  protected dropInterrupts(resume: ReadonlyArray<RunAgentResumeItem>) {
    if (!this.interrupted) return
    const used = new Set(resume.map((item) => item.interruptId))
    const left = this.interrupted.interrupts.filter(
      (interrupt) => !used.has(interrupt.id),
    )
    this.interrupted =
      left.length > 0 ? { ...this.interrupted, interrupts: left } : undefined
  }

  /** Refresh even when a turn failed before its main try block. */
  protected async refreshTurnInterrupts(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    observed?: InterruptedTurn,
  ): Promise<void> {
    await this.refreshInterrupted(observed).catch((error: unknown) =>
      this.warn(operation, 'harness:interrupts', error),
    )
  }

  /**
   * Make `stopped` the interrupted turn. The log gets it first, so a restart
   * can resolve it too, and a resolve cannot end it before it is written. A
   * failed write is a warning.
   */
  protected async keepInterrupted(
    operation: OperationImpl<ChatTurnResult>,
    stopped: InterruptedTurn,
  ): Promise<void> {
    await this.saveInterrupted(stopped).catch((error: unknown) =>
      this.warn(operation, 'harness:interrupts', error),
    )
    this.interrupted = stopped
    await this.armInterruptExpiry(stopped).catch((error: unknown) =>
      this.warn(operation, 'harness:waits', error),
    )
  }

  /**
   * When the interrupt `interrupt` expires: its `expiresAt`, else the
   * default of its kind (a sign-in: 15 minutes) from when it opened.
   * `undefined`: never.
   */
  protected interruptExpiry(interrupt: Interrupt): number | undefined {
    return interruptExpiry(interrupt, this.logWriter?.state.thread.interrupts)
  }

  /**
   * A wake at the expiry of each interrupt of `stopped` that expires, so a
   * worker ends it on time, also when no host has the thread open.
   */
  protected async armInterruptExpiry(stopped: InterruptedTurn) {
    const { schedules } = this.writer.state.thread
    const wakes = stopped.interrupts.flatMap(
      (interrupt): Array<ThreadRecord> => {
        const at = this.interruptExpiry(interrupt)
        const scheduleId = expiryWakeId(interrupt.id)
        return at === undefined || schedules.has(scheduleId)
          ? []
          : [{ type: 'harness.schedule', scheduleId, at }]
      },
    )
    if (wakes.length === 0) return
    await this.writer.append(wakes)
    this.armSchedules()
  }

  protected ask(question: Question<SchemaInput | undefined>): Promise<unknown> {
    // Only a live wait of a tool call asks in memory. Anywhere else, no
    // process may wait for a user: the error names the way that is durable.
    if (!question.live) return Promise.reject(new Error(ASK_OUTSIDE_WAITS))
    if (this.closing) return Promise.reject(new Error('Session closed.'))
    const { signal } = question
    if (signal?.aborted) return Promise.reject(signal.reason)
    // A live wait of a tool call (an MCP elicitation) belongs to the run of
    // that call, and it ends when that run stops.
    const { run } = question.live
    if (run.signal.aborted) return Promise.reject(run.signal.reason)
    const questionId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    // On the run of the tool call, never on another run, so a client that
    // streams that run sees it, and only a stop of that run rejects it. The
    // session stream has every operation's events.
    const operationId = run.runId
    const pending: PendingQuestion = {
      questionId,
      message: question.message,
      ...(question.schema
        ? { schema: convertSchemaToJsonSchema(question.schema) }
        : {}),
      ...(question.secret ? { secret: true } : {}),
      ...(question.url ? { url: question.url } : {}),
    }
    const { user } = run
    const expiresAt = expiryOf('question', question.expiresAt)
    const wait = waitFromQuestion({
      question: pending,
      runId: operationId,
      ...storedUser(user),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    })
    // The question is a live wait: it keeps the thread busy, so this host
    // keeps the log, and an answer that reaches another host comes here
    // through the input lane. The log keeps it too, so every host shows it.
    return new Promise((resolve, reject) => {
      const onAbort = () =>
        void this.endQuestion(questionId, 'cancelled', signal?.reason)
      const onRunStop = () =>
        void this.endQuestion(questionId, 'cancelled', run.signal.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
      run.signal.addEventListener('abort', onRunStop, { once: true })
      this.questions.set(questionId, {
        message: question.message,
        schema: question.schema,
        secret: question.secret === true,
        url: question.url,
        operationId,
        resolve,
        reject,
        release: () => {
          signal?.removeEventListener('abort', onAbort)
          run.signal.removeEventListener('abort', onRunStop)
        },
      })
      const opened = this.writeWait({
        wait,
        at: Date.now(),
        live: true,
        ...(question.secret ? { secret: true as const } : {}),
        ...(question.url ? { url: question.url } : {}),
      })
      opened.then(
        () => {
          if (this.questions.has(questionId)) {
            this.feed.publish(
              operationId,
              customEvent(HARNESS_EVENTS.question, { ...pending }),
            )
            return
          }
          // A cancel or the close ended it before the log had it.
          this.writer
            .append(this.waitEndRecords(questionId, 'cancelled'))
            .then(() => this.publishWaitSettled(questionId))
            .catch(() => {})
        },
        (error: unknown) => {
          const asked = this.questions.get(questionId)
          if (!asked) return
          this.questions.delete(questionId)
          asked.release()
          reject(error)
          queueMicrotask(() => this.checkIdle())
        },
      )
    })
  }
}

/**
 * The id of the credential reference that keeps the secret answer to the
 * wait `waitId` until its run ends. Not under the `${waitId}:` prefix of the
 * refs that `dropAnswerRefs` deletes when the wait ends.
 */
const keptAnswerId = (waitId: string) => `${SECRET_ANSWER_PREFIX}${waitId}#kept`

/**
 * How long a secret answer stays good in the credential store. The session
 * deletes it once read, or when its wait or run ends. The expiry is for one
 * that a host which stopped left there.
 */
// ponytail: one expiry for a ref and a kept answer. A run again after it
// finds no answer, and its `step.ask` throws.
const SECRET_ANSWER_TTL_MS = 24 * 60 * 60 * 1000

/** A secret answer as the credential store keeps it, with its expiry. */
const secretAnswerCredential = (value: unknown): Credential => ({
  type: 'secret_answer',
  value: JSON.stringify(value),
  expiresAt: Date.now() + SECRET_ANSWER_TTL_MS,
})

/** The answer in `saved`, when it is a secret answer that did not expire. */
function answerIn(
  saved: Credential | null | undefined,
): { value: unknown } | undefined {
  if (saved?.type !== 'secret_answer' || saved.expiresAt <= Date.now()) {
    return undefined
  }
  try {
    return { value: JSON.parse(saved.value) }
  } catch {
    return undefined
  }
}

/** Why `ctx.session.ask` throws outside a live wait. */
export const ASK_OUTSIDE_WAITS =
  'ctx.session.ask cannot wait here: no process waits for a user. In a command, a durable tool, or an agent run, use step.ask({ name, message }). To let the model ask, add the question tool. To ask before a tool call, give the tool its resources (PermissionResources), and permissions() asks before the call runs.'

/** The id of the wake that ends the wait `waitId` at its `expiresAt`. */
const expiryWakeId = (waitId: string) => `wait:${waitId}`

function createWaitId() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
