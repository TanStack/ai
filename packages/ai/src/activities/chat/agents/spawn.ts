import { EventType } from '../../../types'
import {
  addTokenUsage,
  isTanstackUsage,
  rebuildTokenUsage,
  toSpecTokenUsage,
} from '../../../utilities/ag-ui-usage'
import {
  tanstackMetadata,
  withTanstackMetadata,
} from '../../../utilities/merge-metadata'
import { mergeStreams } from '../../../utilities/merge-streams'
import { INTERRUPT_BINDING_METADATA_KEY } from '../../../interrupt-resume'
import { EMIT_STREAM_CHUNK, SUBAGENT_TOOL } from '../tools/tool-calls'
import { validateToolInput } from '../tools/input-validation'
import { convertSchemaToJsonSchema } from '../tools/schema-converter'
import { getLoadChild } from '../middleware/load-child'
import type { LoadChild } from '../middleware/load-child'
import type { SubagentToolOutcome } from '../tools/tool-calls'
import type { SpecTokenUsage } from '../../../utilities/ag-ui-usage'
import type {
  InferSchemaType,
  Interrupt,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
  SubagentErrorEvent,
  SubagentFinishedEvent,
  SubagentStartedEvent,
  TokenUsage,
  Tool,
  ToolExecutionContext,
  UIMessage,
} from '../../../types'
import { envProviderKeys } from '../../../byok/env-keys'
import { createBoundActivities } from './bound'
import { SubagentBudget } from './limits'
import type { AgentStarter, AgentStep, SubagentBinding } from './bound'
import type { SubagentLimits } from './limits'
import type {
  DefinedAgent,
  SubagentRunContext,
  SubagentRunInput,
} from './define-agent'
import type { ChatMiddleware } from '../middleware/types'
import type { SubagentTurn } from './turn'

export const SUBAGENT_STARTED = EventType.SUBAGENT_STARTED
export const SUBAGENT_FINISHED = EventType.SUBAGENT_FINISHED
export const SUBAGENT_ERROR = EventType.SUBAGENT_ERROR

export type SubagentOrder = 'parallel' | 'sequence'

/**
 * One agent in a router pick: its name, or its name and its input. An agent
 * with `inputSchema` needs `{ name, input }`. The input is checked against
 * the schema, and `run` reads it as `ctx.input`.
 */
export type SubagentPickName = string | { name: string; input?: unknown }

export interface SubagentRouterPlan {
  names: ReadonlyArray<SubagentPickName>
  /** Overrides `subagents.order` for this turn. */
  order?: SubagentOrder
}

export interface SubagentStep {
  names: ReadonlyArray<SubagentPickName>
  /** Overrides `subagents.order` for this step. */
  order?: SubagentOrder
}

export interface SubagentStepsPlan {
  steps: ReadonlyArray<SubagentStep>
}

export type SubagentRouterPick =
  | 'main'
  | SubagentPickName
  | ReadonlyArray<SubagentPickName>
  | SubagentRouterPlan
  | SubagentStepsPlan

/**
 * A router pick after `normalizeRouterPick`. Each step has plain names, and
 * `inputs` holds the raw input of each name that has one. This is the plan
 * on `SUBAGENT_STARTED` metadata.
 */
export interface RoutedPlan {
  steps: ReadonlyArray<{
    names: ReadonlyArray<string>
    inputs?: Record<string, unknown>
    order?: SubagentOrder
  }>
}

export interface SubagentsBag<
  TAgents extends ReadonlyArray<DefinedAgent> = ReadonlyArray<DefinedAgent>,
> {
  agents: TAgents
  router?: (ctx: {
    messages: SubagentRunContext['messages']
    agents: NoInfer<TAgents>
    abortSignal?: AbortSignal
  }) => SubagentRouterPick | Promise<SubagentRouterPick>
  strategy?: 'exclusive' | 'handoff'
  /**
   * How a router list runs. `parallel` starts every name together.
   * `sequence` runs each name after the previous one finishes, and passes
   * that child's text to the next child.
   */
  order?: 'parallel' | 'sequence'
  sandbox?: 'own' | 'inherit'
  /**
   * Limits for the whole tree of children the model starts through tools:
   * depth, total calls, children at once, and time per child. A refused
   * start returns to the model as a tool error.
   */
  limits?: SubagentLimits
  /**
   * What a host adds to every activity call a child makes through `ctx`
   * (`ctx.chat`, `ctx.generateImage`, and the rest). A harness session sets
   * it. Apps do not.
   */
  binding?: SubagentBinding
  /**
   * The tools the parent model gets. `per-agent` (the default) gives one tool
   * per agent, with the agent's name. `single` gives one tool named
   * `subagent`. It takes the agent name, plus `sessionId` to continue a
   * stored child and `background` to start a child without waiting.
   */
  tool?: 'per-agent' | 'single'
}

/** The name of the one tool in `subagents: { tool: 'single' }`. */
export const SINGLE_SUBAGENT_TOOL = 'subagent'

