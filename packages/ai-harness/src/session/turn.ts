import {
  EventType,
  StreamProcessor,
  SubagentBudget,
  chat,
  subagentHostMessageId,
  compactForModel,
  modelMessagesToUIMessages,
  isStandardSchema,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { withPersistence } from '@tanstack/ai-persistence'
import { redactMiddleware } from '../auth'
import { bindDurable } from '../durable-tool'
import { NO_SESSION_CONTEXT } from '../agents'
import { isHumanTarget } from '../log-records'
import { BOUNDARY_INTERRUPTS } from '../boundary-waits'
import { agentCardOf } from '../waits'
import { errorsOnlyDebug } from '../logger'
import { mediaMiddleware } from '../media'
import { mediaOfMessage } from '../media-ref'
import { OperationImpl } from '../operation'
import { mountPlugins } from '../plugins'
import { scrubToolResults, truncationMiddleware } from '../resume'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import { isRecord } from '../utils'
import {
  createInputId,
  customEvent,
  errorText,
  cacheObject,
  toolCallOf,
  storedUser,
  turnContext,
  withRun,
  settingTools,
  toolOwners,
  resetMarker,
  resetContext,
  resetCut,
  contextPromptCall,
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
  runNodeRecord,
  holdPlugins,
  withChildRequests,
} from './helpers'
import { SessionAgents } from './agents'
import { commandStepScope, stepWaitPrefix } from './turn-parts'
import { ToolTurnAdapter } from '../tool-turn'
import { HANDOFF_TOOL, TurnHandoffs, answererOf, markRouted } from '../handoff'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  Interrupt,
  ModelMessage,
  StreamChunk,
  SubagentRouterPick,
} from '@tanstack/ai'
import type { AnyHarness } from '../define'
import type { AnyCommand } from '../commands'
import type { ModelErrorContext } from '../turn'
import type { MountedPlugins } from '../plugins'
import type { HeldPlugins } from './helpers'
import type {
  CommandOptions,
  SettlementOutcome,
  MediaRecord,
  Operation,
  HarnessUser,
  RunContext,
  TurnInfo,
  UserInput,
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
   * command's schema. `user` is who runs it. Default: the user that
   * opened the session. The log keeps it, and the command gets that user's
   * credentials. `inputId` means the same as in `send`: a second command
   * with the same id is a duplicate.
   *
   * @example
   * ```ts
   * await session.runCommand({ name: 'mode', input: 'plan' })
   * ```
   */
  runCommand(
    options: CommandOptions & { user?: HarnessUser; inputId?: string },
  ): Operation<unknown> {
    const { name, input } = options
    const operation = new OperationImpl<unknown>(
      'command',
      this.feed,
      (target) => this.cancel({ operationId: target.id }),
    )
    this.track(operation)
    const user = options.user ?? this.user
    // A store write that throws (the log) still ends the command.
    const inputId = options.inputId ?? createInputId()
    this.executeCommand(operation, name, input, user, inputId).catch(
      (error: unknown) => this.failOperation(operation, error),
    )
    return operation
  }

  protected async executeCommand(
    operation: OperationImpl<unknown>,
    name: string,
    input: unknown,
    user: HarnessUser | undefined,
    inputId: string,
  ): Promise<void> {
    // The log keeps the input for replay, so a command must not take a secret
    // as its input. Ask a `secret` question instead.
    const admission = await this.accept(
      inputId,
      { op: 'command', name, input },
      user,
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
    // A command of a plugin that this thread removed is unknown here.
    const entry = this.threadPlugins()?.commands.get(name)
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
    await this.runCommandEntry({
      operation,
      name,
      command: entry.command,
      input: checked,
      user,
      inputId,
    })
  }

  /**
   * Run again a command that a host stopped during while it waited in a
   * `step.ask`: from the top, as a new operation. Its finished steps return
   * their values, and the ask returns the logged answer, or waits again.
   * `false`: the session has no such command now.
   */
  protected replayCommand(input: {
    inputId: string
    name: string
    input: unknown
    user: HarnessUser | undefined
  }): boolean {
    const entry = this.threadPlugins()?.commands.get(input.name)
    if (!entry) return false
    const operation = new OperationImpl<unknown>(
      'command',
      this.feed,
      (target) => this.cancel({ operationId: target.id }),
    )
    this.track(operation)
    // The input was checked when it came. A store write that throws (the
    // log) still ends the command.
    this.runCommandEntry({ ...input, operation, command: entry.command }).catch(
      (error: unknown) => this.failOperation(operation, error),
    )
    return true
  }

  /** Apply the checked input of a command, run it, and settle the input. */
  private async runCommandEntry({
    operation,
    name,
    command,
    input,
    user,
    inputId,
  }: {
    operation: OperationImpl<unknown>
    name: string
    command: AnyCommand
    input: unknown
    user: HarnessUser | undefined
    inputId: string
  }) {
    operation.setStatus('running')
    await this.applied(inputId, operation.id, [
      runNodeRecord({
        runId: operation.id,
        kind: 'command',
        inputId,
        user,
      }),
    ])
    this.publishStarted(operation)
    const run = this.runContext({
      user,
      runId: operation.id,
      signal: operation.abortController.signal,
    })
    const scope = commandStepScope(inputId)
    // The steps of the command are under the key of its input: the same on
    // each run again.
    const { step } = this.durableBinding(this.writer, scope, run)
    /**
     * The command ended: delete the secret answers of its steps, before its
     * caller sees the end. A host that stops keeps them: the next host runs
     * the command again, and reads them again.
     */
    const endSteps = async () => {
      const isStop =
        operation.abortController.signal.reason === SHUTDOWN_REASON ||
        this.ownershipLoss !== undefined
      if (isStop) return
      await this.dropKeptAnswers(stepWaitPrefix(scope)).catch(
        (error: unknown) => this.warnSession('harness:waits', error),
      )
    }
    try {
      const { signal } = operation.abortController
      // A cancel or a session close ends the command at once. A handler that
      // does not stop on its signal runs on alone, and its result is dropped.
      const result: unknown = await Promise.race([
        command.run(input, {
          signal,
          // The command acts for its sender, also while another user's turn runs.
          session: this.pluginApi(user, undefined, operation.id),
          ...(user ? { user } : {}),
          credentials: run.credentials,
          run,
          step,
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
      await endSteps()
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
      await endSteps()
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
    this.turnUser = next.user
    this.turnConfig = this.configSnapshot()
    const ended = () => {
      this.activeResume = false
      this.activeTurn = undefined
      this.turnUser = undefined
      this.turnConfig = undefined
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
      await this.applied(inputId, operation.id, [
        runNodeRecord({
          runId: operation.id,
          kind: 'turn',
          inputId,
          user: turn.user,
        }),
      ])
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

  /**
   * A turn that runs no model: the reply of an operator, or a message while
   * a person answers the thread after a handoff to a person. The message
   * goes in the transcript once: recovery can run the same input again. An
   * operator reply with no open handoff to a person fails with
   * `no_human_wait`. Any other message settles `interrupted`: the session
   * waits for the operator.
   */
  protected async runWithoutModel(turn: QueuedTurn): Promise<void> {
    const { operation } = turn
    const inputId = turn.inputId ?? operation.id
    const isOperator = turn.operator === true
    // A held turn that recovery runs again has its message in the
    // transcript. An operator reply is found by its id.
    const sent = isOperator ? (turn.message ?? turn.sentMessage) : turn.message
    this.publishStarted(operation)
    let error: { message: string; code?: string } | undefined
    try {
      const id = `${isOperator ? 'operator' : 'held'}-${inputId}`
      const history = await this.messages.loadThread(this.threadId)
      const isAdded = history.some(
        (message) => message.id === id || message.id === attachmentId(id),
      )
      if (isOperator && !isAdded && !this.humanHandoff()) {
        error = {
          message: 'No handoff to a person waits for an operator.',
          code: 'no_human_wait',
        }
      } else if (!isAdded && sent !== undefined) {
        const messages = isOperator
          ? await this.operatorMessages(id, sent, turn.user ?? this.user)
          : [{ ...(await this.userMessage(sent, turn.wake)), id }]
        await this.addToTurn({ messages })
        // A view shows the reply live, as the text of a model, with its
        // files.
        if (isOperator) {
          for (const message of messages) {
            if (message.role === 'assistant') {
              publishText(operation, id, message.content)
            }
            for (const media of mediaOfMessage(message)) {
              operation.publish(customEvent(HARNESS_EVENTS.media, { ...media }))
            }
          }
        }
      }
    } catch (failure) {
      error = { message: this.scrub(errorText(this.logFailure ?? failure)) }
    }
    if (turn.inputId !== undefined && !this.logFailure) {
      await this.settle({
        inputId,
        operationId: operation.id,
        ...(error
          ? { outcome: 'failed', error }
          : { outcome: isOperator ? 'completed' : 'interrupted' }),
      }).catch((failure: unknown) => this.warnSession('harness:log', failure))
    }
    const text = isOperator && typeof sent === 'string' ? sent : ''
    if (error) operation.fail('failed', new Error(error.message))
    else if (isOperator) operation.finish('completed', { text, media: [] })
    else operation.finish('interrupted', { text, interrupts: [], media: [] })
    this.publishFinished(operation)
    // A steer that came while it ran runs as its own turn.
    this.requeueWaitingSteers()
  }

  /**
   * The reply of an operator, as the transcript keeps it: its text in an
   * assistant message, and its files in a user note after it, because a
   * provider takes media only from a user. The note has
   * `metadata.harness.operatorAttachment` and the media records, so a view
   * shows the files with the reply, not as a message of the user.
   */
  private async operatorMessages(
    id: string,
    content: UserInput,
    user: HarnessUser | undefined,
  ): Promise<Array<ModelMessage>> {
    // The id of the operator. A session with no user has none.
    const operator = user?.id ?? true
    const parts = typeof content === 'string' ? [] : content
    const files = parts.filter((part) => part.type !== 'text')
    if (files.length === 0) {
      return [
        { id, role: 'assistant', content, metadata: { harness: { operator } } },
      ]
    }
    const text = parts
      .map((part) => (part.type === 'text' ? part.content : ''))
      .join('')
    const note = await this.userMessage([
      { type: 'text', content: 'The operator attached these files.' },
      ...files,
    ])
    return [
      ...(text === ''
        ? []
        : [
            {
              id,
              role: 'assistant' as const,
              content: text,
              metadata: { harness: { operator } },
            },
          ]),
      {
        ...note,
        id: attachmentId(id),
        metadata: {
          ...note.metadata,
          harness: {
            ...note.metadata?.harness,
            operator,
            operatorAttachment: true,
          },
        },
      },
    ]
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
        await this.applied(turn.inputId, operation.id, [
          runNodeRecord({
            runId: operation.id,
            kind: 'turn',
            inputId: turn.inputId,
            user: turn.user,
          }),
        ])
      } catch (error) {
        // The log refused the write, so the session stops.
        await this.refreshTurnInterrupts(operation)
        return failEarly(error)
      }
    }
    // While a person answers the thread, no model runs. A resolve and a
    // tool turn still run: they answer work that started before.
    const isHeld =
      this.humanHandoff() !== undefined && !turn.answers && !turn.tool
    if (turn.operator || isHeld) return this.runWithoutModel(turn)
    const stopTimer = this.startTimeout(turn.inputId, operation)
    this.publishStarted(operation)

    let runPlugins: MountedPlugins | undefined
    /** The turn plugins, held until the turn and the runs it started settle. */
    let heldPlugins: HeldPlugins | undefined
    /** The next chat() call runs the root agents that `routing` picked. */
    let isRootPart = false
    /** chat() refused the resume of this turn, so it ran nothing. */
    let isResumeRefused = false
    /** The turn handed off to a person: it ends `interrupted`. */
    let isPaused = false
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
    const sender = turn.user ?? this.user
    const runParent = turn.answers?.runId ?? turn.parentRunId
    /** `run.handoff`: the handoff of this turn, once it has `routing`. */
    let turnHandoff: RunContext['handoff'] = NO_SESSION_CONTEXT.handoff
    // The run of this turn: its tools, its middleware, its subagents, and
    // its turn plugins get the credentials and keys of its sender. A sign-in
    // wait of one of its tools stops this turn only.
    const run = this.runContext({
      user: sender,
      runId: operation.id,
      ...(runParent ? { parentRunId: runParent } : {}),
      signal: operation.abortController.signal,
      canWait: (id) =>
        this.activeTurn === operation && !this.declinedSignIns.has(id),
      handoff: (options) => turnHandoff(options),
    })
    const info: TurnInfo = {
      operationId: operation.id,
      ...(turn.inputId ? { inputId: turn.inputId } : {}),
      ...(sentMessage !== undefined ? { message: sentMessage } : {}),
      ...(turn.context !== undefined ? { context: turn.context } : {}),
      ...(sender ? { user: sender } : {}),
      ...(turn.overrides ? { overrides: turn.overrides } : {}),
      run,
    }
    try {
      await this.flushNotes()
      // The stored settings of the thread, as they are when the turn starts.
      const stored = this.currentSettings
      // A removed session plugin stays mounted, but gives this turn nothing:
      // no tools, prompts, middleware, agents, extension items, or
      // capabilities, also for the turn plugins below.
      const removed = this.removedPlugins()
      const session = this.threadPlugins()
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
            ...(session?.tools ?? []),
          ],
          harnessProvides: (this.harness.middleware ?? []).flatMap(
            (middleware) => middleware.provides ?? [],
          ),
          ...(session
            ? {
                inherited: session.values,
                takenCommands: session.commands,
                takenConfig: session.config,
                inheritedExtensions: session.extensions,
              }
            : {}),
          // Bound to this turn's run, not read when a service is called.
          services: this.pluginServices(info),
        })
        heldPlugins = holdPlugins(runPlugins, (held) =>
          this.turnPlugins.delete(held),
        )
        this.turnPlugins.add(heldPlugins)
      }
      // Once per turn, before the adapter pick, the tools, and the prompts.
      await this.runTurnStarts(
        [...(session?.turnStarts ?? []), ...(runPlugins?.turnStarts ?? [])],
        operation,
        info,
      )
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
      // The handoffs of this turn: the router, the `handoff` tool, and
      // `ctx.harness.handoff` all go through it.
      const handoffs =
        this.harness.routing && rootAgents.length > 0
          ? new TurnHandoffs({
              runId: operation.id,
              noteKey: turn.inputId ?? operation.id,
              rootAgents,
              subagents: subagentList.map((agent) => agent.name),
              humans: this.harness.routing.allowHandoffToHuman === true,
              tool: this.harness.routing.giveModelsHandoffTool !== false,
              append: (record) =>
                this.appendHandoff(record, storedUser(sender).user),
              publish: (record) =>
                operation.publish(
                  customEvent(HARNESS_EVENTS.handoff, { ...record }),
                ),
            })
          : undefined
      // A resolve of a part that handed off: the part ends after the
      // answered tools, and the target runs.
      if (handoffs && turn.answers?.handoff) {
        handoffs.restore(turn.answers.handoff)
      }
      // The settings of this turn. Every chat() call below uses them: the
      // tool loop, retries, `beforeFinish` cycles, the main part of
      // `routing.afterAgentsAnswer: 'main-answers'`, and late joins.
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
        toolOwners(staticTools, [
          ...(session?.owners.tools ?? []),
          ...(runPlugins?.owners.tools ?? []),
        ]),
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
          run,
        },
        operation,
      )
      // Each durableTool call gets its steps in the log. The tools are bound
      // here, so a middleware wrapper wraps the bound tool,
      // and again at each model call, for tools that a middleware returns.
      const bindTool = this.durableBinder(run)
      // `routing.giveModelsHandoffTool: false` gives the models no `handoff` tool.
      const handoffTool =
        handoffs && this.harness.routing?.giveModelsHandoffTool !== false
          ? handoffs.tool(null)
          : undefined
      const clash = handoffTool
        ? prepared.find((tool) => tool.name === HANDOFF_TOOL)
        : undefined
      if (clash) {
        const owner =
          [
            ...(session?.owners.tools ?? []),
            ...(runPlugins?.owners.tools ?? []),
          ].find((entry) => entry.name === HANDOFF_TOOL)?.owner ?? 'the turn'
        throw new Error(
          `Duplicate tool "${HANDOFF_TOOL}": first owner routing (the handoff tool), second owner ${owner}. Rename the tool.`,
        )
      }
      const tools = [
        ...prepared.map((tool) => bindDurable(tool, bindTool)),
        ...(handoffTool ? [handoffTool] : []),
      ]
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
      let resume = withChildRequests(
        turn.resume,
        turn.answers?.interrupts ?? [],
      )
      let parentRunId = runParent
      const { chatPersistence, checkpoint, toolRecorder } = this
      if (!chatPersistence || !checkpoint || !toolRecorder) {
        throw new Error('The session is not open yet.')
      }
      const durableTools = this.durableTools(bindTool)
      const signal = operation.abortController.signal
      const { routing } = this.harness
      /**
       * The messages that the next chat() call adds after `message`: the
       * note of a handoff, or the partial answer and the note that a
       * `'continue'` adds.
       */
      let continued: Array<ModelMessage> = []
      // A new turn asks the router once. A resolve does not: it continues the
      // turn it answers, the main model or the saved plan of the root agents.
      let pick: SubagentRouterPick | undefined
      if (routing && handoffs && turn.resume === undefined && !turn.tool) {
        const history = await this.messages.loadThread(this.threadId)
        const active = this.writer.state.thread.activeAgent
        // A tool turn and a resolve run while a person answers. They do not
        // reach here, so this is only for the type.
        const activeAgent = isHumanTarget(active) ? active.from : active
        const chosen = await routing.router({
          messages: resetContext([...history, ...(message ? [message] : [])]),
          agents: rootAgents,
          abortSignal: signal,
          session: this.self(),
          ...(sentMessage !== undefined ? { input: sentMessage } : {}),
          operationId: operation.id,
          ...(turn.inputId ? { inputId: turn.inputId } : {}),
          ...(sender ? { user: sender } : {}),
          ...(turn.context !== undefined ? { context: turn.context } : {}),
          adapter,
          // Its model calls are for this turn, and count under `router`.
          model: {
            chat: async ({ run: _run, ...call }) =>
              (await this.modelChat({
                ...call,
                run,
                source: 'router',
              })) as never,
          },
          ...(activeAgent !== null ? { activeAgent } : {}),
        })
        // Before the agent runs, so a takeover goes on with the new agent.
        const routedTo = await handoffs.route(chosen, activeAgent)
        pick = routedTo.pick
        // ponytail: the first chat() call saves the note. A crash before
        // that call loses it: the log has the handoff, the transcript not.
        continued = routedTo.messages
      }
      const isRootTurn =
        turn.answers?.routed?.root === true || (pick ?? 'main') !== 'main'
      const {
        afterAgentsAnswer: after,
        allowHandoffToHuman: _humans,
        giveModelsHandoffTool: _handoffs,
        ...shared
      } = routing ?? {}
      const routedBag = routing
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
            // The harness runs the main part of `afterAgentsAnswer: 'main-answers'`, so the main
            // model keeps its subagents.
            strategy: 'exclusive' as const,
          }
        : undefined
      /** The bag of the root agents, while a part of them runs. */
      let rootBag = isRootTurn ? routedBag : undefined
      isRootPart = rootBag !== undefined
      // A `session.runTool()` turn takes no steer and no late join: it has no
      // model to answer them. They wait and run as their own turn.
      const isToolTurn = turn.tool !== undefined
      /**
       * The agent that answers the next part, when one agent does: `null`
       * for the main model. The routed message gets its name.
       */
      let answerer = isRootPart ? answererOf(pick) : null
      // A tool of the main model hands off as the main model. A tool of a
      // root agent hands off as that agent.
      if (handoffs) {
        turnHandoff = (options) =>
          handoffs.handoff(
            options,
            isRootPart ? (answerer ?? null) : null,
            'code',
          )
      }
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
      /** How many times `turn.beforeFinish` continued this turn. */
      let cycle = 0
      /** How many routed passes of this turn kept their answer. */
      let routedRuns = 0
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
        // The main model and the root agents of a routed part run them.
        const turnHooks = this.harness.turn
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
          // harness keeps the cards of a run with agents, as a client does.
          const cards =
            routed || (bag && this.harness.durability?.agentToolWaits !== false)
              ? new StreamProcessor({
                  initialMessages:
                    routedFrom ?? modelMessagesToUIMessages(turnMessages),
                })
              : undefined
          const binding =
            bag &&
            this.binding(
              operation,
              captured,
              sender,
              run,
              runPlugins,
              {
                agents: bag.agents,
                // The tree budget of this chat() call, as core makes it. The
                // binding has it too, so the starts of a tool-mode child
                // count against it.
                budget: SubagentBudget.root(bag.limits ?? this.limits()),
                ...(heldPlugins ? { plugins: heldPlugins } : {}),
              },
              // The root agents of a routed part can hand off.
              isRootPart ? handoffs : undefined,
            )
          if (binding && isRootPart) {
            // The root agents of a routed part take steers at each model
            // call, as the main model does, and get the ephemeral messages
            // of a turn hook. Those go after the reset cut, so it keeps them.
            const { chatMiddleware } = binding
            chatMiddleware.splice(
              chatMiddleware.indexOf(resetCut) + 1,
              0,
              ephemeralCall(ephemeral),
            )
            if (!isToolTurn) {
              chatMiddleware.unshift(
                this.steering(ephemeral, { operationId: operation.id }),
              )
            }
          }
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
              // The root agents of a routed part take steers in their own
              // middleware (above). A tool turn takes none.
              ...(rootBag || isToolTurn ? [] : [this.steering(ephemeral)]),
              // Before the harness middleware, so a compaction sees only the
              // context after a reset.
              resetCut,
              this.usageCounter(operation, sender),
              this.toolCallTracker(operation),
              ...(this.harness.middleware ?? []),
              ...(session?.middleware ?? []),
              ...(runPlugins?.middleware ?? []),
              ...(keepTools ? [keepTools] : []),
              durableTools,
              this.detachTools(operation.id, sender),
              ...(handoffs ? [handoffs.middleware()] : []),
              ...(rootBag ? [] : [this.syncFold()]),
              // Again: a middleware that returns `messages` (as `syncFold`
              // does) resets what the model gets to the whole transcript.
              resetCut,
              // After steering and the reset, so neither drops them.
              ...(start && turn.ephemeral
                ? [turnEphemeral(turn.ephemeral, start)]
                : []),
              ephemeralCall(ephemeral),
              // The last system prompt: text that changes at each call.
              contextPromptCall(() =>
                [
                  ...(session?.contextPrompts ?? []),
                  ...(runPlugins?.contextPrompts ?? []),
                ].map((prompt) =>
                  this.redactor.scrub(resolvePrompt(prompt.text)),
                ),
              ),
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
            ...(bag && binding
              ? {
                  subagents: {
                    ...bag,
                    limits: bag.limits ?? this.limits(),
                    binding,
                  },
                }
              : {}),
            agentLoopStrategy: this.loopStrategy(),
            ...(this.harness.toolExecution !== undefined
              ? { toolExecution: this.harness.toolExecution }
              : {}),
            ...(modelOptions !== undefined ? { modelOptions } : {}),
            // The approvals and questions that plugins stop the turn with
            // before its tools run, then the app's own.
            interrupts: [
              ...BOUNDARY_INTERRUPTS,
              ...(this.harness.interrupts ?? []),
            ],
            // The context type narrows per harness; chat() wants it exact.
            context: context as never,
            ...(reasoning !== undefined ? { reasoning } : {}),
            promptCache,
            threadId: this.threadId,
            runId: operation.id,
            ...(parentRunId ? { parentRunId } : {}),
            ...(resume ? { resume } : {}),
            abortController: operation.abortController,
            // Only the errors of the call, to the host logger.
            debug: errorsOnlyDebug(this.logger),
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
              const all = cards?.getMessages()
              // A turn that is not routed keeps only this turn: the store
              // has the history, and the resolve merges it back by id.
              const messages =
                all && !routed
                  ? all.slice(
                      Math.max(
                        all.findLastIndex((entry) => entry.role === 'user'),
                        0,
                      ),
                    )
                  : all
              // A handoff of the part waits with its interrupts: the resolve
              // runs the target, or pauses for a person.
              const handoff = handoffs?.take()
              // Pending before a client sees RUN_FINISHED, so a resolve sent
              // at once is accepted.
              await this.keepInterrupted(operation, {
                runId: operation.id,
                interrupts,
                ...(messages ? { routed: { messages, root: isRootPart } } : {}),
                ...(handoff ? { handoff } : {}),
                ...storedUser(sender),
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
        // The routed message of this part gets the name of its agent. A part
        // that waits for an answer gets it too.
        if (routed && failure === undefined && !signal.aborted) {
          await markRouted(this.messages, this.threadId, operation.id, {
            ...(answerer ? { agent: answerer } : {}),
          })
        }
        const isFinished =
          failure !== undefined ||
          (interrupts?.length ?? 0) > 0 ||
          signal.aborted
        if (isFinished) break
        const handoff = handoffs?.take()
        const target = handoff?.to
        // The note of a code handoff, for the transcript.
        const note = handoff ? (handoffs?.messages(handoff) ?? []) : []
        if (isHumanTarget(target)) {
          // A person answers next. The turn ends, and the session pauses.
          // No chat() call saves the note, so it is saved here, once.
          if (note.length > 0) {
            const history = await this.messages.loadThread(this.threadId)
            const ids = new Set(history.map((entry) => entry.id))
            await this.messages.saveThread(this.threadId, [
              ...history,
              ...note.filter((entry) => !ids.has(entry.id)),
            ])
          }
          isPaused = true
          break
        }
        if (target !== undefined) {
          // The next chat() call saves the note before the target answers.
          continued = note
          // The target answers in this turn, with its own prompt and tools,
          // from the saved thread. A routed target runs on the same run id,
          // so the answer of an earlier routed pass is kept below.
          answerer = target
          if (target === null) {
            isRootPart = false
            rootBag = undefined
            bag = subagents
          } else {
            pick = target
            isRootPart = true
            rootBag = routedBag
            bag = routedBag
            // The turn text is the answer of the target.
            text = ''
          }
          routed = isRoutedBag(bag)
          if (routed) {
            await this.runStore.createOrResume({
              runId: operation.id,
              threadId: this.threadId,
              startedAt: Date.now(),
            })
          }
        } else if (isRootPart && after === 'main-answers') {
          // The agents answered. The main model answers next, with the
          // transcript that has their answer.
          isRootPart = false
          bag = subagents
          routed = isRoutedBag(bag)
        } else {
          // A resolve continues the saved plan of the root agents. It has no
          // pick, so they cannot run again for a join or a hook.
          if (isRootPart && pick === undefined) break
          // The root agents run again for a late join. Its steers join now:
          // an agent that makes no model call takes no steer. The main part
          // of a handoff takes no steer: it waits and runs as its own turn.
          // The main model claims them, so a cancel after this check cannot
          // leave a run with no new input. A tool turn takes no late join
          // (see `isToolTurn`).
          const hasLateJoin = isToolTurn
            ? false
            : isRootPart
              ? (await this.joinSteers({
                  operationId: operation.id,
                  messages: [],
                  ephemeral,
                  isRouted: true,
                })) !== undefined
              : !rootBag && (await this.claimJoins()) > 0
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
        if (isRootPart) {
          // The store keeps one answer message per run, and the next routed
          // pass (a late join, a hook, or a handoff to a root agent) writes
          // it again. The answer so far keeps its place under its own id, as
          // its own message, with the agent that wrote it.
          routedRuns += 1
          await this.writer.commit({
            messages: this.writer.state.messages.map((entry) =>
              entry.id === subagentHostMessageId(operation.id)
                ? keptAnswer(entry, routedRuns)
                : entry,
            ),
          })
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
      // The runs that the turn started keep the plugins until they settle.
      await heldPlugins?.release()
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
            ...storedUser(sender),
            ...(turn.context !== undefined ? { context: turn.context } : {}),
          }
        : undefined
    // A resume whose tools ran is used up, even when the turn fails after
    // them. Offering its interrupts again would run the tools a second time.
    // A resume that failed before its tools ran stays open for a retry.
    const resumed = turn.resume ?? []
    const stoppedTurn = turn.answers ?? this.interrupted
    const resumedFrom = stoppedTurn?.interrupts ?? []
    const didResumedToolsRun =
      !isResumeRefused &&
      resumed.length > 0 &&
      resumed.every((item) => {
        const interrupt = resumedFrom.find(
          (candidate) => candidate.id === item.interruptId,
        )
        // A wait of an agent tool is used when that tool call got a result.
        // A sign-in or an app interrupt of the agent names no tool call.
        const agentCall =
          interrupt?.subagentRunId === undefined
            ? undefined
            : agentCardOf(
                stoppedTurn?.routed?.messages ?? [],
                interrupt.subagentRunId,
              )?.parentToolCallId
        const toolCallIds = [
          interrupt ? toolCallOf(interrupt) : undefined,
          agentCall,
        ].filter((id) => id !== undefined)
        // A stopped run gives the calls it did not run an error result.
        return toolCallIds.some(
          (toolCallId) =>
            resultIds.has(toolCallId) ||
            (!operation.abortController.signal.aborted &&
              errorResultIds.has(toolCallId)),
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
    } else if (isPaused) {
      // The `human` wait of the handoff is in the log. An operator answers it.
      await settleTurn({ outcome: 'interrupted' })
      operation.finish('interrupted', { text, interrupts: [], media: captured })
    } else {
      await settleTurn({ outcome: 'completed' })
      operation.finish('completed', { text, media: captured })
    }
    this.publishFinished(operation)
    this.requeueWaitingSteers()
  }
}

/**
 * Publish the text of a message that no model wrote, as the text events of
 * one assistant message.
 */
function publishText(
  operation: Pick<OperationImpl<unknown>, 'publish'>,
  messageId: string,
  content: ModelMessage['content'],
) {
  const delta =
    typeof content === 'string'
      ? content
      : (content ?? [])
          .map((part) => (part.type === 'text' ? part.content : ''))
          .join('')
  if (delta === '') return
  const timestamp = Date.now()
  operation.publish({
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp,
  })
  operation.publish({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
    timestamp,
  })
  operation.publish({ type: EventType.TEXT_MESSAGE_END, messageId, timestamp })
}

/** The id of the note with the files of the operator reply `id`. */
const attachmentId = (id: string) => `${id}:media`

/**
 * The answer message of a routed run, kept under the id `${id}:${index}`.
 * It loses its run tag, so the store writes the next answer of the run as a
 * new message.
 */
function keptAnswer(message: ModelMessage, index: number): ModelMessage {
  const { metadata } = message
  const tanstack = isRecord(metadata) ? metadata.tanstack : undefined
  if (!isRecord(metadata) || !isRecord(tanstack)) {
    return { ...message, id: `${message.id}:${index}` }
  }
  const { runId: _runId, ...rest } = tanstack
  return {
    ...message,
    id: `${message.id}:${index}`,
    metadata: { ...metadata, tanstack: rest },
  }
}
