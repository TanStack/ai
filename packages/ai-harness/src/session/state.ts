import {
  INTERRUPT_BINDING_METADATA_KEY,
  convertSchemaToJsonSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { loadChildTranscript } from '@tanstack/ai-persistence'
import { checkConfigValue } from '../config'
import { isRecord } from '../utils'
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
import {
  createInputId,
  customEvent,
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
import type { ThreadRecord } from '../log-records'
import type { Question } from '../commands'
import type { ConfigOption } from '../config'
import type { AnyHarness, SessionMetadataOf } from '../define'
import type { SessionEntryChange, SessionEntryUpdate } from '../session-entry'
import type {
  ChatTurnResult,
  ConfigureOptions,
  MediaRecord,
  MediaUpload,
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

/**
 * A layer of {@link HarnessSession}: config, thread settings, revert,
 * interrupts, media, and the snapshot.
 */
export abstract class SessionState<
  THarness extends AnyHarness = AnyHarness,
> extends SessionInputs<THarness> {
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

  snapshot(): SessionSnapshot {
    const active = [...this.operations.values()].filter(
      (operation) => !operation.isSettled(),
    )
    return {
      threadId: this.threadId,
      status: this.activeTurn
        ? 'running'
        : this.interrupted
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
      pendingInterrupts:
        this.activeResume && !this.activeTurn?.isSettled()
          ? []
          : (this.interrupted?.interrupts ?? []),
      pendingQuestions: [...this.questions.entries()].map(
        ([questionId, question]) => ({
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
          ...(question.url ? { url: question.url } : {}),
        }),
      ),
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
   * settings and plugin config of `source`. The log of this thread keeps
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
    /** @internal The id of a forwarded input, so a replay is a duplicate. */
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
    // Another host runs the thread: its log write would stop that host.
    if (this.snapshot().status !== 'idle' || (await this.isOwnedElsewhere())) {
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
    // Another host runs the thread: its log write would stop that host.
    if (this.snapshot().status !== 'idle' || (await this.isOwnedElsewhere())) {
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
    }
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
        const isOwn = threadOf(record, this.logId) === this.threadId
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
   * Answer a question from `ctx.session.ask`. `principal` is who answers.
   * Default: the principal that opened the session. The log keeps it.
   */
  async answer({
    questionId,
    value,
    inputId = createInputId(),
    principal,
  }: {
    questionId: string
    value: unknown
    /** @internal The id of a forwarded input, so a replay is a duplicate. */
    inputId?: string
    principal?: Principal
  }): Promise<Receipt> {
    // A secret (a key or a password) stays out of the inbox and the log. A
    // restart does not replay an answer, so they never need it. A host that
    // does not have the question cannot tell: the owner deletes the inbox
    // entry of the answer after it applies it.
    const isSecret = this.questions.get(questionId)?.secret === true
    // A host that does not have the question passes the value on to its owner.
    const admission = await this.accept(
      inputId,
      {
        op: 'answer',
        questionId,
        value: isSecret ? '[secret]' : value,
      },
      principal,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const question = this.questions.get(questionId)
    if (!question) return this.reject(inputId, 'unknown_question')
    let checked: unknown = value
    if (question.schema !== undefined) {
      const result = await validateWithStandardSchema(question.schema, value)
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
      await this.applied(inputId, 'session')
    } catch (error) {
      // The answer was not stored. The question waits again, unless the
      // session closes: then nobody can answer it.
      if (this.closing) question.reject(new Error('Session closed.'))
      else this.questions.set(questionId, question)
      throw error
    }
    this.feed.publish(
      question.operationId,
      customEvent(HARNESS_EVENTS.questionAnswered, { questionId }),
    )
    question.resolve(checked)
    // The question no longer holds the thread. The resolved work, if any,
    // marks it busy again first.
    queueMicrotask(() => this.checkIdle())
    return { inputId, status: 'accepted' }
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
    await this.writer.append([
      { type: 'harness.interrupted', turn: turn ?? null },
    ])
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
  }

  protected ask(
    question: Question<SchemaInput | undefined>,
    owner?: string,
  ): Promise<unknown> {
    if (this.closing) return Promise.reject(new Error('Session closed.'))
    const questionId = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    // On the operation that asks (a command), else on the running chat turn,
    // so a client that streams that operation sees it, and a cancel of it
    // rejects the question. The session stream has every operation's events.
    const operationId = owner ?? this.activeTurn?.id ?? 'session'
    // The claim sends an answer that reaches another host here.
    this.markBusy()
    return new Promise((resolve, reject) => {
      this.questions.set(questionId, {
        message: question.message,
        schema: question.schema,
        secret: question.secret === true,
        url: question.url,
        operationId,
        resolve,
        reject,
      })
      this.feed.publish(
        operationId,
        customEvent(HARNESS_EVENTS.question, {
          questionId,
          message: question.message,
          ...(question.schema
            ? { schema: convertSchemaToJsonSchema(question.schema) }
            : {}),
          ...(question.secret ? { secret: true } : {}),
          ...(question.url ? { url: question.url } : {}),
        }),
      )
    })
  }
}