/** Fields every call of the single `subagent` tool can add. */
interface SubagentCallOptions {
  /** The `subagentRunId` of a stored, finished child. The call continues it. */
  sessionId?: string
  /** Start the child and return at once. Needs a harness host. */
  background?: boolean
}

/** One agent's call: `input` for an agent with `inputSchema`, else `prompt`. */
type SubagentCallFor<TAgent extends DefinedAgent> = TAgent extends DefinedAgent
  ? ([NonNullable<TAgent['inputSchema']>] extends [never]
      ? { agent: TAgent['name']; prompt?: string }
      : {
          agent: TAgent['name']
          input: InferSchemaType<NonNullable<TAgent['inputSchema']>>
        }) &
      SubagentCallOptions
  : never

/**
 * The input of the single `subagent` tool (`subagents: { tool: 'single' }`).
 * A union on `agent`: an agent with an `inputSchema` needs `input`, and an
 * agent without one takes an optional `prompt`.
 */
export type SubagentToolInput<TAgents extends ReadonlyArray<DefinedAgent>> =
  SubagentCallFor<TAgents[number]>

/** A call of the single `subagent` tool, after the wire schema check. */
interface SubagentCall extends SubagentCallOptions {
  agent: string
  input?: unknown
  prompt?: string
}

/** What the children of one parent run left behind for the parent terminal. */
export interface SubagentSink {
  interrupts: Array<Interrupt>
  /** One AG-UI entry per child model call. */
  usage: Array<SpecTokenUsage>
  /** Summed full usage of the children, including cost. */
  total?: TokenUsage
}

export function createSubagentSink(): SubagentSink {
  return { interrupts: [], usage: [] }
}

/** One child to start, or a suspended child to continue. */
export interface SpawnEntry {
  name: string
  /** The checked input of an agent with `inputSchema`, from a tool or a router. */
  input?: unknown
  /** Text for an agent without `inputSchema`. One user message at the end. */
  prompt?: string
  /** A stored, finished child to run again from its transcript. */
  continued?: {
    subagentRunId: string
    messages: Array<UIMessage | ModelMessage>
  }
  resume?: {
    subagentRunId: string
    /** The child's own messages from the interrupted run. */
    messages: Array<UIMessage | ModelMessage>
    entries: Array<RunAgentResumeItem>
    /** Text the child wrote before it stopped. */
    text: string
  }
}

interface SpawnContext {
  messages: SubagentRunContext['messages']
  abortSignal?: AbortSignal
  threadId: string
  /** The parent chat run. */
  parentRunId: string
  /** The interrupted parent run, on a resume. */
  interruptedRunId?: string
  /** The parent chat's own subagentRunId, when that chat is a child too. */
  parentSubagentRunId?: string
}

