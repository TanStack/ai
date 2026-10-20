import { RUN_CANCEL_REASON } from '@tanstack/ai'
import { changedEntry } from '../session-entry'
import { OperationImpl } from '../operation'
import { parseTraceparent } from '../observability'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import { timeOf } from '../waits'
import {
  signInConnector,
  createInputId,
  customEvent,
  errorText,
  inputKey,
  SHUTDOWN_REASON,
} from './helpers'
import { SessionState } from './state'
import type { ModelMessage, SchemaInput } from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type { PluginSessionApi, Question } from '../commands'
import type { AnyHarness, HarnessToolInput, HarnessToolsOf } from '../define'
import type {
  AgentSendOptions,
  CancelOptions,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  Operation,
  HarnessUser,
  Receipt,
  ResetOptions,
  ResolveOptions,
  SendForRunOptions,
  SendOptions,
  TurnOverrides,
  UserInput,
  WaitingInput,
} from '../types'
import type {
  HarnessChild,
  QueuedTurn,
  ResolveForRunOptions,
  WaitingSteer,
} from './types'
import type { Admission } from './inputs'
import type { HeldPlugins } from './helpers'

/**
 * A layer of {@link HarnessSession}: prompt, steer, follow-up, continue, reset,
 * resolve, and cancel.
 */
export abstract class SessionRequests<
  THarness extends AnyHarness = AnyHarness,
