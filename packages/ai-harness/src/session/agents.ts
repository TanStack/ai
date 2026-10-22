import {
  EventType,
  convertMessagesToModelMessages,
  createSubagentId,
  createSubagentSink,
  runAgentStream,
  validateWithStandardSchema,
} from '@tanstack/ai'
import { withPersistence } from '@tanstack/ai-persistence'
import { redactMiddleware } from '../auth'
import { BOUNDARY_INTERRUPTS, withoutBoundaryWaits } from '../boundary-waits'
import { errorsOnlyDebug } from '../logger'
import { mediaCapture, mediaMiddleware } from '../media'
import { OperationImpl } from '../operation'
import {
  checkpointMiddleware,
  repairTranscript,
  scrubToolResults,
  toolResultRecorder,
  truncationMiddleware,
} from '../resume'
import { HARNESS_EVENTS, InputRejectedError } from '../types'
import {
  expiryOf,
  interruptOf,
  openWaits,
  signInOf,
  waitFromInterrupt,
} from '../waits'
import {
  agentKey,
  agentResultRecord,
  chainFields,
  asUserMessage,
  chainInputOf,
  runStatus,
  createInputId,
  createMessageId,
  customEvent,
  inputKey,
  isAgentInput,
  runNodeRecord,
  storedUser,
  isSameSender,
  resetCut,
  referenceNote,
  runMiddleware,
  AGENT_STOPPED,
  BUDGET_REASON,
  SHUTDOWN_REASON,
  TIMEOUT_REASON,
  linkSignal,
} from './helpers'
import type { HeldPlugins } from './helpers'
import { SessionTurnParts, stepWaitPrefix } from './turn-parts'
import type {
  ChatMiddleware,
  SubagentBudget,
  Interrupt,
  ModelMessage,
  RunAgentResumeItem,
  RunRecord,
  StreamChunk,
  SubagentBinding,
  SubagentRunContext,
} from '@tanstack/ai'
import type { InputState, LogWriter } from '../log'
import type { InnerTurnEnd } from '../harness-text'
import type { AgentResultRecord, RunTreeNode } from '../log-records'
import { NO_SESSION_CONTEXT, withHarnessChild } from '../agents'
import { forwardTurn, lastUserInput } from '../harness-text'
import { wait as backoff, isTransientModelError } from '../turn'
import { addCounts, emptyCounts } from '../usage'
import { isRecord } from '../utils'
import { tanstackMetadata } from '@tanstack/ai/adapter-internals'
import type {
  AgentActions,
  AgentGroup,
  AgentGroupOptions,
  AnyAgent,
  HarnessAgentContext,
} from '../agents'
import type { AnyHarness } from '../define'
import type { HandoffOptions, TurnHandoffs } from '../handoff'
import type { MountedPlugins } from '../plugins'
import type {
  AgentRun,
  AgentSendOptions,
  ChatTurnResult,
  Cursor,
  InputSettlement,
  SettlementOutcome,
  MediaRecord,
  Operation,
  HarnessUser,
  Receipt,
  RunContext,
  UserInput,
} from '../types'
import type {
  AgentModelErrorContext,
  AgentRunStartOptions,
  AgentStartFn,
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
  GroupRuns,
} from './types'

/**
 * A layer of {@link HarnessSession}: agent runs started from code.
 */
export abstract class SessionAgents<
  THarness extends AnyHarness = AnyHarness,
