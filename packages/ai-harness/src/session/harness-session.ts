import { EventType } from '@tanstack/ai'
import { REDACTED_THINKING_ID_PREFIX } from '@tanstack/ai/adapter-internals'
import { LogConflictError } from '@tanstack/ai-persistence'
import { engineMessageStore, loggedRunOf, sessionMessageStore } from '../log'
import { logChatStores } from '../log-stores'
import { mountPlugins } from '../plugins'
import {
  CUT_OFF_NOTE,
  checkpointMiddleware,
  toolResultRecorder,
  repairSteps,
  repairTranscript,
} from '../resume'
import { HARNESS_EVENTS } from '../types'
import {
  chainInputOf,
  createMessageId,
  customEvent,
  errorText,
  inputKey,
  isAgentInput,
  CHAT_OPS,
  CONTROL_OPS,
  hasFinalAnswer,
  loggedExtras,
  notifyListeners,
  offeredInputRecord,
  SHUTDOWN_REASON,
  storedUser,
  tapFeed,
  toolCallOf,
} from './helpers'
import { SessionTurn } from './turn'
import { commandStepScope, stepWaitPrefix } from './turn-parts'
import { MAX_TIMER_MS } from '../utils'
import type { ModelMessage } from '@tanstack/ai'
import type { AccessRun } from '../access'
import type { InputState, LogWriter } from '../log'
import type { AnyHarness } from '../define'
import type { RecoverContext, RecoverDecision } from '../turn'
import type { HarnessInput, SettlementOutcome, TurnOverrides } from '../types'
import type { ScheduleOptions, WaitingSteer } from './types'

/**
 * The members of the session class that {@link HarnessSession} has. Only
 * these are public: a new member of a layer stays off the public type until
 * it is listed here.
 */
type PublicSessionMember =
  | 'agent'
  | 'agentResult'
  | 'agentRun'
  | 'agentRuns'
  | 'agentTranscript'
  | 'agents'
  | 'answer'
  | 'appendRecords'
  | 'cancel'
  | 'cancelInput'
  | 'cancelSchedule'
  | 'changeInputDelivery'
  | 'commands'
  | 'continueWithoutMessage'
  | 'describe'
  | 'events'
  | 'getMedia'
  | 'indexEntry'
  | 'inspect'
  | 'jobs'
  | 'loadMedia'
  | 'logState'
  | 'mediaUrl'
  | 'moveToolCallToBackground'
  | 'onAuthRequired'
  | 'onEvent'
  | 'onMedia'
  | 'onQuestion'
  | 'onUsage'
  | 'operation'
  | 'pluginSettings'
  | 'putMedia'
  | 'recoverPendingWork'
  | 'registry'
  | 'reloadPlugins'
  | 'reset'
  | 'resolve'
  | 'revert'
  | 'runCommand'
  | 'runTool'
  | 'schedule'
  | 'send'
  | 'setPluginSetting'
  | 'settled'
  | 'snapshot'
  | 'threadId'
  | 'threadSettings'
  | 'transcript'
  | 'unrevert'
  | 'updateIndexEntry'
  | 'updateThreadSettings'
  | 'usage'
  | 'waitForRun'
  | 'waitingInputs'
  | 'whenIdle'

/**
 * A handle to a live harness session: one conversation (`threadId`) with its
 * plugins, operations, inputs, and event stream. Open one with `host.open()`.
 * Each open gives its own handle. Release it with `close()`, or with
 * `await using`, when you are done.
 */
export interface HarnessSession<
  THarness extends AnyHarness = AnyHarness,
> extends Pick<SessionImpl<THarness>, PublicSessionMember> {
  /**
   * Release this handle. The session stays open while another handle holds
   * it. When no handle holds it and it is idle, the host closes it after
   * `lifecycle.closeIdleSessionsAfterMs`. A second call does nothing. A call on the handle
   * after the session closed opens it again. To stop the work of every
   * session, call `host.close()`.
   *
   * @example
   * ```ts
   * const session = await host.open(assistant, { threadId })
   * try {
   *   await session.send('Hello.')
   * } finally {
   *   await session.close()
   * }
   * ```
   */
  close: () => Promise<void>
  /**
   * `close()`, for `await using`.
   *
   * @example
   * ```ts
   * await using session = await host.open(assistant, { threadId })
   * ```
   */
  [Symbol.asyncDispose]: () => Promise<void>
}

/**
 * The session class. The package does not export it: apps get the
 * {@link HarnessSession} type from `host.open()`.
 */
