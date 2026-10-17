import { LogRecordsCapability, provideLogRecords } from '@tanstack/ai'
import { bindDurable, createToolStep } from '../durable-tool'
import { waitUntil } from '../utils'
import { commonPrefix, stepKey } from '../log'
import { mediaIdOf, mediaOfMessage } from '../media-ref'
import { LogOwnedElsewhereError } from '../ownership'
import { HARNESS_EVENTS } from '../types'
import { callUsage } from '../usage'
import {
  asUserMessage,
  createMessageId,
  customEvent,
  storedPrincipal,
  isSameSender,
  WAKE_METADATA,
  resetContext,
  TIMEOUT_REASON,
  checkHostRecords,
} from './helpers'
import { SessionRequests } from './requests'
import type { OperationImpl } from '../operation'
import type {
  AnyChatMiddleware,
  AnyTool,
  ModelMessage,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { DurableBind } from '../durable-tool'
import type { LogWriter } from '../log'
import type { UsageCall } from '../usage'
import type { AnyHarness } from '../define'
import type { TurnAdditions } from '../turn'
import type { MountedPlugins } from '../plugins'
import type {
  ChatTurnResult,
  MediaRecord,
  Principal,
  RunContext,
  TurnInfo,
  UserInput,
} from '../types'
import type { QueuedTurn, AgentRunImpl, AgentChain } from './types'

/**
 * A layer of {@link HarnessSession}: the tools, middleware, and joins a turn
 * uses.
 */
export abstract class SessionTurnParts<
  THarness extends AnyHarness = AnyHarness,
> extends SessionRequests<THarness> {
  /**
   * The `step` and `append` a durable tool call gets, in `run`. A step value
   * is in the log before `step.do` resolves. Staged records land with the
   * call's stored result, so a call that a crash cuts leaves none of them.
   * A step does not start after another host took the log. A `step.sleep`
   * keeps a wake schedule in the log while it waits (see `sleepUntil`).
   */
  protected durableBinding(
    writer: LogWriter,
    toolCallId: string,
    run: RunContext,
  ) {
    const step = createToolStep({
      recorded: (name) => {
        const key = stepKey(toolCallId, name)
        return writer.state.steps.has(key)
          ? { found: true, value: writer.state.steps.get(key) }
          : { found: false }
      },
      record: (name, value) =>
        writer.append([{ type: 'harness.tool.step', toolCallId, name, value }]),
      run: (name) => {
        if (writer.fenced) throw new LogOwnedElsewhereError(writer.logId)
        return {
          idempotencyKey: run.idempotencyKey(name, toolCallId),
          epoch: run.epoch,
        }
      },
      sleep: ({ name, wakeAt }) =>
        this.sleepUntil({
          writer,
          scheduleId: `sleep:${toolCallId}:${name}`,
          wakeAt,
          signal: run.signal,
        }),
    })
    const append = (records: ReadonlyArray<LogRecord>) => {
      checkHostRecords(records)
      writer.stage(records, toolCallId)
    }
    return { step, append }
  }

  /**
   * Wait for a `step.sleep` until `wakeAt`. While it waits, the log keeps a
   * wake schedule (no input) with `scheduleId`: a host that stops releases
   * the log with that wake, so a worker takes the log at the wake time and
   * recovery runs the call again. The schedule ends when the sleep ends.
   *
   * ponytail: the sleep waits in this process, and the host keeps the log
   * while it waits. It does not end the attempt and free the host: the log
   * view cannot drop the writes of one turn only. The wake makes it durable
   * when the host stops.
   */
  protected async sleepUntil({
    writer,
    scheduleId,
    wakeAt,
    signal,
  }: {
    writer: LogWriter
    scheduleId: string
    wakeAt: number
    signal: AbortSignal
  }) {
    const isWaiting = () => writer.state.thread.schedules.has(scheduleId)
    if (Date.now() < wakeAt) {
      if (!isWaiting()) {
        await writer.append([
          { type: 'harness.schedule', scheduleId, at: wakeAt },
        ])
      }
      await waitUntil(wakeAt, signal)
    }
    if (isWaiting()) {
      await writer.append([{ type: 'harness.schedule.done', scheduleId }])
    }
  }

  /**
   * Ask each plugin for the tools it found since the last turn, for `turn`.
   * A plugin that fails (for example an MCP server that is down) is skipped,
   * and clients get a `harness.plugin.warning` event.
   */
  protected async discoverTools(
    discoverers: MountedPlugins['discoverers'],
    taken: Set<string>,
    operation: OperationImpl<ChatTurnResult>,
    turn: TurnInfo,
  ): Promise<Array<AnyTool>> {
    const found: Array<AnyTool> = []
    for (const { discover, owner } of discoverers) {
      try {
        const tools = await discover(turn)
        for (const tool of tools) {
          if (taken.has(tool.name)) continue
          taken.add(tool.name)
          found.push(tool)
        }
      } catch (error) {
        this.warn(operation, owner, error)
      }
    }
    return found
  }

  /**
   * Let each plugin change the tool list of this turn, in plugin order. A
   * plugin that fails leaves the list as it was, with a warning event.
   */
  protected async prepareTools(
    preparers: MountedPlugins['preparers'],
    turn: { tools: Array<AnyTool>; model: string },
    operation: OperationImpl<ChatTurnResult>,
  ): Promise<Array<AnyTool>> {
    let prepared = turn.tools
    for (const { prepare, owner } of preparers) {
      try {
        prepared = [...(await prepare({ tools: prepared, model: turn.model }))]
      } catch (error) {
        this.warn(operation, owner, error)
      }
    }
    return prepared
  }

  /** The binder of the durable tools of `run`: each call gets its steps in the log. */
  protected durableBinder(run: RunContext): DurableBind {
    const { writer } = this
    return (toolCallId) => this.durableBinding(writer, toolCallId, run)
  }

  /**
   * Middleware that binds the durable tools of each model call with
   * `bindTool`: a middleware can return new tools from `onConfig`, and the
   * engine runs the tools of that list.
   */
  protected durableTools(bindTool: DurableBind): AnyChatMiddleware {
    return {
      name: 'harness:durable-tools',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
        const tools = config.tools.map((tool) => bindDurable(tool, bindTool))
        const isSame = tools.every(
          (tool, index) => tool === config.tools[index],
        )
        return isSame ? undefined : { tools }
      },
    }
  }

  /**
   * Middleware that gives each tool call of a turn `threadId`, `runId`, and
   * `detach` in its context. `detach` lets `background()` move the call to
   * the background. A tool that calls `detach` supports it. The wake turn of
   * a detached job runs as `principal`, the sender of the turn.
   */
  protected detachTools(
    runId: string,
    principal: Principal | undefined,
  ): AnyChatMiddleware {
    // Each model call gets the tools of the last one. Wrap each tool once.
    const wrapped = new WeakSet<AnyTool>()
    const wrap = (tool: AnyTool): AnyTool => {
      const { execute } = tool
      if (!execute || wrapped.has(tool)) return tool
      const next: AnyTool = {
        ...tool,
        execute: (args: unknown, context?: ToolExecutionContext) => {
          const id = context?.toolCallId
          if (!context || id === undefined) return execute(args, context)
          context.threadId = this.threadId
          context.runId = runId
          context.detach = (work) =>
            new Promise((moved) => {
              this.detachable.set(id, () => {
                this.logJob(id, false)
                moved(
                  `The job moved to the background. Its id is ${id}. You get a note when it ends.`,
                )
                // Like other background jobs: a note that wakes the session.
                work
                  .then(
                    (result) =>
                      `Background job ${id} ended.\n${typeof result === 'string' ? result : JSON.stringify(result)}`,
                    (error: unknown) =>
                      this.scrub(
                        `Background job ${id} failed: ${error instanceof Error ? error.message : String(error)}`,
                      ),
                  )
                  .then((text) =>
                    this.pluginApi(principal).note(text, { wake: true }),
                  )
                  .then(() => this.logJob(id, true))
                  .catch(() => undefined)
              })
            })
          return Promise.resolve(execute(args, context)).finally(() =>
            this.detachable.delete(id),
          )
        },
      }
      wrapped.add(next)
      return next
    }
    return {
      name: 'harness:detach-tools',
      onConfig: (ctx, config) => {
        if (ctx.phase !== 'init' && ctx.phase !== 'beforeModel') return
        return { tools: config.tools.map(wrap) }
      },
    }
  }

  /**
   * Each turn's chat run gets `LogRecordsCapability`. A middleware, for
   * example a durable compaction, appends host records with it. They land in the log at once and fold, with the checks of
   * `session.append`. The engine's new messages go in the same append, so a
   * record that counts the tool results of the last phase lands after them.
   * Agent runs do not get it: a child writes to its own thread.
   */
  protected logRecords(): AnyChatMiddleware {
    const { engine } = this
    return {
      name: 'harness:log-records',
      provides: [LogRecordsCapability],
      setup: (ctx) =>
        provideLogRecords(ctx, {
          append: async (records) => {
            checkHostRecords(records)
            // The engine's live list, read at the time of the append.
            await engine.appendRecords(ctx.messages, records)
          },
        }),
    }
  }

  /**
   * Middleware that counts the usage of each model call of `operation` for
   * `principal`. The count does not hold back the stream: chat() waits for it
   * after the run.
   */
  protected usageCounter(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    principal: Principal | undefined,
  ): AnyChatMiddleware {
    return {
      name: 'harness:usage',
      onUsage: (ctx, usage) => {
        ctx.defer(
          this.countUsage(operation, {
            model: `${ctx.provider}/${ctx.model}`,
            ...storedPrincipal(principal),
            usage: callUsage(usage),
          }),
        )
      },
    }
  }

  /**
   * Add one model call to the totals, and send a `harness.usage` event. The
   * session writes a `harness.usage` record, and the log fold adds it.
   */
  protected async countUsage(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    call: UsageCall,
  ): Promise<void> {
    try {
      await this.writer.append([{ type: 'harness.usage', ...call }])
    } catch (error) {
      // A refused log append stops the session already.
      this.warn(operation, 'harness:usage', error)
      return
    }
    operation.publish(
      customEvent(HARNESS_EVENTS.usage, {
        model: call.model,
        ...(call.principal ? { sender: call.principal.id } : {}),
        usage: call.usage,
        total: this.usage().total,
      }),
    )
  }

  /**
   * Take the waiting steers that join now: the prefix up to the first one
   * that has an abort request, or that `turn.canJoin` refuses. Without
   * `canJoin`, only a steer of the running turn's sender joins, so nobody's
   * message runs with another person's credentials. A steer that a join
   * took already stays in, with no new check. Returns how many.
   */
  protected async claimJoins() {
    const canJoin = this.harness.turn?.canJoin
    const turnPrincipal = this.sender()
    let count = 0
    const checked = [...this.steerQueue]
    for (const steer of checked) {
      if (!this.joining.has(steer.inputId)) {
        if (this.isAbortRequested(steer.inputId)) break
        const candidate = {
          inputId: steer.inputId,
          message: steer.message,
          ...(steer.principal ? { principal: steer.principal } : {}),
          ...(turnPrincipal ? { turnPrincipal } : {}),
        }
        const isAllowed = canJoin
          ? await canJoin(candidate)
          : isSameSender(steer.principal, turnPrincipal)
        if (!isAllowed) break
      }
      count += 1
    }
    // A cancel or a move can land while canJoin runs. A moved steer shifts
    // the list, so only steers still at their checked place join. No await
    // from here to the claim.
    const steers = this.steerQueue.slice(0, count)
    const late = steers.findIndex(
      (steer, index) =>
        steer !== checked[index] ||
        (!this.joining.has(steer.inputId) &&
          this.isAbortRequested(steer.inputId)),
    )
    const taken = late >= 0 ? steers.slice(0, late) : steers
    for (const steer of taken) this.joining.add(steer.inputId)
    return taken.length
  }

  /**
   * Middleware that runs before each model call. Queued steers join the
   * running turn in admission order, as far as `claimJoins` lets them.
   * `turn.onJoin` adds its messages after theirs. One append commits the
   * engine's messages, the steer messages, the join
   * records, and the `onJoin` records, so a crash never splits a join. The
   * model gets the folded log when a host record changed the context. The
   * `onJoin` ephemeral messages go to `ephemeral`, for this model call. It
   * runs before the harness middleware, so they get the steer messages too.
   */
  protected steering(ephemeral: Array<ModelMessage>): AnyChatMiddleware {
    return {
      name: 'harness:steering',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel') return undefined
        const count = await this.claimJoins()
        const steers = this.steerQueue.slice(0, count)
        try {
          const running =
            this.activeTurn?.id === ctx.runId ? this.activeTurn : undefined
          const onJoin = this.harness.turn?.onJoin
          let added: TurnAdditions | undefined
          if (steers.length > 0 && onJoin && running) {
            added = await onJoin({
              session: this.self(),
              operationId: ctx.runId,
              inputs: steers.map((steer) => ({
                inputId: steer.inputId,
                message: steer.message,
                ...(steer.principal ? { principal: steer.principal } : {}),
              })),
              signal: running.abortController.signal,
            })
            // A cancelled turn gets nothing from the hook. Its steers run as
            // their own turns.
            if (running.abortController.signal.aborted) return undefined
          }
          const records = added?.records ?? []
          checkHostRecords(records)
          const hostInput = this.operationInputs.get(ctx.runId)
          const joins = hostInput
            ? steers.map((steer) => ({
                type: 'harness.input.joined',
                inputId: steer.inputId,
                into: hostInput,
              }))
            : []
          const list = [
            ...config.messages,
            ...steers.map(
              (steer): ModelMessage => ({
                id: createMessageId(),
                role: 'user',
                content: steer.message,
                ...(steer.wake ? { metadata: WAKE_METADATA } : {}),
              }),
            ),
            ...(added?.messages ?? []).map(
              (message): ModelMessage =>
                message.id ? message : { ...message, id: createMessageId() },
            ),
          ]
          const synced = await this.engine.beforeModel(list, [
            ...joins,
            ...records,
          ])
          // Only now, so a hook or an append that fails leaves them waiting.
          this.steerQueue.splice(0, count)
          for (const steer of steers) this.join(ctx.runId, steer)
          ephemeral.push(...(added?.ephemeral ?? []))
          if (list.length === config.messages.length && !synced) {
            return undefined
          }
          // ponytail: no middleware before this one changes what the model
          // call gets (`providerMessages`), so there is nothing to keep.
          return { messages: synced ?? list }
        } finally {
          for (const steer of steers) this.joining.delete(steer.inputId)
        }
      },
    }
  }

  /**
   * Middleware after the harness middleware, before each model call. A
   * middleware can append host records (a compaction) after `steering`
   * committed. Commit the engine's messages again, and give the model the
   * fold when a record changed it. An earlier middleware can change what this
   * model call gets (`providerMessages`). Keep that change, and add the new
   * messages after it. When the fold rewrote older messages, the fold wins.
   */
  protected syncFold(): AnyChatMiddleware {
    return {
      name: 'harness:sync-fold',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel') return undefined
        const synced = await this.engine.beforeModel(config.messages)
        if (!synced) return undefined
        const provider = config.providerMessages
        const isAppend =
          provider !== undefined &&
          commonPrefix(config.messages, synced) === config.messages.length
        return isAppend
          ? {
              messages: synced,
              providerMessages: [
                ...provider,
                ...synced.slice(config.messages.length),
              ],
            }
          : { messages: synced }
      },
    }
  }

  /**
   * Middleware of one agent run. Before each model call of the run's own
   * chat, the steers that wait join as user messages, in order. The chain's
   * thread keeps them before the log records the join, so a crash
   * does not lose one, and each message id is its input id, so a run again
   * does not add a steer twice. Nested children share the binding: their
   * thread is not the chain's, so they skip it.
   */
  protected agentSteering(
    chain: AgentChain,
    runInput: string,
    operation: AgentRunImpl,
  ): AnyChatMiddleware {
    return {
      name: 'harness:agent-steering',
      onConfig: async (ctx, config) => {
        if (ctx.phase !== 'beforeModel' || ctx.threadId !== chain.thread) {
          return undefined
        }
        const steers = [...chain.steers]
        if (steers.length === 0) return undefined
        const known = new Set(config.messages.map((item) => item.id))
        const messages = [
          ...config.messages,
          ...steers
            .filter((steer) => !known.has(steer.inputId))
            .map(asUserMessage),
        ]
        await this.engine.saveThread(chain.thread, messages)
        await this.writer.append(
          steers.map((steer) => ({
            type: 'harness.input.joined',
            inputId: steer.inputId,
            into: runInput,
          })),
        )
        // Only now, so a save that fails leaves them waiting.
        chain.steers.splice(0, steers.length)
        for (const steer of steers) this.join(operation.id, steer)
        // ponytail: user and agent middleware run after this one, so no
        // earlier `providerMessages` exists to keep (unlike `steering()`).
        return { messages }
      },
    }
  }

  /**
   * The user message of a turn. It keeps the records of its media files in
   * `metadata.harness.media`, so a UI can show their names and sizes later.
   * An id this thread does not know is skipped.
   */
  protected async userMessage(content: UserInput, wake?: boolean) {
    const ids =
      typeof content === 'string'
        ? []
        : content.map(mediaIdOf).filter((id) => id !== undefined)
    const records = await Promise.all(ids.map((id) => this.getMedia(id)))
    const media = records.filter((record) => record !== null)
    const message: ModelMessage = {
      id: createMessageId(),
      role: 'user',
      content,
      ...(media.length > 0 || wake
        ? {
            metadata: {
              harness: {
                ...(media.length > 0 ? { media } : {}),
                ...(wake ? { wake: true } : {}),
              },
            },
          }
        : {}),
    }
    return message
  }

  /** Add the media a turn made to the last assistant message of the thread. */
  protected async saveTurnMedia(media: Array<MediaRecord>) {
    const store = this.messages
    const history = await store.loadThread(this.threadId)
    const index = history.findLastIndex(
      (message) => message.role === 'assistant',
    )
    const last = history[index]
    if (!last) return
    const harness = {
      ...last.metadata?.harness,
      media: [...mediaOfMessage(last), ...media],
    }
    const updated: ModelMessage = {
      ...last,
      metadata: { ...last.metadata, harness },
    }
    await store.saveThread(this.threadId, history.with(index, updated))
  }

  /**
   * Abort `operation` when its input passes `timeoutAt` (a harness with
   * `durability.timeoutMs`). Returns the function that stops the timer.
   */
  protected startTimeout(
    inputId: string | undefined,
    operation: OperationImpl<ChatTurnResult>,
  ) {
    const timeoutAt =
      inputId === undefined
        ? undefined
        : this.writer.state.inputs.get(inputId)?.timeoutAt
    if (timeoutAt === undefined) return () => {}
    const timer = setTimeout(
      () => operation.abortController.abort(TIMEOUT_REASON),
      Math.max(0, timeoutAt - Date.now()),
    )
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    return () => clearTimeout(timer)
  }

  /**
   * End work that `close({ recoverable: true })` or a lost log stopped, with
   * no settlement. The session gives the log up when it has no work left,
   * so the next host that opens the thread runs the work again.
   */
  protected giveBack(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
  ) {
    operation.fail(
      'cancelled',
      this.ownershipLoss ?? new Error('Session closed.'),
    )
  }

  /** The model can answer the context: it ends with a user or a tool message. */
  protected async canContinue() {
    const history = await this.messages.loadThread(this.threadId)
    const last = resetContext(history).at(-1)
    return last?.role === 'user' || last?.role === 'tool'
  }

  /**
   * Keep the retry count of a turn in the log, so a recovered attempt starts
   * from it. It lands with the next transcript commit of the turn. A failed
   * model call appends its count at once, before `turn.onModelError` runs.
   */
  protected stageRetries(
    turn: QueuedTurn,
    operation: OperationImpl<ChatTurnResult>,
    retries: number,
  ) {
    const { inputId } = turn
    if (inputId === undefined) return
    this.writer.stage([
      {
        type: 'harness.turn.retry',
        inputId,
        operationId: operation.id,
        retries,
      },
    ])
  }

  /**
   * Add hook messages and host records to the transcript, in one append.
   * Returns true when the transcript changed.
   */
  protected async addToTurn(added: TurnAdditions): Promise<boolean> {
    const records = added.records ?? []
    const messages = (added.messages ?? []).map(
      (message): ModelMessage =>
        message.id ? message : { ...message, id: createMessageId() },
    )
    checkHostRecords(records)
    const before = this.writer.state.messages
    await this.writer.commit({ messages: [...before, ...messages], records })
    const after = this.writer.state.messages
    return (
      after.length !== before.length ||
      commonPrefix(before, after) !== before.length
    )
  }

  /**
   * Ask `turn.beforeFinish` whether the turn goes on. True when it added to
   * the transcript or to `ephemeral`, so the turn runs the model again.
   */
  protected async continueBeforeFinish(
    operation: OperationImpl<ChatTurnResult>,
    inputId: string | undefined,
    cycle: number,
    ephemeral: Array<ModelMessage>,
  ): Promise<boolean> {
    const hooks = this.harness.turn
    if (!hooks?.beforeFinish) return false
    const added = await hooks.beforeFinish({
      session: this.self(),
      operationId: operation.id,
      ...(inputId ? { inputId } : {}),
      cycle,
      messages: await this.messages.loadThread(this.threadId),
      signal: operation.abortController.signal,
    })
    // A cancelled turn adds nothing.
    if (operation.abortController.signal.aborted) return false
    const isEmpty =
      !added ||
      ((added.messages?.length ?? 0) === 0 &&
        (added.records?.length ?? 0) === 0 &&
        (added.ephemeral?.length ?? 0) === 0)
    if (isEmpty) return false
    const max = hooks.maxFinishCycles ?? 32
    if (cycle >= max) {
      throw new Error(
        `beforeFinish continued the turn ${max} times. Return nothing from the hook when the work is done.`,
      )
    }
    const isChanged = await this.addToTurn(added)
    ephemeral.push(...(added.ephemeral ?? []))
    return isChanged || ephemeral.length > 0
  }
}
