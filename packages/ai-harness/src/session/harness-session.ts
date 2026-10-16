import { EventType } from '@tanstack/ai'
import { REDACTED_THINKING_ID_PREFIX } from '@tanstack/ai/adapter-internals'
import { LogConflictError } from '@tanstack/ai-persistence'
import { engineMessageStore, revertOf, sessionMessageStore } from '../log'
import { mountPlugins } from '../plugins'
import {
  CUT_OFF_NOTE,
  checkpointMiddleware,
  findCrashedRuns,
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
  CHAT_OPS,
  CONTROL_OPS,
  hasFinalAnswer,
  tapFeed,
} from './helpers'
import { SessionTurn } from './turn'
import type { ModelMessage } from '@tanstack/ai'
import type { InboxEntry } from '@tanstack/ai-persistence'
import type { InputState, LogWriter } from '../log'
import type { AnyHarness } from '../define'
import type { RecoverContext, RecoverDecision } from '../turn'
import type { HarnessInput, SettlementOutcome } from '../types'
import type { WaitingSteer } from './types'

/**
 * A live harness session: one conversation (`threadId`) with its plugins,
 * operations, inbox, and event stream. Open one with `host.open()`.
 */
export interface HarnessSession<
  THarness extends AnyHarness = AnyHarness,
> extends Omit<
  SessionImpl<THarness>,
  // The public members that only the host calls.
  'open' | 'adoptFork' | 'onIdle'
> {}

/**
 * The session class. The package does not export it: apps get the
 * {@link HarnessSession} type from `host.open()`.
 */
export class SessionImpl<
  THarness extends AnyHarness = AnyHarness,
