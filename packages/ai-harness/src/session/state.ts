import {
  INTERRUPT_BINDING_METADATA_KEY,
  convertSchemaToJsonSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { UNOWNED_EPOCH, loadChildTranscript } from '@tanstack/ai-persistence'
import { checkConfigValue } from '../config'
import { isRecord } from '../utils'
import { jsonSchemaIssues } from '../json-schema'
import { changedEntry } from '../session-entry'
import { stableJson, threadOf, visibleMessages } from '../log'
import { mediaIdOf, mediaOfMessage, mediaPart } from '../media-ref'
import {
  BackgroundJobs,
  CapabilityValues,
  RevertFiles,
  RevertStanding,
  SessionMetadata,
  SessionSignal,
} from '../plugins'
import { HARNESS_EVENTS } from '../types'
import { SECRET_ANSWER_PREFIX } from '../auth'
import {
  expiryOf,
  openWaits,
  snapshotWaits,
  timeOf,
  waitKind,
  waitOfQuestion,
} from '../waits'
import {
  createInputId,
  customEvent,
  isOfferedInputRecord,
  scopeOf,
  storedPrincipal,
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
  SessionIndexEntry,
} from '@tanstack/ai-persistence'
import type { RevertState } from '../log'
import type { ThreadRecord, WaitRecord, WaitState } from '../log-records'
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
  HarnessInput,
  MediaRecord,
  MediaUpload,
  PendingQuestion,
  Principal,
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

  /** The stores that first-party plugins read as capabilities. */
  protected storeCapabilities() {
    const values = new CapabilityValues()
    const { metadata } = this.persistence.stores
    if (metadata) values.provide(SessionMetadata, metadata)
    values.provide(RevertStanding, () => this.reverted !== undefined)
    values.provide(SessionSignal, this.lifetime.signal)
    values.provide(BackgroundJobs, {
      started: (jobId) => this.logJob(jobId, false),
      ended: (jobId) => this.logJob(jobId, true),
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
    const { principal, tenantId, threadId } = this
    const opened = await this.index.update(this.indexKey, (entry) => {
      const current: SessionIndexEntry = entry ?? {
        ...(tenantId !== undefined ? { tenantId } : {}),
        threadId,
        members: [],
        createdAt: now,
        updatedAt: now,
      }
      // A new entry belongs to its opener. Without access, an entry with no
      // owner goes to the next opener with a principal too. With access, it
      // stays without an owner: `authorize` decides who may open it.
      const isClaim =
        principal !== undefined &&
        (entry === undefined ||
          (current.ownerId === undefined && !this.hasAccess))
      return {
        ...current,
        harness: current.harness ?? this.harness.name,
        updatedAt: now,
        ...(isClaim
          ? {
              ownerId: principal.id,
              members: [{ userId: principal.id, role: 'owner' as const }],
            }
          : {}),
      }
    })
    if (opened?.ownerId !== undefined) {
      this.owner = {
        id: opened.ownerId,
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
      writer.epoch !== UNOWNED_EPOCH
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
    return {
      threadId: this.threadId,
      status: this.activeTurn
        ? 'running'
        : stopped
          ? 'requires_action'
          : 'idle',
      activeOperations: active.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        ...(operation.agent ? { agent: operation.agent } : {}),
        startedCursor: operation.startedCursor,
      })),
      // A steer that waits to join the running turn waits too.
      queuedTurns: this.queue.length + this.steerQueue.length,
      waitingInputs: this.inputs(),
      pendingInterrupts,
      ...snapshotWaits({
        stopped,
        // With the expiry of each wait, also the default one of its kind.
        interrupts: pendingInterrupts.map((interrupt) => {
          const expiresAt = this.interruptExpiry(interrupt)
          return expiresAt === undefined || interrupt.expiresAt !== undefined
            ? interrupt
            : { ...interrupt, expiresAt: new Date(expiresAt).toISOString() }
        }),
        waits: this.logWriter?.state.thread.waits,
      }),
      plugins: { ...this.stateDoc },
      usage: this.usage(),
      cursor: this.feed.head(),
    }
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
  getMedia(id: string) {
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
  async mediaUrl(id: string) {
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
    // A media id belongs to one thread, so each file gets a copy here.
    const copies = new Map<string, MediaRecord | null>()
    const copy = async (id: string) => {
      if (!copies.has(id)) {
        const record = await source.getMedia(id)
        copies.set(
          id,
          record &&
            (await this.putMedia({
              body: await source.loadMedia({ id }),
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
    await this.messages.saveThread(this.threadId, forked)
    this.threadSettings = source.settings()
    const records: Array<ThreadRecord> = []
    if (Object.keys(this.threadSettings).length > 0) {
      records.push({ type: 'harness.settings', settings: this.threadSettings })
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

  // ===========================
  // Config, commands, questions
  // ===========================

  /** Every session setting, with its option and current value. */
  config(): Record<
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
        value: this.configValue(key),
      }
    }
    return result
  }

  /**
   * Change a session setting. It applies at the next turn. `principal` is
   * who changes it. Default: the principal that opened the session. The log
   * keeps it.
   */
  async setConfig({
    key,
    value,
    inputId = createInputId(),
    principal,
  }: {
    key: string
    value: unknown
    /** @internal The id of an offered input, so a replay is a duplicate. */
    inputId?: string
    principal?: Principal
  }): Promise<Receipt> {
    const admission = await this.accept(
      inputId,
      { op: 'config', key, value },
      principal,
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
        ...storedPrincipal(principal ?? this.principal),
      },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.configChanged, { key, value: checked }),
    )
    return { inputId, status: 'accepted' }
  }

  /** The stored settings of this thread. See `configure`. */
  settings(): ThreadSettings {
    return structuredClone(this.threadSettings)
  }

  /**
   * Change the stored settings of this thread: the model by name (from
   * `defineHarness({ models })`), `reasoning`, `instructions`, `tools`,
   * `plugins`, and the working folder `cwd`. A field set to `null` is
   * cleared, and a missing field stays. They apply from the next turn, and
   * the turn's `overrides` win over them. The log keeps them.
   *
   * It is an input, so the log keeps who changed what (`principal`). An
   * unknown field, model, or plugin, or a bad value, is rejected.
   *
   * @example
   * ```ts
   * await session.configure({
   *   settings: { model: 'strong', instructions: 'Answer in French.' },
   * })
   * ```
   */
  async configure(
    options: ConfigureOptions & { principal?: Principal },
  ): Promise<Receipt> {
    const { settings } = options
    const inputId = options.inputId ?? createInputId()
    const principal = options.principal ?? this.principal
    const admission = await this.accept(
      inputId,
      { op: 'configure', settings },
      principal,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    let next: ThreadSettings
    try {
      next = changeSettings(this.threadSettings, settings, this.settingNames())
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.reject(inputId, reason)
      return this.keep({ inputId, status: 'rejected', reason })
    }
    const movedFrom = this.threadSettings.cwd
    this.threadSettings = next
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
        ...storedPrincipal(principal),
      },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.settingsChanged, { settings: next }),
    )
    return this.keep({ inputId, status: 'accepted' })
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
    return [...(this.sessionPlugins?.commands ?? [])].map(([name, entry]) => ({
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
  async entry(): Promise<
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
  async updateEntry(
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
   * `subagentRunId`, oldest first. It starts with the task of the agent
   * call. Each message has the child's card (its name and how it ended) in
   * `metadata.tanstack.subagent`. A child with no messages has one assistant
   * message with no content that holds only its card. A nested child is a
   * child of this thread too. Empty for an unknown id, and for a child of
   * another thread.
   */
  async agentTranscript(subagentRunId: string): Promise<Array<ModelMessage>> {
    return (
      (await loadChildTranscript(this.engine, subagentRunId, this.threadId)) ??
      []
    )
  }

  /**
   * The `durability.reduce` fold of the harness for the log of this session:
   * every host record of the root thread and of its child threads, in log
   * order. `undefined` for a harness without `reduce`. A session of another
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
    return this.writer.reducedBy(this.harness.durability?.reduce) as
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
   * (`'unknown_message'`).
   */
  async revert(messageId: string): Promise<Receipt> {
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
      const files = await handler?.revert(messages.slice(at + 1), (type) =>
        this.hostRecords(type),
      )
      await this.saveRevert({
        messageId,
        ...(files !== undefined ? { files } : {}),
      })
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
        ?.unrevert(reverted.files)
    }
    await this.saveRevert(undefined)
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

  /** Keep the revert state in the log. */
  protected async saveRevert(revert: RevertState | undefined) {
    this.reverted = revert
    await this.writer.append([
      { type: 'harness.revert', revert: revert ?? null },
    ])
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.revert, {
        messageId: revert?.messageId ?? null,
      }),
    )
  }

  /** The host records of `type` of this thread, from the log, oldest first. */
  protected async hostRecords(type: string) {
    const found: Array<Record<string, unknown>> = []
    let after = 0
    for (;;) {
      const entries = await this.log.store.read({
        logId: this.storeLogId,
        after,
        limit: 256,
      })
      for (const { seq, record } of entries) {
        after = seq
        const isOwn = threadOf(record, this.threadId) === this.threadId
        if (isOwn && record.type === type) found.push(record)
      }
      // A store can return fewer than `limit` before the end: stop only at
      // an empty page.
      if (entries.length === 0) return found
    }
  }

  /** The commands, settings, and tools of this session, for a UI. */
  describe() {
    return {
      commands: this.commands(),
      config: Object.entries(this.config()).map(([key, entry]) => ({
        key,
        ...entry,
      })),
      tools: this.inspect().tools,
      settings: this.settings(),
      models: Object.keys(this.harness.models ?? {}),
    } satisfies SessionDescription
  }

  /**
   * Answer an open wait: a question from `ctx.session.ask`, or a `human`
   * wait, by its id. `principal` is who answers. Default: the principal that
   * opened the session. The log keeps it.
   */
  async answer({
    questionId,
    value,
    inputId = createInputId(),
    principal,
    ref,
  }: {
    questionId: string
    value: unknown
    /** @internal The id of an offered input, so a replay is a duplicate. */
    inputId?: string
    principal?: Principal
    /** @internal A secret answer that another host saved. See `answerOffer`. */
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
    if (asked?.secret && typeof value === 'string') this.redactor.add(value)
    const sender = principal ?? this.principal
    let admission
    try {
      admission = await this.accept(
        inputId,
        { op: 'answer', questionId, value: isHidden ? SECRET_ANSWER : value },
        principal,
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
    if (!isOpen) return this.reject(inputId, 'unknown_question')
    // The log has the JSON Schema of the wait: the answer must fit it.
    const issues = jsonSchemaIssues(logged.wait.schema, value)
    if (issues.length > 0) {
      return this.reject(inputId, `Invalid answer: ${issues.join(', ')}`)
    }
    // A secret never goes in the log. The run reads it from the store.
    if (logged.secret) await this.keepSecretAnswer(logged, value)
    await this.applied(
      inputId,
      'session',
      this.waitEndRecords(
        waitId,
        'answered',
        logged.secret ? undefined : value,
      ),
    )
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
   * Keep the secret answer to the wait `logged` until its run ends, so a run
   * again (also on another host) can read it: in memory, and in the
   * credential store of the app when it has one, as a credential reference
   * of the user of the run. The session scrubs it from now on.
   */
  private async keepSecretAnswer(logged: WaitState, value: unknown) {
    const { waitId, principal } = logged.wait
    if (typeof value === 'string') this.redactor.add(value)
    this.keptAnswers.set(waitId, value)
    await this.sharedCredentials?.set({
      scope: scopeOf(this.threadId, principal),
      id: keptAnswerId(waitId),
      credential: { type: 'api_key', value: JSON.stringify(value) },
    })
  }

  /**
   * The secret answer to the wait `logged` that `keepSecretAnswer` kept.
   * `undefined`: no host kept it here, and the store does not have it.
   */
  protected async keptAnswer(
    logged: WaitState,
  ): Promise<{ value: unknown } | undefined> {
    const { waitId, principal } = logged.wait
    if (this.keptAnswers.has(waitId)) {
      return { value: this.keptAnswers.get(waitId) }
    }
    const saved = await this.sharedCredentials?.get({
      scope: scopeOf(this.threadId, principal),
      id: keptAnswerId(waitId),
    })
    if (saved?.type !== 'api_key') return undefined
    let value: unknown
    try {
      value = JSON.parse(saved.value)
    } catch {
      return undefined
    }
    if (typeof value === 'string') this.redactor.add(value)
    this.keptAnswers.set(waitId, value)
    return { value }
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
        scope: scopeOf(this.threadId, wait.principal),
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
    sender: Principal | undefined
  }): Promise<HarnessInput> {
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
      credential: { type: 'api_key', value: JSON.stringify(value) },
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
    sender: Principal | undefined
  }): Promise<{ value: unknown } | undefined> {
    const store = this.sharedCredentials
    if (!store || !ref.startsWith(`${SECRET_ANSWER_PREFIX}${questionId}:`)) {
      return undefined
    }
    const key = { scope: scopeOf(this.threadId, sender), id: ref }
    const saved = await store.get(key)
    if (saved?.type !== 'api_key') return undefined
    await store.delete(key)
    let value: unknown
    try {
      value = JSON.parse(saved.value)
    } catch {
      return undefined
    }
    if (typeof value === 'string') this.redactor.add(value)
    return { value }
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

  /** After the log ended the wait `waitId`: drop its secrets, and move the timer. */
  protected async afterWaitEnd(waitId: string) {
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
    if (records.some((record) => record.wait.expiresAt !== undefined)) {
      this.armSchedules()
    }
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
    principal,
    schema,
    message,
    expiresAt,
  }: Omit<Wait, 'waitId'>): Promise<Wait> {
    const expiry = expiryOf(kind, expiresAt)
    const wait: Wait = {
      waitId: createWaitId(),
      kind,
      runId,
      ...(principal ? { principal } : {}),
      ...(schema !== undefined ? { schema } : {}),
      ...(expiry !== undefined ? { expiresAt: expiry } : {}),
      ...(message !== undefined ? { message } : {}),
    }
    await this.writeWait({ wait, at: Date.now() })
    return wait
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
   * const wait = await session.waitFor({ runId: turn.id })
   * if (isApproval(wait)) console.log('Approve or reject:', wait.message)
   * ```
   */
  waitFor({
    runId,
    signal,
  }: { runId?: string; signal?: AbortSignal } = {}): Promise<Wait> {
    const find = () =>
      this.snapshot().pendingWaits?.find(
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
      ...storedPrincipal(this.principalOfRun(operationId)),
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
        ? [record.principal]
        : [],
    )
    const senders = [logged.wait.principal, this.owner, this.principal]
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
    const stored = this.writer.state.thread.config
    for (const [key, value] of stored) {
      const entry = this.sessionPlugins?.config.get(key)
      if (!entry) continue
      try {
        this.configValues.set(key, checkConfigValue(key, entry.option, value))
      } catch {
        // A stored value an option no longer accepts falls back to the default.
      }
    }
  }

  /** Read the stored settings of this thread from the log. */
  protected loadSettings() {
    const stored = this.writer.state.thread.settings
    const names = this.settingNames()
    for (const [key, value] of Object.entries(stored)) {
      try {
        this.threadSettings = changeSettings(
          this.threadSettings,
          { [key]: value },
          names,
        )
      } catch {
        // A value the harness no longer takes (a removed model or plugin)
        // is dropped.
      }
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
            ...storedPrincipal(
              previous !== undefined && previous.runId === runId
                ? previous.principal
                : savedInput?.principal,
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
    const own = timeOf(interrupt.expiresAt)
    if (own !== undefined) return own
    const opened = this.logWriter?.state.thread.interrupts.get(interrupt.id)
    return (
      opened && expiryOf(waitKind(interrupt), undefined, opened.requestedAt)
    )
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
    const { principal } = run
    const expiresAt = expiryOf('question', question.expiresAt)
    const wait = waitOfQuestion({
      question: pending,
      runId: operationId,
      ...storedPrincipal(principal),
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

/** Why `ctx.session.ask` throws outside a live wait. */
export const ASK_OUTSIDE_WAITS =
  'ctx.session.ask cannot wait here: no process waits for a user. In a command, a durable tool, or an agent run, use step.ask({ name, message }). To let the model ask, add the question tool. To ask before a tool call, give the tool its resources (PermissionResources), and permissions() asks before the call runs.'

/** The id of the wake that ends the wait `waitId` at its `expiresAt`. */
const expiryWakeId = (waitId: string) => `wait:${waitId}`

function createWaitId() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
