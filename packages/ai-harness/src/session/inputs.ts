import { EventType } from '@tanstack/ai'
import { isRecord } from '../utils'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  createInputId,
  customEvent,
  errorText,
  storedPrincipal,
  inputKey,
  CHAT_OPS,
  WORK_OPS,
  lastAssistantText,
  checkHostRecords,
} from './helpers'
import { SessionBase } from './base'
import type { OperationImpl } from '../operation'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { HarnessRecord } from '../log'
import type { AnyHarness } from '../define'
import type {
  ChatTurnResult,
  HarnessInput,
  InputSettlement,
  Receipt,
  SessionEvent,
  WaitingInput,
} from '../types'
import type { QueuedTurn, WaitingSteer } from './types'

/**
 * A layer of {@link HarnessSession}: admitting inputs, receipts, and
 * settlements.
 */
export abstract class SessionInputs<
  THarness extends AnyHarness = AnyHarness,
> extends SessionBase<THarness> {
  /**
   * Append host records to the session log, in one batch after the events
   * that wait. Only a durable host (with `stores.log`) has a log. A `type`
   * that starts with `harness.` is refused: the harness owns those.
   * A record can name another session of the same log with `thread`. The
   * append is all or nothing.
   *
   * With `project` on the host, a record can change the model context. The
   * running turn sees the change at its next model call.
   *
   * @example
   * ```ts
   * await session.append([{ type: 'app.signal', text: 'The build failed.' }])
   * ```
   */
  async append(records: ReadonlyArray<LogRecord>): Promise<void> {
    if (!this.writer) {
      throw new Error(
        'session.append needs a durable host (a host with stores.log).',
      )
    }
    checkHostRecords(records)
    await this.writer.append(records)
  }

  /**
   * Cancel one operation, or the running chat turn. On a durable host the
   * abort request is stored first, so a turn that a crash stops later settles
   * `aborted` and does not run again.
   */
  /**
   * Move a running tool call to the background: the call returns at once,
   * and the job keeps running. When it ends, a note tells the model and
   * wakes an idle session. Without `toolCallId`, it moves every running
   * call that supports it, such as `bash` and the agent tools.
   * With no such call, the receipt is rejected with `not_running`.
   *
   * @example
   * ```ts
   * await session.background()
   * ```
   */
  async background(toolCallId?: string): Promise<Receipt> {
    const inputId = createInputId()
    const ids =
      toolCallId === undefined ? [...this.detachable.keys()] : [toolCallId]
    const moves = ids.flatMap((id) => this.detachable.get(id) ?? [])
    if (moves.length === 0) {
      return { inputId, status: 'rejected', reason: 'not_running' }
    }
    for (const id of ids) this.detachable.delete(id)
    for (const move of moves) move()
    return { inputId, status: 'accepted' }
  }

  /**
   * The inputs that wait, in the order they run: first the steers for the
   * running turn, then the queued turns. Change one with `cancelInput` or
   * `setDelivery`.
   *
   * @example
   * ```ts
   * for (const input of session.inputs()) {
   *   if (input.delivery === 'queue') await session.cancelInput(input.inputId)
   * }
   * ```
   */
  inputs() {
    const waiting: Array<WaitingInput> = []
    // A steer with an abort request never runs. It settles with the turn.
    for (const steer of this.steerQueue) {
      if (this.isAbortRequested(steer.inputId)) continue
      waiting.push({
        inputId: steer.inputId,
        delivery: 'steer',
        message: steer.message,
      })
    }
    // A resolve and a turn that recovery runs again have no new message.
    for (const turn of this.queue) {
      if (turn.inputId === undefined || turn.message === undefined) continue
      waiting.push({
        inputId: turn.inputId,
        delivery: 'queue',
        message: turn.message,
      })
    }
    return waiting
  }

  /**
   * How a chat input ended: `completed`, `failed`, `aborted`, or
   * `interrupted` (the turn waits for human input). It waits until the input
   * ends. On a durable host it reads the log, so it also works after a
   * restart and from another host that opens the thread. There it also
   * takes the input id of an agent run from the log.
   *
   * Rejects with `InputRejectedError` when the session refused the input,
   * and with an error for an id this session does not know.
   *
   * @example
   * ```ts
   * const turn = session.prompt('Summarize the report.', { inputId: 'req-42' })
   * const { outcome } = await session.settled('req-42')
   * ```
   */
  async settled(inputId: string): Promise<InputSettlement> {
    const known = this.knownSettlement(inputId)
    if (known) return known
    if (!this.isChatInput(inputId)) {
      throw new Error(
        `The session knows no chat input with the id ${JSON.stringify(inputId)}.`,
      )
    }
    const settledEvent = (entry: SessionEvent) =>
      entry.event.type === EventType.CUSTOM &&
      entry.event.name === HARNESS_EVENTS.inputSettled &&
      isRecord(entry.event.value) &&
      entry.event.value.inputId === inputId
    for await (const _entry of this.feed.read({
      from: this.feed.head(),
      filter: settledEvent,
    })) {
      const settlement = this.knownSettlement(inputId)
      if (settlement) return settlement
    }
    throw new Error('The session closed before the input ended.')
  }

  protected enqueueTurn(turn: QueuedTurn): void {
    // Recovery queues turns without `accept`, so they claim here too.
    this.markBusy()
    this.queue.push(turn)
    this.drain()
  }

  /**
   * Where a turn that runs next goes: after a resolve that answers the turn
   * that just ended, and after the resets that wait, in their order.
   */
  protected frontOfQueue(): number {
    const at = this.queue.findIndex((turn) => !turn.answers && !turn.reset)
    return at < 0 ? this.queue.length : at
  }

  protected isAbortRequested(inputId: string) {
    return (
      this.writer?.state.inputs.get(inputId)?.abortRequested === true ||
      this.abortedSteers.has(inputId)
    )
  }

  /**
   * `steer` joined the running turn `operationId`: it settles with that
   * turn, and a prompt that joined gets the turn's result.
   */
  protected join(
    operationId: string,
    steer: { inputId: string; operation?: OperationImpl<ChatTurnResult> },
  ) {
    const joined = this.turnJoins.get(operationId) ?? []
    joined.push(steer.inputId)
    this.turnJoins.set(operationId, joined)
    const running = this.activeTurn
    // The follower stays in `operations`, so `session.operation(id)` finds
    // it. It ends as the running turn ends.
    if (steer.operation && running) {
      const follower = steer.operation
      running.then(
        (result) =>
          follower.finish(
            running.status() === 'interrupted' ? 'interrupted' : 'completed',
            result,
          ),
        (error: unknown) =>
          follower.fail(
            running.status() === 'cancelled' ? 'cancelled' : 'failed',
            error,
          ),
      )
    }
    if (!this.writer) {
      this.inbox
        .markApplied({ inputId: steer.inputId, operationId })
        .catch((error: unknown) => this.warnSession('harness:inbox', error))
    }
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, {
        inputId: steer.inputId,
        operationId,
      }),
    )
  }

  /** The inputs that joined the turn of `hostInput` (or operation). */
  protected joinedInputs(operationId: string, hostInput: string | undefined) {
    if (this.writer && hostInput !== undefined) {
      return [...this.writer.state.inputs.values()]
        .filter(
          (input) => input.status === 'joined' && input.into === hostInput,
        )
        .map((input) => input.inputId)
    }
    return this.turnJoins.get(operationId) ?? []
  }

  /**
   * Take a waiting input out of the steers or the queue, so it does not run
   * from there. `undefined` when it does not wait: it started, a join holds
   * it, it has an abort request, or the id is not known.
   */
  protected takeWaiting(inputId: string) {
    const steer = this.steerQueue.find(
      (item) =>
        item.inputId === inputId &&
        !this.joining.has(inputId) &&
        !this.isAbortRequested(inputId),
    )
    // This shifts the later steers. `claimJoins` sees that and skips them.
    if (steer) {
      this.steerQueue.splice(this.steerQueue.indexOf(steer), 1)
      return steer
    }
    const turn = this.queue.find((item) => item.inputId === inputId)
    const message = turn?.message
    if (!turn || message === undefined) return undefined
    this.queue.splice(this.queue.indexOf(turn), 1)
    const taken: WaitingSteer = {
      inputId,
      message,
      operation: turn.operation,
      overrides: turn.overrides,
      ephemeral: turn.ephemeral,
      principal: turn.principal,
      context: turn.context,
      ...(turn.wake ? { wake: true } : {}),
    }
    return taken
  }

  /**
   * Mark a `cancelInput` or `setDelivery` input applied. On a durable host,
   * `change` lands in the same append, so a crash never keeps one without
   * the other.
   */
  protected async applyControl(inputId: string, change: HarnessRecord) {
    if (!this.writer) {
      await this.inbox.markApplied({ inputId, operationId: 'session' })
      return
    }
    await this.writer.append([
      change,
      {
        type: 'harness.input.applied',
        inputId,
        operationId: 'session',
        attempt: 1,
      },
    ])
  }

  // ===========================
  // Inbox and lifecycle events
  // ===========================

  /**
   * Store an input, unless its id is known. The check before the first
   * `await` is synchronous, so a second call with the same id in the same
   * tick is a duplicate too. `principal` is who sent it.
   */
  protected async accept(
    inputId: string,
    input: HarnessInput,
    principal = this.principal,
  ): Promise<'new' | 'duplicate' | 'conflict' | 'closed'> {
    const sender = storedPrincipal(principal)
    const payload = inputKey(input, sender.principal)
    const local = this.admitted.get(inputId)
    if (local !== undefined) return local === payload ? 'duplicate' : 'conflict'
    const logged = this.writer?.state.inputs.get(inputId)
    if (logged) {
      return inputKey(logged.input, logged.principal) === payload
        ? 'duplicate'
        : 'conflict'
    }
    // A closing session runs no new work. Nothing is stored.
    if (this.closing && WORK_OPS.has(input.op)) return 'closed'
    this.admitted.set(inputId, payload)
    try {
      // Before the input is stored, so a crash after the write leaves a claim
      // that a sweep finds.
      if (WORK_OPS.has(input.op)) {
        this.markBusy()
        await this.claimWrite
      }
      const at = Date.now()
      if (this.writer) {
        await this.writer.append([
          { type: 'harness.input', inputId, input, at, ...sender },
        ])
      } else {
        const stored = await this.inbox.append({
          inputId,
          threadId: this.threadId,
          input,
          createdAt: at,
          ...sender,
        })
        // The inbox had the id before this session: a restart.
        if (stored.createdAt !== at || stored.status !== 'pending') {
          return inputKey(stored.input, stored.principal) === payload
            ? 'duplicate'
            : 'conflict'
        }
      }
    } catch (error) {
      // Not stored, so a retry with the same id is a new input.
      this.admitted.delete(inputId)
      throw error
    }
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputAccepted, { inputId, op: input.op }),
    )
    return 'new'
  }

  /**
   * Does `stores.runs` have a run with this id, on any thread? A client run
   * id must not reuse it. A store that fails counts as yes, so nothing runs.
   */
  protected async isRunTaken(runId: string): Promise<boolean> {
    const runs = this.persistence.stores.runs
    if (!runs) return false
    return runs.get(runId).then(
      (run) => run !== null,
      () => true,
    )
  }

  /** Record that `operationId` runs the input. A durable host counts attempts. */
  protected async markApplied(
    inputId: string,
    operationId: string,
  ): Promise<void> {
    if (!this.writer) {
      await this.inbox.markApplied({ inputId, operationId })
      return
    }
    const logged = this.writer.state.inputs.get(inputId)
    const timeoutMs = this.harness.durability?.timeoutMs
    // Stamped once, at the first apply. Retries do not move it.
    const timeoutAt =
      logged?.timeoutAt ??
      (timeoutMs !== undefined ? Date.now() + timeoutMs : undefined)
    await this.writer.append([
      {
        type: 'harness.input.applied',
        inputId,
        operationId,
        attempt: (logged?.attempt ?? 0) + 1,
        ...(timeoutAt !== undefined ? { timeoutAt } : {}),
      },
    ])
  }

  protected async applied(inputId: string, operationId: string): Promise<void> {
    await this.markApplied(inputId, operationId)
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, { inputId, operationId }),
    )
  }

  /** Refuse an input. Returns its rejected receipt. */
  protected reject(inputId: string, reason: string) {
    if (this.writer) {
      void this.writer
        .append([{ type: 'harness.input.rejected', inputId, reason }])
        .catch(() => {})
    } else {
      this.inbox
        .markRejected({ inputId, reason })
        .catch((error: unknown) => this.warnSession('harness:inbox', error))
    }
    const receipt: Receipt = { inputId, status: 'rejected', reason }
    this.receipts.set(inputId, receipt)
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputRejected, { inputId, reason }),
    )
    return receipt
  }

  /**
   * Record how inputs ended, all in one append: a turn and the inputs that
   * joined it settle together. Clients get a `harness.input.settled` event.
   */
  protected async settle(
    ...settlements: Array<InputSettlement>
  ): Promise<void> {
    if (this.writer) {
      await this.writer.append(
        settlements.map((settlement) => ({
          type: 'harness.input.settled',
          ...settlement,
        })),
      )
    }
    for (const settlement of settlements) {
      this.settlements.set(settlement.inputId, settlement)
      this.feed.publish(
        settlement.operationId ?? 'session',
        customEvent(HARNESS_EVENTS.inputSettled, { ...settlement }),
      )
    }
  }

  /** How a chat input ended, when it did. Throws for a refused input. */
  protected knownSettlement(inputId: string): InputSettlement | undefined {
    const logged = this.writer?.state.inputs.get(inputId)
    if (logged?.settlement) return logged.settlement
    const refused =
      logged?.status === 'rejected'
        ? { inputId, status: 'rejected' as const, reason: logged.reason ?? '' }
        : this.receipts.get(inputId)
    if (refused?.status === 'rejected') throw new InputRejectedError(refused)
    return this.settlements.get(inputId)
  }

  protected isChatInput(inputId: string) {
    const input = this.writer?.state.inputs.get(inputId)?.input
    // A reset, an agent run, and a message to an agent run in the log
    // settle their input too.
    if (input)
      return (
        CHAT_OPS.has(input.op) ||
        input.op === 'reset' ||
        input.op === 'agent' ||
        input.op === 'agentMessage'
      )
    return this.turnOperations.has(inputId) || this.receipts.has(inputId)
  }

  /** Link a turn operation and its input. */
  protected bindTurn(
    inputId: string,
    operation: OperationImpl<ChatTurnResult>,
  ) {
    this.turnOperations.set(inputId, operation)
    this.operationInputs.set(operation.id, inputId)
  }

  /** Keep a chat input's receipt, for a duplicate of the input. */
  protected keep(receipt: Receipt): Receipt {
    this.receipts.set(receipt.inputId, receipt)
    return receipt
  }

  /** Resolve a turn's receipt, and keep it for a duplicate. */
  protected answerTurn(
    operation: OperationImpl<ChatTurnResult>,
    receipt: Receipt,
  ) {
    operation.resolveReceipt(this.keep(receipt))
  }

  protected refuse(operation: OperationImpl<ChatTurnResult>, receipt: Receipt) {
    this.answerTurn(operation, receipt)
    operation.fail('failed', new InputRejectedError(receipt))
  }

  /** What a duplicate or a conflicting chat input gets back. */
  protected duplicateReceipt(
    inputId: string,
    admission: 'duplicate' | 'conflict' | 'closed',
  ): Receipt {
    if (admission !== 'duplicate') {
      return { inputId, status: 'rejected', reason: admission }
    }
    const kept = this.receipts.get(inputId)
    if (kept) return kept
    const operationId = this.writer?.state.inputs.get(inputId)?.operationId
    return {
      inputId,
      status: 'accepted',
      ...(operationId ? { operationId } : {}),
    }
  }

  /** End `operation` with a stored settlement. */
  protected settleOperation(
    operation: OperationImpl<ChatTurnResult>,
    settlement: InputSettlement,
  ) {
    const text = this.turnText(settlement.inputId)
    switch (settlement.outcome) {
      case 'completed':
        operation.finish('completed', { text, media: [] })
        return
      case 'interrupted': {
        // The interrupts wait still only when this turn stopped last.
        const stopped = this.interrupted
        const interrupts =
          stopped && stopped.runId === settlement.operationId
            ? stopped.interrupts
            : []
        operation.finish('interrupted', { text, interrupts, media: [] })
        return
      }
      case 'aborted':
        operation.fail('cancelled', new Error('Cancelled.'))
        return
      case 'failed':
        operation.fail(
          'failed',
          new Error(settlement.error?.message ?? 'The input failed.'),
        )
        return
    }
  }

  /**
   * The answer of the turn that ran `inputId`, from the log: the last
   * assistant text from where that turn started to where the next one
   * started. A joined input reads the turn it joined. Empty when the log
   * does not know where the turn started.
   */
  // ponytail: positions in the transcript. A revert that drops messages
  // moves them, and a note added after the turn counts as its text. Keep the
  // answer on the settlement record if that matters.
  protected turnText(inputId: string): string {
    const state = this.writer?.state
    const own = state?.inputs.get(inputId)
    const from = (own?.into ? state?.inputs.get(own.into) : own)?.appliedAt
    if (!state || from === undefined) return ''
    // Only a turn or a reset starts a new part of the transcript. An answer,
    // a command, or an agent run is applied during a turn too.
    const starts = [...state.inputs.values()]
      .filter(
        (input) => CHAT_OPS.has(input.input.op) || input.input.op === 'reset',
      )
      .map((input) => input.appliedAt ?? -1)
      .filter((at) => at > from)
    const to = Math.min(state.messages.length, ...starts)
    return lastAssistantText(state.messages.slice(from, to))
  }

  protected publishStarted(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ): void {
    operation.publish(
      customEvent(HARNESS_EVENTS.operationStarted, {
        operationId: operation.id,
        kind: operation.kind,
        ...(operation.agent ? { agent: operation.agent } : {}),
      }),
    )
  }

  protected publishFinished(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ): void {
    operation.publish(
      customEvent(HARNESS_EVENTS.operationFinished, {
        operationId: operation.id,
        status: operation.status(),
      }),
    )
  }

  /**
   * A store write threw where no code catches it. Fail the operation, so no
   * caller waits for it forever.
   */
  protected failOperation(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    error: unknown,
  ): void {
    if (operation.isSettled()) return
    // A cancelled operation ends cancelled. Its cancel event is out already.
    if (operation.abortController.signal.aborted) {
      operation.fail('cancelled', this.logFailure ?? error)
    } else {
      operation.publish({
        type: EventType.RUN_ERROR,
        message: errorText(this.logFailure ?? error),
        timestamp: Date.now(),
      })
      operation.fail('failed', this.logFailure ?? error)
    }
    this.publishFinished(operation)
  }
}
