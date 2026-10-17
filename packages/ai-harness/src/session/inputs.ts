import { EventType } from '@tanstack/ai'
import { isRecord } from '../utils'
import { LogOwnedElsewhereError } from '../ownership'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  createInputId,
  customEvent,
  errorText,
  storedPrincipal,
  inputKey,
  isOfferedInputRecord,
  loggedExtras,
  offeredInputRecord,
  turnRecords,
  CHAT_OPS,
  WORK_OPS,
  lastAssistantText,
  checkHostRecords,
  dropOldest,
} from './helpers'
import { SessionBase } from './base'
import type { AccessRun } from '../access'
import type { OperationImpl } from '../operation'
import type { LogRecord, OfferedInput } from '@tanstack/ai-persistence'
import type { HarnessRecord, InputState } from '../log'
import type { AnyHarness } from '../define'
import type {
  ChatTurnResult,
  HarnessInput,
  InputSettlement,
  Principal,
  Receipt,
  SessionEvent,
  WaitingInput,
} from '../types'
import type { OfferedInputRecord, TurnExtras } from './helpers'
import type { QueuedTurn, WaitingSteer } from './types'

/**
 * How `accept` took an input. `offered`: another host owns the log, and the
 * input waits for that host in the input lane of the log.
 */
export type Admission = 'new' | 'duplicate' | 'conflict' | 'closed' | 'offered'

/** What `accept` stores with an input besides the input itself. */
interface AcceptOptions {
  /**
   * The id that the input runs with: the AG-UI run id of a turn, or the
   * operation id of an agent run. An offered input runs with it on the
   * owner, so this host follows that id in the log.
   */
  runId?: string
  /** The overrides, preamble, and ephemeral messages of a turn. */
  turn?: TurnExtras
  /**
   * The input that goes to the owner when another host owns the log, if it
   * is not the input that this host logs. It throws to refuse the input.
   */
  offer?: () => Promise<HarnessInput>
}

/** The offer that the next `accept` applies. See `applyOffer`. */
interface ApplyingOffer {
  inputId: string
  /** Called when `accept` ends: the input is stored, or refused. */
  stored: () => void
}

/**
 * The access check of one input, before `accept` stores it: the input, and
 * the run that an answer or a cancel targets. It throws to refuse the input.
 */
export type InputCheck = (check: {
  input: HarnessInput
  run: AccessRun | undefined
}) => Promise<void>

/**
 * A layer of {@link HarnessSession}: admitting inputs, receipts, and
 * settlements.
 */
export abstract class SessionInputs<
  THarness extends AnyHarness = AnyHarness,