export class SessionImpl<THarness extends AnyHarness = AnyHarness>
  extends SessionTurn<THarness>
  implements HarnessSession<THarness>
{
  /** The recoveries that run. The host keeps the log while one runs. */
  private recovering = 0
  /** The timer of the next schedule of this thread. See `armSchedules`. */
  private scheduleTimer: ReturnType<typeof setTimeout> | undefined
  /** The schedule writes and runs, one at a time. */
  private scheduling: Promise<void> = Promise.resolve()

  /** This session, typed as the public type, for the hooks of each layer. */
  protected override self(): HarnessSession<THarness> {
    return this
  }

  /**
   * @internal Close the session, for `await using` on the class. A handle of
   * `host.open` releases itself instead.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }

  /**
   * @internal `error` without the secrets of this session, for an error
   * frame that leaves it (the HTTP handler, the socket, a worker). An
   * `Error` keeps its class: its message and stack are scrubbed in place.
   * The same value when it has no secret.
   */
  scrubError(error: unknown): unknown {
    if (!(error instanceof Error)) return this.redactor.redact(error)
    const message = this.scrub(error.message)
    if (message === error.message) return error
    try {
      error.message = message
      if (error.stack !== undefined) error.stack = this.scrub(error.stack)
      return error
    } catch {
      // A message that cannot change (a getter only): a plain error.
      return new Error(message)
    }
  }

  /** @internal Mount session plugins and recover the work in the log. */
  async open(): Promise<void> {
    await this.tracing?.ready()
    // First: plugins publish events while they mount.
    await this.openLog()
    try {
      await this.mountSessionPlugins()
      this.loadSettings()
      this.reverted = this.writer.state.revert
      await this.loadInterrupted()
      // Before recovery: a turn that recovery runs updates this entry.
      await this.openEntry()
      await this.recoverFromLog(this.writer)
      // Inputs that other hosts offered while no host owned the log.
      this.acceptsOffers = true
      void this.drainOffers()
      this.armSchedules()
    } catch (error) {
      // A session that fails to open stops what it started: the plugins and
      // the turns that recovery queued or runs. It stops them as on a crash,
      // so the next open runs them again. It gives its log view back, so the
      // thread can open again.
      await this.close({ recoverable: true }).catch(() => {})
      throw error
    }
  }

  /**
   * @internal For `host.sessions.delete`: open the log and the session
   * plugins, and nothing else. No recovery, no index entry, no offers, and
   * no schedules, so no work of the thread runs again before the purge. Call
   * `endThread`, then close it.
   */
  async openToEnd(): Promise<void> {
    await this.openLog()
    await this.mountSessionPlugins()
    this.loadSettings()
  }

  /**
   * @internal The thread ends for good: each `ThreadEnds` handler of the
   * plugins runs, the newest first, so a plugin that needs the workspace of
   * an older plugin runs before that workspace closes. Every handler runs.
   * Then the first error, if any, is thrown.
   */
  async endThread(): Promise<void> {
    const run = this.runContext({
      user: undefined,
      runId: `end:${this.threadId}`,
      signal: this.lifetime.signal,
    })
    const errors: Array<unknown> = []
    for (const handler of [...this.threadEnds].reverse()) {
      await handler({
        tenantId: this.tenantId,
        threadId: this.threadId,
        run,
      }).catch((error: unknown) => errors.push(error))
    }
    if (errors.length > 0) throw errors[0]
  }

  /** Also waits for the last append of the log, so a reopen reads it. */
  override async close(options?: { recoverable?: boolean }): Promise<void> {
    // The log keeps the schedules. The release of the log gives the store
    // their wake time.
    clearTimeout(this.scheduleTimer)
    this.scheduleTimer = undefined
    await super.close(options)
    // A recovery in flight queues turns after the stop: wait for it, then
    // drop what it queued.
    await this.recovery
    for (const turn of this.queue.splice(0)) {
      turn.operation.fail('cancelled', new Error('Session closed.'))
    }
    // A session whose open failed before the log opened has no writer.
    await this.logWriter?.flush().catch((error: unknown) =>
      this.logger.error('[@tanstack/ai-harness] The log flush failed.', {
        error,
      }),
    )
  }

  /** Read `harness.plugins()` and set up its session plugins. */
  protected async mountSessionPlugins(): Promise<void> {
    this.plugins = this.harness.plugins?.() ?? []
    this.sessionPlugins = await mountPlugins(
      // The session plugins and the host plugins. A turn mounts the rest.
      this.plugins.filter((plugin) => plugin.lifetime !== 'turn'),
      {
        threadId: this.threadId,
        hostPlugin: (plugin) => this.hostPlugins.acquire(this.harness, plugin),
        registry: this.agentRegistry,
        harnessTools: this.harness.tools ?? [],
        harnessProvides: (this.harness.middleware ?? []).flatMap(
          (middleware) => middleware.provides ?? [],
        ),
        services: this.services,
        inherited: this.storeCapabilities(),
        // A plugin that this thread removed gives `collect` nothing.
        hiddenOwners: () => this.removedPlugins(),
      },
    )
    this.loadConfig()
    this.loadPluginState()
  }

  /**
   * Tear the plugins down and set them up again, with the list that
   * `harness.plugins()` gives now. It waits for the running turn, and no new
   * turn starts until it ends. The transcript, the log, and the thread
   * settings stay. Clients get a `harness.reloaded` event.
   *
   * When the new setup throws, the session keeps working with no plugins,
   * and the promise rejects with the error. Call `reloadPlugins()` again after a
   * fix.
   *
   * @example
   * ```ts
   * await session.reloadPlugins()
   * ```
   */
  reloadPlugins(): Promise<void> {
    const run = this.reloads.then(() => this.runReload())
    this.reloads = run.catch(() => {})
    return run
  }

  protected async runReload(): Promise<void> {
    if (this.closing) return
    this.holdTurns++
    try {
      while (this.activeTurn) {
        await new Promise<void>((resolve) => this.turnEnds.add(resolve))
      }
      // close() started while the turn ran. It disposes the plugins.
      if (this.closing) return
      const old = this.sessionPlugins
      // No plugins until the new setup works, so a failed setup leaves none.
      this.sessionPlugins = undefined
      this.plugins = []
      this.agentRegistry.deletePluginAgents()
      await old?.dispose()
      await this.mountSessionPlugins()
      this.feed.publish('session', customEvent(HARNESS_EVENTS.reloaded, {}))
    } catch (error) {
      this.sessionPlugins = undefined
      this.plugins = []
      this.agentRegistry.deletePluginAgents()
      this.feed.publish(
        'session',
        customEvent(HARNESS_EVENTS.reloaded, {
          error: this.scrub(errorText(error)),
        }),
      )
      throw error
    } finally {
      this.holdTurns--
      this.drain()
    }
  }

  /**
   * Recover the work in the log again, as `open()` does, then apply the
   * inputs that other hosts offered. `open()` skips the work while another
   * host owns the log. Call this after that host stops or gives the log up,
   * and the work runs here. The work that this session runs or queues stays
   * as it is.
   *
   * @example
   * ```ts
   * await session.recoverPendingWork()
   * ```
   */
  async recoverPendingWork(): Promise<void> {
    if (this.closing) return
    const { writer } = this
    const run = this.recovery.then(async () => {
      // First the records that other hosts wrote since this session read.
      await writer.catchUp()
      if (this.logFailure) throw this.logFailure
      // close() ran while catchUp waited: nothing resumes.
      if (this.closing) return
      await this.recoverFromLog(writer)
    })
    this.recovery = run.catch(() => {})
    await run
    await this.drainOffers()
  }

  /**
   * @internal For a sweep that acquired the log of this session: recover
   * the work, apply the offers, run the schedules that are due, then give
   * the log back when the thread has no work. Resolves `false` when another
   * live host owns the log.
   */
  async takeOver(): Promise<boolean> {
    await this.recoverPendingWork()
    // A log that a worker took for its wake has a schedule that is due.
    await this.runDueSchedules()
    const isOwner = await this.writer.own()
    // A recovery with no work did not write, so the log goes back here.
    await this.writer.rest()
    return isOwner
  }

  /**
   * Run `input` at the time `at` (epoch ms), on the host that owns the log
   * then. The log keeps the schedule, so it runs once, also after a restart
   * or on another machine: when no host has the thread open, the log store
   * wakes a worker at that time (see `createHarnessWorker`). Resolves with
   * the id of the schedule when the log has it.
   *
   * Throws `LogOwnedElsewhereError` when another live host owns the log of
   * the thread, and a `RangeError` for an `at` that is not a finite number.
   *
   * @example
   * ```ts
   * const { scheduleId } = await session.schedule({
   *   at: Date.now() + 60 * 60 * 1000,
   *   input: { op: 'prompt', message: 'Write the daily summary.' },
   * })
   * ```
   */
  async schedule(options: ScheduleOptions): Promise<{ scheduleId: string }> {
    const { at, input } = options
    if (!Number.isFinite(at)) {
      throw new RangeError(`schedule: at must be a finite number, got ${at}.`)
    }
    const scheduleId = options.scheduleId ?? createScheduleId()
    const user = options.user ?? this.user
    await this.inSchedules(async () => {
      if (this.writer.state.thread.schedules.has(scheduleId)) return
      await this.writer.append([
        {
          type: 'harness.schedule',
          scheduleId,
          at,
          input,
          ...storedUser(user),
        },
      ])
    })
    this.armSchedules()
    return { scheduleId }
  }

  /**
   * Stop a schedule that did not run yet. A schedule that ran, or an id that
   * the thread does not know, changes nothing. Throws
   * `LogOwnedElsewhereError` when another live host owns the log.
   *
   * @example
   * ```ts
   * await session.cancelSchedule({ scheduleId })
   * ```
   */
  async cancelSchedule({ scheduleId }: { scheduleId: string }): Promise<void> {
    await this.inSchedules(async () => {
      if (!this.writer.state.thread.schedules.has(scheduleId)) return
      await this.writer.append([{ type: 'harness.schedule.done', scheduleId }])
    })
    this.armSchedules()
  }

  /**
   * @internal The run that `isAllowed` gets for a cancel of the schedule
   * `scheduleId`: the schedule, and who made it. `undefined` for an id that
   * the thread does not know.
   */
  scheduleRun(scheduleId: string): AccessRun | undefined {
    const schedule = this.writer.state.thread.schedules.get(scheduleId)
    if (!schedule) return undefined
    const { user } = schedule
    return {
      runId: scheduleId,
      ...(user ? { userId: user.id } : {}),
    }
  }

  /**
   * @internal The run that `input` targets, and who started it, from the
   * log: the access check of a schedule. See `loggedRunOf`.
   */
  loggedRun(input: HarnessInput) {
    return loggedRunOf({
      store: this.log.store,
      logId: this.storeLogId,
      rootThread: this.threadId,
      input,
    })
  }

  /** Run `task` after the schedule tasks before it. */
  private inSchedules(task: () => Promise<void>) {
    const run = this.scheduling.then(task)
    this.scheduling = run.catch(() => {})
    return run
  }

  /**
   * Run the schedules that are due now, and set the timer for the first one
   * that is not. When the timer fires, the session runs the schedules that
   * are due, if this host can own the log. With `isRetry`, a schedule that
   * is still due (another host owns the log, or a write failed) waits
   * `SCHEDULE_RETRY_MS` before the next try.
   */
  protected override armSchedules({
    isRetry = false,
  }: { isRetry?: boolean } = {}) {
    clearTimeout(this.scheduleTimer)
    this.scheduleTimer = undefined
    if (this.closing || this.logWriter === undefined) return
    const schedules = [...this.writer.state.thread.schedules.values()]
    if (schedules.length === 0) return
    const first = Math.min(...schedules.map((schedule) => schedule.at))
    const left = first - Date.now()
    if (left <= 0 && !isRetry) {
      // At once, so the thread is busy before the host can close it on idle.
      this.runDueSchedules().catch((error: unknown) =>
        this.warnSession('harness:schedules', error),
      )
      return
    }
    // A longer wait fires early, finds nothing due, and sets the timer again.
    const delay = Math.min(left > 0 ? left : SCHEDULE_RETRY_MS, MAX_TIMER_MS)
    const timer = setTimeout(() => {
      this.scheduleTimer = undefined
      this.runDueSchedules().catch((error: unknown) =>
        this.warnSession('harness:schedules', error),
      )
    }, delay)
    // The log store wakes a worker for the schedule, so the timer must not
    // keep a process alive.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.scheduleTimer = timer
  }

  /**
   * Run the schedules of this thread that are due, the first one first, and
   * set the timer for the next one. Only the owner of the log runs them:
   * when another live host owns it, that host runs them.
   */
  protected runDueSchedules(): Promise<void> {
    // The thread is busy while it runs, so it does not close on idle.
    return this.admitting(() =>
      this.inSchedules(() => this.fireDueSchedules()),
    ).finally(() => this.armSchedules({ isRetry: true }))
  }

  /**
   * Each due schedule with an input offers the input, with the input id
   * `schedule:<scheduleId>`, to the input lane, and then writes its done
   * record. The store keeps each input id once: when a crash comes between
   * the two writes, the next owner offers the same input again, gets a
   * duplicate, and the input still runs once. A due wake (a `step.sleep`)
   * writes its done record, and the session recovers the run that waits.
   */
  private async fireDueSchedules() {
    const { writer } = this
    const now = Date.now()
    const due = [...writer.state.thread.schedules]
      .filter(([, schedule]) => schedule.at <= now)
      .sort(([, left], [, right]) => left.at - right.at)
    const isStopped = () =>
      this.closing !== undefined || this.logFailure !== undefined
    if (due.length === 0 || isStopped()) return
    if (!(await writer.own())) return
    let hasWake = false
    for (const [scheduleId, schedule] of due) {
      if (isStopped() || writer.fenced) return
      if (schedule.input) {
        const inputId = `schedule:${scheduleId}`
        const offered = await writer.offer(
          inputId,
          offeredInputRecord({
            inputId,
            input: schedule.input,
            user: schedule.user,
          }),
        )
        if (offered === 'conflict') {
          this.warnSession(
            'harness:schedules',
            `Schedule ${scheduleId} did not run: another input has the id ${inputId}.`,
          )
        }
      } else {
        hasWake = true
      }
      await writer.append([{ type: 'harness.schedule.done', scheduleId }])
    }
    if (hasWake) await this.recoverPendingWork()
    await this.drainOffers()
    // A schedule that started no work gives the log back.
    void writer.rest()
  }

  /**
   * The host gives the session its view of the log, and the session writes
   * through it: the log is the event feed, the transcript, and the runs and
   * interrupts. Then the session builds the stores that `withPersistence`
   * and the checkpoints get.
   */
  protected async openLog(): Promise<void> {
    const { stores } = this.persistence
    const writer = await this.log.open(this.threadId, {
      onFailure: (error) => this.stopOnLogFailure(error),
      onLost: () => this.stopOnOwnershipLoss(),
      // A background job of this host keeps the log too: a host that takes
      // the log over would note the job as stopped.
      isBusy: () =>
        !this.isIdle() || this.liveJobs.size > 0 || this.recovering > 0,
      // A sleep has a schedule, so its wake comes at its time.
      hasWorkNow: () =>
        (!this.isIdle() || this.liveJobs.size > 0 || this.recovering > 0) &&
        this.sleeping === 0,
      onOffers: () => void this.drainOffers(),
      // An event that another host wrote: the host status and the `onEvent`
      // listeners see it, as they see the events of this host at publish.
      onRemoteEvent: ({ operationId, event }) =>
        notifyListeners(
          this.notifyHost,
          this.eventListeners,
          { operationId, event },
          this.logger,
        ),
      // Records of another host: the settings, the config, and the
      // interrupted turn come from the new fold.
      onRemoteFold: () => this.syncFromLog(),
      // This host became the owner. The event goes in the next append.
      onOwned: (change) =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.ownershipChanged, { ...change }),
        ),
      redact: this.redactor.redact,
    })
    this.logWriter = writer
    this.feed = tapFeed(
      writer,
      this.notifyHost,
      this.eventListeners,
      this.redactor,
      this.logger,
    )
    // The child threads (agent chains and subagent runs) are in this log.
    const view = { writer }
    this.messages = sessionMessageStore(view)
    const engineMessages = engineMessageStore(view)
    this.openEngine = engineMessages
    const { runs, interrupts } = logChatStores(writer)
    this.logStores = { runs, interrupts }
    this.chatPersistence = {
      stores: {
        messages: engineMessages,
        runs,
        interrupts,
        ...(stores.metadata ? { metadata: stores.metadata } : {}),
        ...(stores.sessions ? { sessions: stores.sessions } : {}),
      },
    }
    // The `harness.tool.started` records are the running tools of a turn.
    this.checkpoint = checkpointMiddleware({
      messages: engineMessages,
      onToolStart: ({ toolCallId, name, replay }) =>
        writer.append([
          { type: 'harness.tool.started', toolCallId, name, replay },
        ]),
    })
    // The log keeps each finished tool result, so a crash later in the
    // batch does not lose it. It is the final result, after every plugin.
    this.toolRecorder = toolResultRecorder(({ toolCallId, message }) =>
      writer.append([{ type: 'harness.tool.result', toolCallId, message }]),
    )
  }

  /**
   * The log refused a write: another host wrote to this log, or the store
   * failed. The state of this session is not known any more, so it stops.
   * The next `host.open` folds the log again.
   */
  protected stopOnLogFailure(error: unknown): void {
    if (this.logFailure) return
    this.logFailure = new Error(
      error instanceof LogConflictError
        ? 'Another host wrote to this log, so this session stopped. Open the thread again.'
        : this.scrub(
            `The session log failed, so this session stopped: ${error instanceof Error ? error.message : String(error)}`,
          ),
    )
    for (const operation of this.operations.values()) {
      if (!operation.isSettled())
        operation.abortController.abort(this.logFailure)
    }
    // The feed closes with the session, so a failed plugin dispose has no one
    // to tell.
    this.close().catch(() => {})
  }

  /**
   * Another host took the log of this session. Its running work stops at
   * once, as on a crash: no later write of it lands, and the new owner runs
   * it again. Queued turns end. The session stays open and reads the log.
   * When the stopped work has ended (the session is idle), a later write
   * acquires the log again.
   */
  protected stopOnOwnershipLoss(): void {
    this.ownershipLoss = new Error(
      'Another host took this thread over, so this host stopped its work on it. The new owner runs that work. This session still reads the thread.',
    )
    for (const turn of this.queue.splice(0)) {
      turn.operation.fail('cancelled', this.ownershipLoss)
    }
    for (const operation of this.operations.values()) {
      if (!operation.isSettled()) {
        operation.abortController.abort(SHUTDOWN_REASON)
      }
    }
    // None of the inputs that this session took runs here now. A recovery
    // after this host gets the log back must take them again. The duplicate
    // check reads the log for the inputs that it stored.
    this.admitted.clear()
    // With no work that still ends, the session is idle now and unfences.
    queueMicrotask(() => this.checkIdle())
  }

  /**
   * The extras of a turn that recovery runs again: the JSON overrides,
   * preamble, and ephemeral messages that the log keeps, under the
   * overrides of the recover hook (`decided`). A turn that had overrides
   * that the log does not keep (an adapter object, tools) goes on without
   * them, and the session warns once.
   */
  protected recoveredExtras(
    inputId: string,
    decided: TurnOverrides | undefined,
  ) {
    const named = this.writer.state.thread.turnOverrides.get(inputId)
    if (named?.liveOnly) {
      this.warnSession(
        'harness:overrides',
        `The turn of input ${inputId} runs again without its ${named.liveOnly.join(' and ')} overrides: the log keeps only JSON overrides. Name the model with overrides.model to keep it.`,
      )
    }
    const logged = named ? loggedExtras(named) : {}
    const hasOverrides = decided !== undefined || logged.overrides !== undefined
    return {
      ...logged,
      ...(hasOverrides
        ? { overrides: { ...logged.overrides, ...decided } }
        : {}),
    }
  }

  /** The recovery decision for `input`: the hook's, or `decision`. */
  protected async recoverDecision(
    writer: LogWriter,
    input: InputState,
    decision: RecoverDecision,
    interruptedTools: RecoverContext['interruptedTools'] = [],
  ): Promise<RecoverDecision> {
    const recover = this.harness.durability?.recover
    if (!recover) return decision
    const answer = await recover({
      session: this.self(),
      input: {
        inputId: input.inputId,
        input: input.input,
        attempt: input.attempt,
        ...(input.timeoutAt !== undefined
          ? { timeoutAt: input.timeoutAt }
          : {}),
        abortRequested: input.abortRequested,
        ...(input.operationId ? { operationId: input.operationId } : {}),
        retries: input.retries ?? 0,
      },
      messages: [...writer.state.messages],
      interruptedTools,
      decision,
    })
    return answer ?? decision
  }

  /**
   * The part of a cut answer that the log has: the answer text and the
   * signed thinking blocks that operation `operationId` streamed after the
   * last transcript record. A thinking block with no signature, tool call
   * arguments, and agent events are not in it.
   */
  protected async cutOffAnswer(writer: LogWriter, operationId: string) {
    const from = writer.state.transcriptSeq
    let text = ''
    // By reasoning message id, in stream order.
    const blocks = new Map<string, { content: string; signature?: string }>()
    const block = (id: string) => {
      const found = blocks.get(id) ?? { content: '' }
      blocks.set(id, found)
      return found
    }
    for await (const { event } of writer.read({
      from: String(from),
      filter: (entry) => entry.operationId === operationId,
      until: () => true,
    })) {
      if ('subagentRunId' in event && event.subagentRunId) continue
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) text += event.delta
      if (event.type === EventType.REASONING_MESSAGE_CONTENT) {
        block(event.messageId).content += event.delta
      }
      if (
        event.type === EventType.REASONING_ENCRYPTED_VALUE &&
        event.subtype === 'message'
      ) {
        block(event.entityId).signature = event.encryptedValue
      }
    }
    // As the transcript keeps thinking: a redacted block has no text.
    const thinking = [...blocks].flatMap(([id, { content, signature }]) =>
      !signature
        ? []
        : id.startsWith(REDACTED_THINKING_ID_PREFIX)
          ? [{ content: '', signature, redacted: true }]
          : [{ content, signature }],
    )
    return { text, thinking }
  }

  /**
   * A `cancelInput` or `setDelivery` whose own record is in the log, but not
   * its change: a crash cut it. Apply it now, before any input runs. When
   * its input does not wait any more, reject it with `not_waiting`. Other
   * ops are not changed.
   */
  protected async recoverControl(writer: LogWriter, logged: InputState) {
    const { input } = logged
    if (input.op !== 'cancelInput' && input.op !== 'setDelivery') return
    const target = writer.state.inputs.get(input.inputId)
    const isWaiting = target?.status === 'pending' && 'message' in target.input
    if (!isWaiting) {
      this.reject(logged.inputId, 'not_waiting')
      return
    }
    await this.applyControl(
      logged.inputId,
      input.op === 'cancelInput'
        ? { type: 'harness.input.abort', inputId: input.inputId }
        : {
            type: 'harness.input.delivery',
            inputId: input.inputId,
            delivery: input.delivery,
          },
    )
  }

  /**
   * Recover a durable session from its log, input by input, in admission
   * order. Only the owner of the log recovers: while another host owns it,
   * recovery waits. A chat turn whose host stopped settles
   * `completed` when the log already has its final answer. Else it settles
   * `aborted` when an abort was asked, settles `failed` when no attempt or no
   * time is left, and else runs again as the next attempt. An agent run (a
   * first run or a follow-up run) whose host stopped runs again with
   * `runAgainAfterCrash: true`, else settles `failed` with the steers that joined it. A
   * message that waited for such a run goes to the run again, else settles
   * `aborted`. An input that never ran runs now. One that a `setDelivery`
   * sent to `steer` joins the turn that runs, when one does. A `cancelInput`
   * or `setDelivery` that a crash cut before it was applied applies first.
   * Other inputs are rejected with `expired_on_restart`. An input that this
   * session stored or took already is skipped, so `recoverPendingWork()` can run this
   * again.
   */
  protected async recoverFromLog(writer: LogWriter): Promise<void> {
    // The owner of the log decides. A host that gets it knows that no other
    // host runs these inputs: the last owner stopped or gave the log up.
    // While another host owns it, its work is alive, and recovery waits.
    // A log with nothing to recover is not acquired: a reader owns nothing.
    const hasWork = [...writer.state.inputs.values()].some(
      (input) =>
        (input.status === 'pending' || input.status === 'applied') &&
        !this.admitted.has(input.inputId),
    )
    if (hasWork && !(await writer.own())) {
      this.recoveryDeferred = true
      return
    }
    // True for an input that this session stored or took. Else the session
    // takes it now, so `recoverPendingWork()` does not take it again.
    const taken: Array<string> = []
    const isTaken = (input: InputState) => {
      if (this.admitted.has(input.inputId)) return true
      this.admitted.set(input.inputId, inputKey(input.input, input.user))
      taken.push(input.inputId)
      return false
    }
    // The host keeps the log until recovery queued its work.
    this.recovering += 1
    // A span only when inputs of a host that stopped wait for this host.
    const span = hasWork
      ? this.tracing?.span('harness.recovery', {})
      : undefined
    try {
      try {
        await this.recoverInputs(writer, isTaken)
      } catch (error) {
        this.tracing?.safely(() => {
          span?.recordException(error instanceof Error ? error : String(error))
          span?.setStatus({ code: 2 })
        })
        // Not recovered, so the next `recoverPendingWork()` takes them again.
        for (const inputId of taken) {
          if (!this.turnOperations.has(inputId)) this.admitted.delete(inputId)
        }
        throw error
      }
      // After the turns are decided: a note must not end the transcript
      // that a cut turn continues.
      await this.recoverBackground(writer)
      // The waits that expired, and the live waits of a host that stopped.
      await this.endStaleWaits()
      await this.endOrphanChildWaits()
      await this.expireInterrupted()
      // The agent runs whose waits ended while no host could resume them.
      await this.resumeWaitingRuns()
    } finally {
      this.recovering -= 1
      this.tracing?.safely(() => span?.end())
      // A recovery that left no work gives the log back.
      void writer.rest()
    }
  }

  private async recoverInputs(
    writer: LogWriter,
    isTaken: (input: InputState) => boolean,
  ): Promise<void> {
    const runs = this.runStore
    const maxAttempts = this.harness.durability?.maxAttempts ?? 10
    const logged = [...writer.state.inputs.values()]
    for (const input of logged) {
      const isControl =
        input.status === 'pending' && CONTROL_OPS.has(input.input.op)
      if (isControl && !isTaken(input)) await this.recoverControl(writer, input)
    }
    // Read again: the pass above changed the inputs it applied to.
    const inputs = [...writer.state.inputs.values()]
    for (const input of inputs) {
      // A reset that did not settle applies now. Its marker goes in once.
      if (input.input.op === 'reset') {
        const isOpen =
          (input.status === 'pending' || input.status === 'applied') &&
          !isTaken(input)
        if (isOpen && input.abortRequested) {
          await this.settle({ inputId: input.inputId, outcome: 'aborted' })
        } else if (isOpen) {
          this.queueReset(input.inputId, input.input.note, input.user, 'end')
        }
        continue
      }
      // A command that the host stopped during: no host runs it again,
      // unless it asked in a `step.ask`. Then it runs again from the top.
      if (input.input.op === 'command' && input.status === 'applied') {
        if (isTaken(input)) continue
        const prefix = stepWaitPrefix(commandStepScope(input.inputId))
        const hasAsked = [...writer.state.thread.waits.keys()].some((waitId) =>
          waitId.startsWith(prefix),
        )
        const isReplayed =
          hasAsked &&
          this.replayCommand({
            inputId: input.inputId,
            name: input.input.name,
            input: input.input.input,
            user: input.user,
          })
        if (isReplayed) continue
        await this.settle({
          inputId: input.inputId,
          ...(input.operationId ? { operationId: input.operationId } : {}),
          outcome: 'failed',
          error: { message: 'The host stopped during this command.' },
        })
        continue
      }
      const isChat = CHAT_OPS.has(input.input.op)
      if (input.status === 'pending') {
        // The pass above handled a control input.
        if (CONTROL_OPS.has(input.input.op) || isTaken(input)) continue
        // A message to an agent run goes to the run that recovery continues.
        // That run's input is older, so its chain exists here.
        if (input.input.op === 'agentMessage') {
          const chain = this.agentChains.get(input.input.run ?? '')
          if (chain) {
            this.deliver(
              chain,
              {
                inputId: input.inputId,
                message: input.input.message,
                ...(input.user ? { user: input.user } : {}),
              },
              input.input.mode ?? 'steer',
            )
          } else {
            // ponytail: a follow-up that waited for a run that had ended when
            // the host stopped settles aborted too. Start it from the chain
            // in the log if an app needs it.
            await this.settle({ inputId: input.inputId, outcome: 'aborted' })
          }
          continue
        }
        // An agent start that no agent code made never ran: a top-level
        // start waited for a slot, or the host stopped first. It runs now, in
        // log order. A child of a turn runs as that child, also with
        // `resumeBackgroundAgents: false`: it never ran, so nothing runs
        // twice. A cancel that was asked before settles it aborted.
        if (isAgentInput(input) && input.input.parentRunId === undefined) {
          const queued = [...writer.state.thread.tree.values()].find(
            (node) =>
              node.inputId === input.inputId && node.status === 'queued',
          )
          if (input.abortRequested) {
            await this.settle({
              inputId: input.inputId,
              ...(queued ? { operationId: queued.runId } : {}),
              outcome: 'aborted',
            })
          } else {
            this.startQueuedAgent(input)
          }
          continue
        }
        if (
          !isChat ||
          !(
            'message' in input.input ||
            input.input.op === 'continue' ||
            input.input.op === 'tool'
          )
        ) {
          this.reject(input.inputId, 'expired_on_restart')
          continue
        }
        // An input that was cancelled before it ran settles aborted.
        const decision = await this.recoverDecision(
          writer,
          input,
          input.abortRequested
            ? { action: 'settle', outcome: 'aborted' }
            : { action: 'run' },
        )
        if (decision.action === 'settle') {
          const { action: _action, ...outcome } = decision
          await this.settle({ inputId: input.inputId, ...outcome })
          continue
        }
        if (input.input.op === 'continue') {
          // It runs from the transcript, as `continueWithoutMessage()` does.
          const operation = this.createTurnOperation()
          this.bindTurn(input.inputId, operation)
          this.enqueueTurn({
            operation,
            inputId: input.inputId,
            user: input.user,
            context: input.input.context,
            ...this.recoveredExtras(input.inputId, decision.overrides),
            isContinue: true,
          })
          continue
        }
        if (input.input.op === 'tool') {
          const { name, args, meta } = input.input
          const operation = this.createTurnOperation()
          this.bindTurn(input.inputId, operation)
          this.enqueueTurn({
            operation,
            inputId: input.inputId,
            user: input.user,
            tool: { name, args, ...(meta ? { meta } : {}) },
          })
          continue
        }
        if (input.input.op === 'prompt' && input.input.as === 'operator') {
          // An operator reply runs no model, as `send` does.
          const operation = this.createTurnOperation()
          this.bindTurn(input.inputId, operation)
          this.enqueueTurn({
            operation,
            inputId: input.inputId,
            user: input.user,
            message: input.input.message,
            operator: true,
          })
          continue
        }
        const steer: WaitingSteer = {
          inputId: input.inputId,
          message: input.input.message,
          user: input.user,
          context: input.input.context,
          ...this.recoveredExtras(input.inputId, decision.overrides),
          ...(input.input.op === 'followUp' && input.input.wake
            ? { wake: true }
            : {}),
        }
        // Else it runs as its own turn, as `steer()` does when no turn runs.
        if (input.delivery === 'steer' && this.activeTurn) {
          this.steerQueue.push(steer)
          continue
        }
        this.enqueueTurn(this.steerTurn(steer))
        continue
      }
      // An agent run: a first run, or a follow-up run of its chain.
      const first = chainInputOf(writer.state.inputs, input)
      if (input.status !== 'applied' || !(isChat || first)) continue
      // This host owns the log (see `recoverFromLog`), so no other host
      // drives this turn.
      if (isTaken(input)) continue
      const run = input.operationId ? await runs.get(input.operationId) : null
      const now = Date.now()
      if (first) {
        // A run that waits for answers waits on here. A crash after the run
        // store marked it `interrupted` and before its waits landed leaves
        // nothing to answer: that run stopped, as a running one.
        const hasWaits = [...writer.state.thread.waits.values()].some(
          ({ wait }) => wait.runId === input.operationId,
        )
        if (run?.status === 'interrupted' && hasWaits) {
          this.adoptWaitingRun(input, first, run)
          continue
        }
        // A run that ended before its settle record landed did not stop.
        if (!run || run.status === 'running' || run.status === 'interrupted') {
          const isResumable = first.input.runAgainAfterCrash === true
          // `limits.maxAttempts` of the run wins over the harness's.
          const runMax =
            writer.state.thread.tree.get(input.operationId ?? '')?.limits
              ?.maxAttempts ?? maxAttempts
          if (isResumable && input.attempt < runMax) {
            if (input.operationId) {
              await runs.update(input.operationId, {
                status: 'failed',
                finishedAt: now,
                error: {
                  message:
                    'The host stopped. The session continued this agent run in a new run.',
                },
              })
            }
            // A stop before the run record leaves the child id in the node.
            this.resumeAgent(
              input,
              first,
              run?.subagentRunId ??
                writer.state.thread.tree.get(input.operationId ?? '')
                  ?.subagentRunId,
            )
            continue
          }
          await this.failStoppedAgent({
            operationId: appliedOperationId(input),
            agent: first.input.agent,
            inputId: input.inputId,
            wake: first.input.detached,
            ...(input.user ? { user: input.user } : {}),
            ...(isResumable
              ? {
                  error: {
                    message: `The agent run stopped the host ${input.attempt} times.`,
                    code: 'attempts_exhausted',
                  },
                }
              : {}),
          })
        }
        continue
      }
      if (run?.status === 'running') {
        await runs.update(run.runId, {
          status: 'failed',
          finishedAt: now,
          error: { message: 'The host stopped during this turn.' },
        })
      }
      const operationId = appliedOperationId(input)
      // The inputs that joined this turn settle with it, in one append.
      const joined = this.joinedInputs(operationId, input.inputId)
      const ended = (settlement: SettlementOutcome) =>
        this.settle(
          ...[input.inputId, ...joined].map((inputId) => ({
            inputId,
            ...(operationId ? { operationId } : {}),
            ...settlement,
          })),
        )
      // A final answer in the log comes first: the turn ended.
      const fallback: RecoverDecision = hasFinalAnswer(
        writer.state.messages,
        input.appliedAt ?? 0,
      )
        ? { action: 'settle', outcome: 'completed' }
        : input.abortRequested
          ? { action: 'settle', outcome: 'aborted' }
          : input.attempt >= maxAttempts
            ? {
                action: 'settle',
                outcome: 'failed',
                error: {
                  message: `The input stopped the host ${input.attempt} times.`,
                  code: 'attempts_exhausted',
                },
              }
            : input.timeoutAt !== undefined && now >= input.timeoutAt
              ? {
                  action: 'settle',
                  outcome: 'failed',
                  error: {
                    message: 'The input passed its time limit.',
                    code: 'timeout',
                  },
                }
              : { action: 'run' }
      const pending = [...writer.state.started]
        .filter(([toolCallId]) => !writer.state.toolResults.has(toolCallId))
        .map(([toolCallId, tool]) => ({ toolCallId, ...tool }))
      // Before the decision, so the hook has it when it settles the input. A
      // resolve repairs nothing.
      const interruptedTools =
        input.input.op === 'resolve'
          ? []
          : repairSteps(
              writer.state.messages,
              pending,
              writer.state.toolResults,
            ).filter((step) => 'reason' in step)
      const decision = await this.recoverDecision(
        writer,
        input,
        fallback,
        interruptedTools,
      )
      if (decision.action === 'settle') {
        const { action: _action, ...outcome } = decision
        await ended(outcome)
        continue
      }
      if (input.input.op === 'resolve') {
        const { resume } = input.input
        const store = this.interruptStore
        const records = await Promise.all(
          resume.map((item) => store.get(item.interruptId)),
        )
        const newPhase =
          this.interrupted && this.interrupted.runId === operationId
        // The tools of the resume ran, and the log failed before their
        // resolve records landed. They are used up all the same, so they
        // never run twice.
        const isRunOut =
          !newPhase &&
          resume.length > 0 &&
          resume.every((item) => {
            const interrupt = this.interrupted?.interrupts.find(
              (candidate) => candidate.id === item.interruptId,
            )
            const toolCallId = interrupt ? toolCallOf(interrupt) : undefined
            return toolCallId !== undefined && hasToolResult(writer, toolCallId)
          })
        if (isRunOut) {
          await this.consumeResume(resume)
          this.dropInterrupts(resume)
          await this.saveInterrupted(this.interrupted)
        }
        const consumed =
          isRunOut ||
          (records.length > 0 &&
            records.every(
              (record) =>
                record !== null &&
                record.threadId === this.threadId &&
                record.status !== 'pending',
            ))
        if (
          consumed ||
          newPhase ||
          (!this.interrupted && run?.status === 'completed')
        ) {
          await ended({
            outcome: this.interrupted ? 'interrupted' : 'completed',
          })
          continue
        }
        if (!this.interrupted) {
          await ended({
            outcome: 'failed',
            error: { message: 'The interrupted turn is no longer available.' },
          })
          continue
        }
        const operation = this.createTurnOperation()
        this.bindTurn(input.inputId, operation)
        this.feed.publish(
          operation.id,
          customEvent(HARNESS_EVENTS.operationResumed, {
            operationId: operation.id,
            ...(operationId ? { resumedFrom: operationId } : {}),
          }),
        )
        // The same turn as a live `resolve()`: it answers the stopped turn,
        // as the sender of the stopped turn, with its context.
        this.enqueueTurn({
          operation,
          inputId: input.inputId,
          resume: input.input.resume,
          answers: this.interrupted,
          user: this.interrupted.user ?? input.user,
          context: this.interrupted.context,
          ...this.recoveredExtras(input.inputId, decision.overrides),
        })
        continue
      }
      // Before the repair, which can write a transcript record.
      const cutOff = this.harness.durability?.continueCutOff
      const partial =
        cutOff && operationId
          ? await this.cutOffAnswer(writer, operationId)
          : undefined
      await repairTranscript({
        messages: this.messages,
        threadId: this.threadId,
        pending,
        finished: writer.state.toolResults,
        interrupted: this.harness.durability?.interruptedToolResult,
        truncated: this.harness.durability?.truncatedToolResult,
      })
      if (partial && (partial.text !== '' || partial.thinking.length > 0)) {
        const history = await this.messages.loadThread(this.threadId)
        const notes = [
          (typeof cutOff === 'object' && cutOff.note) || CUT_OFF_NOTE,
        ].flat()
        // One append, so the transcript never ends with the cut answer.
        await this.messages.saveThread(this.threadId, [
          ...history,
          {
            id: createMessageId(),
            role: 'assistant',
            content: partial.text || null,
            ...(partial.thinking.length > 0
              ? { thinking: partial.thinking }
              : {}),
          },
          ...notes.map(
            (content): ModelMessage => ({
              id: createMessageId(),
              role: 'user',
              content,
            }),
          ),
        ])
      }
      const operation = this.createTurnOperation()
      this.bindTurn(input.inputId, operation)
      this.feed.publish(
        operation.id,
        customEvent(HARNESS_EVENTS.operationResumed, {
          operationId: operation.id,
          ...(operationId ? { resumedFrom: operationId } : {}),
        }),
      )
      // The transcript has the message, so the turn adds none. Plugins and
      // the router still get what the input sent.
      const sent = input.input
      this.enqueueTurn({
        operation,
        inputId: input.inputId,
        user: input.user,
        ...('message' in sent ? { sentMessage: sent.message } : {}),
        ...('context' in sent ? { context: sent.context } : {}),
        // An operator reply runs no model.
        ...(sent.op === 'prompt' && sent.as === 'operator'
          ? { operator: true }
          : {}),
        ...this.recoveredExtras(input.inputId, decision.overrides),
      })
    }
  }
}

/** How long a schedule that could not run waits before the next try. */
const SCHEDULE_RETRY_MS = 1_000

/** A new schedule id. */
function createScheduleId() {
  return `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Does the log have the result of tool call `toolCallId`: a stored result,
 * or a tool message in the transcript? Then the call ran to its end.
 */
function hasToolResult(writer: LogWriter, toolCallId: string) {
  const { toolResults, messages } = writer.state
  return (
    toolResults.has(toolCallId) ||
    messages.some(
      (message) => message.role === 'tool' && message.toolCallId === toolCallId,
    )
  )
}

/**
 * The operation of an input that the log says was applied. An applied record
 * always names one: a missing id is a corrupt log, not an empty operation.
 */
function appliedOperationId(input: InputState): string {
  if (input.operationId === undefined) {
    throw new Error(
      `The log has an applied input "${input.inputId}" with no operation id.`,
    )
  }
  return input.operationId
}

/**
 * `error` without the secrets of `session`, when it is a session of this
 * package. Else the same `error`: a code path with no session leaves it.
 */
export const scrubbedBy = (session: unknown, error: unknown): unknown =>
  session instanceof SessionImpl ? session.scrubError(error) : error