> extends SessionTurn<THarness> {
  /** This session, typed as the public type, for the hooks of each layer. */
  protected override self(): HarnessSession<THarness> {
    return this
  }

  /** @internal Mount session plugins and replay inputs left in the inbox. */
  async open(): Promise<void> {
    // First: plugins publish events while they mount.
    await this.openLog()
    try {
      await this.mountSessionPlugins()
      await this.loadSettings()
      this.reverted = this.writer
        ? this.writer.state.revert
        : revertOf(
            await this.persistence.stores.metadata?.get(
              'harness:revert',
              this.threadId,
            ),
          )
      await this.loadInterrupted()
      // Before recovery: a turn that recovery runs updates this entry.
      await this.openEntry()
      if (this.writer) {
        await this.recoverFromLog(this.writer)
        // Inputs that waited for an owner that stopped.
        void this.drainInbox()
        return
      }
      await this.loadUsage()
      await this.recoverCrashedTurn()
      await this.recoverInbox()
    } catch (error) {
      // A session that fails to open stops what it started: the plugins, the
      // claim timer, and the turns that recovery queued or runs. It stops
      // them as on a crash, so the next open runs them again. It gives its
      // log view back, so the thread can open again.
      await this.close({ recoverable: true }).catch(() => {})
      throw error
    }
  }

  /** Also waits for the last append of the log, so a reopen reads it. */
  override async close(options?: { recoverable?: boolean }): Promise<void> {
    await super.close(options)
    // A recovery in flight queues turns after the stop: wait for it, then
    // drop what it queued.
    await this.recovery
    for (const turn of this.queue.splice(0)) {
      turn.operation.fail('cancelled', new Error('Session closed.'))
    }
    await this.writer
      ?.flush()
      .catch((error: unknown) =>
        console.error('[@tanstack/ai-harness] The log flush failed.', error),
      )
  }

  /** Read `harness.plugins()` and set up its session plugins. */
  protected async mountSessionPlugins(): Promise<void> {
    this.plugins = this.harness.plugins?.() ?? []
    this.sessionPlugins = await mountPlugins(
      this.plugins.filter(
        (plugin) => (plugin.lifetime ?? 'session') === 'session',
      ),
      {
        threadId: this.threadId,
        registry: this.agentRegistry,
        harnessTools: this.harness.tools ?? [],
        harnessProvides: (this.harness.middleware ?? []).flatMap(
          (middleware) => middleware.provides ?? [],
        ),
        services: this.services,
        inherited: this.storeCapabilities(),
      },
    )
    await this.loadConfig()
    await this.loadPluginState()
  }

  /**
   * Tear the plugins down and set them up again, with the list that
   * `harness.plugins()` gives now. It waits for the running turn, and no new
   * turn starts until it ends. The transcript, the log, the thread settings,
   * and the inbox stay. Clients get a `harness.reloaded` event.
   *
   * When the new setup throws, the session keeps working with no plugins,
   * and the promise rejects with the error. Call `reload()` again after a
   * fix.
   *
   * @example
   * ```ts
   * await session.reload()
   * ```
   */
  reload(): Promise<void> {
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
   * Recover the work in the log again, as `open()` does. `open()` skips a
   * turn while another host holds its lease. Call this after that lease
   * expires, and the turn runs here. The work that this session runs or
   * queues stays as it is. A session without `stores.log` does nothing.
   *
   * @example
   * ```ts
   * await session.recover()
   * ```
   */
  recover(): Promise<void> {
    const { writer } = this
    if (!writer || this.closing) return Promise.resolve()
    const run = this.recovery.then(async () => {
      // First the records that other hosts wrote since this session read.
      await writer.catchUp()
      if (this.logFailure) throw this.logFailure
      // close() ran while catchUp waited: nothing resumes.
      if (this.closing) return
      await this.recoverFromLog(writer)
    })
    this.recovery = run.catch(() => {})
    return run
  }

  /**
   * A durable host gives the session its view of the log, and the session
   * writes through it: the log is the event feed and the transcript. Then
   * both modes build the stores that `withPersistence` and the checkpoints
   * get.
   */
  protected async openLog(): Promise<void> {
    const { stores } = this.persistence
    if (this.log) {
      const { store, project } = this.log
      this.writer = await this.log.open(this.threadId, (error) =>
        this.stopOnLogFailure(error),
      )
      this.feed = tapFeed(this.writer, this.notifyHost, this.eventListeners)
      const view = {
        writer: this.writer,
        store,
        ...(project ? { project } : {}),
      }
      this.messages = sessionMessageStore(view)
      this.engine = engineMessageStore(view)
    }
    const engineMessages = this.engine ?? this.messages
    this.chatPersistence = {
      stores: {
        messages: engineMessages,
        ...(stores.runs ? { runs: stores.runs } : {}),
        ...(stores.interrupts ? { interrupts: stores.interrupts } : {}),
        ...(stores.metadata ? { metadata: stores.metadata } : {}),
        ...(stores.sessions ? { sessions: stores.sessions } : {}),
      },
    }
    const { writer } = this
    this.checkpoint = checkpointMiddleware({
      ...(stores.runs ? { runs: stores.runs } : {}),
      messages: engineMessages,
      hostId: this.hostId,
      ...(this.lease ? { lease: this.lease } : {}),
      // A durable host keeps each finished tool result, so a crash later in
      // the batch does not lose it.
      ...(writer
        ? {
            onToolStart: ({ toolCallId, name, replay }) =>
              writer.append([
                { type: 'harness.tool.started', toolCallId, name, replay },
              ]),
            onToolResult: ({ toolCallId, message }) =>
              writer.append([
                { type: 'harness.tool.result', toolCallId, message },
              ]),
          }
        : {}),
    })
    if (writer) {
      this.bindTool = (toolCallId) => this.durableBinding(writer, toolCallId)
    }
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
   * Continue the newest chat turn that a crashed host left running. Older
   * crashed turns are marked failed, and so are crashed agent runs.
   */
  protected async recoverCrashedTurn(): Promise<void> {
    const runs = await findCrashedRuns(
      this.persistence.stores.runs,
      this.threadId,
    )
    for (const run of runs.filter((record) => record.kind === 'agent')) {
      await this.failStoppedAgent({
        operationId: run.runId,
        agent: run.agent ?? 'agent',
      })
    }
    const crashed = runs.filter((record) => record.kind !== 'agent')
    const newest = crashed.sort((a, b) => b.startedAt - a.startedAt)[0]
    for (const record of crashed) {
      await this.persistence.stores.runs?.update(record.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: {
          message:
            record === newest
              ? 'The host stopped. The session continued this turn in a new run.'
              : 'The host stopped during this turn.',
        },
      })
    }
    if (!newest || this.interrupted) return
    await repairTranscript({
      messages: this.messages,
      threadId: newest.threadId,
      pending: newest.checkpoint?.pendingTools ?? [],
      interrupted: this.harness.durability?.interruptedToolResult,
      truncated: this.harness.durability?.truncatedToolResult,
    })
    const operation = this.createTurnOperation()
    this.feed.publish(
      operation.id,
      customEvent(HARNESS_EVENTS.operationResumed, {
        operationId: operation.id,
        resumedFrom: newest.runId,
      }),
    )
    this.enqueueTurn({ operation })
  }

  /** Re-run turns that were accepted but never applied before a restart. */
  protected async recoverInbox(): Promise<void> {
    const pending: Array<InboxEntry> = await this.inbox.listPending(
      this.threadId,
    )
    for (const entry of pending) {
      const input = entry.input as HarnessInput
      if (
        input.op === 'prompt' ||
        input.op === 'followUp' ||
        input.op === 'steer'
      ) {
        const operation = this.createTurnOperation()
        this.admitted.set(entry.inputId, inputKey(input, entry.principal))
        this.bindTurn(entry.inputId, operation)
        this.enqueueTurn({
          operation,
          message: input.message,
          inputId: entry.inputId,
          principal: entry.principal,
          context: input.context,
          ...(input.op === 'followUp' && input.wake ? { wake: true } : {}),
        })
      } else if (input.op === 'tool') {
        const operation = this.createTurnOperation()
        this.admitted.set(entry.inputId, inputKey(input, entry.principal))
        this.bindTurn(entry.inputId, operation)
        this.enqueueTurn({
          operation,
          inputId: entry.inputId,
          principal: entry.principal,
          tool: {
            name: input.name,
            args: input.args,
            ...(input.meta ? { meta: input.meta } : {}),
          },
        })
      } else if (input.op === 'reset') {
        this.queueReset(entry.inputId, input.note, entry.principal, 'end')
      } else {
        this.reject(entry.inputId, 'expired_on_restart')
      }
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
    if (from === undefined) return { text: '', thinking: [] }
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
   * order. A chat turn whose host stopped (its run lease expired) settles
   * `completed` when the log already has its final answer. Else it settles
   * `aborted` when an abort was asked, settles `failed` when no attempt or no
   * time is left, and else runs again as the next attempt. An agent run (a
   * first run or a follow-up run) whose host stopped runs again with
   * `resume: true`, else settles `failed` with the steers that joined it. A
   * message that waited for such a run goes to the run again, else settles
   * `aborted`. An input that never ran runs now. One that a `setDelivery`
   * sent to `steer` joins the turn that runs, when one does. A `cancelInput`
   * or `setDelivery` that a crash cut before it was applied applies first.
   * Other inputs are rejected with `expired_on_restart`. An input that this
   * session stored or took already is skipped, so `recover()` can run this
   * again.
   */
  protected async recoverFromLog(writer: LogWriter): Promise<void> {
    // A live owner runs its own inputs, also one that has no run lease yet.
    // A sweep recovers them after its claim expires.
    if (await this.isOwnedElsewhere()) {
      this.recoveryDeferred = true
      return
    }
    // True for an input that this session stored or took. Else the session
    // takes it now, so `recover()` does not take it again.
    const taken: Array<string> = []
    const isTaken = (input: InputState) => {
      if (this.admitted.has(input.inputId)) return true
      this.admitted.set(input.inputId, inputKey(input.input, input.principal))
      taken.push(input.inputId)
      return false
    }
    try {
      await this.recoverInputs(writer, isTaken)
    } catch (error) {
      // Not recovered, so the next `recover()` takes them again.
      for (const inputId of taken) {
        if (!this.turnOperations.has(inputId)) this.admitted.delete(inputId)
      }
      throw error
    }
    // After the turns are decided: a note must not end the transcript that
    // a cut turn continues.
    await this.recoverBackground(writer)
  }

  private async recoverInputs(
    writer: LogWriter,
    isTaken: (input: InputState) => boolean,
  ): Promise<void> {
    const runs = this.persistence.stores.runs
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
          this.queueReset(
            input.inputId,
            input.input.note,
            input.principal,
            'end',
          )
        }
        continue
      }
      // A command that the host stopped during: no host runs it again.
      if (input.input.op === 'command' && input.status === 'applied') {
        if (isTaken(input)) continue
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
                ...(input.principal ? { principal: input.principal } : {}),
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
          // It runs from the transcript, as `continue()` does.
          const operation = this.createTurnOperation()
          this.bindTurn(input.inputId, operation)
          this.enqueueTurn({
            operation,
            inputId: input.inputId,
            principal: input.principal,
            context: input.input.context,
            overrides: decision.overrides,
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
            principal: input.principal,
            tool: { name, args, ...(meta ? { meta } : {}) },
          })
          continue
        }
        const steer: WaitingSteer = {
          inputId: input.inputId,
          message: input.input.message,
          principal: input.principal,
          context: input.input.context,
          overrides: decision.overrides,
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
      const leases = this.persistence.stores.leases
      const run = input.operationId ? await runs?.get(input.operationId) : null
      const now = Date.now()
      // A host lease store decides when there is one. Else the run lease does.
      const isAlive =
        leases && input.operationId
          ? await leases.isAlive({
              threadId: this.threadId,
              inputId: input.inputId,
              operationId: input.operationId,
              attempt: input.attempt,
            })
          : run?.status === 'running' &&
            run.leaseExpiresAt !== undefined &&
            run.leaseExpiresAt >= now
      // Another host still drives this turn.
      if (isAlive || isTaken(input)) continue
      if (first) {
        // A run that ended before its settle record landed did not stop.
        if (!run || run.status === 'running') {
          const isResumable = first.input.resume === true
          if (isResumable && input.attempt < maxAttempts) {
            if (input.operationId) {
              await runs?.update(input.operationId, {
                status: 'failed',
                finishedAt: now,
                error: {
                  message:
                    'The host stopped. The session continued this agent run in a new run.',
                },
              })
            }
            this.resumeAgent(input, first)
            continue
          }
          await this.failStoppedAgent({
            operationId: appliedOperationId(input),
            agent: first.input.agent,
            inputId: input.inputId,
            wake: first.input.detached,
            ...(input.principal ? { principal: input.principal } : {}),
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
        await runs?.update(run.runId, {
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
      const pending = [
        ...(run?.checkpoint?.pendingTools ?? []),
        ...[...writer.state.started]
          .filter(([toolCallId]) => !writer.state.toolResults.has(toolCallId))
          .map(([toolCallId, tool]) => ({ toolCallId, ...tool })),
      ]
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
        const store = this.persistence.stores.interrupts
        const records = store
          ? await Promise.all(
              input.input.resume.map((item) => store.get(item.interruptId)),
            )
          : []
        const consumed =
          records.length > 0 &&
          records.every(
            (record) =>
              record !== null &&
              record.threadId === this.threadId &&
              record.status !== 'pending',
          )
        const newPhase =
          this.interrupted && this.interrupted.runId === operationId
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
        // as the input's sender, with the context of the stopped turn.
        this.enqueueTurn({
          operation,
          inputId: input.inputId,
          resume: input.input.resume,
          answers: this.interrupted,
          principal: input.principal,
          context: this.interrupted.context,
          overrides: decision.overrides,
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
        principal: input.principal,
        ...('message' in sent ? { sentMessage: sent.message } : {}),
        ...('context' in sent ? { context: sent.context } : {}),
        overrides: decision.overrides,
      })
    }
  }
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
