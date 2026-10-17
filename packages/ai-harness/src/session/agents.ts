import {
  EventType,
  compactForModel,
  createSubagentId,
  runAgentStream,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { withPersistence } from '@tanstack/ai-persistence'
import { mediaCapture, mediaMiddleware } from '../media'
import { OperationImpl } from '../operation'
import {
  checkpointMiddleware,
  holdRunLease,
  repairTranscript,
  truncationMiddleware,
} from '../resume'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  agentKey,
  chainFields,
  asUserMessage,
  chainInputOf,
  runStatus,
  loggedStatus,
  createInputId,
  createMessageId,
  customEvent,
  storedPrincipal,
  isSameSender,
  resetCut,
  referenceNote,
  runMiddleware,
  AGENT_STOPPED,
  SHUTDOWN_REASON,
} from './helpers'
import { SessionTurnParts } from './turn-parts'
import type {
  SubagentBudget,
  ModelMessage,
  RunRecord,
  StreamChunk,
  SubagentBinding,
} from '@tanstack/ai'
import type { InputState, LogWriter } from '../log'
import { NO_SESSION_CONTEXT } from '../agents'
import type { AgentStarter, AnyAgent, HarnessAgentContext } from '../agents'
import type { AnyHarness } from '../define'
import type { AgentGroup, MountedPlugins } from '../plugins'
import type {
  AgentRun,
  AgentSendOptions,
  ChatTurnResult,
  InputSettlement,
  SettlementOutcome,
  MediaRecord,
  Operation,
  Principal,
  Receipt,
  RunContext,
  UserInput,
} from '../types'
import type {
  AgentStartOptions,
  AgentChild,
  DynamicAgentHandle,
  AgentRunInfo,
  AgentRunImpl,
  AgentMessage,
  AgentRunEntry,
  AgentChain,
  AgentRunStart,
  AgentInputState,
} from './types'

/**
 * A layer of {@link HarnessSession}: agent runs started from code.
 */
export abstract class SessionAgents<
  THarness extends AnyHarness = AnyHarness,
