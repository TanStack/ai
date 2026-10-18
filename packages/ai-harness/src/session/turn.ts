import {
  EventType,
  StreamProcessor,
  chat,
  compactForModel,
  modelMessagesToUIMessages,
  isStandardSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { withPersistence } from '@tanstack/ai-persistence'
import { redactMiddleware } from '../auth'
import { bindDurable } from '../durable-tool'
import { mediaMiddleware } from '../media'
import { OperationImpl } from '../operation'
import { mountPlugins } from '../plugins'
import { scrubToolResults, truncationMiddleware } from '../resume'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  createInputId,
  customEvent,
  errorText,
  cacheObject,
  toolCallOf,
  storedPrincipal,
  turnContext,
  withRun,
  withoutPlugins,
  settingTools,
  resetMarker,
  resetContext,
  resetCut,
  ephemeralCall,
  turnEphemeral,
  acceptedKinds,
  TIMEOUT_REASON,
  CONTINUE_NOTE,
  SHUTDOWN_REASON,
  detachOnShutdown,
  NO_MODEL,
  lastAssistantText,
  isRoutedBag,
  keepTurnTools,
} from './helpers'
import { SessionAgents } from './agents'
import { ToolTurnAdapter } from '../tool-turn'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  Interrupt,
  ModelMessage,
  StreamChunk,
  SubagentRouterPick,
} from '@tanstack/ai'
import type { AnyAgent } from '../agents'
import type { AnyHarness, HarnessRouterPick } from '../define'
import type { HandoffRecord } from '../log-records'
import type { ModelErrorContext } from '../turn'
import type { MountedPlugins } from '../plugins'
import type {
  CommandOptions,
  SettlementOutcome,
  MediaRecord,
  Operation,
  Principal,
  TurnInfo,
} from '../types'
import type { QueuedTurn } from './types'

/**
 * A layer of {@link HarnessSession}: the turn queue and the chat turn.
 */
export abstract class SessionTurn<
  THarness extends AnyHarness = AnyHarness,
