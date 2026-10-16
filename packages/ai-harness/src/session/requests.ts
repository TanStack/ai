import { RUN_CANCEL_REASON } from '@tanstack/ai'
import { changedEntry } from '../session-entry'
import { OperationImpl } from '../operation'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  signInConnector,
  createInputId,
  customEvent,
  errorText,
  inputKey,
  SHUTDOWN_REASON,
  isElsewhere,
} from './helpers'
import { SessionState } from './state'
import type {
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type { PluginSessionApi, Question } from '../commands'
import type { AnyHarness, HarnessToolInput, HarnessToolsOf } from '../define'
import type {
  AgentSendOptions,
  ChatTurnResult,
  HarnessInput,
  Operation,
  Principal,
  Receipt,
  SendOptions,
  TurnOverrides,
  UserInput,
  WaitingInput,
} from '../types'
import type { QueuedTurn, WaitingSteer } from './types'
import type { Admission } from './inputs'

/**
 * A layer of {@link HarnessSession}: prompt, steer, follow-up, continue, reset,
 * resolve, and cancel.
 */
export abstract class SessionRequests<
  THarness extends AnyHarness = AnyHarness,
> extends SessionState<THarness> {
  // ===========================
  // Inputs
  // ===========================

  /**
   * Send a message to the session, or to one of its agent runs.
   *
   * `mode` is how it runs. `'prompt'` (default) starts a chat turn, or
   * queues it while one runs (see `busy`). `'steer'` adds it to the running
   * turn at its next model call, and the operation ends with that turn.
   * With no turn running, it runs as its own turn. `'followUp'` runs a turn
   * after all current work.
   *
   * `to` is the operation id of an agent run. The message goes to that run,
   * as `AgentRun.send` does: a steer waits for the run's next model call, a
   * follow-up runs the agent again after the run ends. The operation ends
   * with the run that gets the message. An unknown run, or one that another
   * host runs, is rejected with `'not_running'`.
   *
   * `inputId` is an id you choose. A second send with the same id and the
   * same message returns the first input's operation and does not run again.
   * The same id with another message is rejected with `'conflict'`.
   * `await operation.receipt` resolves when the input is stored.
   *
   * `overrides` changes the adapter, reasoning, prompt cache, or tools of
   * this turn only (see `TurnOverrides`). A steer that joins the running
   * turn uses the overrides of that turn, and its own are ignored.
   *
   * `principal` is who sent the message. Default: the principal that opened
   * the session. The log keeps it, and the turn runs with its credentials
   * and provider keys. A steer that joins the running turn runs with the
   * credentials of that turn's sender.
   *
   * `context` is JSON data from the client, stored with the input. Tools
   * get it in their context (see `HarnessConfig.context`). Do not trust it.
   *
   * `ephemeral` are messages that each model call of this turn gets, after
   * the transcript and the new user message, before the messages that the
   * turn adds (answers, tool results, steers). No store keeps them: not the
   * transcript, and not the log. Like `overrides`, they are not part of the
   * input: the `inputId` duplicate check does not read them, so a retry with
   * other ephemeral messages gets the first input's operation and its own
   * are dropped. A turn that recovery runs again has none. A steer that joins
   * the running turn ignores them.
   *
   * `systemPreamble` are system prompts that this turn gets ahead of the
   * harness prompts, for example memory that the host adds. They are kept
   * like `overrides`: in memory only, and only from server code. A client
   * input cannot set them.
   */
  send(message: UserInput, options: AgentSendOptions): Operation<unknown>
  send(message: UserInput, options?: SendOptions): Operation<ChatTurnResult>
  send(
    message: UserInput,
    options?: SendOptions | AgentSendOptions,
  ): Operation<unknown> {
    if (options?.to !== undefined) return this.sendToRun(message, options)
    const context = options?.context
    const mode = options?.mode ?? 'prompt'
    const input: HarnessInput =
      mode === 'prompt'
        ? {
            op: 'prompt',
            message,
            busy: options?.busy ?? this.harness.busy ?? 'queue',
            ...(context !== undefined ? { context } : {}),
          }
        : mode === 'steer'
          ? {
              op: 'steer',
              message,
              ...(context !== undefined ? { context } : {}),
            }
          : {
              op: 'followUp',
              message,
              ...(context !== undefined ? { context } : {}),
            }
    return this.startTurn(input, options)
  }

  /**
   * Start the turn of `input` (a prompt, a steer, or a follow-up), with its
   * operation. `wake`: the harness wakes the session with the message (a
   * background job ended), so its user message is marked, not shown as
   * something the user said.
   */
  protected startTurn(
    input: HarnessInput & { op: 'prompt' | 'steer' | 'followUp' },
    options?: SendOptions & { wake?: boolean },
  ): Operation<ChatTurnResult> {
    const { message } = input
    const inputId = options?.inputId ?? createInputId()
    const overrides = options?.overrides
    const systemPreamble = options?.systemPreamble
    const ephemeral = options?.ephemeral
    const principal = options?.principal ?? this.principal
    const context = options?.context
    const wake = options?.wake === true
    const busy =
      input.op === 'prompt'
        ? input.busy
        : input.op === 'steer'
          ? 'steer'
          : 'queue'
    const stored: HarnessInput =
      input.op === 'followUp' && wake ? { ...input, wake: true } : input
    const known = this.knownTurn(inputId, stored, principal)
    if (known) return known
    const runId = options?.runId
    // A prompt that this host passed on comes back from the inbox when its
    // owner stopped. It runs on the operation that its caller holds.
    const passed = this.forwarded.has(inputId)
      ? this.turnOperations.get(inputId)
      : undefined
    // A run id must not take the id of another operation.
    if (
      !passed &&
      runId !== undefined &&
      (this.operations.has(runId) || this.retiredIds.has(runId))
    ) {
      const refused = this.createTurnOperation()
      this.refuse(refused, { inputId, status: 'rejected', reason: 'conflict' })
      return refused
    }
    const operation = passed ?? this.createTurnOperation(runId)
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, stored, principal, runId).then(
        async (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          // Awaited only for a client run id, so other prompts keep their order.
          if (runId !== undefined && (await this.isRunTaken(runId))) {
            this.reject(inputId, 'conflict')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'conflict',
            })
            return
          }
          if (this.activeTurn && busy === 'reject') {
            this.reject(inputId, 'busy')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'busy',
            })
            return
          }
          // A steer joins the running turn, so the receipt names that turn.
          const running = busy === 'steer' ? this.activeTurn : undefined
          if (!running && this.waitsForInterrupts()) {
            this.reject(inputId, 'pending_interrupts')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'pending_interrupts',
            })
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          this.answerTurn(operation, {
            inputId,
            status: isWaiting && !running ? 'queued' : 'accepted',
            operationId: running?.id ?? operation.id,
          })
          const sent = { principal, context, ...(wake ? { wake } : {}) }
          if (running) {
            this.steerQueue.push({
              inputId,
              message,
              operation,
              overrides,
              ephemeral,
              ...sent,
            })
            return
          }
          this.enqueueTurn({
            operation,
            message,
            inputId,
            overrides,
            systemPreamble,
            ephemeral,
            ...sent,
          })
        },
        (error: unknown) => {
          // The input was not stored. After a log failure, say why the
          // session stopped.
          const failure = this.logFailure ?? error
          this.answerTurn(operation, {
            inputId,
            status: 'rejected',
            reason:
              failure instanceof Error ? failure.message : String(failure),
          })
          operation.fail('failed', failure)
        },
      ),
    )
    return operation
  }

  /**
   * Run one tool with no model, for example from a schedule or a webhook.
   * It runs as a chat turn whose only model call asks for the tool, so the
   * call goes through middleware, the input check, and `permissions()`, and
   * the call and its result join the transcript. A tool that asks for
   * approval stops the turn with an interrupt. `meta` is echoed as a
   * `tanstack.injection` custom event. The turn waits behind a running turn.
   * While interrupts wait, it is refused with `'pending_interrupts'`.
   *
   * `args` is typed from the input schema of a harness tool. A plugin tool
   * takes any `args`, and its input schema checks them.
   */
  tool<TName extends HarnessToolsOf<THarness>['name'] | (string & {})>(
    name: TName,
    args?: HarnessToolInput<THarness, TName>,
    options?: {
      meta?: Record<string, unknown>
      inputId?: string
      principal?: Principal
    },
  ): Operation<ChatTurnResult> {
    const inputId = options?.inputId ?? createInputId()
    const principal = options?.principal ?? this.principal
    const meta = options?.meta
    const input: HarnessInput = {
      op: 'tool',
      name,
      ...(args !== undefined ? { args } : {}),
      ...(meta ? { meta } : {}),
    }
    const known = this.knownTurn(inputId, input, principal)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, input, principal).then(
        (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          // As a prompt: the open interrupts are answered first.
          if (this.waitsForInterrupts()) {
            this.reject(inputId, 'pending_interrupts')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'pending_interrupts',
            })
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          this.answerTurn(operation, {
            inputId,
            status: isWaiting ? 'queued' : 'accepted',
            operationId: operation.id,
          })
          this.enqueueTurn({
            operation,
            inputId,
            principal,
            tool: { name, args, ...(meta ? { meta } : {}) },
          })
        },
        (error: unknown) => {
          const failure = this.logFailure ?? error
          this.answerTurn(operation, {
            inputId,
            status: 'rejected',
            reason: errorText(failure),
          })
          operation.fail('failed', failure)
        },
      ),
    )
    return operation
  }

  /** `send` to an agent run: the session agents layer implements it. */
  protected abstract sendToRun(
    message: UserInput,
    options: AgentSendOptions,
  ): Operation<unknown>

  /**
   * Start a chat turn from the stored transcript, with no new message. While
   * a turn runs, it queues. When it starts, the transcript must end with a
   * user or a tool message. Else the input is rejected with
   * `'nothing_to_continue'`. `inputId`, `overrides`, `principal`,
   * `context`, and `ephemeral` mean the same as in `prompt`. Each model call
   * gets the `ephemeral` messages after the transcript.
   *
   * @example
   * ```ts
   * await session.append([{ type: 'app.signal', text: 'The build failed.' }])
   * await session.continue({ inputId: 'after-signal' })
   * ```
   */
  continue(options?: {
    inputId?: string
    overrides?: TurnOverrides
    principal?: Principal
    context?: unknown
    ephemeral?: ReadonlyArray<ModelMessage>
  }): Operation<ChatTurnResult> {
    const inputId = options?.inputId ?? createInputId()
    const principal = options?.principal ?? this.principal
    const context = options?.context
    const input: HarnessInput = {
      op: 'continue',
      ...(context !== undefined ? { context } : {}),
    }
    const known = this.knownTurn(inputId, input, principal)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, input, principal).then(
        (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          this.answerTurn(operation, {
            inputId,
            status: isWaiting ? 'queued' : 'accepted',
            operationId: operation.id,
          })
          this.enqueueTurn({
            operation,
            inputId,
            overrides: options?.overrides,
            ephemeral: options?.ephemeral,
            principal,
            context,
            isContinue: true,
          })
        },
        (error: unknown) => {
          // As in `prompt`: the input was not stored.
          const failure = this.logFailure ?? error
          this.answerTurn(operation, {
            inputId,
            status: 'rejected',
            reason: errorText(failure),
          })
          operation.fail('failed', failure)
        },
      ),
    )
    return operation
  }

  /**
   * Start a fresh model context. From the next turn, the model sees only
   * `note` (when you give one) and what comes after the reset.
   * `transcript()` keeps every message: the reset adds a user message with
   * `metadata.harness.reset`, whose content is the note.
   *
   * While a turn runs, the reset waits and applies when that turn ends,
   * before the next queued turn. A thread that waits for interrupts is
   * refused with `'pending_interrupts'`: resolve them first. `principal` and
   * `inputId` mean the same as in `prompt`.
   */
  async reset(
    note?: string,
    options?: { principal?: Principal; inputId?: string },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      // An empty note is no note: the model never gets an empty message.
      const text = note?.trim() ? note : undefined
      const admission = await this.accept(
        inputId,
        { op: 'reset', ...(text !== undefined ? { note: text } : {}) },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const isRunning = this.activeTurn !== undefined
      if (this.waitsForInterrupts())
        return this.reject(inputId, 'pending_interrupts')
      const operation = this.queueReset(inputId, text, principal, 'front')
      return this.keep({
        inputId,
        status: isRunning ? 'queued' : 'accepted',
        operationId: operation.id,
      })
    })
  }

  /**
   * Answer the interrupts of the last turn. One resume must answer every open
   * interrupt of that turn (the AG-UI rule). `principal` means the same as in
   * `prompt`: the turn that continues runs with its credentials.
   */
  async resolve(
    resume: Array<RunAgentResumeItem>,
    options?: {
      inputId?: string
      principal?: Principal
      /** @internal The AG-UI `runId` of a `POST run` request. The turn runs as it. */
      runId?: string
    },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const inputId = options?.inputId ?? createInputId()
      const principal = options?.principal ?? this.principal
      const runId = options?.runId
      const admission = await this.accept(
        inputId,
        { op: 'resolve', resume },
        principal,
        runId,
      )
      if (admission !== 'new') {
        const receipt = this.duplicateReceipt(inputId, admission)
        // The owner runs a forwarded resume as `runId`.
        return admission === 'forwarded' &&
          runId !== undefined &&
          receipt.status !== 'rejected'
          ? { ...receipt, operationId: runId }
          : receipt
      }
      // A run id must not take the id of another operation or stored run.
      const isTaken =
        runId !== undefined &&
        (this.operations.has(runId) ||
          this.retiredIds.has(runId) ||
          (await this.isRunTaken(runId)))
      if (isTaken) {
        this.reject(inputId, 'conflict')
        return { inputId, status: 'rejected', reason: 'conflict' }
      }
      const answers = this.interrupted
      if (!answers) {
        this.reject(inputId, 'no_pending_interrupts')
        return { inputId, status: 'rejected', reason: 'no_pending_interrupts' }
      }
      // A client answers on RUN_FINISHED, while the interrupted turn still
      // ends. The resolve runs right after it.
      const isEnding = this.activeTurn?.id === answers.runId
      if (
        (this.activeTurn && !isEnding) ||
        this.queue.some((turn) => turn.answers?.runId === answers.runId)
      ) {
        this.reject(inputId, 'busy')
        return { inputId, status: 'rejected', reason: 'busy' }
      }
      // A cancelled sign-in fails its tool when the turn runs it again.
      for (const entry of resume) {
        const connector = signInConnector(
          answers.interrupts.find((item) => item.id === entry.interruptId),
        )
        if (connector && entry.status === 'cancelled')
          this.declinedSignIns.add(connector)
      }
      const operation = this.createTurnOperation(runId)
      this.bindTurn(inputId, operation)
      // The turn goes on with the context its input sent.
      const turn: QueuedTurn = {
        operation,
        resume,
        inputId,
        answers,
        principal,
        context: answers.context,
      }
      if (isEnding) this.queue.unshift(turn)
      else this.enqueueTurn(turn)
      return this.keep({
        inputId,
        status: 'accepted',
        operationId: operation.id,
      })
    })
  }

  async cancel(
    operationId?: string,
    /** @internal The id of a forwarded input, so a replay is a duplicate. */
    options?: { inputId?: string },
  ): Promise<Receipt> {
    const inputId = options?.inputId ?? createInputId()
    const admission = await this.accept(inputId, { op: 'cancel', operationId })
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const target = operationId
      ? this.operations.get(operationId)
      : this.activeTurn
    if (!target || target.isSettled()) {
      return this.reject(inputId, 'not_running')
    }
    const waitingSteer = this.steerQueue.find(
      (steer) => steer.operation === target,
    )
    // A join took it, so it ends with the running turn, as a joined steer.
    if (waitingSteer && this.joining.has(waitingSteer.inputId)) {
      return this.reject(inputId, 'not_running')
    }
    const targetInput = this.operationInputs.get(target.id)
    // A prompt that joined the running turn ends with it, as a joined steer.
    const hasJoined =
      targetInput !== undefined &&
      [...this.turnJoins.values()].some((joined) =>
        joined.includes(targetInput),
      )
    if (hasJoined) return this.reject(inputId, 'not_running')
    // It never joins now, and settles when the running turn ends.
    if (waitingSteer) this.abortedSteers.add(waitingSteer.inputId)
    if (this.writer && targetInput) {
      await this.writer.append([
        { type: 'harness.input.abort', inputId: targetInput },
      ])
    }
    if (waitingSteer) {
      await this.markApplied(inputId, target.id)
      return { inputId, status: 'accepted', operationId: target.id }
    }
    const chain = this.chainOf.get(target.id)
    const waiting =
      chain?.followUps.findIndex((item) => item.operation === target) ?? -1
    if (chain && waiting >= 0) {
      // A follow-up that did not start never runs.
      const [item] = chain.followUps.splice(waiting, 1)
      if (item) {
        await this.settle({
          inputId: item.inputId,
          outcome: 'aborted',
          operationId: target.id,
        })
      }
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
      await this.markApplied(inputId, target.id)
      this.checkIdle()
      return { inputId, status: 'accepted', operationId: target.id }
    }
    // A run's children stop first, bottom-up.
    for (const child of chain?.children ?? []) {
      if (!child.current.operation.isSettled()) {
        await this.cancel(child.current.operation.id)
      }
    }
    const queued = this.queue.findIndex((turn) => turn.operation === target)
    if (queued >= 0) {
      this.queue.splice(queued, 1)
      if (targetInput) {
        await this.settle({
          inputId: targetInput,
          outcome: 'aborted',
          operationId: target.id,
        })
      }
      await this.refreshTurnInterrupts(target)
      target.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(target)
    } else {
      // A question of this turn gets no answer now.
      for (const [questionId, question] of this.questions) {
        if (question.operationId !== target.id) continue
        this.questions.delete(questionId)
        question.reject(new Error('Cancelled.'))
      }
      target.abortController.abort(RUN_CANCEL_REASON)
    }
    await this.markApplied(inputId, target.id)
    return { inputId, status: 'accepted', operationId: target.id }
  }

  /**
   * Cancel an input that waits, so it never runs, also after a restart. It
   * settles `aborted`. An input that started, or that joins the running
   * turn now, is refused with `not_waiting`: stop it with
   * `cancel(operationId)`.
   *
   * @example
   * ```ts
   * await session.send('Then write the tests.', { mode: 'followUp', inputId: 'tests' })
   * await session.cancelInput('tests')
   * ```
   */
  async cancelInput(target: string): Promise<Receipt> {
    const inputId = createInputId()
    const admission = await this.accept(inputId, {
      op: 'cancelInput',
      inputId: target,
    })
    if (isElsewhere(admission)) return this.duplicateReceipt(inputId, admission)
    const taken = this.takeWaiting(target) ?? this.takeQueuedContinue(target)
    if (!taken) return this.reject(inputId, 'not_waiting')
    await this.applyControl(inputId, {
      type: 'harness.input.abort',
      inputId: target,
    })
    // Without a log, the inbox entry must not stay pending: a restart runs
    // pending entries.
    if (!this.writer)
      await this.inbox.markRejected({
        threadId: this.threadId,
        inputId: target,
        reason: 'cancelled',
      })
    const { operation } = taken
    await this.settle({
      inputId: target,
      outcome: 'aborted',
      ...(operation ? { operationId: operation.id } : {}),
    })
    if (operation) {
      operation.fail('cancelled', new Error('Cancelled before it started.'))
      this.publishFinished(operation)
    }
    return { inputId, status: 'accepted' }
  }

  /**
   * Move an input that waits. `'steer'` joins it to the running turn at the
   * next model call. `'queue'` runs it as its own turn, after the queued
   * turns. An input that started, or that joins the running turn now, is
   * refused with `not_waiting`. On a durable host the log keeps the
   * delivery, and a restart honors it. Without a log, it is kept in memory.
   *
   * @example
   * ```ts
   * await session.send('Use tabs, not spaces.', { mode: 'followUp', inputId: 'style' })
   * await session.setDelivery({ inputId: 'style', delivery: 'steer' })
   * ```
   */
  async setDelivery({
    inputId: target,
    delivery,
  }: {
    inputId: string
    delivery: WaitingInput['delivery']
  }): Promise<Receipt> {
    const inputId = createInputId()
    const admission = await this.accept(inputId, {
      op: 'setDelivery',
      inputId: target,
      delivery,
    })
    if (isElsewhere(admission)) return this.duplicateReceipt(inputId, admission)
    const current = this.inputs().find((input) => input.inputId === target)
    if (current?.delivery !== delivery) {
      const taken = this.takeWaiting(target)
      if (!taken) return this.reject(inputId, 'not_waiting')
      if (delivery === 'steer' && this.activeTurn) this.steerQueue.push(taken)
      else this.enqueueTurn(this.steerTurn(taken))
    }
    await this.applyControl(inputId, {
      type: 'harness.input.delivery',
      inputId: target,
      delivery,
    })
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputDelivery, { inputId: target, delivery }),
    )
    return { inputId, status: 'accepted' }
  }

  /**
   * A saved credential can answer the sign-ins the last turn waits for. When
   * every open interrupt is a sign-in and each of their connectors has a
   * credential of the turn's sender now, the turn goes on as that sender and
   * its tools run again. The input id comes from the interrupts, so a second
   * save does not resolve them twice.
   */
  protected override async resumeSignIns(): Promise<void> {
    const stopped = this.interrupted
    const waiting = stopped?.interrupts ?? []
    const connectors = waiting.map(signInConnector)
    if (waiting.length === 0) return
    // Another user's credential never answers this sign-in.
    const principal = stopped?.principal ?? this.principal
    const credentials = this.credentialsOf(principal)
    for (const connector of connectors) {
      if (!connector || !(await credentials.get(connector))) return
    }
    if (this.interrupted !== stopped) return
    await this.resolve(
      waiting.map((interrupt, index) => ({
        interruptId: interrupt.id,
        status: 'resolved',
        payload: { connector: connectors[index] },
      })),
      {
        inputId: `sign-in:${waiting.map((item) => item.id).join(',')}`,
        ...(principal ? { principal } : {}),
      },
    )
  }

  /**
   * The session API of plugins. With `principal` (a command), it acts for
   * that user. Without it, it follows the sender of the running turn. With
   * `operationId` (a command), its questions belong to that operation.
   */
  protected override pluginApi(
    principal?: Principal,
    metadataSchema?: SchemaInput,
    operationId?: string,
  ): PluginSessionApi {
    const sender = () => principal ?? this.sender()
    return {
      threadId: this.threadId,
      get principal() {
        return sender()
      },
      snapshot: () => this.snapshot(),
      // A plugin turn always waits its turn. It cannot see a busy rejection.
      send: (text) =>
        this.startTurn(
          { op: 'prompt', message: text, busy: 'queue' },
          { principal: sender() },
        ),
      note: async (text, options) => {
        await this.addNote(text)
        if (options?.wake) {
          const receipt = await this.startTurn(
            { op: 'followUp', message: text },
            { principal: sender(), wake: true },
          ).receipt
          if (receipt.status === 'rejected')
            throw new InputRejectedError(receipt)
        }
      },
      transcript: () => this.transcript(),
      replaceTranscript: (messages) =>
        this.messages.saveThread(this.threadId, messages),
      entry: () => this.index.get(this.threadId),
      updateEntry: (update) => {
        // Only these fields: a plugin cannot change the owner, the parent,
        // or the pin.
        const pick = (
          change:
            | Pick<SessionIndexEntry, 'title' | 'metadata' | 'usage'>
            | undefined,
        ) =>
          change && {
            title: change.title,
            metadata: change.metadata,
            usage: change.usage,
          }
        return this.index.update(this.threadId, (entry) =>
          changedEntry(
            entry,
            typeof update === 'function'
              ? (current) => pick(update(current))
              : pick(update),
            this.harness.metadataSchema,
            metadataSchema,
          ),
        )
      },
      // The public type narrows the answer from the schema.
      ask: ((question: Question<SchemaInput | undefined>) =>
        this.ask(question, operationId)) as PluginSessionApi['ask'],
      authRequired: (info) =>
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.authRequired, { ...info }),
        ),
      setConfig: (change) => this.setConfig(change),
      settings: () => this.settings(),
    }
  }

  /** Operations that follow an input another host runs, or that ran before. */
  private readonly followers = new Set<OperationImpl<ChatTurnResult>>()

  /**
   * Stop every running operation, wait for them, then dispose session plugins.
   * Safe to call twice.
   *
   * With `recoverable`, the running turns and agent runs stop as on a host
   * crash: the log gets none of their later writes, they do not settle, and
   * the run store gets no aborted state. They give their leases back, so the
   * next host that opens the thread runs them again at once. Use it when a
   * durable host shuts down, for example for a deploy.
   *
   * @example
   * ```ts
   * await session.close({ recoverable: true })
   * ```
   */
  close(options?: { recoverable?: boolean }): Promise<void> {
    this.closing ??= (async () => {
      // A thread with work keeps its claim, so a sweep finds that work after
      // the claim expires. An idle thread gives it back.
      const wasIdle = this.isIdle()
      this.stopClaimTimer()
      if (wasIdle) await this.releaseClaim()
      // Before the stop, so no write of the stopped work lands.
      if (options?.recoverable) this.writer?.close()
      for (const turn of this.queue.splice(0)) {
        await this.refreshTurnInterrupts(turn.operation)
        turn.operation.fail('cancelled', new Error('Session closed.'))
      }
      // A follower waits for a settlement in the log. The log view closes
      // with the session, so it ends now.
      for (const operation of this.followers) {
        if (!operation.isSettled())
          operation.fail('cancelled', new Error('Session closed.'))
      }
      this.followers.clear()
      const running = [...this.operations.values()].filter(
        (operation) => !operation.isSettled(),
      )
      for (const operation of running) {
        operation.abortController.abort(
          options?.recoverable ? SHUTDOWN_REASON : RUN_CANCEL_REASON,
        )
      }
      for (const question of this.questions.values()) {
        question.reject(new Error('Session closed.'))
      }
      this.questions.clear()
      await Promise.allSettled(
        running.map((operation) => Promise.resolve(operation)),
      )
      // The events from before the close land first, so the next host has
      // the text of a cut answer.
      if (options?.recoverable)
        await this.writer
          ?.flush()
          .catch((error: unknown) => this.warnSession('harness:log', error))
      // A reload that mounts plugins now ends first, so its plugins are
      // disposed below.
      await this.reloads
      this.lifetime.abort()
      try {
        await this.sessionPlugins?.dispose()
      } finally {
        this.feed.close()
        this.eventListeners.clear()
        this.onClose()
      }
    })()
    return this.closing
  }

  // ===========================
  // Chat turns
  // ===========================

  protected createTurnOperation(id?: string): OperationImpl<ChatTurnResult> {
    const operation = new OperationImpl<ChatTurnResult>(
      'chat',
      this.feed,
      (target) => this.cancel(target.id),
      undefined,
      id,
    )
    this.track(operation as OperationImpl<unknown>)
    return operation
  }

  /**
   * Steers a turn never reached run next, before other queued turns (after
   * a resolve of that turn). A steer with an abort request settles `aborted`
   * instead.
   */
  protected requeueWaitingSteers(): void {
    this.joining.clear()
    const waiting = this.steerQueue.splice(0)
    const aborted = waiting.filter((steer) =>
      this.isAbortRequested(steer.inputId),
    )
    const rest = waiting.filter((steer) => !aborted.includes(steer))
    for (const steer of aborted) {
      this.abortedSteers.delete(steer.inputId)
      const { operation } = steer
      // Not awaited: the session goes on to the next turn at once. The
      // settlement lands before the operation ends.
      void this.settle({
        inputId: steer.inputId,
        outcome: 'aborted',
        ...(operation ? { operationId: operation.id } : {}),
      })
        .catch(() => {})
        .then(() => {
          if (!operation) return
          operation.fail('cancelled', new Error('Cancelled before it started.'))
          this.publishFinished(operation)
        })
    }
    if (this.closing) {
      // close() ended the queued turns already. These end the same way.
      for (const steer of rest) {
        steer.operation?.fail('cancelled', new Error('Session closed.'))
      }
      return
    }
    this.queue.splice(
      this.frontOfQueue(),
      0,
      ...rest.map((steer) => this.steerTurn(steer)),
    )
  }

  /** A waiting steer as its own turn, with its own operation. */
  protected steerTurn(steer: WaitingSteer) {
    const operation = steer.operation ?? this.createTurnOperation()
    this.bindTurn(steer.inputId, operation)
    const turn: QueuedTurn = { ...steer, operation }
    return turn
  }

  /**
   * The operation for a prompt whose id is known: the live one, one that
   * settles from the log, or a refused one for another payload.
   */
  protected knownTurn(
    inputId: string,
    input: HarnessInput,
    principal: Principal | undefined,
  ) {
    const payload = inputKey(input, principal)
    const local = this.admitted.get(inputId)
    const logged = this.writer?.state.inputs.get(inputId)
    const stored =
      local ?? (logged ? inputKey(logged.input, logged.principal) : undefined)
    if (stored === undefined) return undefined
    if (stored !== payload) {
      const refused = this.createTurnOperation()
      this.refuse(refused, { inputId, status: 'rejected', reason: 'conflict' })
      return refused
    }
    const live = this.turnOperations.get(inputId)
    if (live) return live
    const replay = this.createTurnOperation(logged?.operationId)
    this.answerDuplicate(replay, inputId, 'duplicate')
    return replay
  }

  /** Settle `operation` like the earlier input with the same id. */
  protected answerDuplicate(
    operation: OperationImpl<ChatTurnResult>,
    inputId: string,
    admission: Exclude<Admission, 'new'>,
  ) {
    const receipt = this.duplicateReceipt(inputId, admission)
    if (receipt.status === 'rejected') {
      this.refuse(operation, receipt)
      return
    }
    operation.resolveReceipt(receipt)
    this.followers.add(operation)
    if (!this.writer) {
      // Without a log, the result of an input from before a restart, or of
      // one the session no longer keeps, is gone.
      operation.fail(
        'failed',
        new Error(
          'This input ran earlier, and its result is gone. Keep results with a durable host (stores.log).',
        ),
      )
      return
    }
    void this.settled(inputId)
      .then(
        (settlement) => this.settleOperation(operation, settlement),
        (error: unknown) => operation.fail('failed', error),
      )
      .finally(() => this.followers.delete(operation))
  }

  /**
   * Queue a reset: at the front for a new one (it applies when the running
   * turn ends), at the end for one from before a restart (in its admission
   * order). Its operation is a command, so clients do not see a chat turn.
   */
  protected queueReset(
    inputId: string,
    note: string | undefined,
    principal: Principal | undefined,
    at: 'front' | 'end',
  ) {
    const operation = new OperationImpl<ChatTurnResult>(
      'command',
      this.feed,
      (target) => this.cancel(target.id),
    )
    this.track(operation as OperationImpl<unknown>)
    this.bindTurn(inputId, operation)
    const turn: QueuedTurn = {
      operation,
      inputId,
      principal,
      reset: note !== undefined ? { note } : {},
    }
    this.queue.splice(
      at === 'front' ? this.frontOfQueue() : this.queue.length,
      0,
      turn,
    )
    this.drain()
    return operation
  }
}