> extends SessionState<THarness> {
  /**
   * The plugins of turns that are not disposed yet: a turn, or a run that it
   * started, still runs. `close()` disposes them.
   */
  protected readonly turnPlugins = new Set<HeldPlugins>()

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
   * `overrides` changes the adapter or model, model options, reasoning,
   * prompt cache, or tools of this turn only (see `TurnOverrides`). The log
   * keeps the JSON ones, so a turn that recovery runs again uses them. A
   * steer that joins the running turn uses the overrides of that turn, and
   * its own are ignored.
   *
   * `user` is who sent the message. Default: the user that opened
   * the session. The log keeps it, and the turn runs with its credentials
   * and provider keys. A steer that joins the running turn runs with the
   * credentials of that turn's sender.
   *
   * `context` is JSON data from the client, stored with the input. Tools
   * get it in their context (see `HarnessConfig.context`). Do not trust it.
   *
   * `ephemeral` are messages that each model call of this turn gets, after
   * the transcript and the new user message, before the messages that the
   * turn adds (answers, tool results, steers). The transcript does not
   * keep them. The log keeps them with the input, so a turn that recovery
   * runs again has them too. Like `overrides`, they are not part of the
   * input: the `inputId` duplicate check does not read them, so a retry with
   * other ephemeral messages gets the first input's operation and its own
   * are dropped. A steer that joins the running turn ignores them.
   *
   * `systemPreamble` are system prompts that this turn gets ahead of the
   * harness prompts, for example memory that the host adds. They are kept
   * like `overrides`, and only server code sets them. A client input cannot
   * set them.
   *
   * `as: 'operator'` is the reply of a person who took over after a handoff
   * to a person. It goes in the transcript as an assistant message, and no
   * model turn runs. It needs the `operator` access action and an open
   * `human` wait of a handoff, else the receipt is rejected with
   * `'no_human_wait'`. While that wait is open, other messages go in the
   * transcript, and no model turn runs either: the turn settles
   * `interrupted`.
   *
   * @example
   * ```ts
   * await session.send('I refunded order 42.', { as: 'operator' })
   * ```
   */
  send(message: UserInput, options: AgentSendOptions): Operation<unknown>
  send(message: UserInput, options?: SendOptions): Operation<ChatTurnResult>
  send(
    message: UserInput,
    options?: SendOptions | AgentSendOptions,
  ): Operation<unknown> {
    if (options?.to !== undefined) return this.sendToRun(message, options)
    return this.sendForRun(message, options)
  }

  /**
   * @internal `send` of a message to the session, with the AG-UI `runId` of
   * a `POST run` request: the turn runs as it. The HTTP handler and an
   * offered prompt call it.
   */
  override sendForRun(
    message: UserInput,
    options?: SendForRunOptions,
  ): Operation<ChatTurnResult> {
    const context = options?.context
    const mode = options?.mode ?? 'prompt'
    const input: HarnessInput =
      mode === 'prompt'
        ? {
            op: 'prompt',
            message,
            busy: options?.busy ?? this.harness.busy ?? 'queue',
            ...(context !== undefined ? { context } : {}),
            ...(options?.as ? { as: options.as } : {}),
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
    options?: SendForRunOptions & { wake?: boolean },
  ): Operation<ChatTurnResult> {
    const { message } = input
    const inputId = options?.inputId ?? createInputId()
    const overrides = options?.overrides
    const systemPreamble = options?.systemPreamble
    const ephemeral = options?.ephemeral
    const user = options?.user ?? this.user
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
    const known = this.knownTurn(inputId, stored, user)
    if (known) return known
    const runId = options?.runId
    // A prompt that this host offered comes back from the lane when no live
    // host owns the log. It runs on the operation that its caller holds.
    const passed = this.offeredInputs.has(inputId)
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
    const traceparent = options?.traceparent
    void this.admitting(() =>
      this.accept(inputId, stored, user, {
        // An offered turn runs as the operation of this host.
        runId: operation.id,
        turn: { overrides, systemPreamble, ephemeral },
        // As the W3C rules say, an invalid `traceparent` is dropped.
        ...(traceparent !== undefined && parseTraceparent(traceparent)
          ? { traceparent }
          : {}),
      }).then(
        async (admission) => {
          if (admission !== 'new') {
            this.answerDuplicate(operation, inputId, admission)
            return
          }
          // A client run id must be new in the log of this thread.
          if (runId !== undefined && this.isRunTaken(runId)) {
            this.reject(inputId, 'conflict')
            this.refuse(operation, {
              inputId,
              status: 'rejected',
              reason: 'conflict',
            })
            return
          }
          const isWaiting =
            this.activeTurn !== undefined || this.queue.length > 0
          if (input.op === 'prompt' && input.as === 'operator') {
            // An operator reply runs no model. It needs an open handoff to
            // a person.
            if (!this.humanHandoff()) {
              this.refuse(operation, this.reject(inputId, 'no_human_wait'))
              return
            }
            this.answerTurn(operation, {
              inputId,
              status: isWaiting ? 'queued' : 'accepted',
              operationId: operation.id,
            })
            this.enqueueTurn({
              operation,
              message,
              inputId,
              user,
              operator: true,
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
          this.answerTurn(operation, {
            inputId,
            status: isWaiting && !running ? 'queued' : 'accepted',
            operationId: running?.id ?? operation.id,
          })
          const sent = { user, context, ...(wake ? { wake } : {}) }
          if (running) {
            this.steerQueue.push({
              inputId,
              message,
              operation,
              overrides,
              ephemeral,
              ...sent,
            })
            this.publishQueued(inputId, 'steer')
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
   * takes any `args`, and its input schema checks them. `inputId` and
   * `user` mean the same as in `send`.
   *
   * @example
   * ```ts
   * const turn = session.runTool({ name: 'sync_inbox', args: { folder: 'INBOX' } })
   * ```
   */
  runTool<
    TName extends HarnessToolsOf<THarness>['name'] | (string & {}),
  >(options: {
    name: TName
    args?: HarnessToolInput<THarness, TName>
    meta?: Record<string, unknown>
    inputId?: string
    user?: HarnessUser
  }): Operation<ChatTurnResult> {
    const { name, args, meta } = options
    const inputId = options.inputId ?? createInputId()
    const user = options.user ?? this.user
    const input: HarnessInput = {
      op: 'tool',
      name,
      ...(args !== undefined ? { args } : {}),
      ...(meta ? { meta } : {}),
    }
    const known = this.knownTurn(inputId, input, user)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    void this.admitting(() =>
      this.accept(inputId, input, user).then(
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
            user,
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
   * `'nothing_to_continue'`. `inputId`, `overrides`, `user`,
   * `context`, and `ephemeral` mean the same as in `prompt`. Each model call
   * gets the `ephemeral` messages after the transcript.
   *
   * @example
   * ```ts
   * await session.appendRecords({
   *   records: [{ type: 'app.signal', text: 'The build failed.' }],
   * })
   * await session.continueWithoutMessage({ inputId: 'after-signal' })
   * ```
   */
  continueWithoutMessage(options?: {
    inputId?: string
    overrides?: TurnOverrides
    user?: HarnessUser
    context?: unknown
    ephemeral?: ReadonlyArray<ModelMessage>
  }): Operation<ChatTurnResult> {
    const inputId = options?.inputId ?? createInputId()
    const user = options?.user ?? this.user
    const context = options?.context
    const input: HarnessInput = {
      op: 'continue',
      ...(context !== undefined ? { context } : {}),
    }
    const known = this.knownTurn(inputId, input, user)
    if (known) return known
    const operation = this.createTurnOperation()
    this.bindTurn(inputId, operation)
    const turn = {
      ...(options?.overrides ? { overrides: options.overrides } : {}),
      ...(options?.ephemeral ? { ephemeral: options.ephemeral } : {}),
    }
    void this.admitting(() =>
      this.accept(inputId, input, user, { turn }).then(
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
            user,
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
   * refused with `'pending_interrupts'`: resolve them first. `user` and
   * `inputId` mean the same as in `prompt`.
   *
   * @example
   * ```ts
   * await session.reset({ note: 'The user wants a new plan.' })
   * ```
   */
  async reset(
    options?: ResetOptions & { user?: HarnessUser },
  ): Promise<Receipt> {
    return this.admitting(async () => {
      const note = options?.note
      const inputId = options?.inputId ?? createInputId()
      const user = options?.user ?? this.user
      // An empty note is no note: the model never gets an empty message.
      const text = note?.trim() ? note : undefined
      const admission = await this.accept(
        inputId,
        { op: 'reset', ...(text !== undefined ? { note: text } : {}) },
        user,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const isRunning = this.activeTurn !== undefined
      if (this.waitsForInterrupts())
        return this.reject(inputId, 'pending_interrupts')
      const operation = this.queueReset(inputId, text, user, 'front')
      return this.keep({
        inputId,
        status: isRunning ? 'queued' : 'accepted',
        operationId: operation.id,
      })
    })
  }

  /**
   * Answer the interrupts of the last turn. One resume must answer every open
   * interrupt of that turn (the AG-UI rule). `user` is who answers: the
   * log keeps it. The turn that continues still runs as the user who sent
   * it, with that user's credentials.
   *
   * @example
   * ```ts
   * await session.resolve({
   *   resume: [{ interruptId, status: 'resolved', payload: { approved: true } }],
   * })
   * ```
   */
  resolve(options: ResolveOptions & { user?: HarnessUser }): Promise<Receipt> {
    return this.resolveForRun(options)
  }

  /**
   * The `harnessAgent` child that waits for every id of `waitIds`, or
   * `undefined`. A child lists the waits of its own children too.
   */
  protected childOfWaits(
    waitIds: ReadonlyArray<string>,
  ): HarnessChild | undefined {
    if (waitIds.length === 0) return undefined
    for (const child of this.harnessChildren.values()) {
      const waits = child.session.snapshot().pendingWaits
      const open = new Set(waits.map((wait) => wait.waitId))
      if (waitIds.every((id) => open.has(id))) return child
    }
    return undefined
  }

  /**
   * @internal `resolve`, with the AG-UI `runId` of a `POST run` request: the
   * turn runs as it. The HTTP handler and an offered resolve call it.
   */
  override async resolveForRun(
    options: ResolveForRunOptions,
  ): Promise<Receipt> {
    const { resume } = options
    // The waits of a `harnessAgent` child: the child takes the answers, and
    // its run goes on, still for the user of the run that started it. The
    // AG-UI run id names a run of this session only.
    const child = this.childOfWaits(resume.map((item) => item.interruptId))
    if (child) {
      const { inputId } = options
      return child.answer({
        resume,
        ...(inputId !== undefined ? { inputId } : {}),
      })
    }
    return this.admitting(async () => {
      const inputId = options.inputId ?? createInputId()
      const user = options.user ?? this.user
      const runId = options.runId
      const admission = await this.accept(
        inputId,
        { op: 'resolve', resume },
        user,
        runId !== undefined ? { runId } : {},
      )
      if (admission !== 'new') {
        const receipt = this.duplicateReceipt(inputId, admission)
        // The owner runs an offered resume as `runId`.
        return admission === 'offered' &&
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
          this.isRunTaken(runId))
      if (isTaken) {
        this.reject(inputId, 'conflict')
        return { inputId, status: 'rejected', reason: 'conflict' }
      }
      // The waits of a background agent run: the log ends them, and the
      // run goes on (see `resumeWaitingRuns`).
      const logged = resume.map((item) => this.loggedWait(item.interruptId))
      const open = logged.flatMap((state) =>
        state !== undefined &&
        state.outcome === undefined &&
        state.live === undefined
          ? [state]
          : [],
      )
      const interrupts = this.logWriter?.state.thread.interrupts
      // A `step.ask` question and the `human` wait of a handoff have no
      // interrupt: `answer` checks their schema, keeps a secret out of the
      // log, and ends the handoff.
      if (
        open.some(
          ({ wait }) => interrupts?.get(wait.waitId)?.status !== 'pending',
        )
      ) {
        this.reject(inputId, 'use_answer')
        return { inputId, status: 'rejected', reason: 'use_answer' }
      }
      if (open.length > 0) {
        // The access check saw the run of the first item: every item must
        // be a wait of that run.
        const runId = open[0]?.wait.runId
        const isOneRun =
          open.length === resume.length &&
          open.every(({ wait }) => wait.runId === runId)
        if (!isOneRun) {
          this.reject(inputId, 'mixed_runs')
          return { inputId, status: 'rejected', reason: 'mixed_runs' }
        }
        // Another answer ends one of these waits now.
        if (open.some(({ wait }) => this.answering.has(wait.waitId))) {
          this.reject(inputId, 'unknown_question')
          return { inputId, status: 'rejected', reason: 'unknown_question' }
        }
        const ids = open.map(({ wait }) => wait.waitId)
        for (const id of ids) this.answering.add(id)
        try {
          // The input ends here, in the append that ends the waits.
          await this.settleWith(
            [{ inputId, outcome: 'completed' }],
            resume.flatMap((item) =>
              item.status === 'resolved'
                ? this.waitEndRecords(
                    item.interruptId,
                    'answered',
                    item.payload,
                  )
                : this.waitEndRecords(item.interruptId, 'cancelled'),
            ),
          )
        } finally {
          for (const id of ids) this.answering.delete(id)
        }
        for (const item of resume) await this.afterWaitEnd(item.interruptId)
        return this.keep({
          inputId,
          status: 'accepted',
          ...(runId !== undefined ? { operationId: runId } : {}),
        })
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
      // The turn goes on as its sender, with the context its input sent:
      // an owner who answers the turn of a member does not lend the member
      // the owner's keys. A copy from an older version has no sender.
      const turn: QueuedTurn = {
        operation,
        resume,
        inputId,
        answers,
        user: answers.user ?? user,
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

  /**
   * Stop the operation `operationId`, or the running turn without it. A turn
   * that waits in the queue never runs. Refused with `'not_running'` when
   * nothing runs or the operation ended. `inputId` means the same as in
   * `send`: a second cancel with the same id is a duplicate. `user` is
   * who cancels. Default: the user that opened the session. The log
   * keeps it.
   *
   * @example
   * ```ts
   * await session.cancel({ operationId: turn.id })
   * ```
   */
  async cancel(
    options?: CancelOptions & { inputId?: string; user?: HarnessUser },
  ): Promise<Receipt> {
    const operationId = options?.operationId
    const inputId = options?.inputId ?? createInputId()
    const admission = await this.accept(
      inputId,
      { op: 'cancel', operationId },
      options?.user,
    )
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
    if (targetInput) {
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
        await this.cancel({ operationId: child.current.operation.id })
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
      for (const [questionId, question] of [...this.questions]) {
        if (question.operationId !== target.id) continue
        await this.endQuestion(questionId, 'cancelled', new Error('Cancelled.'))
      }
      target.abortController.abort(RUN_CANCEL_REASON)
    }
    await this.markApplied(inputId, target.id)
    return { inputId, status: 'accepted', operationId: target.id }
  }

  /**
   * @internal Cancel the queued and running work that the user `userId`
   * started: `host.sessions.unshare` and `host.revoke` stop it. `user`
   * is who cancels, and the log keeps it.
   */
  async cancelWorkOf({
    userId,
    user,
  }: {
    userId: string
    user: HarnessUser | undefined
  }): Promise<void> {
    const theirs = [...this.operations.values()].filter(
      (operation) =>
        !operation.isSettled() &&
        this.startedBy(operation.id).userId === userId,
    )
    for (const operation of theirs) {
      await this.cancel({
        operationId: operation.id,
        ...(user ? { user } : {}),
      })
    }
  }

  /**
   * Cancel an input that waits, so it never runs, also after a restart. It
   * settles `aborted`. An input that started, or that joins the running
   * turn now, is refused with `not_waiting`: stop it with
   * `cancel({ operationId })`. `user` is who cancels. Default: the
   * user that opened the session. The log keeps it.
   *
   * @example
   * ```ts
   * await session.send('Then write the tests.', { mode: 'followUp', inputId: 'tests' })
   * await session.cancelInput({ inputId: 'tests' })
   * ```
   */
  cancelInput(options: {
    inputId: string
    user?: HarnessUser
  }): Promise<Receipt> {
    return this.applyCancelInput(options)
  }

  /**
   * `cancelInput`, with `controlId`: the id of an offered input, so a replay
   * is a duplicate.
   */
  protected override async applyCancelInput({
    inputId: target,
    user,
    controlId,
  }: {
    inputId: string
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt> {
    const inputId = controlId ?? createInputId()
    const admission = await this.accept(
      inputId,
      { op: 'cancelInput', inputId: target },
      user,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const taken = this.takeWaiting(target) ?? this.takeQueuedContinue(target)
    if (!taken) return this.reject(inputId, 'not_waiting')
    await this.applyControl(inputId, {
      type: 'harness.input.abort',
      inputId: target,
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
   * refused with `not_waiting`. The log keeps the delivery, and a restart
   * honors it.
   * `user` is who moves it. Default: the user that opened the
   * session. The log keeps it.
   *
   * @example
   * ```ts
   * await session.send('Use tabs, not spaces.', { mode: 'followUp', inputId: 'style' })
   * await session.changeInputDelivery({ inputId: 'style', delivery: 'steer' })
   * ```
   */
  changeInputDelivery(options: {
    inputId: string
    delivery: WaitingInput['delivery']
    user?: HarnessUser
  }): Promise<Receipt> {
    return this.applySetDelivery(options)
  }

  /**
   * `changeInputDelivery`, with `controlId`: the id of an offered input, so a replay
   * is a duplicate.
   */
  protected override async applySetDelivery({
    inputId: target,
    delivery,
    user,
    controlId,
  }: {
    inputId: string
    delivery: WaitingInput['delivery']
    user?: HarnessUser
    controlId?: string
  }): Promise<Receipt> {
    const inputId = controlId ?? createInputId()
    const admission = await this.accept(
      inputId,
      { op: 'setDelivery', inputId: target, delivery },
      user,
    )
    if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
    const current = this.waitingInputs().find(
      (input) => input.inputId === target,
    )
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
    const user = stopped?.user ?? this.user
    const credentials = this.credentialsOf(user)
    for (const connector of connectors) {
      if (!connector || !(await credentials.get(connector))) return
    }
    if (this.interrupted !== stopped) return
    await this.resolve({
      resume: waiting.map((interrupt, index) => ({
        interruptId: interrupt.id,
        status: 'resolved',
        payload: { connector: connectors[index] },
      })),
      inputId: `sign-in:${waiting.map((item) => item.id).join(',')}`,
      ...(user ? { user } : {}),
    })
  }

  /**
   * End the waits of the last turn when one of them expired. A batch of
   * interrupts resumes as one, so the first expiry ends them all: the turn
   * goes on, and its model gets each call cancelled ("no answer"). chat()
   * refuses any answer to an interrupt past its own `expiresAt`, so then the
   * turn cannot go on: its interrupts end cancelled, and the thread takes
   * new turns again. Only the owner of the log ends them.
   */
  // ponytail: a turn that cannot go on keeps the tool calls with no result
  // in its transcript. chat() repairs them at the next turn.
  protected async expireInterrupted(): Promise<void> {
    const stopped = this.interrupted
    if (!stopped || this.activeTurn || this.queue.length > 0) return
    const now = Date.now()
    const isDue = (at: number | undefined) => at !== undefined && at <= now
    const { interrupts } = stopped
    if (!interrupts.some((item) => isDue(this.interruptExpiry(item)))) return
    if (!(await this.writer.own()) || this.interrupted !== stopped) return
    const resume = interrupts.map((interrupt) => ({
      interruptId: interrupt.id,
      status: 'cancelled' as const,
    }))
    if (interrupts.some((interrupt) => isDue(timeOf(interrupt.expiresAt)))) {
      await this.consumeResume(resume)
      this.interrupted = undefined
      await this.saveInterrupted(undefined)
      this.checkIdle()
      return
    }
    const user = stopped.user ?? this.user
    await this.resolve({
      resume,
      inputId: `expired:${interrupts.map((item) => item.id).join(',')}`,
      ...(user ? { user } : {}),
    })
  }

  /**
   * The session API of plugins. With `user` (a command, a turn plugin),
   * it acts for that user. Without it (a session plugin), it acts for the
   * owner of the session entry, else for the user that opened the
   * session. A `user` option of `send` and `note` wins: a plugin passes
   * the user whose work the turn continues. With `operationId` (a command, a
   * turn plugin), its questions belong to that operation.
   */
  protected override pluginApi(
    user?: HarnessUser,
    metadataSchema?: SchemaInput,
    operationId?: string,
  ): PluginSessionApi {
    // A session plugin acts for the owner of the entry, not for whoever
    // opened the session first on this host. The owner is known only after
    // the session read its entry, so it is read at each call. A turn of
    // `send` or `note` never follows the sender of the running turn: that
    // user did not start the work of the plugin.
    const owner = () => user ?? this.owner ?? this.user
    return {
      threadId: this.threadId,
      get user() {
        return owner()
      },
      snapshot: () => this.snapshot(),
      // A plugin turn always waits its turn. It cannot see a busy rejection.
      send: (text, options) =>
        this.startTurn(
          { op: 'prompt', message: text, busy: 'queue' },
          { user: options?.user ?? owner() },
        ),
      note: async (text, options) => {
        await this.addNote(text)
        if (options?.wake) {
          const receipt = await this.startTurn(
            { op: 'followUp', message: text },
            { user: options.user ?? owner(), wake: true },
          ).receipt
          if (receipt.status === 'rejected')
            throw new InputRejectedError(receipt)
        }
      },
      transcript: () => this.transcript(),
      keptRecords: async (type) => this.keptRecords(type),
      replaceTranscript: (messages) =>
        this.messages.saveThread(this.threadId, messages),
      indexEntry: () => this.index.get(this.indexKey),
      updateIndexEntry: (update) => {
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
        return this.index.update(this.indexKey, (entry) =>
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
      // The public type narrows the answer from the schema. A live wait
      // belongs to the run of its tool call, never to the run of this API.
      ask: ((question: Question<SchemaInput | undefined>) =>
        this.ask(question)) as PluginSessionApi['ask'],
      authRequired: (info) => {
        this.feed.publish(
          'session',
          customEvent(HARNESS_EVENTS.authRequired, { ...info }),
        )
        // The OAuth login of a command is a live wait of that command.
        if (operationId !== undefined) this.openSignIn(info, operationId)
      },
      setPluginSetting: (change) =>
        this.setPluginSetting({ ...change, user: owner() }),
      threadSettings: () => this.threadSettings(),
    }
  }

  /** Operations that follow an input another host runs, or that ran before. */
  private readonly followers = new Set<OperationImpl<ChatTurnResult>>()

  /**
   * @internal Close the session for every handle: stop every running
   * operation, wait for them, then dispose session plugins. Safe to call
   * twice. The host calls it (`host.close`, the idle close, and
   * `host.sessions.delete`). The `close()` of a handle releases only that
   * handle.
   *
   * With `recoverable`, the running turns and agent runs stop as on a host
   * crash: the log gets none of their later writes, so they do not settle
   * and their runs get no aborted state. The host gives the log up, so the
   * next host that opens the thread runs them again at once. `host.close`
   * passes it when a host shuts down, for example for a deploy.
   */
  close(options?: { recoverable?: boolean }): Promise<void> {
    this.closing ??= (async () => {
      // Before the stop, so no write of the stopped work lands.
      // A session whose open failed before the log opened has no writer.
      if (options?.recoverable) this.logWriter?.close()
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
      // Nobody can answer a live question now. The log gets the end, when
      // it still takes writes.
      await Promise.all(
        [...this.questions.keys()].map((questionId) =>
          this.endQuestion(
            questionId,
            'cancelled',
            new Error('Session closed.'),
          ),
        ),
      )
      await Promise.allSettled(
        running.map((operation) => Promise.resolve(operation)),
      )
      // The turn plugins that a run still held, before the feed closes.
      await Promise.all([...this.turnPlugins].map((held) => held.dispose()))
      // The events from before the close land first, so the next host has
      // the text of a cut answer.
      if (options?.recoverable)
        await this.logWriter
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

  /**
   * `id`: a stored or chosen run id. `startedCursor`: the start of a run
   * that a restart rebuilds from the log.
   */
  protected createTurnOperation(
    id?: string,
    startedCursor?: Cursor,
  ): OperationImpl<ChatTurnResult> {
    const operation = new OperationImpl<ChatTurnResult>(
      'chat',
      this.feed,
      (target) => {
        // A cancel on the turn itself acts as its sender, not as the
        // user that opened the session. A handle passes its own.
        const user = this.userOfRun(target.id)
        return this.cancel({
          operationId: target.id,
          ...(user ? { user } : {}),
        })
      },
      undefined,
      id,
      startedCursor,
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
    user: HarnessUser | undefined,
  ) {
    const payload = inputKey(input, user)
    const local = this.admitted.get(inputId)
    const logged = this.writer.state.inputs.get(inputId)
    const stored =
      local ?? (logged ? inputKey(logged.input, logged.user) : undefined)
    if (stored === undefined) return undefined
    if (stored !== payload) {
      const refused = this.createTurnOperation()
      this.refuse(refused, { inputId, status: 'rejected', reason: 'conflict' })
      return refused
    }
    const live = this.turnOperations.get(inputId)
    if (live) return live
    // A join of the replayed turn reads its events from its run start.
    const replay = this.createTurnOperation(
      logged?.operationId,
      this.runStart(logged?.operationId),
    )
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
    void this.settled({ inputId })
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
    user: HarnessUser | undefined,
    at: 'front' | 'end',
  ) {
    const operation = new OperationImpl<ChatTurnResult>(
      'command',
      this.feed,
      (target) => this.cancel({ operationId: target.id }),
    )
    this.track(operation as OperationImpl<unknown>)
    this.bindTurn(inputId, operation)
    const turn: QueuedTurn = {
      operation,
      inputId,
      user,
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