> extends SessionTurnParts<THarness> {
  /**
   * The `maxConcurrent` slots of the top-level agent runs. The session is
   * the parent of every top-level run, so the runs that hold a slot here
   * and the top-level runs that run or wait in the log count.
   */
  protected readonly slots = new Gate(
    () => this.limits().maxConcurrent,
    () => this.loggedTopLevelRuns(),
  )

  /**
   * The agent named `name`, for names known only at runtime (a slash
   * command, a protocol input). `undefined` when no such agent exists.
   */
  agent(name: string): DynamicAgentHandle | undefined {
    // An agent of a plugin that this thread removed does not exist here.
    if (!this.threadAgent(name)) return undefined
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
      () => {
        // It acts as the user of the run, as a cancel of the run does.
        const user = this.userOfRun(target)
        return this.cancel({
          operationId: target,
          ...(user ? { user } : {}),
        })
      },
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
        // An offered message: the owner gives it to the run, and the log
        // says how that run ends.
        if (receipt.status === 'queued' && receipt.operationId === undefined) {
          this.followLoggedRun(follower, inputId)
          return
        }
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
   * `user` is who sent it. A follow-up runs for its sender. An unknown
   * run gets `not_running`.
   */
  protected async sendToAgent(options: {
    operationId: string
    message: UserInput
    mode?: 'steer' | 'followUp'
    inputId?: string
    user?: HarnessUser
  }): Promise<Receipt> {
    const { operationId, message } = options
    const inputId = options.inputId ?? createInputId()
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    // A run that another host runs: the message goes to it through the lane.
    const runInputId =
      chain?.runInputId ?? this.loggedChainInput(operationId)?.inputId
    if (runInputId === undefined) {
      return { inputId, status: 'rejected', reason: 'not_running' }
    }
    const user = options.user ?? this.user
    const mode = options.mode ?? 'steer'
    return this.admitting(async () => {
      const admission = await this.accept(
        inputId,
        {
          op: 'agentMessage',
          operationId,
          message,
          mode,
          run: runInputId,
        },
        user,
      )
      if (admission !== 'new') return this.duplicateReceipt(inputId, admission)
      // This host owns the log, and no run of this host has the chain.
      if (!chain) return this.reject(inputId, 'not_running')
      const sent = { inputId, message, ...(user ? { user } : {}) }
      return this.keep({ inputId, ...this.deliver(chain, sent, mode) })
    })
  }

  /**
   * The agent run `operationId`: a run of this session, or a run in the log
   * that ended, so a follow-up continues it after a restart. `undefined` for
   * an unknown run, and for one that another host runs.
   */
  agentRun(operationId: string): AgentRun<unknown> | undefined {
    const chain = this.chainOf.get(operationId) ?? this.loggedChain(operationId)
    return [...(chain?.runs ?? []), ...(chain?.followUps ?? [])].find(
      (run) => run.operation.id === operationId,
    )?.operation
  }

  /**
   * The agent runs of this session, oldest first: the running ones, and the
   * settled ones in the window of `lifecycle.retention.keepSettledAgentRuns`. It
   * also lists the runs in the log, so it works after a restart.
   */
  agentRuns(): Array<AgentRunInfo> {
    const { tree } = this.writer.state.thread
    const live = [...this.agentChains.values()].flatMap((chain) =>
      [...chain.runs, ...chain.followUps].map(({ operation, user }) => {
        // A follow-up that waits has no node in the tree yet.
        const parentRunId = chain.parentRunId ?? chain.turnRunId
        const node: RunTreeNode = tree.get(operation.id) ?? {
          runId: operation.id,
          kind: 'agent',
          status: 'queued',
          ...(parentRunId !== undefined ? { parentRunId } : {}),
        }
        const { user: _logged, ...rest } = node
        return agentRunInfo(
          {
            ...rest,
            status: runStatus(operation.status()),
            ...(user ? { user } : {}),
          },
          chain.agent,
          operation.subagentRunId,
        )
      }),
    )
    const known = new Set(live.map((run) => run.operationId))
    return [
      ...this.loggedRuns().filter((run) => !known.has(run.operationId)),
      ...live,
    ]
  }

  /**
   * The raw result of the agent run `runId`, as the log keeps it: the value
   * the run resolved to, as JSON. `undefined` while the run has not ended,
   * for a run that failed or was cancelled, and for an unknown run. It reads
   * the log, so it works after a restart, on any host.
   *
   * @example
   * ```ts
   * const result = session.agentResult({ runId: run.id })
   * ```
   */
  agentResult({ runId }: { runId: string }) {
    return this.writer.state.thread.agentResults.get(runId)?.result
  }

  /** The agent runs in the log: the agent runs of the run tree. */
  protected loggedRuns(): Array<AgentRunInfo> {
    return [...this.writer.state.thread.tree.values()].flatMap((node) =>
      node.kind === 'agent' && node.agent !== undefined
        ? [
            agentRunInfo(
              node,
              node.agent,
              this.writer.state.thread.runs.get(node.runId)?.subagentRunId,
            ),
          ]
        : [],
    )
  }

  /**
   * End `operation` as `settlement` says. A completed run resolves to the
   * raw result in the log, of the run that the settlement names.
   */
  protected endAgentRun(
    operation: OperationImpl<unknown>,
    settlement: InputSettlement | undefined,
  ) {
    if (settlement?.outcome === 'completed') {
      const { agentResults } = this.writer.state.thread
      const runId = settlement.operationId ?? operation.id
      operation.finish('completed', agentResults.get(runId)?.result)
      return
    }
    operation.fail(
      settlement?.outcome === 'aborted' ? 'cancelled' : 'failed',
      new Error(settlement?.error?.message ?? 'The run did not complete.'),
    )
  }

  /**
   * End `operation` as the log says that the run of `inputId` ended: another
   * host runs it (this host offered it), or it ran before. It does not keep
   * the thread busy here.
   */
  protected followLoggedRun(
    operation: OperationImpl<unknown>,
    inputId: string,
  ) {
    this.remoteRuns.add(operation.id)
    void this.settled({ inputId })
      .then(
        (settlement) => this.endAgentRun(operation, settlement),
        (error: unknown) => operation.fail('failed', error),
      )
      .finally(() => {
        this.remoteRuns.delete(operation.id)
        this.checkIdle()
      })
  }

  /** The `agent` input in the log of the chain that runs `operationId`. */
  protected loggedChainInput(operationId: string) {
    const { inputs, thread } = this.writer.state
    const chainInputId = thread.tree.get(operationId)?.chainInputId
    const first =
      chainInputId === undefined ? undefined : inputs.get(chainInputId)
    return isAgentInput(first) ? first : undefined
  }

  /**
   * The chain of a run in the log, with every run it had, so a follow-up
   * continues its thread after a restart. `undefined` for an unknown run,
   * and while a run of the chain has not ended: another host runs it.
   */
  protected loggedChain(operationId: string): AgentChain | undefined {
    const { inputs, thread } = this.writer.state
    const first = this.loggedChainInput(operationId)
    if (!first) return undefined
    const known = this.agentChains.get(first.inputId)
    if (known) return known
    // The runs of the chain, oldest first, with how each one settled.
    const logged = [...thread.tree.values()].flatMap((node) =>
      node.chainInputId === first.inputId
        ? [
            {
              node,
              settlement:
                node.inputId === undefined
                  ? undefined
                  : inputs.get(node.inputId)?.settlement,
            },
          ]
        : [],
    )
    if (logged.some(({ settlement }) => settlement === undefined)) {
      return undefined
    }
    const entries = logged.map(({ node, settlement }) => {
      const operation = this.agentOperation(
        first.input.agent,
        node.runId,
        this.runStart(node.runId),
      )
      this.endAgentRun(operation, settlement)
      return {
        operation,
        ...(node.user ? { user: node.user } : {}),
      }
    })
    const [firstRun, ...later] = entries
    if (!firstRun) return undefined
    const chain = this.createChain(this.loggedFields(first), firstRun)
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
   * the usage of `user`, the user of `run`. With `turn` (the subagents
   * of a turn), the agent tools can start them in the background, for
   * `user`. A wait of a child (an approval, a question, `step.ask`)
   * is a wait of the turn, and the turn's resume continues the child, unless
   * `durability.agentToolWaits` is `false`. A run that the turn starts keeps
   * its plugins until it settles. A tool-mode child gets `ctx.harness`, and
   * its starts count against the turn's tree budget `turn.budget`. With
   * `handoffs` (the root agents of a routed turn), each root agent gets the
   * `handoff` tool and `ctx.harness.handoff`.
   */
  protected binding(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    captured: Array<MediaRecord>,
    user: HarnessUser | undefined,
    run: RunContext,
    runPlugins?: MountedPlugins,
    turn?: {
      agents: ReadonlyArray<AnyAgent>
      budget: SubagentBudget
      plugins?: HeldPlugins
    },
    handoffs?: TurnHandoffs,
  ) {
    const options = this.harness.media
    const agentMiddleware = [
      // A plugin that this thread removed gives its agents no middleware.
      ...(this.threadPlugins()?.agentMiddleware ?? []),
      ...(runPlugins?.agentMiddleware ?? []),
    ]
    const agents = turn?.agents
    // A wait of a tool-mode child is a wait of the turn, unless the app
    // turned that off.
    const childWaits =
      agents !== undefined && this.harness.durability?.agentToolWaits !== false
    const plugins = turn?.plugins ? { plugins: turn.plugins } : {}
    // The child runs as a background agent of this session, and its end
    // starts a new turn. Core does not pass `start` to nested children.
    const start: SubagentBinding['start'] =
      agents &&
      (async (call, startOptions) => {
        const agent = agents.find((entry) => entry.name === call.agent)
        if (!agent) throw new Error(`Unknown agent "${call.agent}".`)
        const subagentRunId = createSubagentId()
        // The next host continues the run after a stop, with the same id.
        const resume = this.harness.durability?.resumeBackgroundAgents !== false
        const started = this.runAgent(
          agent,
          call.input,
          {
            // Core passes `{ wake: true }`: start a new turn when the run ends.
            startTurnWhenDone: startOptions.wake,
            ...(resume ? { runAgainAfterCrash: resume } : {}),
            ...(user ? { user } : {}),
          },
          undefined,
          {
            subagentRunId,
            // The run tree keeps the turn as the parent of the run.
            turnRunId: operation.id,
            ...plugins,
            ...(call.prompt !== undefined && { prompt: call.prompt }),
            ...(call.parentToolCallId !== undefined && {
              parentToolCallId: call.parentToolCallId,
            }),
          },
        )
        // Core does not catch `done`, and a cancel of the turn now stops
        // the run too. It only needs to know when the run ends.
        const done = Promise.resolve(started).then(
          () => undefined,
          () => undefined,
        )
        return { subagentRunId, done }
      })
    // `ctx.harness` of a tool-mode child, one per child run. Only a root
    // agent of a routed turn can hand off. Its nested children get the
    // `handoff` of `NO_SESSION_CONTEXT`, which throws.
    const extend: SubagentBinding['extend'] =
      (turn || handoffs) &&
      ((child: SubagentRunContext) => {
        const handoff =
          handoffs && child.parentSubagentRunId === undefined
            ? (handoffOptions: HandoffOptions) =>
                handoffs.handoff(
                  handoffOptions,
                  child.forward.subagentName,
                  'code',
                )
            : NO_SESSION_CONTEXT.handoff
        if (!turn) return { harness: { ...NO_SESSION_CONTEXT, handoff } }
        // The steps of the child are in the log under its run id: the same
        // id when it goes on after a wait of the turn.
        const scope = `sub:${child.subagentRunId}`
        const harness: HarnessAgentContext = withHarnessChild(
          {
            step: childWaits
              ? this.durableBinding(this.writer, scope, run, (question) =>
                  this.askInTurn(scope, question, child.resume),
                ).step
              : NO_SESSION_CONTEXT.step,
            agents: this.turnChildAgents(operation, user, turn),
            state: (stateOptions) => this.sharedState(stateOptions),
            handoff,
          },
          (inner, ctx) => this.runHarnessChild(inner, ctx, { operation, user }),
          run,
        )
        return { harness }
      })
    return {
      generationMiddleware: [
        ...(this.threadPlugins()?.generationMiddleware ?? []),
        ...(runPlugins?.generationMiddleware ?? []),
        ...mediaCapture({
          persistence: this.media,
          threadId: this.threadId,
          tenantId: this.tenantId,
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
        ...(agents && !childWaits
          ? withoutBoundaryWaits(agentMiddleware)
          : agentMiddleware),
        // A routed root agent gets the thread too, so a reset cuts it as well.
        resetCut,
        this.usageCounter(operation, user),
        this.toolCallTracker(operation),
        // Last, because a later middleware that returns `messages` resets
        // what the model gets. A child's adapter is not known here, so only
        // `media.accepts` narrows what it reads.
        mediaMiddleware({
          store: this.mediaStore,
          accepted: options?.accepts,
          transcribe: options?.transcribe,
        }),
        ...(handoffs ? [handoffs.middleware({ roots: true })] : []),
      ],
      // After the agent's own middleware too, so the model gets no secret
      // of the session, also when one of them sets the messages again.
      lastChatMiddleware: [redactMiddleware(this.redactor)],
      keys: run.keys,
      // A model call of a child that sets no `debug` logs only its errors,
      // to the host logger. Nested children get it too.
      debug: errorsOnlyDebug(this.logger),
      // No `promptCache`: a tool-mode child then uses the retention of the
      // turn's chat() call, so a turn override reaches it.
      ...(start && { start }),
      // As in the turn: the child stops for these, and the turn waits.
      ...(childWaits && {
        interrupts: [
          ...BOUNDARY_INTERRUPTS,
          ...(this.harness.interrupts ?? []),
        ],
      }),
      ...(turn && { budget: turn.budget }),
      ...(extend && { extend }),
    } satisfies SubagentBinding
  }

  protected override runAgent(
    target: string | AnyAgent,
    input: unknown,
    options: AgentRunStartOptions,
    parent?: AgentChain,
    child?: AgentChild,
  ): AgentRunImpl {
    const name = typeof target === 'string' ? target : target.name
    const {
      offered,
      inputId,
      ready: given,
      enter,
      parent: caller,
      ...startOptions
    } = options
    // A start from a tool of an agent run that runs (`parent:
    // ctx.context.run`) is a child of that run. It takes no `maxConcurrent`
    // slot, so the run can await it.
    const callerChain =
      parent || child || !caller ? undefined : this.chainOf.get(caller.runId)
    const isCallerRunning =
      callerChain?.current.operation.id === caller?.runId &&
      callerChain?.current.operation.isSettled() === false
    if (callerChain && isCallerRunning) {
      return this.startChild(callerChain, target, input, {
        ...startOptions,
        ...(inputId !== undefined ? { inputId } : {}),
        ...(given ? { ready: given } : {}),
        ...(enter ? { enter } : {}),
      })
    }
    // Any other `parent` is a mistake: a top-level run would start in its
    // place. A running turn or command of this session (the run of a tool
    // of the main model) gives a top-level run.
    const callerOperation = caller
      ? this.operations.get(caller.runId)
      : undefined
    const isCallerTurn =
      callerOperation !== undefined &&
      callerOperation.kind !== 'agent' &&
      !callerOperation.isSettled()
    if (!parent && !child && caller && !isCallerTurn) {
      throw new Error(
        `parent names no running agent run of this session (${caller.runId}). Pass parent: null for a root run.`,
      )
    }
    // A start that no start function admitted (a child of a plugin group)
    // enters its group here.
    const ready = enter ? this.admitStart({ enter }).ready : given
    const operation = this.agentOperation(
      name,
      offered?.runId,
      undefined,
      child?.subagentRunId,
    )
    // The agent runs for the user who starts it, also after the turn that
    // starts it ends. A child of agent code runs for its parent run's user.
    // Without either, it runs for the user that opened the session.
    const user = options.user ?? (parent ? parent.current.user : this.user)
    const sender = user ? { user } : {}
    const fromParent = parent
      ? {
          parentRunId: parent.current.operation.id,
          parentChainInputId: parent.runInputId,
          budget: parent.budget.child(),
          // `agentStarter` took a call of the tree budget for this start.
          release: () => parent.budget.release(),
          ...(parent.plugins ? { plugins: parent.plugins } : {}),
        }
      : child?.turnRunId !== undefined
        ? { turnRunId: child.turnRunId, ...this.fromTurn(child) }
        : {}
    const chain = this.createChain(
      {
        runInputId: offered?.inputId ?? inputId ?? createInputId(),
        target,
        input,
        options: startOptions,
        ...sender,
        ...fromParent,
      },
      { operation, ...sender },
    )
    // The run keeps the turn plugins until it settles, and stops when the
    // run that started it stops.
    if (chain.plugins && !chain.plugins.hold(operation)) delete chain.plugins
    const parentRun =
      parent?.current.operation ??
      (child?.turnRunId === undefined
        ? undefined
        : this.operations.get(child.turnRunId))
    if (parentRun) linkSignal(parentRun, operation)
    const begin = () => {
      parent?.children.add(chain)
      void this.executeAgent(operation, chain, {
        inputId: chain.runInputId,
        ...(child ? { child } : {}),
      })
    }
    if (ready) this.startWhenReady(operation, chain, ready, begin)
    else begin()
    return operation
  }

  /**
   * Start the run `operation` of `chain` with `begin` when `ready` resolves
   * `true`: its group has a free slot. Until then, nothing of the run is in
   * the log. On `false` (the run was cancelled while it waited), it ends
   * cancelled. A rejection (the start was refused) fails it. In both cases
   * the start took no call of the tree budget.
   */
  protected startWhenReady(
    operation: AgentRunImpl,
    chain: AgentChain,
    ready: Promise<boolean>,
    begin: () => void,
  ) {
    ready.then(
      (isFree) => {
        if (isFree) {
          begin()
          return
        }
        delete chain.release
        operation.fail('cancelled', new Error('Cancelled before it started.'))
        this.checkIdle()
      },
      (error: unknown) => {
        delete chain.release
        operation.fail('failed', error)
        this.checkIdle()
      },
    )
  }

  /**
   * `ctx.harness.agents` of a tool-mode child of the turn `operation`. Each
   * start counts against the turn's tree budget, one level below the child,
   * as core counts the child's own subagents. Over it, the start throws. The
   * runs are children of the turn in the run tree, run for `user`, and
   * keep the turn plugins.
   */
  protected turnChildAgents(
    operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>,
    user: HarnessUser | undefined,
    turn: { budget: SubagentBudget; plugins?: HeldPlugins },
  ): AgentActions {
    // ponytail: a nested tool-mode child counts at depth 1 too: core passes
    // `extend` down unchanged, so its depth is not known here.
    const budget = turn.budget.child()
    const started: Array<AgentRunImpl> = []
    const asUser = user ? { user } : {}
    return this.agentActions((target, input, options) => {
      // ponytail: a child that waits for a slot of its group counts as
      // active here too.
      const reserve = () => {
        const active = started.filter((run) => !run.isSettled()).length
        const refusal = budget.reserve(active)
        if (refusal !== undefined) throw new Error(refusal)
      }
      const admitted = this.admitStart(options, reserve)
      try {
        const run = this.runAgent(
          target,
          input,
          { ...asUser, ...admitted },
          undefined,
          {
            subagentRunId: createSubagentId(),
            turnRunId: operation.id,
            budget,
            ...(turn.plugins ? { plugins: turn.plugins } : {}),
          },
        )
        started.push(run)
        return run
      } catch (error) {
        if (!admitted.ready) budget.release()
        throw error
      }
    })
  }

  /**
   * Run `harness` as a child session of the run `parent.operation`, for
   * `harnessAgent`: a session of `harness` on the thread
   * `${rootThreadId}/agent/${subagentRunId}`, in the log of the root thread.
   * The child runs for `parent.user`, with the keys of that user. Its
   * model calls count in the usage and the budget of the parent run. While
   * a turn of the child waits, the snapshot of this session lists its waits,
   * and an answer here continues the child, in the parent run: its receipt
   * names that run. The child can also go on by itself (a wait expires). It
   * streams every event of the
   * child turns with `parentRunId`, then a RUN_FINISHED with the usage of
   * the child. A stop of the parent run cancels the child, and a recoverable
   * close stops it as on a crash. The child closes when the run ends.
   */
  protected async *runHarnessChild(
    harness: AnyHarness,
    ctx: SubagentRunContext,
    parent: {
      operation: OperationImpl<unknown> | OperationImpl<ChatTurnResult>
      user: HarnessUser | undefined
    },
  ): AsyncGenerator<StreamChunk> {
    const open = this.openChild
    if (!open) throw new Error('This session cannot open a child session.')
    const parentRunId = parent.operation.id
    const threadId = `${this.rootThreadId}/agent/${ctx.subagentRunId}`
    const used = emptyCounts()
    const session = await open(harness, {
      threadId,
      user: parent.user,
      child: {
        rootThreadId: this.rootThreadId,
        parentThreadId: this.threadId,
        countUsage: async (call) => {
          addCounts(used, call.usage)
          await this.countUsage(parent.operation, {
            ...call,
            runId: parentRunId,
          })
          this.checkBudget(parent.operation)
        },
      },
    })
    let operation: Operation<unknown> | undefined
    /**
     * The turns of the child, oldest first. An answer here, or the child
     * itself (a wait that expires), starts the next one.
     */
    const turns: Array<string> = []
    const forwarded = new Set<string>()
    /** Checks for the next turn of the child, while a turn of it waits. */
    let next: (() => void) | undefined
    const stopListening = session.onEvent(
      EventType.CUSTOM,
      ({ operationId, event }) => {
        if (event.name !== HARNESS_EVENTS.operationStarted) return
        if (!isRecord(event.value) || event.value.kind !== 'chat') return
        turns.push(operationId)
        next?.()
      },
    )
    const signal = ctx.abortSignal ?? parent.operation.abortController.signal
    const isShutdown = () =>
      parent.operation.abortController.signal.reason === SHUTDOWN_REASON
    const onAbort = () => {
      next?.()
      // A recoverable close: the child stops as on a crash too.
      if (isShutdown()) void session.close({ recoverable: true })
      else void operation?.cancel().catch(() => {})
    }
    this.harnessChildren.set(threadId, {
      session,
      // The answer goes on in the run that runs the child: a reader follows
      // that operation, not the child's own.
      answer: async (options) => {
        const receipt = await session.resolveForRun(options)
        return receipt.status !== 'rejected' && receipt.operationId
          ? { ...receipt, operationId: parentRunId }
          : receipt
      },
    })
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      operation = session.send(
        lastUserInput(convertMessagesToModelMessages(ctx.messages)),
      )
      if (signal.aborted) onAbort()
      let finished: InnerTurnEnd['finished'] = 'stop'
      while (true) {
        const end = yield* forwardTurn(operation, (chunk) =>
          isChildOwnEvent(chunk)
            ? undefined
            : withParentRun(chunk, parentRunId),
        )
        if (end.failed !== undefined) {
          yield {
            type: EventType.RUN_ERROR,
            message: end.failed,
            timestamp: Date.now(),
          }
          return
        }
        finished = end.finished
        if (!end.isInterrupted) break
        // The turn waits for answers: the next turn of the child goes on.
        forwarded.add(operation.id)
        const id = await new Promise<string | undefined>((resolve) => {
          next = () => {
            const found = turns.find((turn) => !forwarded.has(turn))
            if (signal.aborted) resolve(undefined)
            else if (found !== undefined) resolve(found)
          }
          next()
        })
        next = undefined
        const resumed = id === undefined ? undefined : session.operation(id)
        if (!resumed) {
          yield {
            type: EventType.RUN_ERROR,
            message: 'The run stopped while its child harness waited.',
            timestamp: Date.now(),
          }
          return
        }
        operation = resumed
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId: ctx.runId,
        threadId,
        timestamp: Date.now(),
        usage: {
          promptTokens: used.promptTokens,
          completionTokens: used.completionTokens,
          totalTokens: used.totalTokens,
          ...(used.cost !== undefined ? { cost: used.cost } : {}),
        },
        metadata: { tanstack: { finishReason: finished } },
      }
    } finally {
      stopListening()
      signal.removeEventListener('abort', onAbort)
      this.harnessChildren.delete(threadId)
      await session.close(isShutdown() ? { recoverable: true } : undefined)
    }
  }

  /**
   * Admit a start: a child of a group enters the group (`enter`), and
   * `reserve` (a call of the tree budget) runs as it enters. Now, a throw of
   * `reserve` throws here. Later, it fails the run. The options it returns
   * have `ready` when the run waits for a slot of its group.
   */
  protected admitStart(
    options: AgentRunStartOptions,
    reserve: () => void = () => {},
  ): AgentRunStartOptions {
    const { enter, ...rest } = options
    if (!enter) {
      reserve()
      return rest
    }
    const entered = enter(reserve)
    return entered === true ? rest : { ...rest, ready: entered }
  }

  /**
   * What a chain that a turn started takes from the turn: its plugins, and,
   * for a start from a tool-mode child, the turn's tree budget, one level
   * below the child. The start took a call of it, and a start that fails
   * before its run applies gives the call back.
   */
  protected fromTurn(child: AgentChild) {
    const { budget, plugins } = child
    return {
      ...(budget
        ? { budget: budget.child(), release: () => budget.release() }
        : {}),
      ...(plugins ? { plugins } : {}),
    }
  }

  /**
   * `ctx.harness.agents` in the runs of `chain`: start, run, and group
   * children. Each child counts against the chain's tree budget, and over
   * it the start throws. A start that fails before its run applies gives
   * its call back. A run with no model budget left starts no child. The
   * child records the run that started it, and runs for that run's sender.
   *
   * In a resumable run, `runInputId` is the input the run applies. Each
   * child then gets an input id from it: `${runInputId}/start:k:${key}` for
   * a `start` or `run` with a `key`, `${runInputId}/start:n:${n}` for the
   * n-th one without, and `${runInputId}/group:k:${key}:${index}` or
   * `${runInputId}/group:n:${n}:${index}` in a group. Keyed and positional
   * ids never collide. The `/` keeps the settle of this run from dropping
   * what a child that outlives it stored under `agent:${runInputId}:`. A
   * run again (after its host stopped) gets a new operation id, but the
   * same input, so its children get the same ids. A child that the log
   * knows then binds to the old run, and does not start again.
   */
  protected agentStarter(chain: AgentChain, runInputId?: string): AgentActions {
    const keyed = chain.options.runAgainAfterCrash ? runInputId : undefined
    const startChild: AgentStartFn = (target, input, options) => {
      if (options.inputId !== undefined) {
        const name = typeof target === 'string' ? target : target.name
        const known = this.knownChild(chain, name, options.inputId)
        // A known child holds a slot of its group too.
        if (known) {
          this.admitStart(options)
          return known
        }
      }
      return this.startChild(chain, target, input, options)
    }
    /** The id part of a child: its key, else its place among the unkeyed. */
    const counts = { start: 0, group: 0 }
    const idOf = (kind: 'start' | 'group', key: string | undefined) =>
      key === undefined
        ? `${keyed}/${kind}:n:${counts[kind]++}`
        : `${keyed}/${kind}:k:${encodeURIComponent(key)}`
    const actions = this.agentActions((target, input, options) => {
      if (keyed === undefined) return startChild(target, input, options)
      const inputId = idOf('start', options.key)
      return startChild(target, input, { ...options, inputId })
    })
    if (keyed === undefined) return actions
    const group = (
      options: AgentGroupOptions,
      body: (g: AgentGroup) => GroupRuns | Promise<GroupRuns>,
    ) => {
      const groupId = idOf('group', options.key)
      let index = 0
      return this.agentGroup(options, body, (target, input, childOptions) =>
        startChild(target, input, {
          startTurnWhenDone: false,
          ...childOptions,
          inputId: `${groupId}:${index++}`,
        }),
      )
    }
    return { ...actions, group: group as AgentActions['group'] }
  }

  /**
   * Start a new child of `chain`. It counts against the chain's tree
   * budget, and over it the start throws. A start that fails before its run
   * applies gives its call back.
   */
  protected startChild(
    chain: AgentChain,
    target: string | AnyAgent,
    input: unknown,
    options: AgentRunStartOptions,
  ): AgentRunImpl {
    const admitted = this.admitStart(options, () => this.reserveChild(chain))
    try {
      return this.runAgent(target, input, admitted, chain)
    } catch (error) {
      if (!admitted.ready) chain.budget.release()
      throw error
    }
  }

  /**
   * Take a call of the tree budget of `chain` for a new child. Throws when
   * the run has no model budget left, or the tree budget refuses it.
   */
  protected reserveChild(chain: AgentChain) {
    const runId = chain.current.operation.id
    if (this.overBudget(runId, (left) => left <= 0).length > 0) {
      throw new Error(`The agent run ${runId} has no budget left.`)
    }
    const active = [...chain.children].filter(
      (child) => !child.current.operation.isSettled(),
    ).length
    const refusal = chain.budget.reserve(active)
    if (refusal !== undefined) throw new Error(refusal)
  }

  /**
   * The child of `chain` with the input id `inputId`, when an earlier run
   * of `chain` started it: its chain on this host (a run again after a
   * retry, or a child that this host runs again), else a run that ends as
   * the log says. `undefined` when the log does not know the input. A known
   * child takes no call of the tree budget: the log counts it already. It
   * throws when the known child is another agent than `name`.
   */
  protected knownChild(
    chain: AgentChain,
    name: string,
    inputId: string,
  ): AgentRunImpl | undefined {
    // Another agent under the same id: the order or the keys of the starts
    // changed between two runs.
    const refuse = (agent: string | undefined) => {
      if (agent === undefined || agent === name) return
      throw new Error(
        `The child ${inputId} of this run is the agent ${agent}, not ${name}. Give the starts a key that does not change.`,
      )
    }
    const live = this.agentChains.get(inputId)
    if (live) {
      refuse(live.agent)
      chain.children.add(live)
      return live.runs[0]?.operation
    }
    const { inputs, thread } = this.writer.state
    const logged = inputs.get(inputId)
    const node = [...thread.tree.values()].find(
      (item) => item.inputId === inputId,
    )
    if (!logged && !node) return undefined
    refuse(isAgentInput(logged) ? logged.input.agent : node?.agent)
    const operation = this.agentOperation(name)
    this.followLoggedRun(operation, inputId)
    return operation
  }

  /** Give back the tree budget call of the start of `chain`, once. */
  protected releaseStart(chain: AgentChain) {
    const { release } = chain
    delete chain.release
    release?.()
  }

  /** The top-level agent runs that run or wait in the log. */
  protected *loggedTopLevelRuns() {
    for (const node of this.writer.state.thread.tree.values()) {
      const isTopLevel = node.kind === 'agent' && node.parentRunId === undefined
      if (
        isTopLevel &&
        (node.status === 'running' || node.status === 'waiting')
      )
        yield node.runId
    }
  }

  /**
   * Take a `maxConcurrent` slot for the top-level start `operation` of
   * `chain`. With no slot free, the run waits as `queued` in the run tree.
   * Returns false when the run ended while it waited: a cancel settles it
   * `aborted`, and a close gives it back. A run that waits when its host
   * stops waits again on the next host (see `startQueuedAgent`).
   */
  protected async takeSlot(
    operation: AgentRunImpl,
    chain: AgentChain,
    inputId: string,
  ): Promise<boolean> {
    const isFree = this.slots.enter(operation.id)
    if (isFree === true) return true
    const { signal } = operation.abortController
    signal.addEventListener('abort', () => this.slots.drop(operation.id), {
      once: true,
    })
    await this.writer.append([
      runNodeRecord({
        runId: operation.id,
        kind: 'agent',
        inputId,
        user: chain.current.user,
        agent: chain.agent,
        chainInputId: chain.runInputId,
        options: chain.options,
      }),
    ])
    if (await isFree) return true
    if (signal.reason === SHUTDOWN_REASON || this.logFailure) {
      this.giveBack(operation)
      return false
    }
    await this.settle({
      inputId,
      operationId: operation.id,
      outcome: 'aborted',
    })
    operation.fail('cancelled', new Error('Cancelled before it started.'))
    return false
  }

  /**
   * The time limit of a new run of `chain`, in epoch ms: its own
   * `limits.timeoutMs`, never later than the time limit of the run that
   * started it.
   */
  protected agentDeadline(chain: AgentChain) {
    const { inputs, thread } = this.writer.state
    const parentId = chain.parentRunId ?? chain.turnRunId
    const parentInput =
      parentId === undefined ? undefined : thread.tree.get(parentId)?.inputId
    const timeoutMs = chain.options.limits?.timeoutMs
    const limits = [
      ...(timeoutMs !== undefined ? [Date.now() + timeoutMs] : []),
      ...(parentInput === undefined
        ? []
        : [inputs.get(parentInput)?.timeoutAt ?? Infinity]),
    ]
    const deadline = Math.min(...limits)
    return Number.isFinite(deadline) ? deadline : undefined
  }

  /**
   * The chain fields of the `agent` input `first`, with the start options
   * that the newest run node of its chain keeps.
   */
  protected loggedFields(first: AgentInputState) {
    let node: RunTreeNode | undefined
    for (const item of this.writer.state.thread.tree.values()) {
      if (item.chainInputId === first.inputId) node = item
    }
    const fields = chainFields(first, node)
    // The input keeps only a parent run of agent code. The tree keeps the
    // turn that started the chain too, so a run of the chain on any host
    // knows that turn.
    const parent = node?.parentRunId
    return parent !== undefined && fields.parentRunId === undefined
      ? { ...fields, turnRunId: parent }
      : fields
  }

  /**
   * Warn once that the agent run `runId` runs again on this host without
   * the start options that the log cannot keep (`onModelError`).
   */
  protected warnLiveOnly(runId: string | undefined) {
    const node =
      runId === undefined ? undefined : this.writer.state.thread.tree.get(runId)
    if (!node?.liveOnly) return
    this.warnSession(
      'harness:agents',
      `The agent run ${runId} runs again without its ${node.liveOnly.join(' and ')} option: the log keeps no function.`,
    )
  }

  /**
   * The chat middleware of the `onModelError` option of `chain`, for the
   * run `operation`: a model call that fails before it streams asks the
   * option. On `'retry'`, it waits a short backoff and calls the model
   * again. Only that call runs again, so no tool runs twice. Core calls one
   * model call at most 3 times. A tool that throws, or an error of the agent
   * code, does not ask.
   */
  protected modelErrorRetry(
    operation: AgentRunImpl,
    chain: AgentChain,
  ): ChatMiddleware | undefined {
    const option = chain.options.onModelError
    if (!option) return undefined
    const hook =
      typeof option === 'function'
        ? option
        : ({ error, retries }: AgentModelErrorContext) =>
            retries < option.retries &&
            (option.transientOnly === false || isTransientModelError(error))
              ? ('retry' as const)
              : ('fail' as const)
    const { signal } = operation.abortController
    let retries = 0
    return {
      name: 'harness:agent-model-error',
      onModelError: async (ctx, error) => {
        if (signal.aborted || this.logFailure) return
        const { code, retryAfterMs } = error
        let answer: 'retry' | 'fail'
        try {
          answer = await hook({
            runId: operation.id,
            agent: chain.agent,
            error: {
              message: this.scrub(error.message),
              ...(code !== undefined ? { code } : {}),
              ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            },
            retries,
            signal,
          })
        } catch (thrown) {
          this.warnSession('harness:agents', thrown)
          return
        }
        retries += 1
        // Core makes no 4th call, so a wait after the 3rd failure is lost.
        if (answer !== 'retry' || signal.aborted || retries >= 3) return
        await backoff(
          Math.min(retryAfterMs ?? 250 * 2 ** (retries - 1), 5_000),
          signal,
        )
        if (!signal.aborted) ctx.retry()
      },
    }
  }

  /**
   * The run that started the operation `operationId`: the parent of its
   * chain, the same as its node in the run tree. A run that this host does
   * not run (an offered run) has its node in the log. A top-level run and an
   * operation that is not an agent run have none.
   */
  protected parentRunOf(operationId: string): string | undefined {
    const chain = this.chainOf.get(operationId)
    if (chain) return chain.parentRunId ?? chain.turnRunId
    return this.logWriter?.state.thread.tree.get(operationId)?.parentRunId
  }

  /**
   * A new agent run operation. `id`: a stored one, after a restart.
   * `startedCursor`: the start of a run that the log rebuilds.
   * `subagentRunId`: the child id of the run. Default: the one of its run
   * record, else the run id, so a host that offered the run knows it too.
   */
  protected agentOperation(
    agent: string,
    id?: string,
    startedCursor?: Cursor,
    subagentRunId?: string,
  ): AgentRunImpl {
    // A call on the run itself acts as the user of the run, not as the
    // user that opened the session. A handle passes its own user.
    const asUserOf = (running: string) => {
      const user = this.userOfRun(running)
      return user ? { user } : {}
    }
    const operation = new OperationImpl<unknown>(
      'agent',
      this.feed,
      (running) =>
        this.cancel({ operationId: running.id, ...asUserOf(running.id) }),
      agent,
      id,
      startedCursor,
    )
    const run = Object.assign(
      // `kind` and `agent` are fixed by the constructor call above.
      operation as OperationImpl<unknown> & { kind: 'agent'; agent: string },
      {
        subagentRunId:
          subagentRunId ??
          this.writer.state.thread.runs.get(operation.id)?.subagentRunId ??
          operation.id,
        send: (
          message: UserInput,
          options?: {
            mode?: 'steer' | 'followUp'
            inputId?: string
            user?: HarnessUser
          },
        ) =>
          this.sendToAgent({
            ...asUserOf(operation.id),
            ...options,
            operationId: operation.id,
            message,
          }),
      },
    )
    this.track(run)
    // A settled run frees its slot. Any agent run that ends can free one: a
    // top-level run that ran or waited in the log counts too.
    const free = () => this.slots.leave(run.id)
    run.then(free, free)
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
      | 'user'
      | 'parentRunId'
      | 'parentChainInputId'
      | 'release'
      | 'turnRunId'
      | 'plugins'
    > & { budget?: SubagentBudget },
    first: AgentRunEntry,
  ): AgentChain {
    const agent =
      typeof fields.target === 'string' ? fields.target : fields.target.name
    const chain = {
      ...fields,
      agent,
      thread: `${this.threadId}:${agent}:${fields.runInputId}`,
      budget: fields.budget ?? this.codeBudget(fields.runInputId),
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
   * Run again an agent run with `runAgainAfterCrash: true` whose host stopped: a first
   * run, or a follow-up run of the chain of `first`. The new run applies the
   * same input, so its attempt counts up, and it continues the chain's saved
   * transcript. `subagentRunId`: the child id of the run that stopped, so an
   * id that the model got stays valid.
   */
  protected resumeAgent(
    input: InputState,
    first: AgentInputState,
    subagentRunId?: string,
  ) {
    this.warnLiveOnly(input.operationId)
    const operation = this.agentOperation(
      first.input.agent,
      undefined,
      undefined,
      subagentRunId,
    )
    const sender = input.user ? { user: input.user } : {}
    const chain = this.createChain(this.loggedFields(first), {
      operation,
      ...sender,
    })
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
   * Start an agent run whose start waited in the log when its host stopped:
   * a top-level run waited for a slot, or the host stopped before it
   * started. It never ran, so nothing runs twice, also without `runAgainAfterCrash`. It
   * keeps the run id of its queued node, so the `operationId` of its receipt
   * stays valid. A top-level run waits for a slot again. A child of a turn
   * keeps its turn as its parent, and the child id that the model got.
   */
  protected startQueuedAgent(input: AgentInputState) {
    const node = [...this.writer.state.thread.tree.values()].find(
      (item) => item.inputId === input.inputId && item.status === 'queued',
    )
    const operation = this.agentOperation(
      input.input.agent,
      node?.runId,
      undefined,
      node?.subagentRunId,
    )
    const sender = input.user ? { user: input.user } : {}
    const chain = this.createChain(this.loggedFields(input), {
      operation,
      ...sender,
    })
    void this.executeAgent(operation, chain, {
      inputId: input.inputId,
      queued: true,
    })
  }

  /**
   * What a resumable agent run adds: checkpoints of its `ctx.chat` tool
   * phases, and `ctx.harness.step` values in the session log, under the key
   * of the input the run applies.
   */
  protected resumable(inputId: string, run: RunContext) {
    const { writer } = this
    const key = agentKey(inputId)
    const checkpoint = checkpointMiddleware({
      runs: this.runStore,
      messages: this.engine,
    })
    return {
      middleware: [
        checkpoint,
        truncationMiddleware(this.harness.durability?.truncatedToolResult),
        this.durableTools(this.durableBinder(run)),
      ],
      // As in a turn, each final tool result goes to the session log at
      // once, under a key of this run. A run again puts it back. These go
      // at the very end of the list, after every plugin and the agent's
      // own middleware.
      last: [
        scrubToolResults(this.redactor),
        toolResultRecorder(({ toolCallId, message }) =>
          writer.append([
            {
              type: 'harness.tool.result',
              toolCallId: `${key}:${toolCallId}`,
              message,
            },
          ]),
        ),
      ],
      // The steps of the run are under the key of its input: the same on
      // each run again.
      step: this.durableBinding(writer, key, run).step,
    }
  }

  /**
   * The saved transcript of a resumable agent run whose host stopped. The
   * chat runs that host left running end `failed`, and the last tool batch
   * gets the same repair as in a turn: the results that finished, and an
   * error for a cut call that must not run twice.
   */
  protected async continueAgentThread(agentThread: string, inputId: string) {
    const store = this.engine
    const runs = this.runStore
    const records = (await runs.listByThread?.(agentThread)) ?? []
    for (const run of records.filter((item) => item.status === 'running')) {
      await runs.update(run.runId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: { message: AGENT_STOPPED },
      })
    }
    const newest = [...records].sort((a, b) => b.startedAt - a.startedAt)[0]
    const prefix = `${agentKey(inputId)}:`
    const finished = new Map(
      [...this.writer.state.toolResults].flatMap(([id, message]) =>
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
   * Run a group of agents that `start` starts. Every child settles before
   * the group returns. At most `concurrency` children run at the same time.
   * A child over it waits for a slot, oldest first, and nothing of it is in
   * the log until it starts. A cancel while it waits ends it cancelled.
   */
  protected override async agentGroup(
    options: AgentGroupOptions,
    body: (group: AgentGroup) => GroupRuns | Promise<GroupRuns>,
    start: AgentStartFn,
  ): Promise<Array<unknown>> {
    const concurrency = options.concurrency ?? Infinity
    if (!(concurrency >= 1)) {
      throw new RangeError('The concurrency of a group must be 1 or more.')
    }
    const slots = new Gate(() => concurrency)
    let children = 0
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
      start: ((
        target: string | AnyAgent,
        input?: unknown,
        childOptions?: AgentStartOptions,
      ) => {
        // The start function enters the group as it admits the child.
        const key = String(children++)
        let operation: AgentRunImpl
        try {
          operation = start(target, input, {
            ...childOptions,
            enter: (admit) => slots.enter(key, admit),
          })
        } catch (error) {
          slots.leave(key)
          throw error
        }
        operation.abortController.signal.addEventListener(
          'abort',
          () => slots.drop(key),
          { once: true },
        )
        started.push(operation)
        Promise.resolve(operation).then(
          () => slots.leave(key),
          () => {
            slots.leave(key)
            cancelOthers(operation)
          },
        )
        return operation
      }) as AgentGroup['start'],
    }
    try {
      const runs = await body(group)
      if (options.onFailure !== 'collect') return await Promise.all(runs)
      return await Promise.all(
        runs.map((run) =>
          Promise.resolve(run).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        ),
      )
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
      // A store write threw. The run still ends. A run that had no receipt
      // yet gets a refusal, so a reader of it does not wait.
      operation.resolveReceipt({
        inputId: start.inputId,
        status: 'rejected',
        reason: error instanceof Error ? error.message : String(error),
      })
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
    const { operation: running, user } = chain.current
    // A steer joins only a run of its own sender, so no message runs with
    // another person's credentials. Any other message runs as a follow-up,
    // for its sender.
    const isOwnSteer =
      mode === 'steer' && !running.isSettled() && isSameSender(sent.user, user)
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
      ...(next.user ? { user: next.user } : {}),
    }
    chain.runs.push(chain.current)
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
    const { user } = chain.current
    const { answers } = start
    if (!start.resumed && !start.message && !answers) {
      // A queued start that recovery runs is in the log already. With no
      // `await` before the slot, recovery keeps the order of the starts.
      const admission = start.queued
        ? 'new'
        : await this.accept(
            inputId,
            {
              op: 'agent',
              agent: name,
              input,
              ...(options.startTurnWhenDone ? { detached: true } : {}),
              ...(options.runAgainAfterCrash
                ? { runAgainAfterCrash: true }
                : {}),
              ...(options.addResultNote === false
                ? { addResultNote: false as const }
                : {}),
              ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
            },
            user,
            {
              // An offered run runs as this operation on the owner.
              runId: operation.id,
              // A child of a turn has its node from the start, with the child
              // id that the model got. Recovery of a start that never ran
              // reads both: the input keeps no turn.
              ...(chain.turnRunId !== undefined && start.child
                ? {
                    records: [
                      runNodeRecord({
                        runId: operation.id,
                        kind: 'agent',
                        inputId,
                        user,
                        agent: name,
                        chainInputId: chain.runInputId,
                        options,
                        parentRunId: chain.turnRunId,
                        subagentRunId: start.child.subagentRunId,
                      }),
                    ],
                  }
                : {}),
            },
          )
      // As a turn does: a refused, offered, or known input gets its receipt
      // now. A new one gets it below, when the run starts or waits.
      if (admission !== 'new') {
        operation.resolveReceipt(this.duplicateReceipt(inputId, admission))
      }
      switch (admission) {
        case 'new':
          break
        case 'closed':
          this.releaseStart(chain)
          operation.fail('cancelled', new Error('Session closed.'))
          return
        case 'conflict':
        case 'deleted':
          this.releaseStart(chain)
          operation.fail(
            'failed',
            new InputRejectedError({
              inputId,
              status: 'rejected',
              reason: admission,
            }),
          )
          return
        case 'offered':
        case 'duplicate':
          // Another host runs it, or it ran before: the log says how it ends.
          // A run before took its call of the tree budget already.
          if (admission === 'duplicate') this.releaseStart(chain)
          this.followLoggedRun(operation, inputId)
          return
      }
      // A top-level start waits for a slot of `maxConcurrent`.
      const isTopLevel =
        chain.parentRunId === undefined && chain.turnRunId === undefined
      if (isTopLevel && !this.slots.hasRoom()) {
        operation.resolveReceipt({
          inputId,
          status: 'queued',
          operationId: operation.id,
        })
      }
      if (isTopLevel && !(await this.takeSlot(operation, chain, inputId))) {
        return
      }
    }
    // By name, an agent of a plugin that this thread removed is unknown.
    const agent: AnyAgent | undefined =
      typeof target === 'string' ? this.threadAgent(target) : target
    if (!agent) {
      this.releaseStart(chain)
      operation.resolveReceipt(this.reject(inputId, 'unknown_agent'))
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
        this.releaseStart(chain)
        operation.resolveReceipt(this.reject(inputId, 'invalid_input'))
        operation.fail('failed', new Error(reason))
        return
      }
      checkedInput = checked.data
    }

    operation.setStatus('running')
    // A run that waited for a slot has its receipt already.
    operation.resolveReceipt({
      inputId,
      status: 'accepted',
      operationId: operation.id,
    })
    // A run that goes on after its waits applied its input already. The
    // node of the run goes in the same append.
    if (!answers) {
      const parentRunId = chain.parentRunId ?? chain.turnRunId
      const { parentChainInputId } = chain
      await this.applied(
        inputId,
        operation.id,
        [
          runNodeRecord({
            runId: operation.id,
            kind: 'agent',
            inputId,
            user,
            agent: name,
            chainInputId: chain.runInputId,
            options,
            ...(parentRunId !== undefined ? { parentRunId } : {}),
            ...(parentChainInputId !== undefined ? { parentChainInputId } : {}),
          }),
        ],
        this.agentDeadline(chain),
      )
    }
    // The run applied: its start keeps its call of the tree budget.
    delete chain.release
    const stopTimer = this.startTimeout(inputId, operation)
    const child = answers
      ? { subagentRunId: answers.subagentRunId }
      : (start.child ?? { subagentRunId: operation.subagentRunId })
    const runs = this.runStore
    // The run record keeps the child id, so the run can go on after a
    // restart with the same one.
    await runs.createOrResume({
      runId: operation.id,
      threadId: this.threadId,
      startedAt: Date.now(),
      kind: 'agent',
      agent: name,
      subagentRunId: child.subagentRunId,
      // Only a run that agent code started: core reads a parent run here as
      // a chat run whose child cards it shows.
      ...(chain.parentRunId ? { parentRunId: chain.parentRunId } : {}),
      // `RunRecord` is a published type: it keeps the user as `principal`.
      ...(user ? { principal: storedUser(user).user } : {}),
    })
    if (answers) await runs.update(operation.id, { status: 'running' })
    // The run that started this one: a reader rebuilds the run tree from it.
    const parentRunId = chain.parentRunId ?? chain.turnRunId
    operation.publish({
      type: EventType.RUN_STARTED,
      runId: operation.id,
      threadId: this.threadId,
      ...(parentRunId !== undefined ? { parentRunId } : {}),
      timestamp: Date.now(),
    })
    if (!answers) {
      this.publishStarted(operation)
      await this.indexAgent(operation, child)
    }

    let text = ''
    let result: unknown
    let failure: string | undefined
    /** The run stopped for its interrupts: it waits for their answers. */
    let isSuspended = false
    // The interrupts of the run, when it stops for them.
    const sink = createSubagentSink()
    const { subagentRunId, prompt } = child
    const modelErrorRetry = this.modelErrorRetry(operation, chain)
    try {
      // A first run starts from the session thread. A run again after a
      // host stop continues the chain's thread. A follow-up run continues
      // the chain's thread, with its message added. The message id is its
      // input id, so a run again after a host stop does not add it twice.
      // A run that goes on after its waits continues the chain's thread.
      const { message } = start
      const saved = start.resumed
        ? await this.continueAgentThread(chain.thread, inputId)
        : message || answers
          ? await this.engine.loadThread(chain.thread)
          : await this.messages.loadThread(this.threadId)
      const messages =
        message && !saved.some((item) => item.id === message.inputId)
          ? [...saved, asUserMessage(message)]
          : saved
      // The run of this agent: its user's credentials and keys, for its own
      // chat calls and its tools, also while another user's turn runs. A
      // sign-in wait of one of its tools stops this run, until the user
      // cancels that sign-in.
      const declined = new Set(answers?.declined)
      // The run that started this one: agent code, else a turn.
      const parentRunId = chain.parentRunId ?? chain.turnRunId
      const run = this.runContext({
        user,
        runId: operation.id,
        ...(parentRunId ? { parentRunId } : {}),
        signal: operation.abortController.signal,
        canWait: (id) => !declined.has(id),
      })
      // The plugins of the turn that started the chain, while they are
      // not disposed. A follow-up after the turn and its runs gets none.
      const { plugins } = chain
      const runPlugins = plugins?.hold(operation) ? plugins.plugins : undefined
      const binding = this.binding(operation, [], user, run, runPlugins)
      const durable = options.runAgainAfterCrash
        ? this.resumable(inputId, run)
        : undefined
      const harnessContext: HarnessAgentContext = withHarnessChild(
        {
          step: durable?.step ?? NO_SESSION_CONTEXT.step,
          agents: this.agentStarter(chain, inputId),
          state: (options) => this.sharedState(options),
          // A background run does not answer a turn, so it cannot hand off.
          handoff: NO_SESSION_CONTEXT.handoff,
        },
        (inner, ctx) => this.runHarnessChild(inner, ctx, { operation, user }),
        run,
      )
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
          // A run that goes on after its waits gets a new chat run.
          runId: answers
            ? `${operation.id}:${subagentRunId}:${Date.now().toString(36)}`
            : `${operation.id}:${subagentRunId}`,
          parentRunId: answers?.interruptedRunId ?? operation.id,
          subagentRunId,
          ...(answers ? { resume: answers.resume } : {}),
          abortSignal: operation.abortController.signal,
        },
        sink,
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
            ...(modelErrorRetry ? [modelErrorRetry] : []),
            ...binding.chatMiddleware,
          ],
          // After the agent's own middleware: the scrub of the model call,
          // then the scrub and the log of each final tool result.
          lastChatMiddleware: [
            ...binding.lastChatMiddleware,
            ...(durable?.last ?? []),
          ],
          // As in a turn: the approvals and questions that plugins stop the
          // run with before its tools run, then the app's own. The run waits
          // for them. The agent's own interrupts win on an id clash.
          interrupts: [
            ...BOUNDARY_INTERRUPTS,
            ...(this.harness.interrupts ?? []),
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
          isSuspended = chunk.outcome?.type === 'suspended'
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
    stopTimer()

    // The run stopped for outside input: it waits, and does not end.
    const isWaiting =
      isSuspended &&
      failure === undefined &&
      sink.interrupts.length > 0 &&
      !operation.abortController.signal.aborted &&
      !this.logFailure
    if (isWaiting) {
      await this.suspendAgent({
        operation,
        chain,
        inputId,
        subagentRunId,
        interrupts: sink.interrupts,
      })
      return
    }

    const value = result !== undefined ? result : text
    // The run record and the log keep how the agent ended, so recovery
    // leaves it alone. After a log failure, another host owns the thread and
    // decides how the run ended, so this host writes neither. The result is
    // in the `harness.agent.result` record only, so `agentResult` has it
    // after a restart.
    const end = async (
      run: Pick<RunRecord, 'status'> & Partial<Pick<RunRecord, 'error'>>,
      settlement: SettlementOutcome,
      ended: Omit<AgentResultRecord, 'inputId'>,
    ) => {
      if (this.logFailure) return
      // The model use of the run and of the runs below it.
      const used = this.writer.state.runUsage.get(operation.id)
      await runs.update(operation.id, {
        ...run,
        finishedAt: Date.now(),
        ...(used
          ? {
              usage: {
                promptTokens: used.promptTokens,
                completionTokens: used.completionTokens,
                totalTokens: used.totalTokens,
              },
            }
          : {}),
      })
      await this.endAgentSteps(inputId)
      // A refused append stops the session. The operation still ends. The
      // steers that joined the run settle with it, in one append.
      const joined = this.joinedInputs(operation.id, inputId)
      await this.settleWith(
        [inputId, ...joined].map((id) => ({
          inputId: id,
          operationId: operation.id,
          ...settlement,
        })),
        [agentResultRecord(operation.id, { inputId, ...ended })],
      ).catch((error: unknown) => this.warnSession('harness:agents', error))
    }
    // The run settled already: a note that fails must not leave it open.
    const note = (ended: 'finished' | 'failed', result: unknown) =>
      this.noteAgentEnd(name, ended, result, options, user).catch(
        (error: unknown) => this.warnSession('harness:agents', error),
      )
    // A recoverable close: the run stops as on a crash, and the next host
    // runs it again.
    if (operation.abortController.signal.reason === SHUTDOWN_REASON) {
      this.giveBack(operation)
      return
    }
    // A budget or a time limit stops the run: it fails with a code.
    const limited = limitFailure(operation.abortController.signal.reason)
    const error =
      limited ?? (failure !== undefined ? { message: failure } : undefined)
    try {
      if (operation.abortController.signal.aborted && !limited) {
        operation.publish({
          type: EventType.RUN_FINISHED,
          runId: operation.id,
          threadId: this.threadId,
          outcome: { type: 'cancelled' },
          timestamp: Date.now(),
        } as StreamChunk)
        await end(
          { status: 'aborted' },
          { outcome: 'aborted' },
          { status: 'cancelled' },
        )
        operation.fail('cancelled', new Error('Cancelled.'))
      } else if (error) {
        operation.publish({
          type: EventType.RUN_ERROR,
          message: error.message,
          ...(limited ? { code: limited.code } : {}),
          timestamp: Date.now(),
        })
        await end(
          { status: 'failed', error },
          { outcome: 'failed', error },
          { status: 'failed', error },
        )
        await note('failed', error.message)
        operation.fail(
          'failed',
          Object.assign(new Error(error.message), limited ?? {}),
        )
      } else {
        operation.publish({
          type: EventType.RUN_FINISHED,
          runId: operation.id,
          threadId: this.threadId,
          result: value,
          timestamp: Date.now(),
        } as StreamChunk)
        await end(
          { status: 'completed' },
          { outcome: 'completed' },
          { status: 'completed', result: value },
        )
        await note('finished', value)
        operation.finish('completed', value)
      }
    } finally {
      // The finished event goes out as the run settles, so the listeners of
      // the run still get it. A run that a store write failed gets it from
      // failOperation.
      if (operation.isSettled()) this.publishFinished(operation)
    }
  }

  /**
   * The agent run of the input `inputId` ended: delete the secret answers of
   * its steps, before its caller sees the end. A failed delete does not fail
   * the end of the run.
   */
  protected async endAgentSteps(inputId: string) {
    await this.dropKeptAnswers(stepWaitPrefix(agentKey(inputId))).catch(
      (error: unknown) => this.warnSession('harness:waits', error),
    )
  }

  /**
   * Keep the agent run `operation` waiting for the answers to `interrupts`.
   * Each one is a wait of this run in the log. The run is `interrupted`, its
   * input stays open, and it does not keep the thread busy. An answer on any
   * host resumes it (see `resumeWaitingRuns`).
   */
  protected async suspendAgent({
    operation,
    chain,
    inputId,
    subagentRunId,
    interrupts,
  }: {
    operation: AgentRunImpl
    chain: AgentChain
    inputId: string
    subagentRunId: string
    interrupts: ReadonlyArray<Interrupt>
  }) {
    const { user } = chain.current
    // First, so an answer that comes at once finds the run here.
    this.holdWaitingRun({ operation, chain, inputId, subagentRunId })
    await this.runStore.update(operation.id, { status: 'interrupted' })
    const at = Date.now()
    await this.writeWait(
      ...interrupts.map((interrupt) => {
        const wait = waitFromInterrupt({
          interrupt,
          runId: operation.id,
          ...storedUser(user),
        })
        const expiresAt = expiryOf(wait.kind, wait.expiresAt, at)
        return {
          wait: { ...wait, ...(expiresAt !== undefined ? { expiresAt } : {}) },
          at,
        }
      }),
    )
    operation.publish({
      type: EventType.RUN_FINISHED,
      runId: operation.id,
      threadId: this.threadId,
      outcome: { type: 'interrupt', interrupts: [...interrupts] },
      timestamp: Date.now(),
    } as StreamChunk)
    this.checkIdle()
  }

  /**
   * Keep the agent run `operation` as a run of this host that waits: it is
   * `interrupted`, a cancel ends it, and an answer resumes it here. It does
   * not keep the thread busy.
   */
  protected holdWaitingRun(waiting: {
    operation: AgentRunImpl
    chain: AgentChain
    inputId: string
    subagentRunId: string
  }) {
    const { operation, inputId } = waiting
    this.waitingRuns.set(operation.id, waiting)
    operation.setStatus('interrupted')
    operation.abortController.signal.addEventListener(
      'abort',
      () =>
        void this.stopWaitingRun(operation).catch((error: unknown) =>
          this.warnSession('harness:agents', error),
        ),
      { once: true },
    )
    // Another host can resume the run: then the log says how it ended.
    this.settled({ inputId }).then(
      (settlement) => {
        if (this.waitingRuns.get(operation.id)?.operation !== operation) {
          return
        }
        this.waitingRuns.delete(operation.id)
        this.endAgentRun(operation, settlement)
      },
      () => {},
    )
  }

  /**
   * Take an agent run that waits in the log (its host stopped) as a run of
   * this host that waits, so a cancel reaches it, and an answer resumes it
   * here. Recovery calls it.
   */
  protected adoptWaitingRun(
    input: InputState,
    first: AgentInputState,
    run: Pick<RunRecord, 'subagentRunId'>,
  ) {
    const runId = input.operationId
    if (runId === undefined || run.subagentRunId === undefined) return
    this.warnLiveOnly(runId)
    const operation = this.agentOperation(
      first.input.agent,
      runId,
      this.runStart(runId),
    )
    const sender = input.user ? { user: input.user } : {}
    const chain = this.createChain(this.loggedFields(first), {
      operation,
      ...sender,
    })
    this.holdWaitingRun({
      operation,
      chain,
      inputId: input.inputId,
      subagentRunId: run.subagentRunId,
    })
  }

  /**
   * The abort of a run that waits. A cancel ends the run `cancelled`, with
   * its open waits. A session close ends only the part of this host: the log
   * keeps the run waiting, and an answer resumes it on the next host.
   */
  protected async stopWaitingRun(operation: AgentRunImpl) {
    const waiting = this.waitingRuns.get(operation.id)
    if (waiting?.operation !== operation) return
    this.waitingRuns.delete(operation.id)
    // `close()` sets `closing` after it aborts the runs.
    await Promise.resolve()
    // A host that stops or loses the log: the run waits on in the log.
    const isShutdown =
      operation.abortController.signal.reason === SHUTDOWN_REASON
    if (this.closing || this.logFailure || isShutdown) {
      operation.fail('cancelled', new Error('Session closed.'))
      return
    }
    const { thread } = this.writer.state
    const open = [...thread.waits.values()].filter(
      (state) =>
        state.wait.runId === operation.id && state.outcome === undefined,
    )
    for (const { wait } of open) {
      if (thread.interrupts.get(wait.waitId)?.status === 'pending') {
        await this.interruptStore.cancel(wait.waitId)
      }
    }
    await this.runStore.update(operation.id, {
      status: 'aborted',
      finishedAt: Date.now(),
    })
    const { inputId } = waiting
    await this.endAgentSteps(inputId)
    await this.settleWith(
      [inputId, ...this.joinedInputs(operation.id, inputId)].map((id) => ({
        inputId: id,
        operationId: operation.id,
        outcome: 'aborted' as const,
      })),
      [
        agentResultRecord(operation.id, { inputId, status: 'cancelled' }),
        ...open.flatMap((state) =>
          this.waitEndRecords(state.wait.waitId, 'cancelled'),
        ),
      ],
    )
    for (const state of open) this.publishWaitSettled(state.wait.waitId)
    this.armSchedules()
    operation.publish({
      type: EventType.RUN_FINISHED,
      runId: operation.id,
      threadId: this.threadId,
      outcome: { type: 'cancelled' },
      timestamp: Date.now(),
    } as StreamChunk)
    operation.fail('cancelled', new Error('Cancelled.'))
    this.publishFinished(operation)
    this.nextFollowUp(waiting.chain)
    this.checkIdle()
  }

  /**
   * A saved credential also answers the sign-in waits of the agent runs
   * that wait: each open wait whose connector has a credential of the
   * run's user now ends `answered`, through the input lane, so the owner of
   * the log takes it. The input id comes from the wait, so a second save
   * does not answer it twice.
   */
  protected override async resumeSignIns(): Promise<void> {
    await super.resumeSignIns()
    if (this.closing || !this.logWriter) return
    const { waits, interrupts } = this.writer.state.thread
    for (const { wait, live } of openWaits(waits)) {
      if (wait.kind !== 'sign-in' || live !== undefined) continue
      const opened = interrupts.get(wait.waitId)
      const connector = opened && signInOf(interruptOf(opened))?.connector
      if (!connector) continue
      // Another user's credential never answers this sign-in.
      const user = wait.user ?? this.user
      if (!(await this.credentialsOf(user).get(connector))) continue
      await this.resolve({
        resume: [
          {
            interruptId: wait.waitId,
            status: 'resolved',
            payload: { connector },
          },
        ],
        inputId: `sign-in:${wait.waitId}`,
        ...(user ? { user } : {}),
      })
    }
  }

  /**
   * Resume each agent run whose waits all ended. The answers go to the chat
   * run that stopped: an answer resolves its interrupt, and a cancel or an
   * expiry cancels it. A run that waits on this host goes on here. Else
   * (after a restart, or a run of another host) it goes on from the log, as
   * the same operation. Only the owner of the log resumes a run.
   */
  protected override async resumeWaitingRuns(): Promise<void> {
    if (this.closing || !this.logWriter) return
    const { inputs } = this.writer.state
    const { waits, runs, interrupts } = this.writer.state.thread
    for (const input of [...inputs.values()]) {
      const runId = input.operationId
      if (runId === undefined || input.status !== 'applied') continue
      const record = runs.get(runId)
      if (record?.status !== 'interrupted') continue
      const first = chainInputOf(inputs, input)
      if (!first) continue
      // The waits of the stopped chat run: their interrupts are pending.
      const own = [...waits.values()].filter(
        (state) =>
          state.wait.runId === runId &&
          interrupts.get(state.wait.waitId)?.status === 'pending',
      )
      if (own.length === 0 || own.some((state) => !state.outcome)) continue
      const ownFirst = own[0]
      const stopped = ownFirst && interrupts.get(ownFirst.wait.waitId)
      const waiting = this.waitingRuns.get(runId)
      const subagentRunId = waiting?.subagentRunId ?? record.subagentRunId
      if (!stopped || subagentRunId === undefined) continue
      const answers = {
        resume: own.map(
          ({ wait, outcome, value }): RunAgentResumeItem =>
            outcome === 'answered'
              ? { interruptId: wait.waitId, status: 'resolved', payload: value }
              : { interruptId: wait.waitId, status: 'cancelled' },
        ),
        interruptedRunId: stopped.runId,
        subagentRunId,
        // A sign-in that the user cancelled fails its tool when it runs again.
        declined: own.flatMap(({ wait, outcome }) => {
          const opened = interrupts.get(wait.waitId)
          const connector =
            outcome !== 'answered' && opened
              ? signInOf(interruptOf(opened))?.connector
              : undefined
          return connector ? [connector] : []
        }),
      }
      if (waiting) {
        this.waitingRuns.delete(runId)
        void this.executeAgent(waiting.operation, waiting.chain, {
          inputId: waiting.inputId,
          answers,
        })
        continue
      }
      // It goes on here already.
      const isRunning = () => this.operations.get(runId)?.isSettled() === false
      if (isRunning()) continue
      if (!(await this.writer.own())) return
      // Another call started it during the wait for the log.
      if (isRunning()) continue
      // Recovery must not run it again.
      this.admitted.set(input.inputId, inputKey(input.input, input.user))
      this.warnLiveOnly(runId)
      const operation = this.agentOperation(
        first.input.agent,
        runId,
        this.runStart(runId),
      )
      const sender = input.user ? { user: input.user } : {}
      const chain = this.createChain(this.loggedFields(first), {
        operation,
        ...sender,
      })
      void this.executeAgent(operation, chain, {
        inputId: input.inputId,
        answers,
      })
    }
  }

  /**
   * The index entry of an agent run: thread `subagent:<subagentRunId>`, in
   * the tenant of this thread, with this thread as its parent and the
   * harness of this thread. It has no members: access to a child goes
   * through its parent. A write replaces the whole entry, so the fields of other writers
   * stay. A failed write does not fail the run.
   */
  protected async indexAgent(
    operation: OperationImpl<unknown>,
    child: AgentChild,
  ) {
    const { tenantId } = this
    const threadId = `subagent:${child.subagentRunId}`
    const now = Date.now()
    try {
      await this.index.update({ tenantId, threadId }, (entry) => ({
        ...entry,
        ...(tenantId !== undefined ? { tenantId } : {}),
        threadId,
        parentThreadId: this.threadId,
        ...(child.parentToolCallId !== undefined && {
          parentToolCallId: child.parentToolCallId,
        }),
        harness: this.harness.name,
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
   * `addResultNote: false`), and a new chat turn when `startTurnWhenDone` is set. The new turn
   * runs as `user`, the user who started the agent.
   */
  protected async noteAgentEnd(
    name: string,
    ended: 'finished' | 'failed',
    result: unknown,
    options: AgentStartOptions,
    user?: HarnessUser,
  ): Promise<void> {
    const note = referenceNote(name, result, ended)
    if (options.addResultNote !== false) {
      await this.addNote(note)
    }
    if (options.startTurnWhenDone) {
      this.startTurn(
        {
          op: 'followUp',
          message: `Background agent ${name} ${ended}: ${note}`,
        },
        { ...(user ? { user } : {}), wake: true },
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
  protected async failStoppedAgent(stopped: {
    operationId: string
    agent: string
    inputId?: string
    wake?: boolean
    /** Who started the agent. The wake turn runs as this user. */
    user?: HarnessUser
    /** Why it failed. Default: the host stopped. */
    error?: InputSettlement['error']
  }): Promise<void> {
    const { operationId, inputId } = stopped
    const error = stopped.error ?? { message: AGENT_STOPPED }
    await this.runStore.update(operationId, {
      status: 'failed',
      finishedAt: Date.now(),
      error,
    })
    if (inputId) {
      await this.endAgentSteps(inputId)
      // The steers that joined the run settle with it.
      await this.settleWith(
        [inputId, ...this.joinedInputs(operationId, inputId)].map((id) => ({
          inputId: id,
          operationId,
          outcome: 'failed' as const,
          error,
        })),
        [agentResultRecord(operationId, { inputId, status: 'failed', error })],
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
      { startTurnWhenDone: stopped.wake === true },
      stopped.user,
    )
  }

  /**
   * After a crash: queue the logged notes that are not in the transcript,
   * and note each logged job that no host runs now. A job with a backend id
   * can still run in its workspace, so the workspace tools stop it and note
   * it when they bind the workspace again.
   */
  protected async recoverBackground(writer: LogWriter) {
    const queued = new Set(this.pendingNotes.map((message) => message.id))
    for (const [id, note] of writer.state.notes) {
      if (queued.has(id)) continue
      this.pendingNotes.push({ id, role: 'assistant', content: note })
    }
    const lost = [...writer.state.jobs]
      .filter(
        ([jobId, { backendId }]) =>
          !this.liveJobs.has(jobId) && backendId === undefined,
      )
      .map(([jobId]) => jobId)
    // Only the owner notes them. While another live host owns the log, the
    // job runs there.
    if (lost.length > 0 && !(await writer.own())) return
    for (const jobId of lost) {
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

/**
 * The error of an agent run that `reason` stopped: its budget, or its time
 * limit. `undefined` for any other reason.
 */
function limitFailure(reason: unknown) {
  if (reason === BUDGET_REASON) {
    return { message: 'The agent run used its budget.', code: 'budget' }
  }
  if (reason === TIMEOUT_REASON) {
    return { message: 'The agent run passed its time limit.', code: 'timeout' }
  }
  return undefined
}

/** The `agentRuns()` entry of the agent run `node`, of the agent `agent`. */
function agentRunInfo(
  node: RunTreeNode,
  agent: string,
  subagentRunId: string | undefined,
): AgentRunInfo {
  return {
    operationId: node.runId,
    runId: node.runId,
    kind: 'agent',
    agent,
    ...(subagentRunId !== undefined ? { subagentRunId } : {}),
    status: node.status,
    ...(node.parentRunId !== undefined
      ? { parentRunId: node.parentRunId }
      : {}),
    ...(node.user ? { user: node.user } : {}),
    ...(node.budget ? { budget: node.budget } : {}),
    ...(node.result !== undefined ? { result: node.result } : {}),
    ...(node.error ? { error: node.error } : {}),
  }
}

/**
 * The events of a child turn that `harnessAgent` does not send on: the run
 * events (it sends one RUN_FINISHED of its own at the end, with the usage of
 * every turn), and the input and operation events of the child session,
 * whose ids the parent session does not know.
 */
const isChildOwnEvent = (chunk: StreamChunk) =>
  chunk.type === EventType.RUN_STARTED ||
  chunk.type === EventType.RUN_FINISHED ||
  chunk.type === EventType.RUN_ERROR ||
  (chunk.type === EventType.CUSTOM &&
    (chunk.name.startsWith('harness.input.') ||
      chunk.name.startsWith('harness.operation.')))

/**
 * `chunk` with the run that started the child: `metadata.tanstack` gets
 * `parentRunId`, where AG-UI events carry TanStack fields.
 */
function withParentRun(chunk: StreamChunk, parentRunId: string): StreamChunk {
  const metadata =
    'metadata' in chunk && isRecord(chunk.metadata) ? chunk.metadata : {}
  return Object.assign({}, chunk, {
    metadata: {
      ...metadata,
      tanstack: { ...tanstackMetadata(chunk), parentRunId },
    },
  })
}

/**
 * The admission of agent runs: at most `max()` holders at once, no limit
 * when it is `undefined`. `busy` names more holders that the gate does not
 * hold itself (runs in the log). A key that finds no room waits, oldest
 * first. `admit` (a call of the tree budget) runs as a key enters: its
 * throw refuses the key, and the room stays free.
 */
class Gate {
  private readonly holders = new Set<string>()
  private readonly waiters: Array<{
    key: string
    admit: (() => void) | undefined
    resolve: (entered: boolean) => void
    reject: (error: unknown) => void
  }> = []

  constructor(
    private readonly max: () => number | undefined,
    private readonly busy: () => Iterable<string> = () => [],
  ) {}

  hasRoom() {
    const max = this.max()
    if (max === undefined) return true
    return new Set([...this.holders, ...this.busy()]).size < max
  }

  /**
   * Enter as `key`. With room, `admit` runs and the key enters now: `true`,
   * and a throw of `admit` throws here. Else a promise: `true` when the key
   * enters, `false` after `drop`, and a rejection when `admit` throws then.
   */
  enter(key: string, admit?: () => void): true | Promise<boolean> {
    if (this.hasRoom()) {
      admit?.()
      this.holders.add(key)
      return true
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ key, admit, resolve, reject })
    })
  }

  /** The waiting `key` leaves the queue: its entry resolves `false`. */
  drop(key: string) {
    const at = this.waiters.findIndex((waiter) => waiter.key === key)
    if (at >= 0) this.waiters.splice(at, 1)[0]?.resolve(false)
  }

  /** `key` leaves, and the room goes to the waiters, oldest first. */
  leave(key: string) {
    this.holders.delete(key)
    const at = this.waiters.findIndex((waiter) => waiter.key === key)
    if (at >= 0) this.waiters.splice(at, 1)
    this.next()
  }

  /** Give the free room to the waiters, oldest first. */
  next() {
    while (this.hasRoom()) {
      const waiter = this.waiters.shift()
      if (!waiter) return
      try {
        waiter.admit?.()
      } catch (error) {
        waiter.reject(error)
        continue
      }
      this.holders.add(waiter.key)
      waiter.resolve(true)
    }
  }
}