export function createSubagentId() {
  return `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function childRunId(parentRunId: string, subagentRunId: string) {
  return `${parentRunId}:${subagentRunId}`
}

/**
 * Bind child interrupts to the parent run. The client resumes the parent run,
 * so each binding must name that run. The resumed child then validates with
 * the parent's interrupted run id.
 */
export function rebindInterrupts(
  interrupts: ReadonlyArray<Interrupt>,
  runId: string,
): Array<Interrupt> {
  return interrupts.map((interrupt) => {
    const binding = interrupt.metadata?.[INTERRUPT_BINDING_METADATA_KEY]
    if (typeof binding !== 'object' || binding === null) return interrupt
    return {
      ...interrupt,
      metadata: {
        ...interrupt.metadata,
        [INTERRUPT_BINDING_METADATA_KEY]: {
          ...binding,
          interruptedRunId: runId,
          generation: 0,
        },
      },
    }
  })
}

function createAbortError() {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return true
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'Aborted')
  )
}

function stoppedEvent(subagentRunId: string) {
  return {
    type: SUBAGENT_ERROR,
    subagentRunId,
    message: 'Stopped',
    timestamp: Date.now(),
  } satisfies SubagentErrorEvent
}

function childThreadId(
  sandbox: SubagentsBag['sandbox'],
  parentThreadId: string,
  name: string,
) {
  return sandbox === 'inherit' ? parentThreadId : `${parentThreadId}:${name}`
}

function linkAbort(parent?: AbortSignal) {
  const controller = new AbortController()
  if (!parent) return { controller, dispose: () => {} }
  if (parent.aborted) {
    controller.abort()
    return { controller, dispose: () => {} }
  }
  const onAbort = () => controller.abort()
  parent.addEventListener('abort', onAbort, { once: true })
  return {
    controller,
    dispose: () => parent.removeEventListener('abort', onAbort),
  }
}

function orAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(createAbortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function agentByName(agents: ReadonlyArray<DefinedAgent>, name: string) {
  const agent = agents.find((entry) => entry.name === name)
  if (!agent) {
    const names = agents.map((entry) => entry.name).join(', ')
    throw new Error(`Unknown subagent: ${name}. The router can pick: ${names}.`)
  }
  return agent
}

function openAgentStream(
  entry: SpawnEntry,
  bag: SubagentsBag,
  ctx: SpawnContext,
  sink?: SubagentSink,
  parentToolCallId?: string,
  binding: SubagentBinding | undefined = bag.binding,
) {
  const agent = agentByName(bag.agents, entry.name)
  const resume = entry.resume
  const continued = entry.continued
  const subagentRunId =
    resume?.subagentRunId ?? continued?.subagentRunId ?? createSubagentId()
  // The parent binds child interrupts to its own run (see rebindInterrupts),
  // so the resumed child continues from the interrupted parent run id.
  if (resume !== undefined && ctx.interruptedRunId === undefined) {
    throw new Error(
      `Subagent "${entry.name}" has interrupt answers, but the run has no parentRunId. Pass the interrupted run id as parentRunId.`,
    )
  }
  // A continued child starts from its stored transcript, not from the parent
  // messages. A prompt is one more user message at the end.
  const base = continued?.messages ?? ctx.messages
  const messages =
    entry.prompt === undefined
      ? base
      : [
          ...base,
          { role: 'user', content: entry.prompt } satisfies ModelMessage,
        ]
  // The card of a continued child also holds its stored messages. Keep only
  // the messages that the stored transcript does not have.
  const storedIds = new Set(continued?.messages.map((message) => message.id))
  const resumed =
    resume !== undefined
      ? {
          messages: [
            ...messages,
            ...resume.messages.filter(
              (message) =>
                message.id === undefined || !storedIds.has(message.id),
            ),
          ],
          parentRunId: ctx.interruptedRunId,
          resume: resume.entries,
        }
      : undefined
  return spawnAgentStream(
    agent,
    {
      input: entry.input,
      messages: resumed?.messages ?? messages,
      ...(ctx.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
      threadId: childThreadId(bag.sandbox, ctx.threadId, entry.name),
      runId: childRunId(ctx.parentRunId, subagentRunId),
      parentRunId: resumed?.parentRunId ?? ctx.parentRunId,
      subagentRunId,
      ...(ctx.parentSubagentRunId !== undefined
        ? { parentSubagentRunId: ctx.parentSubagentRunId }
        : {}),
      ...(resumed ? { resume: resumed.resume } : {}),
    },
    sink,
    parentToolCallId,
    binding,
  )
}

const ROUTER_PICK_ERROR =
  'subagents.router must return main, a name, a list of names, { names, order }, or { steps }.'

function assertOrder(order: SubagentOrder | undefined) {
  if (order !== undefined && order !== 'parallel' && order !== 'sequence') {
    throw new Error('subagents.router order must be parallel or sequence.')
  }
}

/** One step of a pick: plain names, plus the input of each name that has one. */
function normalizeNames(
  picks: ReadonlyArray<SubagentPickName>,
  agents: ReadonlyArray<DefinedAgent>,
) {
  if (picks.length === 0) throw new Error(ROUTER_PICK_ERROR)
  const names = picks.map((pick) =>
    typeof pick === 'string' ? pick : pick.name,
  )
  const hasMain = names.includes('main')
  if (hasMain && names.length > 1) {
    throw new Error('Do not mix main into a subagent list.')
  }
  if (hasMain) return { names: ['main'] }
  for (const name of names) agentByName(agents, name)
  // ponytail: one input per name in a step. A name picked twice in one step
  // keeps its last input. Key inputs by position if a router needs two.
  let inputs: Record<string, unknown> | undefined
  for (const pick of picks) {
    if (typeof pick === 'string' || pick.input === undefined) continue
    inputs = { ...inputs, [pick.name]: pick.input }
  }
  return inputs === undefined ? { names } : { names, inputs }
}

function isPickList(
  pick: SubagentRouterPick,
): pick is ReadonlyArray<SubagentPickName> {
  return Array.isArray(pick)
}

export function normalizeRouterPick(
  pick: SubagentRouterPick,
  agents: ReadonlyArray<DefinedAgent>,
) {
  if (pick === 'main' || typeof pick === 'string') {
    return { steps: [normalizeNames([pick], agents)] }
  }
  if (isPickList(pick)) {
    return { steps: [normalizeNames(pick, agents)] }
  }
  if ('name' in pick) {
    return { steps: [normalizeNames([pick], agents)] }
  }
  if ('steps' in pick) {
    if (pick.steps.length === 0) throw new Error(ROUTER_PICK_ERROR)
    const steps = pick.steps.map((step) => {
      assertOrder(step.order)
      const names = normalizeNames(step.names, agents)
      return step.order === undefined ? names : { ...names, order: step.order }
    })
    const flat = steps.flatMap((step) => step.names)
    if (flat.includes('main') && flat.length > 1) {
      throw new Error('Do not mix main into a subagent list.')
    }
    return { steps }
  }
  assertOrder(pick.order)
  const names = normalizeNames(pick.names, agents)
  return {
    steps: [pick.order === undefined ? names : { ...names, order: pick.order }],
  }
}

/**
 * Tag a child chunk with its subagent. A chunk that a nested child already
 * tagged keeps its own id, and a nested child's start names this child as
 * its parent.
 */
function attributeChunk(
  chunk: StreamChunk,
  subagentRunId: string,
): StreamChunk {
  if (chunk.type === SUBAGENT_STARTED) {
    return chunk.parentSubagentRunId !== undefined
      ? chunk
      : { ...chunk, parentSubagentRunId: subagentRunId }
  }
  if (chunk.type === SUBAGENT_FINISHED || chunk.type === SUBAGENT_ERROR) {
    return chunk
  }
  if ('subagentRunId' in chunk && typeof chunk.subagentRunId === 'string') {
    return chunk
  }
  // RUN_* and MESSAGES_SNAPSHOT never get here (spawnAgentStream drops them).
  // Everything else is tagged.
  return { ...chunk, subagentRunId } as StreamChunk
}

function runUsage(chunk: StreamChunk | undefined): Array<SpecTokenUsage> {
  if (chunk?.type !== EventType.RUN_FINISHED) return []
  if (Array.isArray(chunk.usage)) return chunk.usage
  return isTanstackUsage(chunk.usage) ? toSpecTokenUsage(chunk.usage).usage : []
}

/** The full usage of a run: token counts plus cost and the other fields. */
function fullUsage(chunk: StreamChunk | undefined): TokenUsage | undefined {
  if (chunk?.type !== EventType.RUN_FINISHED) return undefined
  return rebuildTokenUsage(chunk.usage, tanstackMetadata(chunk)?.usage)
}

/** Add a finished child run's usage to the sink. */
export function collectUsage(sink: SubagentSink, finished?: StreamChunk) {
  sink.usage.push(...runUsage(finished))
  const full = fullUsage(finished)
  if (full) sink.total = sink.total ? addTokenUsage(sink.total, full) : full
}

/** A parent run's last chunk: it completed, or it failed. */
type ParentTerminal = Extract<
  StreamChunk,
  { type: 'RUN_FINISHED' | 'RUN_ERROR' }
>

/**
 * Put the children's usage on a parent terminal. `usage[]` keeps one entry per
 * model call. `metadata.tanstack.usage` holds the summed cost and the other
 * TanStack fields, so `fromSpecTokenUsage` reads the full total. Empties the
 * sink, so the next parent terminal does not count it again.
 *
 * `RUN_ERROR` is accepted too: a turn that failed still spent whatever its
 * children spent. Such a chunk carries no usage of its own, so `runUsage` and
 * `fullUsage` return empty for it and the children's total stands alone.
 */
export function withChildUsage(
  chunk: ParentTerminal,
  sink: SubagentSink,
): ParentTerminal {
  if (sink.usage.length === 0 && !sink.total) return chunk
  const own = fullUsage(chunk)
  const total =
    own && sink.total ? addTokenUsage(own, sink.total) : (own ?? sink.total)
  const usage = [...runUsage(chunk), ...sink.usage.splice(0)]
  sink.total = undefined
  const leftover = total ? toSpecTokenUsage(total).leftover : undefined
  const next = { ...chunk, usage }
  if (!leftover) return next
  // `withTanstackMetadata` runs the value through `Omit`, which collapses this
  // union and widens `type` back to `RUN_FINISHED | RUN_ERROR`. It only adds a
  // metadata key, so the runtime shape is the input's: restore that type.
  return withTanstackMetadata(next, { usage: leftover }) as ParentTerminal
}

function isAsyncIterable(value: unknown): value is AsyncIterable<StreamChunk> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

/**
 * Chunks for an agent whose `run` resolved to a plain value instead of a
 * stream. A string also streams as the child's text, so the parent model, a
 * `sequence` router, and the UI all read it like chat output. `messageId` is
 * new for each run and call, so the text of a continued child does not merge
 * into its stored text.
 */
function* valueResultChunks(
  value: unknown,
  id: string,
  messageId: string,
): Generator<StreamChunk> {
  if (typeof value === 'string' && value !== '') {
    const timestamp = Date.now()
    yield attributeChunk(
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp,
      },
      id,
    )
    yield attributeChunk(
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: value,
        timestamp,
      },
      id,
    )
    yield attributeChunk(
      { type: EventType.TEXT_MESSAGE_END, messageId, timestamp },
      id,
    )
  }
  yield {
    type: SUBAGENT_FINISHED,
    subagentRunId: id,
    ...(value !== undefined ? { result: value } : {}),
    timestamp: Date.now(),
  } satisfies SubagentFinishedEvent
}

/**
 * Build the context `run` receives: the spawn input plus `forward`, the
 * provider keys, and the bound activity functions.
 */
function runContext(
  agentName: string,
  input: SubagentRunInput,
  abortController: AbortController,
  binding?: SubagentBinding,
) {
  return {
    ...input,
    forward: {
      threadId: input.threadId,
      runId: input.runId,
      parentRunId: input.parentRunId,
      subagentRunId: input.subagentRunId,
      ...(input.resume ? { resume: input.resume } : {}),
      abortController,
      ...(binding?.promptCache ? { promptCache: binding.promptCache } : {}),
    },
    keys: binding?.keys ?? envProviderKeys,
    step: binding?.step ?? runEachTime,
    agents: binding?.agents ?? noAgents,
    ...createBoundActivities(agentName, input, abortController, binding),
  } satisfies SubagentRunContext
}

/** The steps of an agent run that no host can run again: `fn` runs each time. */
const runEachTime: AgentStep = { do: async (_name, fn) => fn() }

/** `ctx.agents` of a run that no host binds: a start throws. */
const noAgents: AgentStarter = {
  start: () => {
    throw new Error(
      'ctx.agents.start needs a host that runs agents in the background, such as a harness session.',
    )
  },
}

export async function* spawnAgentStream(
  agent: DefinedAgent,
  input: SubagentRunInput,
  sink?: SubagentSink,
  parentToolCallId?: string,
  binding?: SubagentBinding,
): AsyncIterable<StreamChunk> {
  const link = linkAbort(input.abortSignal)
  const ctx = runContext(agent.name, input, link.controller, binding)
  const id = ctx.subagentRunId
  // No parentSubagentRunId here, also for a nested child: the chat that
  // started this child lists it as a direct child. attributeChunk adds the id
  // one level up, in the stream of the parent child.
  yield {
    type: SUBAGENT_STARTED,
    subagentRunId: id,
    name: agent.name,
    description: agent.description,
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
    timestamp: Date.now(),
  } satisfies SubagentStartedEvent

  let iterator: AsyncIterator<StreamChunk> | undefined
  let finished: StreamChunk | undefined
  try {
    if (ctx.abortSignal?.aborted) {
      yield stoppedEvent(id)
      return
    }
    const produced: unknown = await orAbort(
      Promise.resolve(agent.run(ctx)),
      ctx.abortSignal,
    )
    if (!isAsyncIterable(produced)) {
      if (ctx.abortSignal?.aborted) {
        yield stoppedEvent(id)
        return
      }
      const messageId =
        parentToolCallId === undefined
          ? `${ctx.runId}-text`
          : `${ctx.runId}-${parentToolCallId}-text`
      yield* valueResultChunks(produced, id, messageId)
      return
    }
    iterator = produced[Symbol.asyncIterator]()
    while (true) {
      if (ctx.abortSignal?.aborted) {
        yield stoppedEvent(id)
        return
      }
      const result = await orAbort(iterator.next(), ctx.abortSignal)
      if (result.done) break
      const chunk = result.value
      // Run-scoped events describe the child run. The SUBAGENT_* events carry
      // that information for the parent stream.
      if (
        chunk.type === EventType.RUN_STARTED ||
        chunk.type === EventType.MESSAGES_SNAPSHOT
      ) {
        continue
      }
      if (chunk.type === EventType.RUN_FINISHED) {
        // The engine yields one RUN_FINISHED per model call. Add each one.
        if (sink) collectUsage(sink, chunk)
        finished = chunk
        continue
      }
      if (chunk.type === EventType.RUN_ERROR) {
        yield {
          type: SUBAGENT_ERROR,
          subagentRunId: id,
          message: chunk.message || 'Subagent failed',
          ...(chunk.code ? { code: chunk.code } : {}),
          timestamp: Date.now(),
        } satisfies SubagentErrorEvent
        return
      }
      yield attributeChunk(chunk, id)
    }
    if (ctx.abortSignal?.aborted) {
      yield stoppedEvent(id)
      return
    }
    const outcome =
      finished?.type === EventType.RUN_FINISHED ? finished.outcome : undefined
    if (outcome?.type === 'cancelled') {
      yield stoppedEvent(id)
      return
    }
    if (outcome?.type === 'interrupt') {
      const interrupts = outcome.interrupts.map((interrupt) =>
        interrupt.subagentRunId
          ? interrupt
          : { ...interrupt, subagentRunId: id },
      )
      sink?.interrupts.push(...interrupts)
      yield {
        type: SUBAGENT_FINISHED,
        subagentRunId: id,
        outcome: {
          type: 'suspended',
          interruptIds: interrupts
            .filter((interrupt) => interrupt.subagentRunId === id)
            .map((interrupt) => interrupt.id),
        },
        timestamp: Date.now(),
      } satisfies SubagentFinishedEvent
      return
    }
    const result =
      finished?.type === EventType.RUN_FINISHED ? finished.result : undefined
    yield {
      type: SUBAGENT_FINISHED,
      subagentRunId: id,
      ...(result !== undefined ? { result } : {}),
      timestamp: Date.now(),
    } satisfies SubagentFinishedEvent
  } catch (error) {
    yield {
      type: SUBAGENT_ERROR,
      subagentRunId: id,
      message: isAbortError(error, ctx.abortSignal)
        ? 'Stopped'
        : error instanceof Error
          ? error.message
          : String(error),
      timestamp: Date.now(),
    } satisfies SubagentErrorEvent
  } finally {
    try {
      await iterator?.return?.()
    } catch {
      // Child stream may already be closed or aborted.
    }
    link.dispose()
  }
}

/** True when a child in these chunks failed or stopped for outside input. */
function stopsSequence(chunks: ReadonlyArray<StreamChunk>, id: string) {
  return chunks.some(
    (chunk) =>
      (chunk.type === SUBAGENT_ERROR && chunk.subagentRunId === id) ||
      (chunk.type === SUBAGENT_FINISHED &&
        chunk.subagentRunId === id &&
        chunk.outcome?.type === 'suspended'),
  )
}

export async function* spawnNamedAgents(
  entries: ReadonlyArray<SpawnEntry>,
  bag: SubagentsBag,
  ctx: SpawnContext,
  sink?: SubagentSink,
) {
  if (bag.sandbox === 'inherit' && entries.length > 1) {
    throw new Error(
      "subagents.sandbox 'inherit' cannot start two children in one turn",
    )
  }
  // One signal for the group. The finally stops every child that still runs
  // when the reader stops early.
  const group = linkAbort(ctx.abortSignal)
  const groupCtx = { ...ctx, abortSignal: group.controller.signal }
  try {
    if (bag.order === 'sequence') {
      let messages = ctx.messages
      for (const entry of entries) {
        const chunks: Array<StreamChunk> = []
        let id: string | undefined
        for await (const chunk of openAgentStream(
          entry,
          bag,
          { ...groupCtx, messages },
          sink,
        )) {
          if (chunk.type === SUBAGENT_STARTED && id === undefined) {
            id = chunk.subagentRunId
          }
          chunks.push(chunk)
          yield chunk
        }
        if (id !== undefined && stopsSequence(chunks, id)) return
        const text = [
          entry.resume?.text,
          collectNamedText(chunks, [entry.name]),
        ]
          .filter((part) => part !== undefined && part !== '')
          .join('')
        if (text) {
          messages = [...messages, { role: 'assistant', content: text }]
        }
      }
      return
    }
    const streams = entries.map((entry) =>
      openAgentStream(entry, bag, groupCtx, sink),
    )
    const onlyStream = streams.length === 1 ? streams[0] : undefined
    if (onlyStream) {
      yield* onlyStream
      return
    }
    yield* mergeStreams(streams)
  } finally {
    group.controller.abort()
    group.dispose()
  }
}

/**
 * Text of the named direct children, in `names` order. Text from nested
 * children stays out: their chunks carry their own id.
 */
export function collectNamedText(
  chunks: Array<StreamChunk>,
  names: ReadonlyArray<string>,
) {
  const nameByRunId = new Map<string, string>()
  const textByName = new Map<string, string>()
  for (const chunk of chunks) {
    if (chunk.type === SUBAGENT_STARTED) {
      if (chunk.parentSubagentRunId === undefined) {
        nameByRunId.set(chunk.subagentRunId, chunk.name)
      }
      continue
    }
    if (chunk.type !== EventType.TEXT_MESSAGE_CONTENT) continue
    if (!('subagentRunId' in chunk) || typeof chunk.subagentRunId !== 'string')
      continue
    const name = nameByRunId.get(chunk.subagentRunId)
    if (!name) continue
    textByName.set(name, `${textByName.get(name) ?? ''}${chunk.delta}`)
  }
  return names
    .map((name) => textByName.get(name)?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join('\n\n')
}

/**
 * The parent conversation up to the message that carries this tool call, with
 * that message's tool calls removed. Its string text stays; array content is
 * dropped.
 */
function messagesBeforeCall(
  messages: ReadonlyArray<ModelMessage>,
  toolCallId: string,
): Array<ModelMessage> {
  const index = messages.findIndex((message) =>
    message.toolCalls?.some((call) => call.id === toolCallId),
  )
  if (index === -1) return [...messages]
  const host = messages[index]
  const kept = messages.slice(0, index)
  if (host && typeof host.content === 'string' && host.content !== '') {
    const { toolCalls: _calls, ...text } = host
    void _calls
    kept.push(text)
  }
  return kept
}

/**
 * Record the parent messages when the model calls a subagent tool, so the
 * child reads the conversation as it is at that call. Also read the run's
 * `loadChild` service, so a call can continue a stored child.
 */
export function subagentCallMessages(names: ReadonlySet<string>) {
  const byCall = new Map<string, Array<ModelMessage>>()
  let loadChild: LoadChild | undefined
  const middleware: ChatMiddleware = {
    name: 'subagent-call-messages',
    onStart(ctx) {
      loadChild = getLoadChild(ctx, { optional: true })
    },
    onBeforeToolCall(ctx, hook) {
      if (!names.has(hook.toolName)) return undefined
      byCall.set(
        hook.toolCallId,
        messagesBeforeCall(ctx.messages, hook.toolCallId),
      )
      return undefined
    },
  }
  return {
    middleware,
    messagesFor: (toolCallId: string | undefined) =>
      toolCallId === undefined ? undefined : byCall.get(toolCallId),
    childLoader: () => loadChild,
  }
}

/** The JSON Schema of each agent `input`, by agent name. */
function agentInputSchemas(agents: ReadonlyArray<DefinedAgent>) {
  const schemas = new Map<string, JSONSchema>()
  for (const agent of agents) {
    const schema = convertSchemaToJsonSchema(agent.inputSchema, { io: 'input' })
    if (schema) schemas.set(agent.name, schema)
  }
  return schemas
}

/**
 * The description and the wire schema of the single `subagent` tool.
 * Providers need one object at the top, so `input` is an `anyOf` of the agent
 * schemas. `execute` checks each field against the picked agent.
 */
function singleToolShape(agents: ReadonlyArray<DefinedAgent>) {
  const inputs = agentInputSchemas(agents)
  const takesPrompt = agents.some((agent) => !inputs.has(agent.name))
  const lines = agents.map((agent) => {
    const schema = inputs.get(agent.name)
    const how = schema
      ? `Pass \`input\`: ${JSON.stringify(schema)}`
      : 'Pass `prompt`: the task as text.'
    return `- ${agent.name}: ${agent.description} ${how}`
  })
  const inputSchema: JSONSchema = {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: agents.map((agent) => agent.name) },
      ...(inputs.size > 0 && { input: { anyOf: [...inputs.values()] } }),
      ...(takesPrompt && { prompt: { type: 'string' } }),
      sessionId: { type: 'string' },
      background: { type: 'boolean' },
    },
    required: ['agent'],
  }
  return {
    description: [
      'Run a subagent. Set `agent` to one of these names:',
      ...lines,
      'Set `sessionId` to the subagentRunId of an earlier result to continue that child.',
      'Set `background` to true to start the child and get its subagentRunId at once.',
    ].join('\n'),
    inputSchema,
  }
}

