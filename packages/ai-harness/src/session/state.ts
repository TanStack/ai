import {
  EventType,
  INTERRUPT_BINDING_METADATA_KEY,
  convertSchemaToJsonSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { loadChildTranscript } from '@tanstack/ai-persistence'
import { checkConfigValue } from '../config'
import { isRecord } from '../utils'
import { changedEntry } from '../session-entry'
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
import { isSessionUsage } from '../usage'
import {
  INTERRUPTED,
  USAGE,
  isInterruptedTurn,
  createInputId,
  customEvent,
  tanstackOf,
  toolCallOf,
  storedPrincipal,
  SETTINGS,
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
import type { Question } from '../commands'
import type { ConfigOption } from '../config'
import type { AnyHarness, SessionMetadataOf } from '../define'
import type { SessionEntryChange, SessionEntryUpdate } from '../session-entry'
import type {
  ChatTurnResult,
  MediaRecord,
  Principal,
  Receipt,
  ThreadSettings,
  ThreadSettingsChange,
} from '../types'
import type {
  SessionSnapshot,
  SessionDescription,
  InterruptedTurn,
} from './types'
import type { SettingNames } from './helpers'
import type { HarnessSession } from './harness-session'

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
   * time, else a new `updatedAt`. The owner is who opened the thread first,
   * so an open by another user does not change it.
   */
  protected async openEntry() {
    const now = Date.now()
    await this.index.update(this.threadId, (entry) => ({
      threadId: this.threadId,
      createdAt: now,
      ...entry,
      harness: entry?.harness ?? this.harness.name,
      updatedAt: now,
      ...storedPrincipal(entry?.principal ?? this.principal),
    }))
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
   * const record = await session.putMedia(bytes, { mimeType: 'image/png', name: 'cat.png' })
   * session.send([{ type: 'text', content: 'What is this?' }, mediaPart(record)])
   */
  putMedia(body: BlobBody, info: { mimeType: string; name: string }) {
    return this.mediaStore.put(body, info)
  }

  /** The record of a media file of this thread, or `null` when it is not found. */
  getMedia(id: string) {
    return this.mediaStore.get(id)
  }

  /**
   * The bytes of a media file, or of one `range` of them. Throws a
   * `MediaError` with 404 when it is not found.
   */
  loadMedia(id: string, range?: BlobRange) {
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
   * settings and plugin config of `source`. `host.fork` calls it.
   */
  async adoptFork(
    source: HarnessSession,
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
            (await this.putMedia(await source.loadMedia(id), {
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
    const { metadata } = this.persistence.stores
    this.threadSettings = source.settings()
    if (Object.keys(this.threadSettings).length > 0) {
      await metadata?.set(SETTINGS, this.threadId, this.threadSettings)
    }
    for (const [key, value] of source.configValues) {
      if (this.sessionPlugins?.config.has(key))
        this.configValues.set(key, value)
    }
    if (this.configValues.size > 0) {
      await metadata?.set(
        'harness:config',
        this.threadId,
        Object.fromEntries(this.configValues),
      )
    }
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

  /** Change a session setting. It applies at the next turn. */
  async setConfig({
    key,
    value,
    inputId = createInputId(),
  }: {
    key: string
    value: unknown
    /** @internal The id of a forwarded input, so a replay is a duplicate. */
    inputId?: string
  }): Promise<Receipt> {
    const admission = await this.accept(inputId, { op: 'config', key, value })
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
    await this.persistence.stores.metadata?.set(
      'harness:config',
      this.threadId,
      Object.fromEntries(this.configValues),
    )
    await this.applied(inputId, 'session')
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
   * the turn's `overrides` win over them. `stores.metadata` keeps them.
   *
   * It is an input, so the log keeps who changed what (`principal`). An
   * unknown field, model, or plugin, or a bad value, is rejected.
   *
   * @example
   * ```ts
   * await session.configure({ model: 'strong', instructions: 'Answer in French.' })
   * ```
   */
  async configure(
    settings: ThreadSettingsChange,
    options?: { principal?: Principal; inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const principal = options?.principal ?? this.principal
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
    await this.persistence.stores.metadata?.set(SETTINGS, this.threadId, next)
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
    await this.applied(inputId, 'session')
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
    return (await this.index.get(this.threadId)) as
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
    return (await this.index.update(this.threadId, (entry) =>
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
    const messages = [...(await this.messages.loadThread(this.threadId))]
    const at = this.revertedAt(messages)
    return at < 0 ? messages : messages.slice(0, at + 1)
  }

  /**
   * The saved messages of a child agent run of this thread, by its
   * `subagentRunId`, oldest first. It starts with the task of the agent
   * call. Each message has the child's card (its name and how it ended) in
   * `metadata.tanstack.subagent`. A child with no messages has one assistant
   * message with no content that holds only its card. A nested child is a
   * child of this thread too. Empty for an unknown id, for a child of another
   * thread, and with no message store.
   */
  async agentTranscript(subagentRunId: string): Promise<Array<ModelMessage>> {
    const store = this.chatPersistence?.stores.messages
    if (!store) return []
    return (
      (await loadChildTranscript(store, subagentRunId, this.threadId)) ?? []
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

  /** Keep the revert state in the log, else in the metadata store. */
  protected async saveRevert(revert: RevertState | undefined) {
    this.reverted = revert
    if (this.writer) {
      await this.writer.append([
        { type: 'harness.revert', revert: revert ?? null },
      ])
    } else {
      await this.persistence.stores.metadata?.set(
        'harness:revert',
        this.threadId,
        revert ?? null,
      )
    }
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
    if (!this.writer || !this.log) return found
    let after = 0
    for (;;) {
      const entries = await this.log.store.read({
        logId: this.logId,
        after,
        limit: 256,
      })
      for (const { seq, record } of entries) {
        after = seq
        const isOwn = (record.thread ?? this.logId) === this.threadId
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

  /** Answer a question from `ctx.session.ask`. */
  async answer({
    questionId,
    value,
    inputId = createInputId(),
  }: {
    questionId: string
    value: unknown
    /** @internal The id of a forwarded input, so a replay is a duplicate. */
    inputId?: string
  }): Promise<Receipt> {
    // A secret (a key or a password) stays out of the inbox and the log. A
    // restart does not replay an answer, so they never need it. A host that
    // does not have the question cannot tell: the owner deletes the inbox
    // entry of the answer after it applies it.
    const isSecret = this.questions.get(questionId)?.secret === true
    // A host that does not have the question passes the value on to its owner.
    const admission = await this.accept(inputId, {
      op: 'answer',
      questionId,
      value: isSecret ? '[secret]' : value,
    })
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

  protected async loadConfig(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      'harness:config',
      this.threadId,
    )
    if (typeof stored !== 'object' || stored === null) return
    for (const [key, value] of Object.entries(stored)) {
      const entry = this.sessionPlugins?.config.get(key)
      if (!entry) continue
      try {
        this.configValues.set(key, checkConfigValue(key, entry.option, value))
      } catch {
        // A stored value an option no longer accepts falls back to the default.
      }
    }
  }

  /** Read the stored settings of this thread. */
  protected async loadSettings(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      SETTINGS,
      this.threadId,
    )
    if (!isRecord(stored)) return
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

  /** Restore the usage totals that `stores.metadata` keeps for this thread. */
  protected async loadUsage(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      USAGE,
      this.threadId,
    )
    if (isSessionUsage(stored)) this.usageTotals = stored
  }

  /** Restore the interrupted turn that `stores.metadata` keeps for this thread. */
  protected async loadInterrupted(): Promise<void> {
    const stored = await this.persistence.stores.metadata?.get(
      INTERRUPTED,
      this.threadId,
    )
    if (isInterruptedTurn(stored)) this.interrupted = stored
    await this.refreshInterrupted()
  }

  /** Keep the snapshot in line with the committed interrupt records. */
  protected async refreshInterrupted(
    observed?: InterruptedTurn,
    consumed = false,
    persist = true,
  ): Promise<void> {
    const previous = observed ?? this.interrupted
    const store = this.persistence.stores.interrupts
    let next = previous
    if (store) {
      const pending = await store.listPending(this.threadId)
      const owned = pending.filter((record) => {
        const payload = record.payload
        const metadata = isRecord(payload.metadata)
          ? payload.metadata
          : undefined
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
      const savedInput = [...(this.writer?.state.inputs.values() ?? [])].find(
        (input) => input.operationId === runId,
      )
      const context =
        previous !== undefined && previous.runId === runId
          ? previous.context
          : savedInput && 'context' in savedInput.input
            ? savedInput.input.context
            : undefined
      next =
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
    } else if (consumed && observed === undefined) {
      next = undefined
    } else if (observed === undefined && this.writer && this.log) {
      let after = 0
      for (;;) {
        const entries = await this.log.store.read({
          logId: this.logId,
          after,
          limit: 256,
        })
        for (const { seq, record } of entries) {
          after = seq
          if (
            (record.thread ?? this.logId) !== this.threadId ||
            record.type !== 'harness.event' ||
            !isRecord(record.event)
          )
            continue
          const event = record.event
          // A later result of an interrupt's tool call: its resume ran, so it
          // is used up, also when that turn failed after the tool.
          if (
            event.type === EventType.TOOL_CALL_RESULT &&
            typeof event.toolCallId === 'string' &&
            next !== undefined
          ) {
            if (!(await this.isRunResult(event, record.operationId))) continue
            const remaining = next.interrupts.filter(
              (interrupt) => toolCallOf(interrupt) !== event.toolCallId,
            )
            if (remaining.length !== next.interrupts.length) {
              next =
                remaining.length > 0
                  ? { ...next, interrupts: remaining }
                  : undefined
            }
            continue
          }
          if (
            event.type !== EventType.RUN_FINISHED ||
            event.subagentRunId ||
            typeof record.operationId !== 'string'
          )
            continue
          if (
            isRecord(event.outcome) &&
            event.outcome.type === 'interrupt' &&
            Array.isArray(event.outcome.interrupts)
          ) {
            const interrupts: Array<Interrupt> = []
            for (const item of event.outcome.interrupts) {
              if (
                !isRecord(item) ||
                typeof item.id !== 'string' ||
                typeof item.reason !== 'string' ||
                typeof item.message !== 'string'
              ) {
                throw new Error('The logged interrupt descriptor is invalid.')
              }
              interrupts.push({
                ...item,
                id: item.id,
                reason: item.reason,
                message: item.message,
              })
            }
            const savedInput = [
              ...(this.writer?.state.inputs.values() ?? []),
            ].find((input) => input.operationId === record.operationId)
            const context =
              previous !== undefined && previous.runId === record.operationId
                ? previous.context
                : savedInput && 'context' in savedInput.input
                  ? savedInput.input.context
                  : undefined
            next = {
              runId: record.operationId,
              interrupts,
              ...(previous !== undefined &&
              previous.runId === record.operationId &&
              previous.routed
                ? { routed: previous.routed }
                : {}),
              ...storedPrincipal(
                previous !== undefined && previous.runId === record.operationId
                  ? previous.principal
                  : savedInput?.principal,
              ),
              ...(context !== undefined ? { context } : {}),
            }
          } else if (
            (await this.persistence.stores.runs?.get(record.operationId))
              ?.status === 'completed'
          )
            next = undefined
        }
        if (entries.length < 256) break
      }
    }
    this.interrupted = next
    if (!persist) return
    if (next)
      await this.persistence.stores.metadata?.set(
        INTERRUPTED,
        this.threadId,
        next,
      )
    else if (previous !== undefined) {
      try {
        await this.persistence.stores.metadata?.delete(
          INTERRUPTED,
          this.threadId,
        )
      } catch (error) {
        if (!consumed || observed !== undefined) throw error
        await this.persistence.stores.metadata?.set(
          INTERRUPTED,
          this.threadId,
          null,
        )
      }
    }
  }

  /**
   * True when a logged tool result means its tool ran: it is not cancelled,
   * and an error result does not come from a stopped run.
   */
  protected async isRunResult(
    event: Record<string, unknown>,
    operationId: unknown,
  ) {
    const tanstack = tanstackOf(event)
    if (tanstack?.toolResultOutcome === 'cancelled') return false
    if (tanstack?.state !== 'output-error') return true
    if (typeof operationId !== 'string') return false
    const run = await this.persistence.stores.runs?.get(operationId)
    return run !== null && run !== undefined && run.status !== 'aborted'
  }

  /**
   * Mark the interrupts of `resume` answered in the interrupt store, the same
   * way `withPersistence` commits them at a success boundary. Records that are
   * no longer pending are left as they are.
   */
  protected async consumeResume(resume: ReadonlyArray<RunAgentResumeItem>) {
    const store = this.persistence.stores.interrupts
    if (!store) return
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

  /** Refresh even when a turn failed before its main try block. */
  protected async refreshTurnInterrupts(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    observed?: InterruptedTurn,
    consumed = false,
  ): Promise<void> {
    await this.refreshInterrupted(observed, consumed).catch((error: unknown) =>
      this.warn(operation, 'harness:interrupts', error),
    )
  }

  /**
   * Make `stopped` the interrupted turn. `stores.metadata` gets it first, so a
   * restart can resolve it too, and a resolve cannot delete the copy before
   * it is written. A failed write is a warning.
   */
  protected async keepInterrupted(
    operation: OperationImpl<ChatTurnResult>,
    stopped: InterruptedTurn,
  ): Promise<void> {
    await this.persistence.stores.metadata
      ?.set(INTERRUPTED, this.threadId, stopped)
      .catch((error: unknown) =>
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