> extends SessionAgents<THarness> {
  /**
   * Run the plugin command `name`. Its `input` is checked against the
   * command's schema. `principal` is who runs it. Default: the principal that
   * opened the session. The log keeps it, and the command gets that user's
   * credentials. `inputId` means the same as in `send`: a second command
   * with the same id is a duplicate.
   *
   * @example
   * ```ts
   * await session.command({ name: 'mode', input: 'plan' })
   * ```
   */
  command(
    options: CommandOptions & { principal?: Principal; inputId?: string },
  ): Operation<unknown> {
    const { name, input } = options
    const operation = new OperationImpl<unknown>(
      'command',
      this.feed,
      (target) => this.cancel({ operationId: target.id }),
    )
    this.track(operation)
    const principal = options.principal ?? this.principal
    // A store write that throws (the log) still ends the command.
    const inputId = options.inputId ?? createInputId()
    this.executeCommand(operation, name, input, principal, inputId).catch(
      (error: unknown) => this.failOperation(operation, error),
    )
    return operation
  }

  protected async executeCommand(
    operation: OperationImpl<unknown>,
    name: string,
    input: unknown,
    principal: Principal | undefined,
    inputId: string,
  ): Promise<void> {
    // The log keeps the input for replay, so a command must not take a secret
    // as its input. Ask a `secret` question instead.
    const admission = await this.accept(
      inputId,
      { op: 'command', name, input },
      principal,
    )
    // The owner runs it, or it ran before. Its result is in the events.
    if (admission !== 'new') {
      const receipt = this.duplicateReceipt(inputId, admission)
      if (receipt.status === 'rejected') {
        operation.fail('failed', new InputRejectedError(receipt))
      } else {
        operation.finish('completed', undefined)
      }
      return
    }
    const entry = this.sessionPlugins?.commands.get(name)
    if (!entry) {
      this.reject(inputId, 'unknown_command')
      operation.fail('failed', new Error(`Unknown command: ${name}`))
      return
    }
    let checked: unknown = input
    // A JSON Schema input runs unchecked, as a JSON Schema tool input does in
    // core. A Standard Schema input is validated and its parsed value runs.
    // A bare `/name` sends no input: an object schema with only optional
    // fields accepts `{}`.
    if (isStandardSchema(entry.command.input)) {
      const result = await validateWithStandardSchema(
        entry.command.input,
        input ?? {},
      )
      if (!result.success) {
        const reason = `Input validation failed for command ${name}: ${result.issues
          .map((issue) => issue.message)
          .join(', ')}`
        this.reject(inputId, 'invalid_input')
        operation.fail('failed', new Error(reason))
        return
      }
      checked = result.data
    }
    operation.setStatus('running')
    await this.applied(inputId, operation.id)
    this.publishStarted(operation)
    const run = this.runContext({
      principal,
      runId: operation.id,
      signal: operation.abortController.signal,
    })
    try {
      const { signal } = operation.abortController
      // A cancel or a session close ends the command at once. A handler that
      // does not stop on its signal runs on alone, and its result is dropped.
      const result: unknown = await Promise.race([
        entry.command.run(checked, {
          signal,
          // The command acts for its sender, also while another user's turn runs.
          session: this.pluginApi(principal, undefined, operation.id),
          ...(principal ? { principal } : {}),
          credentials: run.credentials,
          run,
        }),
        new Promise<never>((_, reject) => {
          if (signal.aborted) reject(signal.reason)
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
      ])
      operation.publish(
        customEvent('harness.command.result', {
          name,
          result: compactForModel(result),
        }),
      )
      // The command ran: a failed settle append is reported, not a failure.
      await this.settle({
        inputId,
        operationId: operation.id,
        outcome: 'completed',
      }).catch((failure: unknown) =>
        this.warnSession('harness:commands', failure),
      )
      operation.finish('completed', result)
    } catch (error) {
      const message = this.scrub(errorText(error))
      operation.publish({
        type: EventType.RUN_ERROR,
        message,
        timestamp: Date.now(),
      })
      const cancelled = operation.abortController.signal.aborted
      await this.settle({
        inputId,
        operationId: operation.id,
        ...(cancelled
          ? { outcome: 'aborted' }
          : { outcome: 'failed', error: { message } }),
      }).catch((failure: unknown) =>
        this.warnSession('harness:commands', failure),
      )
      // A lost log stopped the command: that is the reason, not the abort.
      operation.fail(
        cancelled ? 'cancelled' : 'failed',
        this.ownershipLoss ?? error,
      )
    }
    this.publishFinished(operation)
  }

  protected override drain(): void {
    if (this.closing) {
      // An input stored while close() ran queued its turn late. close()
      // ended the other queued turns already. These end the same way.
      for (const turn of this.queue.splice(0)) {
        turn.operation.fail('cancelled', new Error('Session closed.'))
      }
      return
    }
    if (this.activeTurn || this.holdTurns > 0) return
    const next = this.queue.shift()
    if (!next) return this.checkIdle()
    this.activeTurn = next.operation
    this.activeResume = next.resume !== undefined
    this.turnPrincipal = next.principal
    const ended = () => {
      this.activeResume = false
      this.activeTurn = undefined
      this.turnPrincipal = undefined
      for (const end of this.turnEnds) end()
      this.turnEnds.clear()
      this.drain()
    }
    // One `then`, so a caller that awaits the turn sees the session idle.
    void this.runTurn(next).then(ended, (error: unknown) => {
      // A store write threw. The turn still ends.
      this.failOperation(next.operation, error)
      ended()
    })
  }

  /**
   * Apply a `reset()`: add its marker to the transcript. A thread that waits
   * for interrupts gets no marker, and the reset fails.
   */
  protected async runReset(
    turn: QueuedTurn,
    reset: { note?: string },
  ): Promise<void> {
    const { operation } = turn
    const inputId = turn.inputId ?? operation.id
    operation.setStatus('running')
    this.publishStarted(operation)
    let error: { message: string; code?: string } | undefined
    try {
      await this.applied(inputId, operation.id)
      await this.refreshInterrupted(undefined, false)
      if (this.interrupted) {
        error = {
          message: 'The thread waits for interrupts. Resolve them first.',
          code: 'pending_interrupts',
        }
      } else {
        const marker = resetMarker(inputId, reset.note)
        const history = await this.messages.loadThread(this.threadId)
        // Once: recovery can apply the same reset again.
        if (!history.some((message) => message.id === marker.id)) {
          await this.addToTurn({ messages: [marker] })
        }
        operation.publish(
          customEvent(HARNESS_EVENTS.reset, { inputId, ...reset }),
        )
      }
    } catch (failure) {
      error = { message: this.scrub(errorText(this.logFailure ?? failure)) }
    }
    if (!this.logFailure) {
      await this.settle({
        inputId,
        operationId: operation.id,
        ...(error ? { outcome: 'failed', error } : { outcome: 'completed' }),
      }).catch((failure: unknown) => this.warnSession('harness:log', failure))
    }
    if (error) operation.fail('failed', new Error(error.message))
    else operation.finish('completed', { text: '', media: [] })
    this.publishFinished(operation)
    // A steer that came while the reset ran runs as its own turn.
    this.requeueWaitingSteers()
  }

  protected async runTurn(turn: QueuedTurn): Promise<void> {
    const { operation } = turn
    /**
     * The turn failed before it ran. Its input settles `failed`, so
     * `settled()` returns, and clients get a RUN_ERROR, as on a later failure.
     */
    const failEarly = async (error: unknown) => {
      const failure = this.logFailure ?? error
      const message = this.scrub(errorText(failure))
      operation.publish({
        type: EventType.RUN_ERROR,
        message,
        timestamp: Date.now(),
      })
      if (turn.inputId !== undefined && !this.logFailure) {
        await this.settle({
          inputId: turn.inputId,
          operationId: operation.id,
          outcome: 'failed',
          error: { message },
        }).catch((failure: unknown) => this.warnSession('harness:log', failure))
      }
      operation.fail('failed', failure)
      this.publishFinished(operation)
      this.requeueWaitingSteers()
    }
    // The next turn drops the messages that a revert hides.
    try {
      await this.commitRevert()
    } catch (error) {
      return failEarly(error)
    }
    if (turn.reset) return this.runReset(turn, turn.reset)
    operation.setStatus('running')
    // A new turn may ask for a sign-in the user cancelled before.
    if (!turn.answers) this.declinedSignIns.clear()
    try {
      await this.refreshInterrupted(undefined, false)
    } catch (error) {
      this.warn(operation, 'harness:interrupts', error)
      return failEarly(error)
    }
    if (turn.inputId) {
      try {
        if (turn.isContinue && !(await this.canContinue())) {
          this.refuse(
            operation,
            this.reject(turn.inputId, 'nothing_to_continue'),
          )
          this.requeueWaitingSteers()
          return
        }
        await this.applied(turn.inputId, operation.id)
      } catch (error) {
        // The log refused the write, so the session stops.
        await this.refreshTurnInterrupts(operation)
        return failEarly(error)
      }
    }
    const stopTimer = this.startTimeout(turn.inputId, operation)
    this.publishStarted(operation)

    let runPlugins: MountedPlugins | undefined
    /** The next chat() call runs the root agents that `routing` picked. */
    let isRootPart = false
    /** chat() refused the resume of this turn, so it ran nothing. */
    let isResumeRefused = false
    /** The tool calls of this turn that got a result, and an error result. */
    const resultIds = new Set<string>()
    const errorResultIds = new Set<string>()
    let text = ''
    let interrupts: Array<Interrupt> | undefined
    let failure: string | undefined
    const captured: Array<MediaRecord> = []
    // What plugins and the router see of this turn. A turn that recovery
    // runs again gets the message its input sent.
    const sentMessage = turn.message ?? turn.sentMessage
    const sender = turn.principal ?? this.principal
    const runParent = turn.answers?.runId ?? turn.parentRunId
    // The run of this turn: its tools, its middleware, its subagents, and
    // its turn plugins get the credentials and keys of its sender. A sign-in
    // wait of one of its tools stops this turn only.
    const run = this.runContext({
      principal: sender,
      runId: operation.id,
      ...(runParent ? { parentRunId: runParent } : {}),
      signal: operation.abortController.signal,
      canWait: (id) =>
        this.activeTurn === operation && !this.declinedSignIns.has(id),
    })
    const info: TurnInfo = {
      operationId: operation.id,
      ...(turn.inputId ? { inputId: turn.inputId } : {}),
      ...(sentMessage !== undefined ? { message: sentMessage } : {}),
      ...(turn.context !== undefined ? { context: turn.context } : {}),
      ...(sender ? { principal: sender } : {}),
      ...(turn.overrides ? { overrides: turn.overrides } : {}),
      run,
    }
    try {
      await this.flushNotes()
      // The stored settings of the thread, as they are when the turn starts.
      const stored = this.threadSettings
      const removed = new Set(stored.plugins?.remove ?? [])
      // The 'turn' plugins. A removed turn plugin is not set up.
      const perRun = this.plugins.filter(
        (plugin) => plugin.lifetime === 'turn' && !removed.has(plugin.name),
      )
      if (perRun.length > 0) {
        runPlugins = await mountPlugins(perRun, {
          turn: info,
          threadId: this.threadId,
          registry: this.agentRegistry.fork(),
          harnessTools: [
            ...(this.harness.tools ?? []),
            ...(this.sessionPlugins?.tools ?? []),
          ],
          harnessProvides: (this.harness.middleware ?? []).flatMap(
            (middleware) => middleware.provides ?? [],
          ),
          ...(this.sessionPlugins
            ? {
                inherited: this.sessionPlugins.values,
                takenCommands: this.sessionPlugins.commands,
                takenConfig: this.sessionPlugins.config,
                inheritedExtensions: this.sessionPlugins.extensions,
              }
            : {}),
          // Bound to this turn's run, not read when a service is called.
          services: this.pluginServices(info),
        })
      }
      // A removed session plugin stays mounted, but gives this turn nothing.
      const session =
        this.sessionPlugins && removed.size > 0
          ? withoutPlugins(this.sessionPlugins, removed)
          : this.sessionPlugins
      const bridges = [
        session?.capabilityBridge,
        runPlugins?.capabilityBridge,
        this.logRecords(),
      ].filter((bridge): bridge is AnyChatMiddleware => bridge !== undefined)
      // Agents the model can call: the harness's own, then the plugins'.
      const subagentList = [
        ...(this.harness.subagents?.agents ?? []),
        ...(session?.subagents ?? []),
        ...(runPlugins?.subagents ?? []),
      ]
      const subagents =
        subagentList.length > 0
          ? { ...this.harness.subagents, agents: subagentList }
          : undefined
      // Agents `routing` can pick: the harness's own, then the plugins'. An
      // agent object counts once.
      const rootAgents = [
        ...new Set([
          ...(this.harness.agents ?? []),
          ...(session?.agents ?? []),
          ...(runPlugins?.agents ?? []),
        ]),
      ]
      // The settings of this turn. Every chat() call below uses them: the
      // tool loop, retries, `beforeFinish` cycles, the main part of
      // `routing.after: 'main'`, and late joins.
      const { overrides } = turn
      const picked = [
        ...(session?.adapters ?? []),
        ...(runPlugins?.adapters ?? []),
      ]
        .map((pick) => pick(info))
        .filter((adapter) => adapter !== undefined)
        .at(-1)
      // A keyed adapter is built for this turn with the user's key. A
      // missing key publishes `auth_required` and fails the turn. It is
      // built before `prepareTools`, which gets its model id. The turn
      // override (an adapter, then a model name), the stored model, a plugin
      // pick, the harness model.
      const named =
        stored.model === undefined
          ? undefined
          : this.harness.models?.[stored.model]
      const turnModel =
        overrides?.model === undefined
          ? undefined
          : this.harness.models?.[overrides.model]
      if (overrides?.model !== undefined && !turnModel) {
        throw new Error(
          `Unknown model ${JSON.stringify(overrides.model)}. Add it to defineHarness({ models }).`,
        )
      }
      const model = turn.tool
        ? new ToolTurnAdapter(turn.tool, `tool-${turn.inputId ?? operation.id}`)
        : (overrides?.adapter ??
          turnModel ??
          named ??
          picked ??
          this.harness.adapter)
      if (!model) throw new Error(NO_MODEL)
      const adapter: AnyTextAdapter = await run.keys.adapter(model)
      const resolvePrompt = (prompt: string | ((turn: TurnInfo) => string)) =>
        typeof prompt === 'function' ? prompt(info) : prompt
      const turnTools = overrides?.tools ?? []
      const turnToolNames = new Set(turnTools.map((tool) => tool.name))
      const staticTools = [
        ...(this.harness.tools ?? []),
        ...(session?.tools ?? []),
        ...(runPlugins?.tools ?? []),
        ...turnTools,
      ]
      const discovered = await this.discoverTools(
        [...(session?.discoverers ?? []), ...(runPlugins?.discoverers ?? [])],
        new Set(staticTools.map((tool) => tool.name)),
        operation,
        info,
      )
      // Before the chat() options below: prompts may describe these tools.
      // The `tools` setting picks from them first, so a preparer (code mode)
      // sees only the kept ones.
      const prepared = await this.prepareTools(
        [...(session?.preparers ?? []), ...(runPlugins?.preparers ?? [])],
        {
          tools: settingTools(
            [...staticTools, ...discovered],
            stored.tools,
            turnToolNames,
          ),
          model: adapter.model,
        },
        operation,
      )
      // Each durableTool call gets its steps in the log. The tools are bound
      // here, so a middleware wrapper wraps the bound tool,
      // and again at each model call, for tools that a middleware returns.
      const bindTool = this.durableBinder(run)
      const tools = prepared.map((tool) => bindDurable(tool, bindTool))
      // The override tools as the turn has them: prepared and bound.
      const keptTools = tools.filter((tool) => turnToolNames.has(tool.name))
      const keepTools =
        keptTools.length > 0 ? keepTurnTools(keptTools) : undefined
      const reasoning =
        overrides?.reasoning ?? stored.reasoning ?? this.harness.reasoning
      const modelOptions = overrides?.modelOptions ?? this.harness.modelOptions
      // The server's run wins over a `run` key of the client's context.
      const context = withRun(
        turnContext(this.harness.context, turn.context),
        run,
      )
      // The turn value wins over the session value, field by field.
      const turnCache = cacheObject(overrides?.promptCache)
      const promptCache = {
        retention: turnCache?.retention ?? this.promptCache.retention,
        key: turnCache?.key ?? this.promptCache.key,
      }
      let message =
        turn.message !== undefined
          ? await this.userMessage(turn.message, turn.wake)
          : undefined
      let resume = turn.resume
      let parentRunId = runParent
      const { chatPersistence, checkpoint, toolRecorder } = this
      if (!chatPersistence || !checkpoint || !toolRecorder) {
        throw new Error('The session is not open yet.')
      }
      const durableTools = this.durableTools(bindTool)
      const signal = operation.abortController.signal
      const { routing } = this.harness
      // A new turn asks the router once. A resolve does not: it continues the
      // turn it answers, the main model or the saved plan of the root agents.
      let pick: SubagentRouterPick | undefined
      if (
        routing &&
        rootAgents.length > 0 &&
        turn.resume === undefined &&
        !turn.tool
      ) {
        const history = await this.messages.loadThread(this.threadId)
        const activeAgent = this.writer.state.thread.activeAgent
        const chosen = await routing.router({
          messages: resetContext([...history, ...(message ? [message] : [])]),
          agents: rootAgents,
          abortSignal: signal,
          session: this.self(),
          ...(sentMessage !== undefined ? { input: sentMessage } : {}),
          operationId: operation.id,
          ...(turn.inputId ? { inputId: turn.inputId } : {}),
          ...(sender ? { principal: sender } : {}),
          ...(turn.context !== undefined ? { context: turn.context } : {}),
          adapter,
          ...(activeAgent !== null ? { activeAgent } : {}),
        })
        const routedTo = routerTarget(chosen, activeAgent, rootAgents)
        pick = routedTo.pick
        // Before the agent runs, so a takeover goes on with the new agent.
        if (routedTo.handoff) {
          await this.writer.append([
            {
              type: 'harness.handoff',
              ...routedTo.handoff,
              runId: operation.id,
              by: 'router',
            },
          ])
        }
      }
      const isRootTurn =
        turn.answers?.routed?.root === true || (pick ?? 'main') !== 'main'
      const { after, ...shared } = routing ?? {}
      const rootBag =
        routing && isRootTurn
          ? {
              ...shared,
              agents: rootAgents,
              router: () => {
                // A resolve has no pick. chat() continues its saved plan.
                if (pick === undefined) {
                  throw new Error('The routed turn has no saved plan.')
                }
                return pick
              },
              // The harness runs the main part of `after: 'main'`, so the main
              // model keeps its subagents.
              strategy: 'exclusive' as const,
            }
          : undefined
      isRootPart = rootBag !== undefined
      /** The subagents of the next chat() call. */
      let bag = rootBag ?? subagents
      let routed = isRoutedBag(bag)
      if (routed) {
        // The same record withPersistence opens, so its open resumes this one.
        await this.runStore.createOrResume({
          runId: operation.id,
          threadId: this.threadId,
          startedAt: Date.now(),
        })
      }
      /** The messages a resolve of a routed turn continues from. */
      let routedFrom = turn.answers?.routed?.messages
      /** Retries since the last finished tool phase. The log keeps them. */
      let retries =
        this.writer.state.inputs.get(turn.inputId ?? '')?.retries ?? 0
      /** The partial answer and the note that a `'continue'` adds. */
      let continued: Array<ModelMessage> = []
      /** How many times `turn.beforeFinish` continued this turn. */
      let cycle = 0
      /** The ephemeral messages of a turn hook, for the next model call. */
      const ephemeral: Array<ModelMessage> = []
      // Each model call gets the input's ephemeral messages after the last
      // message of the context where the turn starts.
      const start = turn.ephemeral?.length
        ? (message ?? (await this.messages.loadThread(this.threadId)).at(-1))
        : undefined
      // One chat() run, and one more each time steers wait after a final
      // answer: a late join gets its answer in this turn. A run that failed
      // runs again when `turn.onModelError` answers 'retry'. A final answer
      // runs again when `turn.beforeFinish` adds to the transcript.
      for (;;) {
        // The root agents of a routed turn run no turn hooks. The main model
        // runs them, also in the main part of `routing.after: 'main'`.
        const turnHooks = isRootPart ? undefined : this.harness.turn
        let textBefore = text
        /** Text, reasoning, or a tool call streamed since `textBefore`. */
        let streamed = false
        let runError: ModelErrorContext['error'] | undefined
        let heldError: StreamChunk | undefined
        try {
          // The router and the routed agents get the full history. The
          // stores merge by message id, so no message is saved twice.
          const history =
            routed && !routedFrom
              ? await this.messages.loadThread(this.threadId)
              : []
          const turnMessages = [
            ...history,
            ...(message ? [message] : []),
            ...continued,
          ]
          // withPersistence saves them at the start of the call, so a later
          // call finds them in the thread.
          continued = []
          // The store keeps each agent in its own thread, and chat() finds a
          // stopped agent in the cards that a client sends back. So the
          // harness keeps the cards of a routed run, as a client does.
          const cards = routed
            ? new StreamProcessor({
                initialMessages:
                  routedFrom ?? modelMessagesToUIMessages(turnMessages),
              })
            : undefined
          const stream = chat({
            adapter,
            messages: routedFrom ?? turnMessages,
            systemPrompts: [
              // Per-run preamble (e.g. pod memory) comes first, ahead of the
              // harness's own system prompts.
              ...(turn.systemPreamble ?? []),
              ...(this.harness.systemPrompts ?? []),
              ...[...(session?.prompts ?? []), ...(runPlugins?.prompts ?? [])]
                .map(resolvePrompt)
                .filter((prompt) => prompt !== ''),
              // The thread's own instructions go last.
              ...(stored.instructions ? [stored.instructions] : []),
            ],
            tools,
            middleware: [
              ...bridges,
              detachOnShutdown,
              // The index entries of subagent children go in this tenant.
              withPersistence(chatPersistence, { tenantId: this.tenantId }),
              checkpoint,
              // The same text as the recovery repair. Early, so a later
              // middleware can still replace the result of a cut call.
              truncationMiddleware(
                this.harness.durability?.truncatedToolResult,
              ),
              // Before the harness middleware, so its change of each model
              // call (`onConfig`) gets the messages that join at that call.
              ...(rootBag ? [] : [this.steering(ephemeral)]),
              // Before the harness middleware, so a compaction sees only the
              // context after a reset.
              resetCut,
              this.usageCounter(operation, sender),
              ...(this.harness.middleware ?? []),
              ...(session?.middleware ?? []),
              ...(runPlugins?.middleware ?? []),
              ...(keepTools ? [keepTools] : []),
              durableTools,
              this.detachTools(operation.id, sender),
              ...(rootBag ? [] : [this.syncFold()]),
              // Again: a middleware that returns `messages` (as `syncFold`
              // does) resets what the model gets to the whole transcript.
              resetCut,
              // After steering and the reset, so neither drops them.
              ...(start && turn.ephemeral
                ? [turnEphemeral(turn.ephemeral, start)]
                : []),
              ephemeralCall(ephemeral),
              // Last, because a later middleware that returns `messages` (as
              // steering does) resets what the model gets.
              mediaMiddleware({
                store: this.mediaStore,
                accepted: acceptedKinds(
                  adapter.inputModalities,
                  this.harness.media?.accepts,
                ),
                transcribe: this.harness.media?.transcribe,
              }),
              // After the media, so the model gets no secret of the session.
              redactMiddleware(this.redactor),
              // Last: the log keeps the result that the model really got,
              // after every plugin, without the secrets of the session.
              scrubToolResults(this.redactor),
              toolRecorder,
              // The registry types of the harness interrupts do not line up
              // with the middleware tuple chat() infers. Only this field.
            ] as never,
            ...(bag
              ? {
                  subagents: {
                    ...bag,
                    limits: bag.limits ?? this.limits(),
                    binding: this.binding(
                      operation,
                      captured,
                      sender,
                      run,
                      runPlugins,
                      bag.agents,
                    ),
                  },
                }
              : {}),
            agentLoopStrategy: this.loopStrategy(),
            ...(this.harness.toolExecution !== undefined
              ? { toolExecution: this.harness.toolExecution }
              : {}),
            ...(modelOptions !== undefined ? { modelOptions } : {}),
            ...(this.harness.interrupts
              ? { interrupts: this.harness.interrupts }
              : {}),
            // The context type narrows per harness; chat() wants it exact.
            context: context as never,
            ...(reasoning !== undefined ? { reasoning } : {}),
            promptCache,
            threadId: this.threadId,
            runId: operation.id,
            ...(parentRunId ? { parentRunId } : {}),
            ...(resume ? { resume } : {}),
            abortController: operation.abortController,
            stream: true,
          }) as AsyncIterable<StreamChunk>

          routedFrom = undefined
          for await (const raw of stream) {
            const chunk =
              raw.type === EventType.RUN_ERROR ||
              raw.type === EventType.SUBAGENT_ERROR
                ? { ...raw, message: this.scrub(raw.message) }
                : raw
            cards?.processChunk(chunk)
            // chat() refused the resume before it ran anything.
            if (
              chunk.type === EventType.RUN_ERROR &&
              (chunk.metadata?.tanstack?.interruptErrors?.length ?? 0) > 0
            ) {
              isResumeRefused = true
            }
            if (
              chunk.type === EventType.RUN_FINISHED &&
              chunk.outcome?.type === 'interrupt'
            ) {
              interrupts = chunk.outcome.interrupts
              const messages = cards?.getMessages()
              // Pending before a client sees RUN_FINISHED, so a resolve sent
              // at once is accepted.
              await this.keepInterrupted(operation, {
                runId: operation.id,
                interrupts,
                ...(messages ? { routed: { messages, root: isRootPart } } : {}),
                ...storedPrincipal(sender),
                ...(turn.context !== undefined
                  ? { context: turn.context }
                  : {}),
              })
            }
            if (
              chunk.type === EventType.RUN_ERROR &&
              turnHooks?.onModelError &&
              runError === undefined
            ) {
              // Held until the hook answers: a retried call shows no error.
              const retryAfterMs = chunk.metadata?.tanstack?.retryAfterMs
              runError = {
                message: chunk.message,
                ...(chunk.code !== undefined ? { code: chunk.code } : {}),
                ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
              }
              heldError = chunk
              continue
            }
            operation.publish(chunk)
            if (!('subagentRunId' in chunk && chunk.subagentRunId)) {
              if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
                text += chunk.delta
              }
              if (
                chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
                chunk.type === EventType.REASONING_MESSAGE_CONTENT ||
                chunk.type === EventType.TOOL_CALL_START ||
                chunk.type === EventType.TOOL_CALL_ARGS
              ) {
                streamed = true
              }
            }
            if (chunk.type === EventType.RUN_ERROR) failure = chunk.message
            // A finished tool phase resets the retries, and its text stays in
            // the result. Streamed text does not reset them, so a call that
            // fails after some text still counts.
            if (chunk.type === EventType.TOOL_CALL_RESULT) {
              // A cancelled call gets a result too, but its tool did not run.
              const tanstack = chunk.metadata?.tanstack
              if (tanstack?.toolResultOutcome !== 'cancelled') {
                if (tanstack?.state === 'output-error') {
                  errorResultIds.add(chunk.toolCallId)
                } else {
                  resultIds.add(chunk.toolCallId)
                }
              }
              if (retries > 0) this.stageRetries(turn, operation, 0)
              retries = 0
              textBefore = text
              streamed = false
            }
          }
        } catch (error) {
          // The outer catch handles a cancelled turn, a log failure, and a
          // harness without the hook, as before.
          if (signal.aborted || this.logFailure || !turnHooks?.onModelError) {
            throw error
          }
          const { code } = toRunErrorPayload(error)
          runError = {
            message: this.scrub(errorText(error)),
            ...(code !== undefined ? { code } : {}),
          }
        }
        if (runError && turnHooks?.onModelError) {
          const partial = streamed
          const isStopped = signal.aborted || this.logFailure !== undefined
          // The count with this failed call is in the log before the hook
          // waits, so a host that stops in the backoff loses no retry.
          if (!isStopped && turn.inputId !== undefined) {
            await this.writer.append([
              {
                type: 'harness.turn.retry',
                inputId: turn.inputId,
                operationId: operation.id,
                retries: retries + 1,
              },
            ])
          }
          const answer = isStopped
            ? undefined
            : await turnHooks.onModelError({
                session: this.self(),
                operationId: operation.id,
                ...(turn.inputId ? { inputId: turn.inputId } : {}),
                error: runError,
                retries,
                partial,
                signal,
              })
          if (
            (answer === 'retry' || answer === 'continue') &&
            !signal.aborted
          ) {
            retries += 1
            // Only streamed text can be continued. Reasoning and a cut tool
            // call do not stay, so with no text, 'continue' acts as 'retry'.
            const isContinued = answer === 'continue' && text !== textBefore
            if (isContinued) {
              // The partial answer stays in the turn result and in the
              // transcript. The model continues it. The note stays in the
              // transcript too, and its flag lets a UI hide it.
              continued = [
                { role: 'assistant', content: text.slice(textBefore.length) },
                {
                  role: 'user',
                  content: CONTINUE_NOTE,
                  metadata: { tanstack: { synthetic: true } },
                },
              ]
            } else {
              // The turn result has only the text of the calls that counted.
              text = textBefore
            }
            operation.publish(
              customEvent(HARNESS_EVENTS.turnRetry, {
                operationId: operation.id,
                retries,
                error: runError,
                continued: isContinued,
              }),
            )
            // The resume stays: withPersistence commits it only when a call
            // succeeds, so its interrupts are still open.
            message = undefined
            // withPersistence failed the run. It runs again, for the retry.
            await this.runStore.update(operation.id, {
              status: 'running',
              finishedAt: undefined,
              error: undefined,
            })
            continue
          }
          // A cancel or a log failure ends the turn without the held error.
          if (signal.aborted) break
          // Here, and not in the outer catch, for an error the run threw.
          operation.publish(
            heldError ?? {
              type: EventType.RUN_ERROR,
              message: runError.message,
              timestamp: Date.now(),
            },
          )
          failure = runError.message
          break
        }
        const isFinished =
          failure !== undefined ||
          (interrupts?.length ?? 0) > 0 ||
          signal.aborted
        if (isFinished) break
        if (isRootPart) {
          if (after !== 'main') break
          // The agents answered. The main model answers next, with the
          // transcript that has their answer.
          isRootPart = false
          bag = subagents
          routed = isRoutedBag(bag)
        } else {
          // A steer does not join a turn that `routing` sent to root agents.
          // It waits and runs as its own turn. Claimed, so a cancel after
          // this check cannot leave a run with no new input.
          const hasLateJoin = !rootBag && (await this.claimJoins()) > 0
          if (!hasLateJoin) {
            const goesOn = await this.continueBeforeFinish(
              operation,
              turn.inputId,
              cycle,
              ephemeral,
            )
            if (!goesOn) break
            cycle += 1
          }
        }
        message = undefined
        resume = undefined
        parentRunId = undefined
        // withPersistence finished the run. It runs again, for the join or
        // the hook's additions.
        await this.runStore.update(operation.id, {
          status: 'running',
          finishedAt: undefined,
          error: undefined,
        })
      }
      // Routed agents stream their text with a subagentRunId, so the main
      // model wrote none. The turn text is the answer the transcript keeps.
      if (routed && text === '') {
        text = lastAssistantText(await this.messages.loadThread(this.threadId))
      }
    } catch (error) {
      failure = this.scrub(errorText(error))
      if (!operation.abortController.signal.aborted) {
        operation.publish({
          type: EventType.RUN_ERROR,
          message: failure,
          timestamp: Date.now(),
        })
      }
    } finally {
      stopTimer()
      await runPlugins?.dispose().catch(() => {})
    }
    const timedOut = operation.abortController.signal.reason === TIMEOUT_REASON
    // A recoverable close: the turn stops as on a crash, and the next host
    // runs it again.
    if (operation.abortController.signal.reason === SHUTDOWN_REASON) {
      this.giveBack(operation)
      this.requeueWaitingSteers()
      return
    }

    // The stream has ended, so withPersistence has saved the turn. A failed or
    // cancelled turn may not have saved its answer, and its last assistant
    // message can be an older turn's, so its media stays in the store only.
    const isSaved =
      failure === undefined && !operation.abortController.signal.aborted
    if (isSaved && captured.length > 0) {
      await this.saveTurnMedia(captured).catch((error: unknown) =>
        this.warn(
          operation,
          'harness:media',
          `The media was not added to the transcript. ${String(error)}`,
        ),
      )
    }

    // The index entry gets the time of the turn and the token totals of the
    // session, before the turn ends. chat() waits for the usage counts before
    // its stream ends, so the totals have every call of this turn. The totals
    // replace the stored ones. The cost stays: a usage plugin writes it. A
    // deleted entry stays deleted. A failed write does not fail the turn.
    const { total } = this.usage()
    await this.index
      .update(
        this.indexKey,
        (entry) =>
          entry && {
            ...entry,
            updatedAt: Date.now(),
            ...(total.calls > 0
              ? {
                  usage: {
                    ...entry.usage,
                    turns: total.calls,
                    promptTokens: total.promptTokens,
                    completionTokens: total.completionTokens,
                    totalTokens: total.totalTokens,
                    cachedTokens: total.cachedTokens,
                    cacheWriteTokens: total.cacheWriteTokens,
                  },
                }
              : {}),
          },
      )
      .catch((error: unknown) =>
        this.warn(
          operation,
          'harness:sessions',
          `The session index was not updated. ${String(error)}`,
        ),
      )

    const { inputId } = turn
    // The turn and every input that joined it settle in one append. The
    // settlement lands before the operation ends, so a caller that sees the
    // result can also read it with `settled()`.
    const settled = [
      ...(inputId === undefined ? [] : [inputId]),
      ...this.joinedInputs(operation.id, inputId),
    ]
    this.turnJoins.delete(operation.id)
    const settleTurn = async (settlement: SettlementOutcome) => {
      if (settled.length > 0 && !this.logFailure) {
        await this.settle(
          ...settled.map((id) => ({
            inputId: id,
            operationId: operation.id,
            ...settlement,
          })),
        ).catch(() => {})
      }
    }
    // A refused resume ran nothing, so its interrupts wait again. Before the
    // settlement, so a client that sees it can resolve once more.
    if (isResumeRefused && turn.answers) {
      await this.keepInterrupted(operation, turn.answers)
    }
    const observedInterrupts =
      interrupts && interrupts.length > 0
        ? {
            ...(this.interrupted?.runId === operation.id
              ? this.interrupted
              : {}),
            runId: operation.id,
            interrupts,
            ...storedPrincipal(sender),
            ...(turn.context !== undefined ? { context: turn.context } : {}),
          }
        : undefined
    // A resume whose tools ran is used up, even when the turn fails after
    // them. Offering its interrupts again would run the tools a second time.
    // A resume that failed before its tools ran stays open for a retry.
    const resumed = turn.resume ?? []
    const resumedFrom = (turn.answers ?? this.interrupted)?.interrupts ?? []
    const didResumedToolsRun =
      !isResumeRefused &&
      resumed.length > 0 &&
      resumed.every((item) => {
        const interrupt = resumedFrom.find(
          (candidate) => candidate.id === item.interruptId,
        )
        const toolCallId = interrupt ? toolCallOf(interrupt) : undefined
        if (toolCallId === undefined) return false
        // A stopped run gives the calls it did not run an error result.
        return (
          resultIds.has(toolCallId) ||
          (!operation.abortController.signal.aborted &&
            errorResultIds.has(toolCallId))
        )
      })
    // On a success, withPersistence committed them already, and this skips
    // them. A failure or a stop can also come after the tools ran.
    if (didResumedToolsRun) {
      await this.consumeResume(resumed).catch((error: unknown) =>
        this.warn(operation, 'harness:interrupts', error),
      )
    }
    await this.refreshTurnInterrupts(operation, observedInterrupts)
    // A failed log write can keep their records pending. Here they are used
    // up all the same.
    if (didResumedToolsRun) this.dropInterrupts(resumed)
    if (this.logFailure) {
      operation.fail('failed', this.logFailure)
    } else if (timedOut) {
      const message = 'The input passed its time limit.'
      await settleTurn({
        outcome: 'failed',
        error: { message, code: 'timeout' },
      })
      operation.fail('failed', new Error(message))
    } else if (operation.abortController.signal.aborted) {
      await settleTurn({ outcome: 'aborted' })
      operation.fail('cancelled', new Error('Cancelled.'))
    } else if (failure !== undefined) {
      await settleTurn({ outcome: 'failed', error: { message: failure } })
      operation.fail('failed', new Error(failure))
    } else if (interrupts && interrupts.length > 0) {
      // `this.interrupted` was kept at RUN_FINISHED.
      await settleTurn({ outcome: 'interrupted' })
      operation.finish('interrupted', { text, interrupts, media: captured })
    } else {
      await settleTurn({ outcome: 'completed' })
      operation.finish('completed', { text, media: captured })
    }
    this.publishFinished(operation)
    this.requeueWaitingSteers()
  }
}

/**
 * The pick that `chat()` runs for a router answer, and the handoff that the
 * log keeps, when the answer changes who answers the thread.
 */
function routerTarget(
  chosen: HarnessRouterPick,
  activeAgent: string | null,
  rootAgents: ReadonlyArray<AnyAgent>,
): {
  pick: SubagentRouterPick
  handoff?: Pick<HandoffRecord, 'from' | 'to' | 'note'>
} {
  const isRoot = (name: string) =>
    rootAgents.some((agent) => agent.name === name)
  if (chosen === undefined) {
    // An active agent that this turn does not have (a plugin went away)
    // gives the turn to the main model.
    return {
      pick: activeAgent !== null && isRoot(activeAgent) ? activeAgent : 'main',
    }
  }
  if (typeof chosen === 'object' && 'handoff' in chosen) {
    const to = chosen.handoff === 'main' ? null : chosen.handoff
    // An unknown name writes nothing. chat() fails the turn for it.
    if (to !== null && !isRoot(to)) return { pick: to }
    return {
      pick: chosen.handoff,
      handoff: {
        from: activeAgent,
        to,
        ...(chosen.note !== undefined ? { note: chosen.note } : {}),
      },
    }
  }
  if (typeof chosen !== 'string') return { pick: chosen }
  const to = chosen === 'main' ? null : chosen
  const changes = to !== activeAgent && (to === null || isRoot(to))
  return changes
    ? { pick: chosen, handoff: { from: activeAgent, to } }
    : { pick: chosen }
}