/** The checked `input` of a single-tool call. A wrong field throws a tool error. */
async function callInput(agent: DefinedAgent, call: SubagentCall) {
  if (agent.inputSchema === undefined) {
    if (call.input !== undefined) {
      throw new Error(`Agent "${agent.name}" takes prompt, not input.`)
    }
    return undefined
  }
  if (call.prompt !== undefined) {
    throw new Error(`Agent "${agent.name}" takes input, not prompt.`)
  }
  if (call.input === undefined) {
    throw new Error(`Agent "${agent.name}" needs input.`)
  }
  return validateToolInput(agent.inputSchema, call.input, agent.name)
}

export function createSyntheticSubagentTools(
  bag: SubagentsBag,
  parent: {
    /** Messages the parent run started with. Used when no call was recorded. */
    messages: SubagentRunContext['messages']
    /** The parent messages at a tool call. See subagentCallMessages. */
    messagesFor?: (
      toolCallId: string | undefined,
    ) => SubagentRunContext['messages'] | undefined
    threadId: string
    runId: string
    interruptedRunId?: string
    /** The parent chat's own subagentRunId, when that chat is a child too. */
    parentSubagentRunId?: string
    abortSignal?: AbortSignal
    turn?: SubagentTurn
    sink: SubagentSink
    /** The run's `loadChild` service. See subagentCallMessages. */
    childLoader?: () => LoadChild | undefined
  },
): Array<Tool> {
  // One budget per root run. A child run inherits its parent's budget.
  const budget = bag.binding?.budget ?? SubagentBudget.root(bag.limits)
  let active = 0

  /** Run one child for a tool call. The model gets its text or result. */
  async function runChild(child: SpawnEntry, context: unknown) {
    const toolContext = context as
      | {
          toolCallId?: string
          [EMIT_STREAM_CHUNK]?: (chunk: StreamChunk) => void
        }
      | undefined
    const toolCallId = toolContext?.toolCallId
    const suspended = parent.turn?.children.find(
      (turnChild) =>
        turnChild.status === 'suspended' &&
        turnChild.parentToolCallId !== undefined &&
        turnChild.parentToolCallId === toolCallId,
    )
    const entry: SpawnEntry = {
      ...child,
      ...(suspended && {
        resume: {
          subagentRunId: suspended.subagentRunId,
          messages: suspended.messages,
          entries: suspended.resume,
          text: suspended.text,
        },
      }),
    }
    // A resumed child already counted when it first started.
    const refusal = suspended ? undefined : budget.reserve(active)
    if (refusal !== undefined) {
      return {
        subagentRunId: '',
        text: '',
        error: refusal,
      } satisfies SubagentToolOutcome
    }
    active += 1
    const sink = createSubagentSink()
    const link = linkAbort(parent.abortSignal)
    const timeout = budget.childTimeout()
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(
            () =>
              link.controller.abort(
                new Error(`subagent timed out after ${timeout} ms`),
              ),
            timeout,
          )
    const childBinding: SubagentBinding = {
      ...bag.binding,
      budget: budget.child(
        timeout === undefined ? undefined : Date.now() + timeout,
      ),
    }
    let subagentRunId = suspended?.subagentRunId ?? ''
    let text = suspended?.text ?? ''
    let error: string | undefined
    let result: unknown
    try {
      for await (const chunk of openAgentStream(
        entry,
        bag,
        {
          messages: parent.messagesFor?.(toolCallId) ?? parent.messages,
          abortSignal: link.controller.signal,
          threadId: parent.threadId,
          parentRunId: parent.runId,
          ...(parent.interruptedRunId !== undefined
            ? { interruptedRunId: parent.interruptedRunId }
            : {}),
          ...(parent.parentSubagentRunId !== undefined
            ? { parentSubagentRunId: parent.parentSubagentRunId }
            : {}),
        },
        sink,
        toolCallId,
        childBinding,
      )) {
        if (chunk.type === SUBAGENT_STARTED && subagentRunId === '') {
          subagentRunId = chunk.subagentRunId
        }
        if (
          chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
          'subagentRunId' in chunk &&
          chunk.subagentRunId === subagentRunId
        ) {
          text += chunk.delta
        }
        if (
          chunk.type === SUBAGENT_ERROR &&
          chunk.subagentRunId === subagentRunId
        ) {
          error = chunk.message
        }
        if (
          chunk.type === SUBAGENT_FINISHED &&
          chunk.subagentRunId === subagentRunId &&
          chunk.result !== undefined
        ) {
          result = chunk.result
        }
        toolContext?.[EMIT_STREAM_CHUNK]?.(chunk)
      }
    } finally {
      active -= 1
      if (timer !== undefined) clearTimeout(timer)
      link.dispose()
    }
    parent.sink.usage.push(...sink.usage)
    if (sink.total) {
      parent.sink.total = parent.sink.total
        ? addTokenUsage(parent.sink.total, sink.total)
        : sink.total
    }
    return {
      subagentRunId,
      text,
      ...(result !== undefined ? { result } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(sink.interrupts.length > 0 ? { interrupts: sink.interrupts } : {}),
    } satisfies SubagentToolOutcome
  }

  /**
   * The stored child that a `sessionId` names, for `agent`. Throws a tool
   * error, also when the child ran under another agent.
   */
  async function storedChild(sessionId: string, agent: string) {
    const load = parent.childLoader?.()
    if (!load) throw new Error('sessionId needs a persistence store.')
    const stored = await load(sessionId)
    if (!stored) throw new Error(`Unknown sessionId "${sessionId}".`)
    if (stored.agent !== undefined && stored.agent !== agent) {
      throw new Error(
        `Session "${sessionId}" belongs to agent "${stored.agent}", not "${agent}".`,
      )
    }
    return { subagentRunId: sessionId, messages: stored.messages }
  }

  if (bag.tool === 'single') {
    // A thrown error in `execute` goes back to the model as a tool error.
    const single = {
      name: SINGLE_SUBAGENT_TOOL,
      ...singleToolShape(bag.agents),
      [SUBAGENT_TOOL]: true,
      execute: async (call: SubagentCall, context?: ToolExecutionContext) => {
        const agent = bag.agents.find((entry) => entry.name === call.agent)
        if (!agent) throw new Error(`Unknown agent "${call.agent}".`)
        const input = await callInput(agent, call)
        const fields = {
          ...(input !== undefined && { input }),
          ...(call.prompt !== undefined && { prompt: call.prompt }),
        }
        const child = { name: agent.name, ...fields }
        if (call.background === true) {
          if (call.sessionId !== undefined) {
            throw new Error('background cannot continue a sessionId.')
          }
          const start = bag.binding?.start
          if (!start) throw new Error('background needs a harness host.')
          const { subagentRunId } = await start(
            {
              agent: agent.name,
              ...fields,
              ...(context?.toolCallId !== undefined && {
                parentToolCallId: context.toolCallId,
              }),
            },
            { wake: true },
          )
          return {
            subagentRunId,
            text: '',
            result: { status: 'started' },
          } satisfies SubagentToolOutcome
        }
        const { sessionId } = call
        const work =
          sessionId === undefined
            ? runChild(child, context)
            : storedChild(sessionId, agent.name).then((continued) =>
                runChild({ ...child, continued }, context),
              )
        // The host can move the child to the background. It keeps running.
        const detach = context?.detach
        if (!detach) return work
        const moved = detach(work).then(
          (text) => ({ subagentRunId: '', text }) satisfies SubagentToolOutcome,
        )
        return Promise.race([work, moved])
      },
    }
    return [single]
  }

  return bag.agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    ...(agent.inputSchema !== undefined && { inputSchema: agent.inputSchema }),
    [SUBAGENT_TOOL]: true,
    // The tool loop checks `input` against `inputSchema` before this runs.
    // An agent without `inputSchema` still gets `{}` from the model. Its
    // `ctx.input` stays undefined.
    execute: (input: unknown, context?: unknown) =>
      runChild(
        {
          name: agent.name,
          ...(agent.inputSchema !== undefined && { input }),
        },
        context,
      ),
  }))
}