> extends SessionTurnParts<THarness> {
  /**
   * The agent named `name`, for names known only at runtime (a slash
   * command, a protocol input). `undefined` when no such agent exists.
   */
  agent(name: string): DynamicAgentHandle | undefined {
    if (!this.agentRegistry.get(name)) return undefined
    return this.agentHandle(name)
  }

  protected override sendToRun(
    message: UserInput,
    options: AgentSendOptions,
  ): Operation<unknown> {
    const { to } = options
    const inputId = options.inputId ?? createInputId()
    const chain = this.chainOf.get(to) ?? this.loggedChain(to)
    // The operation ends with the run that gets the message. Its cancel
    // cancels that run.
    let target = to
    const follower = new OperationImpl<unknown>(
      'agent',
      this.feed,
      () => this.cancel({ operationId: target }),
      chain?.agent,
    )
    void this.sendToAgent({
      ...options,
      inputId,
      operationId: to,
      message,
    }).then(
      (receipt) => {
        follower.resolveReceipt(receipt)
        const run =
          receipt.status === 'rejected'
            ? undefined
            : receipt.operationId
              ? this.agentRun(receipt.operationId)
              : undefined
        if (!run) {
          follower.fail(
            'failed',
            new InputRejectedError(
              receipt.status === 'rejected'
                ? receipt
                : {
                    inputId,
                    status: 'rejected',
                    reason: 'not_running',
                  },
            ),
          )
          return
        }
        target = run.id
        run.then(
          (result) =>
            follower.finish(
              run.status() === 'interrupted' ? 'interrupted' : 'completed',
              result,
            ),
          (error: unknown) =>
            follower.fail(
              run.status() === 'cancelled' ? 'cancelled' : 'failed',
              error,
            ),
        )
      },
      (error: unknown) => {
        follower.resolveReceipt({
          inputId: options.inputId ?? '',
          status: 'rejected',
          reason: error instanceof Error ? error.message : String(error),
        })
        follower.fail('failed', error)
      },
    )
    return follower
  }

  /**
   * Add a message to the agent run `operationId`, as `AgentRun.send` does.
   * `principal` is who sent it. A follow-up runs for its sender. An unknown
   * run gets `not_running`.
   */
  protected async sendToAgent(options: {
    operationId: string
    message: UserInput
    mode?: 'steer' | 'followUp'
    inputId?: string
    principal?: Principal
  }): Promise<Receipt> {
    const { operationId, message } = options
    const inputId = options.inputId ?? createInputId()
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    if (!chain) return { inputId, status: 'rejected', reason: 'not_running' }
    const principal = options.principal ?? this.principal
    const mode = options.mode ?? 'steer'
    return this.admitting(async () => {
      const admission = await this.accept(
        inputId,
        {
          op: 'agentMessage',
          operationId,
          message,
          mode,
          run: chain.runInputId,
        },
        principal,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      const sent = { inputId, message, ...(principal ? { principal } : {}) }
      return this.keep({ inputId, ...this.deliver(chain, sent, mode) })
    })
  }

  /**
   * The agent run `operationId`: a run of this session, or on a durable
   * host a run in the log that ended, so a follow-up continues it after a
   * restart. `undefined` for an unknown run, and for one that another host
   * runs.
   */
  agentRun(operationId: string): AgentRun<unknown> | undefined {
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    return [...(chain?.runs ?? []), ...(chain?.followUps ?? [])].find(
      (run) => run.operation.id === operationId,
    )?.operation
  }

  /**
   * The agent runs of this session, oldest first. On a durable host it also
   * lists the runs in the log, so it works after a restart.
   */
  agentRuns(): Array<AgentRunInfo> {
    const live = [...this.agentChains.values()].flatMap((chain) =>
      [...chain.runs, ...chain.followUps].map(
        ({ operation, principal }): AgentRunInfo => ({
          operationId: operation.id,
          agent: chain.agent,
          status: runStatus(operation.status()),
          ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
          ...(principal ? { principal } : {}),
        }),
      ),
    )
    const known = new Set(live.map((run) => run.operationId))
    return [
      ...this.loggedRuns().filter((run) => !known.has(run.operationId)),
      ...live,
    ]
  }

  /** The agent runs in the log: each input that a run applied. */
  protected loggedRuns(): Array<AgentRunInfo> {
    const inputs = this.writer?.state.inputs
    if (!inputs) return []
    return [...inputs.values()].flatMap((input): Array<AgentRunInfo> => {
      const first = chainInputOf(inputs, input)
      if (!first || input.operationId === undefined) return []
      return [
        {
          operationId: input.operationId,
          agent: first.input.agent,
          status: loggedStatus(input),
          ...(first.input.parentRunId
            ? { parentRunId: first.input.parentRunId }
            : {}),
          ...(input.principal ? { principal: input.principal } : {}),
        },
      ]
    })
  }

  /**
   * The chain of a run in the log, with every run it had, so a follow-up
   * continues its thread after a restart. `undefined` for an unknown run,
   * and while a run of the chain has not ended: another host runs it.
   */
  protected loggedChain(operationId: string): AgentChain | undefined {
    const inputs = this.writer?.state.inputs
    if (!inputs) return undefined
    const own = [...inputs.values()].find(
      (input) => input.operationId === operationId,
    )
    const first = own && chainInputOf(inputs, own)
    if (!first) return undefined
    const known = this.agentChains.get(first.inputId)
    if (known) return known
    const logged = [...inputs.values()].filter(
      (input) =>
        input.operationId !== undefined &&
        chainInputOf(inputs, input) === first,
    )
    if (logged.some((input) => input.settlement === undefined)) {
      return undefined
    }
    // ponytail: a run rebuilt from the log resolves to `undefined`. The log
    // keeps how it ended, not its value. Read `stores.runs` if callers need
    // the value.
    const entries = logged.map((input) => {
      const operation = this.agentOperation(
        first.input.agent,
        input.operationId,
      )
      const settlement = input.settlement
      if (settlement?.outcome === 'completed') {
        operation.finish('completed', undefined)
      } else {
        operation.fail(
          settlement?.outcome === 'aborted' ? 'cancelled' : 'failed',
          new Error(settlement?.error?.message ?? 'The run did not complete.'),
        )
      }
      return {
        operation,
        ...(input.principal ? { principal: input.principal } : {}),
      }
    })
    const [firstRun, ...later] = entries
    if (!firstRun) return undefined
    const chain = this.createChain(chainFields(first), firstRun)
    for (const entry of later) {
      chain.runs.push(entry)
      this.chainOf.set(entry.operation.id, chain)
    }
    chain.current = later.at(-1) ?? firstRun
    return chain
  }

  /**
   * What every agent run of `operation` gets: the run context `run`, the
   * middleware of session plugins, then of run plugins, then the session's
   * media middleware. It keeps the media the agents make, publishes a
   * `harness.media` event for each file, and pushes its record to
   * `captured`. The agents read the provider keys of `run` as `ctx.keys`, and
   * their tools read `run` as `ctx.context.run`. Their model calls count in
   * the usage of `principal`, the user of `run`. With `agents` (the
   * subagents of a turn), the agent tools can start them in the background,
   * for `principal`.
   */
  protected binding(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    captured: Array<MediaRecord>,
    principal: Principal | undefined,
    run: RunContext,
    runPlugins?: MountedPlugins,
    agents?: ReadonlyArray<AnyAgent>,
  ) {
    const options = this.harness.media
    // The child runs as a background agent of this session, and its end
    // starts a new turn. Core does not pass `start` to nested children.
    const start: SubagentBinding['start'] =
      agents &&
      (async (call, startOptions) => {
        const agent = agents.find((entry) => entry.name === call.agent)
        if (!agent) throw new Error(`Unknown agent "${call.agent}".`)
        const subagentRunId = createSubagentId()
        const operation = this.runAgent(
          agent,
          call.input,
          { ...startOptions, ...(principal ? { principal } : {}) },
          undefined,
          {
            subagentRunId,
            ...(call.prompt !== undefined && { prompt: call.prompt }),
            ...(call.parentToolCallId !== undefined && {
              parentToolCallId: call.parentToolCallId,
            }),
          },
        )
        return { subagentRunId, done: Promise.resolve(operation) }
      })
    return {
      generationMiddleware: [
        ...(this.sessionPlugins?.generationMiddleware ?? []),
        ...(runPlugins?.generationMiddleware ?? []),
        ...mediaCapture({
          persistence: this.media,
          threadId: this.threadId,
          options,
          publish: (record) => {
            captured.push(record)
            operation.publish(customEvent(HARNESS_EVENTS.media, { ...record }))
          },
          onError: (error) =>
            this.warn(
              operation,
              'harness:media',
              `The media was not kept. ${String(error)}`,
            ),
        }),
      ],
      chatMiddleware: [
        // First, so the plugin middleware after it reads the run too.
        runMiddleware(run),
        ...(this.sessionPlugins?.agentMiddleware ?? []),
        ...(runPlugins?.agentMiddleware ?? []),
        // A routed root agent gets the thread too, so a reset cuts it as well.
        resetCut,
        this.usageCounter(operation, principal),
        // Last, because a later middleware that returns `messages` resets
        // what the model gets. A child's adapter is not known here, so only
        // `media.accepts` narrows what it reads.
        mediaMiddleware({
          store: this.mediaStore,
          accepted: options?.accepts,
          transcribe: options?.transcribe,
        }),
      ],
      keys: run.keys,
      // No `promptCache`: a tool-mode child then uses the retention of the
      // turn's chat() call, so a turn override reaches it.
      ...(start && { start }),
      // No `extend`: a tool-mode child gets the registered default
      // `NO_SESSION_CONTEXT` as `ctx.harness`.
    } satisfies SubagentBinding
  }

  protected override runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl {
    const name = typeof target === 'string' ? target : target.name
    if (options.resume && !this.writer) {
      throw new Error(
        `Agent ${name}: resume: true needs a durable host (a host with stores.log).`,
      )
    }
    const operation = this.agentOperation(name)
    this.markBusy()
    // The agent runs for the user who starts it, also after the turn that
    // starts it ends. A child of agent code runs for its parent run's user.
    // Without either, it runs for the principal that opened the session.
    const principal =
      options.principal ?? (parent ? parent.current.principal : this.principal)
    const sender = principal ? { principal } : {}
    const fromParent = parent
      ? {
          parentRunId: parent.current.operation.id,
          budget: parent.budget.child(),
        }
      : {}
    const chain = this.createChain(
      {
        runInputId: createInputId(),
        target,
        input,
        options,
        ...sender,
        ...fromParent,
      },
      { operation, ...sender },
    )
    parent?.children.add(chain)
    void this.executeAgent(operation, chain, {
      inputId: chain.runInputId,
      ...(child ? { child } : {}),
    })
    return operation
  }

  /**
   * `ctx.harness.agents` in the runs of `chain`: start a child in the
   * background.
   * The child counts against the chain's tree budget, and over it `start`
   * throws. The child records the run that started it, and runs for that
   * run's sender.
   */
  protected agentStarter(chain: AgentChain): AgentStarter {
    return {
      start: (target, input, options) => {
        const active = [...chain.children].filter(
          (child) => !child.current.operation.isSettled(),
        ).length
        const refusal = chain.budget.reserve(active)
        if (refusal !== undefined) throw new Error(refusal)
        return this.runAgent(target, input, options ?? {}, chain)
      },
    }
  }

  /** A new agent run operation. `id`: a stored one, after a restart. */
  protected agentOperation(agent: string, id?: string): AgentRunImpl {
    const operation = new OperationImpl<unknown>(
      'agent',
      this.feed,
      (running) => this.cancel({ operationId: running.id }),
      agent,
      id,
    )
    const run = Object.assign(
      // `kind` and `agent` are fixed by the constructor call above.
      operation as OperationImpl<unknown> & { kind: 'agent'; agent: string },
      {
        send: (
          message: UserInput,
          options?: { mode?: 'steer' | 'followUp'; inputId?: string },
        ) =>
          this.sendToAgent({ ...options, operationId: operation.id, message }),
      },
    )
    this.track(run)
    return run
  }

  /** A new chain, with `first` as its first run. */
  protected createChain(
    fields: Pick<
      AgentChain,
      | 'runInputId'
      | 'target'
      | 'input'
      | 'options'
      | 'principal'
      | 'parentRunId'
    > & { budget?: SubagentBudget },
    first: AgentRunEntry,
  ): AgentChain {
    const agent =
      typeof fields.target === 'string' ? fields.target : fields.target.name
    const chain = {
      ...fields,
      agent,
      thread: `${this.threadId}:${agent}:${fields.runInputId}`,
      budget: fields.budget ?? this.codeBudget(),
      current: first,
      runs: [first],
      steers: [],
      followUps: [],
      children: new Set<AgentChain>(),
    }
    this.agentChains.set(chain.runInputId, chain)
    this.chainOf.set(first.operation.id, chain)
    return chain
  }

  /**
   * Run again an agent run with `resume: true` whose host stopped: a first
   * run, or a follow-up run of the chain of `first`. The new run applies the
   * same input, so its attempt counts up, and it continues the chain's saved
   * transcript.
   */
  protected resumeAgent(input: InputState, first: AgentInputState) {
    const operation = this.agentOperation(first.input.agent)
    this.markBusy()
    const sender = input.principal ? { principal: input.principal } : {}
    const chain = this.createChain(chainFields(first), { operation, ...sender })
    this.feed.publish(
      operation.id,
      customEvent(HARNESS_EVENTS.operationResumed, {
        operationId: operation.id,
        ...(input.operationId ? { resumedFrom: input.operationId } : {}),
      }),
    )
    void this.executeAgent(operation, chain, {
      inputId: input.inputId,
      resumed: true,
      ...(input.input.op === 'agentMessage'
        ? {
            message: {
              inputId: input.inputId,
              message: input.input.message,
              ...sender,
            },
          }
        : {}),
    })
  }

  /**
   * What a resumable agent run adds on a durable host: checkpoints of its
   * `ctx.chat` tool phases, and `ctx.harness.step` values in the
   * session log, under the key of the input the run applies.
   */
  protected resumable(inputId: string) {
    const { chatPersistence, writer } = this
    if (!chatPersistence || !writer) return undefined
    const { runs } = this.persistence.stores
    const key = agentKey(inputId)
    const checkpoint = checkpointMiddleware({
      ...(runs ? { runs } : {}),
      messages: chatPersistence.stores.messages,
      hostId: this.hostId,
      ...(this.lease ? { lease: this.lease } : {}),
      // As in a turn, each finished tool result goes to the session log at
      // once, under a key of this run. A run again puts it back.
      onToolResult: ({ toolCallId, message }) =>
        writer.append([
          {
            type: 'harness.tool.result',
            toolCallId: `${key}:${toolCallId}`,
            message,
          },
        ]),
    })
    const durableTools = this.durableTools()
    return {
      middleware: [
        checkpoint,
        truncationMiddleware(this.harness.durability?.truncatedToolResult),
        ...(durableTools ? [durableTools] : []),
      ],
      step: this.durableBinding(writer, key).step,
    }
  }

  /**
   * The saved transcript of a resumable agent run whose host stopped. The
   * chat runs that host left running end `failed`, and the last tool batch
   * gets the same repair as in a turn: the results that finished, and an
   * error for a cut call that must not run twice.
   */
  protected async continueAgentThread(agentThread: string, inputId: string) {
    const store = this.chatPersistence?.stores.messages
    if (!store) return []
    const runs = this.persistence.stores.runs
    const records = (await runs?.listByThread?.(agentThread)) ?? []
    for (const run of records.filter((item) => item.status === 'running')) {
      await runs?.update(run.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: { message: AGENT_STOPPED },
      })
    }
    const newest = [...records].sort((a, b) => b.startedAt - a.startedAt)[0]
    const prefix = `${agentKey(inputId)}:`
    const finished = new Map(
      [...(this.writer?.state.toolResults ?? [])].flatMap(([id, message]) =>
        id.startsWith(prefix)
          ? [[id.slice(prefix.length), message] as const]
          : [],
      ),
    )
    await repairTranscript({
      messages: store,
      threadId: agentThread,
      pending: newest?.checkpoint?.pendingTools ?? [],
      finished,
      interrupted: this.harness.durability?.interruptedToolResult,
      truncated: this.harness.durability?.truncatedToolResult,
    })
    return store.loadThread(agentThread)
  }

  /**
   * Run a group of agents, for `principal` (else the principal that opened
   * the session). Every child settles before the group returns.
   */
  protected override async agentGroup<T>(
    options: { onFailure?: 'cancel-siblings' | 'collect' },
    body: (group: AgentGroup) => Promise<T>,
    principal?: Principal,
  ): Promise<T> {
    const runOptions = { wake: false, ...(principal ? { principal } : {}) }
    const started: Array<OperationImpl<unknown>> = []
    const cancelOthers = (failed: OperationImpl<unknown>) => {
      if (options.onFailure === 'collect') return
      for (const operation of started) {
        if (operation !== failed && !operation.isSettled()) {
          operation
            .cancel()
            .catch((error: unknown) =>
              this.warnSession('harness:agents', error),
            )
        }
      }
    }
    const group: AgentGroup = {
      run: (target: string | AnyAgent, input?: unknown) => {
        const operation = this.runAgent(target, input, runOptions)
        started.push(operation)
        return Promise.resolve(operation).catch((error: unknown) => {
          cancelOthers(operation)
          throw error
        })
      },
      runSettled: (target: string | AnyAgent, input?: unknown) => {
        const operation = this.runAgent(target, input, runOptions)
        started.push(operation)
        return Promise.resolve(operation).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      },
    } as AgentGroup
    try {
      return await body(group)
    } finally {
      await Promise.allSettled(
        started.map((operation) => Promise.resolve(operation)),
      )
    }
  }

  /**
   * One run of `chain`. Then the steers it never took run as follow-ups,
   * before the follow-ups that wait, and the next follow-up starts.
   */
  protected async executeAgent(
    operation: AgentRunImpl,
    chain: AgentChain,
    start: AgentRunStart,
  ): Promise<void> {
    try {
      await this.runAgentOnce(operation, chain, start)
    } catch (error) {
      // A store write threw. The run still ends.
      this.failOperation(operation, error)
    } finally {
      // After a log failure, another host owns the thread. A closing session
      // starts no new run: a recoverable close leaves the steers in the log
      // for the next host, as the chat path does.
      if (!this.logFailure && !this.closing) {
        chain.followUps.unshift(
          ...chain.steers
            .splice(0)
            .map((steer) => this.followUpOf(chain, steer)),
        )
      }
      // A log failure closes the session, so this cancels the queued
      // follow-ups then, and close() does not wait for them.
      if (!this.logFailure || this.closing) this.nextFollowUp(chain)
      this.checkIdle()
    }
  }

  /**
   * Give `sent` to `chain`. A steer waits for the running run's next model
   * call. A follow-up, or a steer to a run that ended, runs after the
   * current run. Returns the receipt fields.
   */
  protected deliver(
    chain: AgentChain,
    sent: AgentMessage,
    mode: 'steer' | 'followUp',
  ) {
    const { operation: running, principal } = chain.current
    // A steer joins only a run of its own sender, so no message runs with
    // another person's credentials. Any other message runs as a follow-up,
    // for its sender.
    const isOwnSteer =
      mode === 'steer' &&
      !running.isSettled() &&
      isSameSender(sent.principal, principal)
    if (isOwnSteer) {
      chain.steers.push(sent)
      return { status: 'accepted' as const, operationId: running.id }
    }
    const isWaiting = !running.isSettled() || chain.followUps.length > 0
    const next = this.followUpOf(chain, sent)
    chain.followUps.push(next)
    this.nextFollowUp(chain)
    return {
      status: isWaiting ? ('queued' as const) : ('accepted' as const),
      operationId: next.operation.id,
    }
  }

  /** `sent` as a follow-up of `chain`, with the operation of its run. */
  protected followUpOf(chain: AgentChain, sent: AgentMessage) {
    const operation = this.agentOperation(chain.agent)
    this.chainOf.set(operation.id, chain)
    return { ...sent, operation }
  }

  /** Start the next follow-up of `chain` once its current run ended. */
  protected nextFollowUp(chain: AgentChain): void {
    if (!chain.current.operation.isSettled()) return
    if (this.closing) {
      // A closing session starts no run. Its queued follow-ups end cancelled,
      // so close() and their callers do not wait for them.
      for (const next of chain.followUps.splice(0)) {
        next.operation.fail('cancelled', new Error('Session closed.'))
        this.publishFinished(next.operation)
      }
      return
    }
    const next = chain.followUps.shift()
    if (!next) return
    chain.current = {
      operation: next.operation,
      ...(next.principal ? { principal: next.principal } : {}),
    }
    chain.runs.push(chain.current)
    this.markBusy()
    void this.executeAgent(next.operation, chain, {
      inputId: next.inputId,
      message: next,
    })
  }

  /**
   * One run of `chain`. A new first run stores its `agent` input first.
   * Every run keeps its messages in the chain's thread, so a run again
   * after a host stop continues them.
   */
  protected async runAgentOnce(
    operation: AgentRunImpl,
    chain: AgentChain,
    start: AgentRunStart,
  ): Promise<void> {
    const { agent: name, target, input, options } = chain
    const { inputId } = start
    // This run is the chain's current run.
    const { principal } = chain.current
    if (!start.resumed && !start.message) {
      const admission = await this.accept(
        inputId,
        {
          op: 'agent',
          agent: name,
          input,
          ...(options.wake ? { detached: true } : {}),
          ...(options.resume ? { resume: true } : {}),
          ...(options.attach === 'none' ? { attach: 'none' as const } : {}),
          ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
        },
        principal,
      )
      if (admission === 'closed') {
        operation.fail('cancelled', new Error('Session closed.'))
        return
      }
    }
    const agent: AnyAgent | undefined =
      typeof target === 'string' ? this.agentRegistry.get(target) : target
    if (!agent) {
      this.reject(inputId, 'unknown_agent')
      operation.fail('failed', new Error(`Unknown agent: ${name}`))
      return
    }
    let checkedInput: unknown = input
    if (agent.inputSchema !== undefined) {
      const checked = await validateWithStandardSchema(
        agent.inputSchema,
        input ?? {},
      )
      if (!checked.success) {
        const reason = `Input validation failed for agent ${name}: ${checked.issues
          .map((issue) => issue.message)
          .join(', ')}`
        this.reject(inputId, 'invalid_input')
        operation.fail('failed', new Error(reason))
        return
      }
      checkedInput = checked.data
    }

    operation.setStatus('running')
    await this.applied(inputId, operation.id)
    const runs = this.persistence.stores.runs
    await runs?.createOrResume({
      runId: operation.id,
      threadId: this.threadId,
      startedAt: Date.now(),
      kind: 'agent',
      agent: name,
      ...storedPrincipal(principal),
    })
    operation.publish({
      type: EventType.RUN_STARTED,
      runId: operation.id,
      threadId: this.threadId,
      timestamp: Date.now(),
    })
    this.publishStarted(operation)
    const child = start.child ?? { subagentRunId: createSubagentId() }
    await this.indexAgent(operation, child, principal)

    let text = ''
    let result: unknown
    let failure: string | undefined
    const { subagentRunId, prompt } = child
    let stopRunLease = () => {}
    let releaseLease: (() => Promise<void>) | undefined
    try {
      // A host that stops lets these leases expire. Then recovery fails the run.
      stopRunLease = await holdRunLease(
        runs,
        operation.id,
        this.hostId,
        this.lease,
      )
      releaseLease = await this.holdLease(inputId, operation)
      // A first run starts from the session thread. A run again after a
      // host stop continues the chain's thread. A follow-up run continues
      // the chain's thread, with its message added. The message id is its
      // input id, so a run again after a host stop does not add it twice.
      const { message } = start
      const saved = start.resumed
        ? await this.continueAgentThread(chain.thread, inputId)
        : message
          ? ((await this.chatPersistence?.stores.messages.loadThread(
              chain.thread,
            )) ?? [])
          : ((await this.messages.loadThread(this.threadId)) ?? [])
      const messages =
        message && !saved.some((item) => item.id === message.inputId)
          ? [...saved, asUserMessage(message)]
          : saved
      // The run of this agent: its user's credentials and keys, for its own
      // chat calls and its tools, also while another user's turn runs.
      const run = this.runContext({
        principal,
        runId: operation.id,
        ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
        signal: operation.abortController.signal,
      })
      const binding = this.binding(operation, [], principal, run)
      const durable = options.resume ? this.resumable(inputId) : undefined
      const harnessContext: HarnessAgentContext = {
        step: durable?.step ?? NO_SESSION_CONTEXT.step,
        agents: this.agentStarter(chain),
      }
      const stream = runAgentStream(
        agent,
        {
          input: checkedInput,
          // A prompt is one more user message at the end, as in core.
          messages:
            prompt === undefined
              ? messages
              : [
                  ...messages,
                  { role: 'user', content: prompt } satisfies ModelMessage,
                ],
          threadId: chain.thread,
          runId: `${operation.id}:${subagentRunId}`,
          parentRunId: operation.id,
          subagentRunId,
          abortSignal: operation.abortController.signal,
        },
        undefined,
        undefined,
        // ponytail: the media of a background agent is kept and published,
        // but not written to history: its messages live in its chain's
        // thread. Write it to the session thread if a UI must show it after
        // a restart.
        {
          ...binding,
          chatMiddleware: [
            // Every run keeps its transcript in the chain's thread.
            ...(this.chatPersistence
              ? [
                  withPersistence(this.chatPersistence, {
                    tenantId: this.tenantId,
                  }),
                ]
              : []),
            ...(durable?.middleware ?? []),
            this.agentSteering(chain, inputId, operation),
            ...binding.chatMiddleware,
          ],
          budget: chain.budget,
          // No parent chat() call to take it from, so the session's retention.
          promptCache: this.promptCache.retention,
          extend: () => ({ harness: harnessContext }),
        },
      )
      for await (const raw of stream) {
        const chunk =
          raw.type === EventType.RUN_ERROR ||
          raw.type === EventType.SUBAGENT_ERROR
            ? { ...raw, message: this.scrub(raw.message) }
            : raw
        operation.publish(chunk)
        if (
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          'subagentRunId' in chunk &&
          chunk.subagentRunId === subagentRunId
        ) {
          text += chunk.delta
        }
        if (
          chunk.type === EventType.SUBAGENT_FINISHED &&
          chunk.subagentRunId === subagentRunId
        ) {
          result = chunk.result
        }
        if (
          chunk.type === EventType.SUBAGENT_ERROR &&
          chunk.subagentRunId === subagentRunId
        ) {
          failure = chunk.message
        }
      }
    } catch (error) {
      failure = this.scrub(
        error instanceof Error ? error.message : String(error),
      )
    }

    const value = result !== undefined ? result : text
    // The run record and the log keep how the agent ended, so recovery
    // leaves it alone. After a log failure, another host owns the thread and
    // decides how the run ended, so this host writes neither.
    const end = async (
      run: Pick<RunRecord, 'status'> &
        Partial<Pick<RunRecord, 'error' | 'result'>>,
      settlement: SettlementOutcome,
    ) => {
      if (this.logFailure) return
      await runs?.update(operation.id, { ...run, finishedAt: Date.now() })
      // A refused append stops the session. The operation still ends. The
      // steers that joined the run settle with it, in one append.
      const joined = this.joinedInputs(operation.id, inputId)
      await this.settle(
        ...[inputId, ...joined].map((id) => ({
          inputId: id,
          operationId: operation.id,
          ...settlement,
        })),
      ).catch((error: unknown) => this.warnSession('harness:agents', error))
    }
    // The run settled already: a note that fails must not leave it open.
    const note = (ended: 'finished' | 'failed', result: unknown) =>
      this.noteAgentEnd(name, ended, result, options, principal).catch(
        (error: unknown) => this.warnSession('harness:agents', error),
      )
    // A recoverable close: the run stops as on a crash, and the next host
    // runs it again.
    if (operation.abortController.signal.reason === SHUTDOWN_REASON) {
      stopRunLease()
      await this.giveBack(operation, releaseLease)
      return
    }
    try {
      if (operation.abortController.signal.aborted) {
        operation.publish({
          type: EventType.RUN_FINISHED,
          runId: operation.id,
          threadId: this.threadId,
          outcome: { type: 'cancelled' },
          timestamp: Date.now(),
        } as StreamChunk)
        await end({ status: 'aborted' }, { outcome: 'aborted' })
        operation.fail('cancelled', new Error('Cancelled.'))
      } else if (failure !== undefined) {
        operation.publish({
          type: EventType.RUN_ERROR,
          message: failure,
          timestamp: Date.now(),
        })
        const error = { message: failure }
        await end({ status: 'failed', error }, { outcome: 'failed', error })
        await note('failed', failure)
        operation.fail('failed', new Error(failure))
      } else {
        operation.publish({
          type: EventType.RUN_FINISHED,
          runId: operation.id,
          threadId: this.threadId,
          result: value,
          timestamp: Date.now(),
        } as StreamChunk)
        await end(
          { status: 'completed', result: compactForModel(value) },
          { outcome: 'completed' },
        )
        await note('finished', value)
        operation.finish('completed', value)
      }
    } finally {
      // Also when a store write above threw: the leases must not stay held.
      stopRunLease()
      // The finished event goes out as the run settles, before the lease
      // write, so the listeners of the run still get it. A run that a store
      // write failed gets it from failOperation.
      if (operation.isSettled()) this.publishFinished(operation)
      await releaseLease?.()
    }
  }

  /**
   * The index entry of an agent run: thread `subagent:<subagentRunId>`, in
   * the tenant of this thread, with this thread as its parent and the
   * harness of this thread. Its owner is the owner of this thread, else the
   * user of the run. It has no members: access to a child goes through its
   * parent. A write replaces the whole entry, so the fields of other writers
   * stay. A failed write does not fail the run.
   */
  protected async indexAgent(
    operation: OperationImpl<unknown>,
    child: AgentChild,
    principal: Principal | undefined,
  ) {
    const { tenantId } = this
    const threadId = `subagent:${child.subagentRunId}`
    const now = Date.now()
    try {
      const parent = await this.index.get(this.indexKey)
      const ownerId = parent?.ownerId ?? principal?.id
      await this.index.update({ tenantId, threadId }, (entry) => ({
        ...entry,
        ...(tenantId !== undefined ? { tenantId } : {}),
        threadId,
        parentThreadId: this.threadId,
        ...(child.parentToolCallId !== undefined && {
          parentToolCallId: child.parentToolCallId,
        }),
        harness: this.harness.name,
        ...(ownerId !== undefined ? { ownerId } : {}),
        members: [],
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
      }))
    } catch (error) {
      this.warn(
        operation,
        'harness:sessions',
        `The session index was not updated. ${String(error)}`,
      )
    }
  }

  /**
   * Tell the main model how an agent ended: a transcript note (unless
   * `attach: 'none'`), and a new chat turn when `wake` is set. The wake turn
   * runs as `principal`, the user who started the agent.
   */
  protected async noteAgentEnd(
    name: string,
    ended: 'finished' | 'failed',
    result: unknown,
    options: AgentStartOptions,
    principal?: Principal,
  ): Promise<void> {
    const note = referenceNote(name, result, ended)
    if ((options.attach ?? 'reference') === 'reference') {
      await this.addNote(note)
    }
    if (options.wake) {
      this.startTurn(
        {
          op: 'followUp',
          message: `Background agent ${name} ${ended}: ${note}`,
        },
        { ...(principal ? { principal } : {}), wake: true },
      ).receipt.then(
        // A refused wake (the thread waits for an interrupt) is reported.
        (receipt) => {
          if (receipt.status === 'rejected')
            this.warnSession('harness:agents', new InputRejectedError(receipt))
        },
        (error: unknown) => this.warnSession('harness:agents', error),
      )
    }
  }

  /**
   * Fail an agent run whose host stopped. Its events end the operation for
   * views, and the main model gets a note.
   */
  // ponytail: `wake` comes from the log. Without a log there is no wake, only
  // the note. Keep `wake` on the run record if a host without a log needs it.
  protected async failStoppedAgent(stopped: {
    operationId: string
    agent: string
    inputId?: string
    wake?: boolean
    /** Who started the agent. The wake turn runs as this user. */
    principal?: Principal
    /** Why it failed. Default: the host stopped. */
    error?: InputSettlement['error']
  }): Promise<void> {
    const { operationId, inputId } = stopped
    const error = stopped.error ?? { message: AGENT_STOPPED }
    await this.persistence.stores.runs?.update(operationId, {
      status: 'failed',
      finishedAt: Date.now(),
      error,
    })
    if (inputId) {
      // The steers that joined the run settle with it.
      await this.settle(
        ...[inputId, ...this.joinedInputs(operationId, inputId)].map((id) => ({
          inputId: id,
          operationId,
          outcome: 'failed' as const,
          error,
        })),
      )
    }
    this.feed.publish(operationId, {
      type: EventType.RUN_ERROR,
      message: error.message,
      timestamp: Date.now(),
    })
    this.feed.publish(
      operationId,
      customEvent(HARNESS_EVENTS.operationFinished, {
        operationId,
        status: 'failed',
      }),
    )
    await this.noteAgentEnd(
      stopped.agent,
      'failed',
      error.message,
      { wake: stopped.wake === true },
      stopped.principal,
    )
  }

  /**
   * After a crash: queue the logged notes that are not in the transcript,
   * and note each logged job that no host runs now.
   */
  protected async recoverBackground(writer: LogWriter) {
    const queued = new Set(this.pendingNotes.map((message) => message.id))
    for (const [id, note] of writer.state.notes) {
      if (queued.has(id)) continue
      this.pendingNotes.push({ id, role: 'assistant', content: note })
    }
    for (const jobId of [...writer.state.jobs]) {
      if (this.jobs.has(jobId)) continue
      const id = createMessageId()
      const note = `Background job ${jobId} stopped when the host restarted.`
      this.pendingNotes.push({ id, role: 'assistant', content: note })
      // One batch: a crash keeps both records or neither.
      await writer.append([
        { type: 'harness.note', noteId: id, note },
        { type: 'harness.job', jobId, ended: true },
      ])
    }
    if (this.canFlushNotes()) await this.flushNotes()
  }
}