> extends SessionBase<THarness> {
  /**
   * Inputs that this host offered to the owner of the log. `settled` waits
   * for them. The oldest ids go, as in the window of settled operations.
   */
  protected readonly offeredInputs = new Set<string>()

  /** The check that the next `accept` runs. See `checked`. */
  private pendingCheck: InputCheck | undefined
  /** The offer that the next `accept` applies. See `applyOffer`. */
  private applying: ApplyingOffer | undefined
  /** The drain of the input lane that runs. See `drainOffers`. */
  private draining: Promise<void> | undefined
  /** An offer came while the drain ran: the drain reads the lane again. */
  private drainAgain = false
  /** The session opened: it can apply offers. Plugins and recovery are ready. */
  protected acceptsOffers = false

  /**
   * @internal Run `call`, and run `check` on the input that it stores,
   * before the input is stored. The handle of `host.open` checks access
   * through it. Each method that stores an input calls `accept` before its
   * first `await`, so the check reaches the input of `call` and no other. A
   * call that returns before `accept` stores nothing.
   */
  checked<T>(check: InputCheck, call: () => T): T {
    this.pendingCheck = check
    try {
      return call()
    } finally {
      this.pendingCheck = undefined
    }
  }

  /**
   * The run that `input` answers or cancels, and who started it, when the
   * session knows. Other inputs target no run.
   */
  protected runOf(input: HarnessInput): AccessRun | undefined {
    switch (input.op) {
      case 'resolve': {
        const stopped = this.interrupted
        if (!stopped) return undefined
        return { runId: stopped.runId, ...idOf(stopped.principal) }
      }
      case 'answer': {
        const operationId = this.questions.get(input.questionId)?.operationId
        return operationId === undefined
          ? undefined
          : this.startedBy(operationId)
      }
      case 'cancel': {
        const operationId = input.operationId ?? this.activeTurn?.id
        return operationId === undefined
          ? undefined
          : this.startedBy(operationId)
      }
      case 'cancelInput':
        return { runId: input.inputId, ...idOf(this.senderOf(input.inputId)) }
      case 'prompt':
      case 'steer':
      case 'followUp':
      case 'continue':
      case 'tool':
      case 'reset':
      case 'command':
      case 'agent':
      case 'agentMessage':
      case 'setDelivery':
      case 'background':
      case 'append':
      case 'configure':
      case 'config':
      case 'revert':
      case 'unrevert':
        return undefined
    }
  }

  /** The operation `operationId`, with the id of who started it when known. */
  protected startedBy(operationId: string): AccessRun {
    const chain = this.chainOf.get(operationId)
    const agentRun = [...(chain?.runs ?? []), ...(chain?.followUps ?? [])].find(
      (run) => run.operation.id === operationId,
    )
    const inputId = this.operationInputs.get(operationId)
    const principal =
      this.activeTurn?.id === operationId
        ? this.turnPrincipal
        : agentRun
          ? agentRun.principal
          : inputId !== undefined
            ? this.senderOf(inputId)
            : undefined
    return { runId: operationId, ...idOf(principal) }
  }

  /** Who sent the input `inputId`: from the log, or from what waits. */
  protected senderOf(inputId: string) {
    return (
      this.writer.state.inputs.get(inputId)?.principal ??
      this.steerQueue.find((steer) => steer.inputId === inputId)?.principal ??
      this.queue.find((turn) => turn.inputId === inputId)?.principal
    )
  }

  /**
   * Append host records to the session log, in one batch after the events
   * that wait. A `type` that starts with `harness.` is refused: the harness
   * owns those.
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
    checkHostRecords(records)
    await this.writer.append(records)
  }

  /**
   * Cancel one operation, or the running chat turn. The abort request is
   * stored first, so a turn that a crash stops later settles `aborted` and
   * does not run again.
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
   * ends. It reads the log, so it also works after a restart and from
   * another host that opens the thread. It also takes the input id of an
   * agent run from the log.
   *
   * Rejects with `InputRejectedError` when the session refused the input,
   * and with an error for an id this session does not know.
   *
   * @example
   * ```ts
   * const turn = session.send('Summarize the report.', { inputId: 'req-42' })
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
      this.writer.state.inputs.get(inputId)?.abortRequested === true ||
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
    if (hostInput !== undefined) {
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

  /** Take a queued `continue()` out of the queue, for `cancelInput`. */
  protected takeQueuedContinue(
    inputId: string,
  ): Pick<WaitingSteer, 'operation'> | undefined {
    const turn = this.queue.find(
      (item) => item.inputId === inputId && item.isContinue,
    )
    if (!turn) return undefined
    this.queue.splice(this.queue.indexOf(turn), 1)
    return { operation: turn.operation }
  }

  /**
   * The thread waits for interrupts and nothing queued or running can
   * resolve them, so a new turn would fail with `pending_interrupts`.
   */
  protected waitsForInterrupts(): boolean {
    return (
      this.interrupted !== undefined &&
      this.activeTurn === undefined &&
      this.queue.length === 0
    )
  }

  /**
   * Mark a `cancelInput` or `setDelivery` input applied. `change` lands in
   * the same append, so a crash never keeps one without the other.
   */
  protected async applyControl(inputId: string, change: HarnessRecord) {
    // Also an input that recovery took: it has no other end.
    this.inputRecords.end(inputId)
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
  // Inputs and lifecycle events
  // ===========================

  /**
   * Store an input, unless its id is known. The check before the first
   * `await` is synchronous, so a second call with the same id in the same
   * tick is a duplicate too. `principal` is who sent it. The access check of
   * a `checked` call runs first: a refused input is not stored, and the
   * error rejects this call. The `turn` record goes in the append of the
   * input, so a crash keeps both or neither.
   *
   * When another host owns the log, the input goes to that host through the
   * input lane (`offered`). An input from the lane (see `applyOffer`)
   * consumes its offer in the same append.
   */
  protected async accept(
    inputId: string,
    input: HarnessInput,
    principal = this.principal,
    options: AcceptOptions = {},
  ): Promise<Admission> {
    // Before the first `await`, as the check: only this call takes it.
    const offer = this.applying?.inputId === inputId ? this.applying : undefined
    if (offer) this.applying = undefined
    try {
      return await this.admit({ inputId, input, principal, options, offer })
    } finally {
      offer?.stored()
    }
  }

  private async admit({
    inputId,
    input,
    principal,
    options,
    offer,
  }: {
    inputId: string
    input: HarnessInput
    principal: Principal | undefined
    options: AcceptOptions
    offer: ApplyingOffer | undefined
  }): Promise<Admission> {
    const check = this.pendingCheck
    this.pendingCheck = undefined
    if (check) await check({ input, run: this.runOf(input) })
    const sender = storedPrincipal(principal)
    const known = this.knownAdmission(
      inputId,
      inputKey(input, sender.principal),
    )
    const consumes = offer ? [inputId] : []
    if (known) {
      // The input ran before: its offer goes, and it does not run again.
      if (offer) await this.writer.append([], { consumes })
      return known
    }
    // A closing session runs no new work. Nothing is stored. An offer stays
    // for the next owner.
    if (this.closing && WORK_OPS.has(input.op)) return 'closed'
    this.admitted.set(inputId, inputKey(input, sender.principal))
    try {
      const records = options.turn ? turnRecords(inputId, options.turn) : []
      await this.writer.append(
        [
          { type: 'harness.input', inputId, input, at: Date.now(), ...sender },
          ...records,
        ],
        { consumes },
      )
    } catch (error) {
      // Not stored, so a retry with the same id is a new input.
      this.admitted.delete(inputId)
      if (!(error instanceof LogOwnedElsewhereError)) throw error
      // Another host owns the log. An offer stays for it. Else the input
      // goes to it.
      if (offer) return 'offered'
      return await this.offerInput({ inputId, input, principal, options })
    }
    // An input with no work to run (a cancel, a setting) ends once stored.
    if (!WORK_OPS.has(input.op)) this.inputRecords.end(inputId)
    this.feed.publish(
      'session',
      customEvent(HARNESS_EVENTS.inputAccepted, { inputId, op: input.op }),
    )
    return 'new'
  }

  /** `duplicate` or `conflict` for an input id that is known, else `undefined`. */
  private knownAdmission(inputId: string, payload: string) {
    const local = this.admitted.get(inputId)
    if (local !== undefined) return local === payload ? 'duplicate' : 'conflict'
    const logged = this.writer.state.inputs.get(inputId)
    if (!logged) return undefined
    return inputKey(logged.input, logged.principal) === payload
      ? 'duplicate'
      : 'conflict'
  }

  /**
   * Another host owns the log: offer the input to it. The owner runs it, and
   * this host reads how it ends in the log. The receipt is `queued`.
   */
  private async offerInput({
    inputId,
    input,
    principal,
    options,
  }: {
    inputId: string
    input: HarnessInput
    principal: Principal | undefined
    options: AcceptOptions
  }): Promise<Admission> {
    const { offer, ...extras } = options
    const record = offeredInputRecord({
      inputId,
      input: offer ? await offer() : input,
      principal,
      ...extras,
    })
    const offered = await this.writer.offer(inputId, record)
    if (offered === 'conflict') return 'conflict'
    this.offeredInputs.add(inputId)
    dropOldest(this.offeredInputs, this.retention.settledOperations)
    return 'offered'
  }

  /**
   * Apply the inputs that other hosts offered to this thread, in offer
   * order: the input lane. Only the owner of the log applies them. This host
   * gets the log first, and does nothing while another live host owns it.
   * Each input runs as if it came to this host. Its record consumes its
   * offer in the same append, so it never runs twice. One call runs at a
   * time: a call while a drain runs makes that drain read the lane again.
   * The thread is busy while a drain runs, so it does not close on idle
   * before it applied the offers.
   */
  protected drainOffers(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true
      return this.draining
    }
    const run = async () => {
      do {
        this.drainAgain = false
        await this.drainOnce()
      } while (this.drainAgain && !this.closing)
    }
    this.draining = this.admitting(run).finally(() => {
      this.draining = undefined
    })
    return this.draining
  }

  private async drainOnce(): Promise<void> {
    const writer = this.logWriter
    const isReady =
      writer !== undefined &&
      this.acceptsOffers &&
      !this.closing &&
      !this.logFailure
    if (!isReady) return
    try {
      // ponytail: a host that waits for its own offer reads the lane after
      // each append of the owner. A store that can say "offer" in its
      // notification could skip those reads.
      if ((await writer.offered()).length === 0) return
      if (!(await writer.own())) return
    } catch (error) {
      this.warnSession('harness:inputs', error)
      return
    }
    try {
      // This host takes the log from an owner that stopped. Its work runs
      // first, as on an open.
      if (this.recoveryDeferred) {
        this.recoveryDeferred = false
        try {
          await this.recoverFromLog(writer)
        } catch (error) {
          this.recoveryDeferred = true
          throw error
        }
      }
      // Read again as the owner: no other host consumes offers now.
      const offers = await writer.offered()
      for (const offer of offers) {
        if (this.closing || this.logFailure || writer.fenced) return
        await this.applyOffer(offer)
      }
    } catch (error) {
      this.warnSession('harness:inputs', error)
    }
  }

  /**
   * Apply one offer, and wait until `accept` stored or refused its input.
   * An offer that no `accept` takes (a record of another kind, or a call
   * that ends before `accept`, such as a duplicate prompt) goes, so the
   * lane does not keep it.
   */
  private async applyOffer(offer: OfferedInput) {
    const { inputId, record } = offer
    const isInput = isOfferedInputRecord(record) && record.inputId === inputId
    if (isInput) {
      let stored = () => {}
      const done = new Promise<void>((resolve) => {
        stored = resolve
      })
      this.applying = { inputId, stored }
      let isTaken = false
      try {
        this.applyOffered(record)
      } finally {
        isTaken = this.applying === undefined
        this.applying = undefined
      }
      if (isTaken) {
        await done
        return
      }
    }
    await this.writer.append([], { consumes: [inputId] })
  }

  /**
   * Run an offered input as if it came to this host. Nobody here waits for
   * its result: the host that offered it reads the log. Each call reaches
   * `accept` before its first `await`, so `accept` takes the offer.
   */
  private applyOffered(record: OfferedInputRecord): void {
    const session = this.self()
    const { input, inputId, principal } = record
    const user = principal ? { principal } : {}
    const run = record.runId !== undefined ? { runId: record.runId } : {}
    const turn = record.overrides ? loggedExtras(record.overrides) : {}
    const sent = {
      inputId,
      ...user,
      ...('context' in input && input.context !== undefined
        ? { context: input.context }
        : {}),
    }
    const ignore = (work: PromiseLike<unknown>) => {
      work.then(
        () => {},
        () => {},
      )
    }
    switch (input.op) {
      case 'prompt':
        ignore(
          session.send(input.message, {
            ...sent,
            ...turn,
            ...(input.busy ? { busy: input.busy } : {}),
            ...run,
          }),
        )
        return
      case 'continue':
        ignore(session.continue({ ...sent, ...turn }))
        return
      case 'steer':
        ignore(session.send(input.message, { ...sent, ...turn, mode: 'steer' }))
        return
      case 'followUp':
        ignore(
          this.startTurn(input, {
            ...sent,
            ...turn,
            mode: 'followUp',
            ...(input.wake ? { wake: true } : {}),
          }),
        )
        return
      case 'resolve':
        ignore(this.resolveForRun({ resume: input.resume, ...sent, ...run }))
        return
      case 'reset':
        ignore(session.reset({ note: input.note, ...sent }))
        return
      case 'configure':
        ignore(session.configure({ settings: input.settings, ...sent }))
        return
      case 'agentMessage':
        ignore(
          session.send(input.message, {
            ...sent,
            to: input.operationId,
            mode: input.mode,
          }),
        )
        return
      case 'agent':
        ignore(
          this.runAgent(input.agent, input.input, {
            ...user,
            ...(input.detached ? { wake: true } : {}),
            ...(input.resume ? { resume: true } : {}),
            ...(input.attach ? { attach: input.attach } : {}),
            offered: { inputId, ...run },
          }),
        )
        return
      case 'cancel':
        ignore(
          session.cancel({ operationId: input.operationId, inputId, ...user }),
        )
        return
      case 'cancelInput':
        ignore(session.cancelInput(input.inputId, { inputId, ...user }))
        return
      case 'setDelivery':
        ignore(
          session.setDelivery({
            inputId: input.inputId,
            delivery: input.delivery,
            controlId: inputId,
            ...user,
          }),
        )
        return
      case 'command':
        ignore(
          session.command({
            name: input.name,
            input: input.input,
            inputId,
            ...user,
          }),
        )
        return
      case 'answer':
        ignore(
          session.answer({
            questionId: input.questionId,
            value: input.value,
            ...(input.ref !== undefined ? { ref: input.ref } : {}),
            inputId,
            ...user,
          }),
        )
        return
      case 'config':
        ignore(
          session.setConfig({
            key: input.key,
            value: input.value,
            inputId,
            ...user,
          }),
        )
        return
      case 'tool':
        ignore(
          session.tool({
            name: input.name,
            // Wire args are unknown here. The tool's input schema checks them.
            args: input.args as never,
            inputId,
            ...user,
            ...(input.meta ? { meta: input.meta } : {}),
          }),
        )
        return
      case 'revert':
      case 'unrevert':
      case 'background':
      case 'append':
        // These run only where they are called. No host offers them.
        return
    }
  }

  /**
   * Does the log of this thread have a run with this id? A client run id
   * must not reuse it. The log id has the tenant, so another tenant's run
   * with this id is not here.
   */
  protected isRunTaken(runId: string) {
    return this.writer.state.thread.runs.has(runId)
  }

  /**
   * Record that `operationId` runs the input, and count the attempt.
   * `records` go first in the same append, so a crash keeps both or neither.
   */
  protected async markApplied(
    inputId: string,
    operationId: string,
    records: ReadonlyArray<LogRecord> = [],
  ): Promise<void> {
    const logged = this.writer.state.inputs.get(inputId)
    const timeoutMs = this.harness.durability?.timeoutMs
    // Stamped once, at the first apply. Retries do not move it.
    const timeoutAt =
      logged?.timeoutAt ??
      (timeoutMs !== undefined ? Date.now() + timeoutMs : undefined)
    await this.writer.append([
      ...records,
      {
        type: 'harness.input.applied',
        inputId,
        operationId,
        attempt: (logged?.attempt ?? 0) + 1,
        ...(timeoutAt !== undefined ? { timeoutAt } : {}),
      },
    ])
  }

  /** {@link markApplied}, then the `harness.input.applied` event. */
  protected async applied(
    inputId: string,
    operationId: string,
    records: ReadonlyArray<LogRecord> = [],
  ): Promise<void> {
    await this.markApplied(inputId, operationId, records)
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.inputApplied, { inputId, operationId }),
    )
  }

  /** Refuse an input. Returns its rejected receipt. */
  protected reject(inputId: string, reason: string) {
    void this.writer
      .append([{ type: 'harness.input.rejected', inputId, reason }])
      .catch(() => {})
    const receipt: Receipt = { inputId, status: 'rejected', reason }
    this.inputRecords.reject(receipt)
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
  protected settle(...settlements: Array<InputSettlement>): Promise<void> {
    return this.settleWith(settlements, [])
  }

  /** {@link settle}, with `records` first in the same append. */
  protected async settleWith(
    settlements: ReadonlyArray<InputSettlement>,
    records: ReadonlyArray<LogRecord>,
  ): Promise<void> {
    await this.writer.append([
      ...records,
      ...settlements.map((settlement) => ({
        type: 'harness.input.settled',
        ...settlement,
      })),
    ])
    for (const settlement of settlements) {
      this.inputRecords.settle(settlement)
      this.feed.publish(
        settlement.operationId ?? 'session',
        customEvent(HARNESS_EVENTS.inputSettled, { ...settlement }),
      )
    }
  }

  /** How a chat input ended, when it did. Throws for a refused input. */
  protected knownSettlement(inputId: string): InputSettlement | undefined {
    const logged = this.writer.state.inputs.get(inputId)
    if (logged?.settlement) return logged.settlement
    const refused =
      logged?.status === 'rejected'
        ? {
            inputId,
            status: 'rejected' as const,
            reason: rejectedReason(logged),
          }
        : this.inputRecords.receipt(inputId)
    if (refused?.status === 'rejected') throw new InputRejectedError(refused)
    return this.inputRecords.settlement(inputId)
  }

  protected isChatInput(inputId: string) {
    const input = this.writer.state.inputs.get(inputId)?.input
    // A reset, an agent run, and a message to an agent run in the log
    // settle their input too.
    if (input)
      return (
        CHAT_OPS.has(input.op) ||
        input.op === 'reset' ||
        input.op === 'agent' ||
        input.op === 'agentMessage'
      )
    return (
      this.turnOperations.has(inputId) ||
      this.inputRecords.receipt(inputId) !== undefined ||
      this.offeredInputs.has(inputId)
    )
  }

  /** Link a turn operation and its input. */
  protected bindTurn(
    inputId: string,
    operation: OperationImpl<ChatTurnResult>,
  ) {
    this.inputRecords.bind(inputId, operation)
  }

  /** Keep a chat input's receipt, for a duplicate of the input. */
  protected keep(receipt: Receipt) {
    return this.inputRecords.keep(receipt)
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
    admission: Exclude<Admission, 'new'>,
  ): Receipt {
    if (admission !== 'duplicate' && admission !== 'offered') {
      return { inputId, status: 'rejected', reason: admission }
    }
    if (admission === 'offered') return { inputId, status: 'queued' }
    const kept = this.inputRecords.receipt(inputId)
    if (kept) return kept
    const operationId = this.writer.state.inputs.get(inputId)?.operationId
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
    const { state } = this.writer
    const own = state.inputs.get(inputId)
    const from = (own?.into ? state.inputs.get(own.into) : own)?.appliedAt
    if (from === undefined) return ''
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
    // A log failure aborts operations too, but they fail and say why.
    if (operation.abortController.signal.aborted && !this.logFailure) {
      operation.fail('cancelled', this.logFailure ?? error)
    } else {
      operation.publish({
        type: EventType.RUN_ERROR,
        message: this.scrub(errorText(this.logFailure ?? error)),
        timestamp: Date.now(),
      })
      operation.fail('failed', this.logFailure ?? error)
    }
    this.publishFinished(operation)
  }
}

/** The `principalId` field of an {@link AccessRun}, when the run has a user. */
const idOf = (principal: { id: string } | undefined) =>
  principal ? { principalId: principal.id } : {}

/** The reason of a rejected input record. A rejected record always has one. */
function rejectedReason(logged: InputState): string {
  if (logged.reason === undefined) {
    throw new Error(
      `The log has a rejected input "${logged.inputId}" with no reason.`,
    )
  }
  return logged.reason
}
