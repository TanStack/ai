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
import { SUBAGENT_INPUT_KEY } from '../../../utilities/subagent-wire'
import { INTERRUPT_BINDING_METADATA_KEY } from '../../../interrupt-resume'
import { EMIT_STREAM_CHUNK, SUBAGENT_TOOL } from '../tools/tool-calls'
import {
  convertSchemaToJsonSchema,
  isStandardSchema,
} from '../tools/schema-converter'
import { getLoadChild } from '../middleware/load-child'
import type { LoadChild } from '../middleware/load-child'
import type { SubagentToolOutcome } from '../tools/tool-calls'
import type { SpecTokenUsage } from '../../../utilities/ag-ui-usage'
import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
import type {
  Interrupt,
  JSONSchema,
  ModelMessage,
  SchemaInput,
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
import type { SubagentBinding } from './bound'
import type { SubagentLimits } from './limits'
import type { ProviderKeySource } from '../../../byok/env-keys'
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
 * with `inputSchema` needs `{ name, input }`, and no other agent takes an
 * input. `chat()` checks both when the turn starts. The type does not. The
 * input is checked against the schema, and `run` reads it as `ctx.input`.
 */
export type SubagentPick = string | { name: string; input?: unknown }

export interface SubagentRouterPlan {
  names: ReadonlyArray<SubagentPick>
  /** Overrides `subagents.order` for this turn. */
  order?: SubagentOrder
}

export interface SubagentStep {
  names: ReadonlyArray<SubagentPick>
  /** Overrides `subagents.order` for this step. */
  order?: SubagentOrder
}

export interface SubagentStepsPlan {
  steps: ReadonlyArray<SubagentStep>
}

export type SubagentRouterPick =
  | 'main'
  | SubagentPick
  | ReadonlyArray<SubagentPick>
  | SubagentRouterPlan
  | SubagentStepsPlan

/**
 * A router pick after `normalizeRouterPick`. Each step has plain names, and
 * `inputs` holds the raw input of each name that has one.
 * `checkRoutedInputs` returns the same shape with the checked inputs. The
 * plan on `SUBAGENT_STARTED` metadata has the names and the order only.
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
   * What a host adds to every activity call a child makes through `ctx`
   * (`ctx.chat`, `ctx.generateImage`, and the rest). Apps do not set it.
   */
  binding?: SubagentBinding
  /**
   * Limits for the whole tree of children the model starts through tools:
   * depth, total calls, children at once, and time per child. A refused
   * start returns to the model as a tool error. Only the root chat's limits
   * apply: a nested chat in a child uses the root's budget.
   */
  limits?: SubagentLimits
  /**
   * Provider keys that agents read as `ctx.keys`: an object by provider id,
   * for example `{ openai: userKey }`, or a function that returns the key of
   * a provider, for example `(provider) => getByokKey(request, provider)`.
   * A missing or empty key falls back to the keys of the parent agent, then
   * to the provider's `env` names. A child's `ctx.chat({ subagents })` passes
   * them on. The keys it sets itself win for those providers.
   */
  keys?: ProviderKeySource
}

/**
 * Fields an agent tool takes next to the agent's own fields, when the run
 * can use them. An `inputSchema` cannot use a name that the run uses.
 * - `sessionId`: the `subagentRunId` of a stored child. The call continues
 *   it. Needs a middleware that provides `LoadChildCapability`.
 * - `background`: start the child and return at once. Needs `binding.start`.
 */
const RESERVED_FIELDS = ['sessionId', 'background'] as const

type ReservedField = (typeof RESERVED_FIELDS)[number]

/** The reserved fields that a run uses. */
function reservedFields(
  bag: Pick<SubagentsBag, 'binding'>,
  canContinue: boolean,
) {
  const can: Record<ReservedField, boolean> = {
    sessionId: canContinue,
    background: bag.binding?.start !== undefined,
  }
  return RESERVED_FIELDS.filter((name) => can[name])
}

/** Throws when an agent's `inputSchema` uses a reserved field of the run. */
export function assertNoReservedFields(
  bag: Pick<SubagentsBag, 'agents' | 'binding'>,
  canContinue: boolean,
) {
  const names = reservedFields(bag, canContinue)
  for (const agent of names.length > 0 ? bag.agents : []) {
    const schema = convertSchemaToJsonSchema(agent.inputSchema, { io: 'input' })
    const taken = names.find((name) => schema?.properties?.[name])
    if (taken !== undefined) {
      throw new Error(
        `Agent "${agent.name}" uses the reserved input field "${taken}". Rename that field.`,
      )
    }
  }
}

/** Split the reserved fields off a tool call. */
function splitReserved(value: unknown, names: ReadonlyArray<ReservedField>) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { fields: value, reserved: {} as Record<string, unknown> }
  }
  const fields: Record<string, unknown> = {}
  const reserved: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const target = (names as ReadonlyArray<string>).includes(key)
      ? reserved
      : fields
    target[key] = entry
  }
  return { fields, reserved }
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
    controller.abort(parent.reason)
    return { controller, dispose: () => {} }
  }
  const onAbort = () => controller.abort(parent.reason)
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
    throw new Error(`Unknown subagent: ${name}`)
  }
  return agent
}

/** The root budget of each bag that has no budget from its parent. */
const rootBudgets = new WeakMap<SubagentsBag, SubagentBudget>()

/**
 * The subagent tree budget of `bag`: the one its parent passed down, else
 * one root budget per bag. The `limits` of a bag apply only at the root.
 */
function treeBudget(bag: SubagentsBag) {
  const inherited = bag.binding?.budget
  if (inherited) return inherited
  let budget = rootBudgets.get(bag)
  if (!budget) {
    budget = SubagentBudget.root(bag.limits)
    rootBudgets.set(bag, budget)
  }
  return budget
}

function openAgentStream(
  entry: SpawnEntry,
  bag: SubagentsBag,
  ctx: SpawnContext,
  sink?: SubagentSink,
  parentToolCallId?: string,
  // A child that a router picks does not count against the budget, but its
  // own children do, one level deeper.
  binding: SubagentBinding = {
    ...bag.binding,
    budget: treeBudget(bag).child(),
  },
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
  'subagents.router must return main, a name, { name, input }, a list of them, { names, order }, or { steps }.'

function assertOrder(order: SubagentOrder | undefined) {
  if (order !== undefined && order !== 'parallel' && order !== 'sequence') {
    throw new Error('subagents.router order must be parallel or sequence.')
  }
}

/** One step of a pick: plain names, the input of each name that has one, and the order. */
function normalizeStep(
  picks: ReadonlyArray<SubagentPick>,
  agents: ReadonlyArray<DefinedAgent>,
  order?: SubagentOrder,
): RoutedPlan['steps'][number] {
  assertOrder(order)
  if (!isPickList(picks) || picks.length === 0) {
    throw new Error(ROUTER_PICK_ERROR)
  }
  const names = picks.map((pick) =>
    typeof pick === 'string' ? pick : pick.name,
  )
  if (names.includes('main') && names.length > 1) {
    throw new Error('Do not mix main into a subagent list.')
  }
  // ponytail: one input per name in a step, so a name with an input cannot
  // repeat in that step. Key inputs by position if a router needs two.
  const inputs: Record<string, unknown> = {}
  for (const pick of picks) {
    if (typeof pick === 'string') {
      if (pick !== 'main') agentByName(agents, pick)
      continue
    }
    if (pick.input === undefined) {
      if (pick.name !== 'main') agentByName(agents, pick.name)
      continue
    }
    if (pick.name === 'main') throw new Error('main takes no input.')
    if (agentByName(agents, pick.name).inputSchema === undefined) {
      throw new Error(
        `Agent "${pick.name}" has no inputSchema, so it takes no input.`,
      )
    }
    if (names.filter((name) => name === pick.name).length > 1) {
      throw new Error(
        `Agent "${pick.name}" has an input and is in one step more than once. Put each pick in its own step.`,
      )
    }
    inputs[pick.name] = pick.input
  }
  return {
    names,
    ...(Object.keys(inputs).length > 0 && { inputs }),
    ...(order !== undefined && { order }),
  }
}

function isPickList(pick: unknown): pick is ReadonlyArray<SubagentPick> {
  return Array.isArray(pick)
}

export function normalizeRouterPick(
  pick: SubagentRouterPick,
  agents: ReadonlyArray<DefinedAgent>,
): RoutedPlan {
  if (isPickList(pick)) return { steps: [normalizeStep(pick, agents)] }
  if (typeof pick === 'string')
    return { steps: [normalizeStep([pick], agents)] }
  // A router in plain JavaScript can return anything.
  if (typeof pick !== 'object' || pick === null) {
    throw new Error(ROUTER_PICK_ERROR)
  }
  if ('name' in pick) return { steps: [normalizeStep([pick], agents)] }
  if ('steps' in pick) {
    if (pick.steps.length === 0) throw new Error(ROUTER_PICK_ERROR)
    const steps = pick.steps.map((step) =>
      normalizeStep(step.names, agents, step.order),
    )
    const flat = steps.flatMap((step) => step.names)
    if (flat.includes('main') && flat.length > 1) {
      throw new Error('Do not mix main into a subagent list.')
    }
    return { steps }
  }
  return { steps: [normalizeStep(pick.names, agents, pick.order)] }
}

/** The input of `name` in a step. Skips keys that `Object.prototype` has. */
export function stepInput(step: RoutedPlan['steps'][number], name: string) {
  return step.inputs && Object.hasOwn(step.inputs, name)
    ? step.inputs[name]
    : undefined
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
 * The chunks of a `chat({ stream: false })` result, else `undefined`. A `run`
 * that resolves to a chat result streams like a `run` that returns the chat
 * stream: its text, usage, and interrupts reach the parent.
 */
function chatResultChunks(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('text' in value) ||
    typeof value.text !== 'string' ||
    !('chunks' in value) ||
    !Array.isArray(value.chunks)
  ) {
    return undefined
  }
  const chunks: Array<StreamChunk> = value.chunks
  return (async function* () {
    yield* chunks
  })()
}

/**
 * Chunks for an agent whose `run` resolved to a plain value instead of a
 * stream. A string also streams as the child's text, so the parent model, a
 * `sequence` router, and the UI all read it like chat output. `messageId` is
 * new for each run and call.
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
      subagentName: agentName,
      ...(input.parentSubagentRunId !== undefined
        ? { parentSubagentRunId: input.parentSubagentRunId }
        : {}),
      ...(input.resume ? { resume: input.resume } : {}),
      abortController,
      ...(binding?.promptCache ? { promptCache: binding.promptCache } : {}),
    },
    keys: binding?.keys ?? envProviderKeys,
    ...createBoundActivities(agentName, input, abortController, binding),
  } satisfies SubagentRunContext
}

/**
 * Run one agent and stream its chunks, from `SUBAGENT_STARTED` to
 * `SUBAGENT_FINISHED` or `SUBAGENT_ERROR`. The package root exports this
 * as `runAgentStream`. The caller checks `ctx.input` against
 * `agent.inputSchema` first. Pass `createSubagentSink()` to keep the
 * child's interrupt objects and token usage. The finished event carries
 * `interruptIds` only.
 */
export async function* spawnAgentStream(
  agent: DefinedAgent,
  input: SubagentRunInput,
  sink?: SubagentSink,
  parentToolCallId?: string,
  binding?: SubagentBinding,
): AsyncIterable<StreamChunk> {
  const id = input.subagentRunId
  // No parentSubagentRunId here, also for a nested child: the chat that
  // started this child lists it as a direct child. attributeChunk adds the id
  // one level up, in the stream of the parent child.
  const started = {
    type: SUBAGENT_STARTED,
    subagentRunId: id,
    name: agent.name,
    description: agent.description,
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
    timestamp: Date.now(),
  } satisfies SubagentStartedEvent
  // The card keeps the checked input that the model wrote in a tool call, so
  // a UI can show the brief. A router input stays on the server.
  yield input.input === undefined || parentToolCallId === undefined
    ? started
    : withTanstackMetadata(started, { [SUBAGENT_INPUT_KEY]: input.input })

  // No yield between here and the `try`, so `finally` always disposes it.
  const link = linkAbort(input.abortSignal)
  const ctx = runContext(agent.name, input, link.controller, binding)
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
    const stream = isAsyncIterable(produced)
      ? produced
      : chatResultChunks(produced)
    if (!stream) {
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
    iterator = stream[Symbol.asyncIterator]()
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

/**
 * The wire schema of an agent tool: the agent's `inputSchema`, or a `prompt`
 * for an agent without one. The reserved fields of the run sit next to
 * those fields.
 */
function agentToolSchema(
  agent: DefinedAgent,
  names: ReadonlyArray<ReservedField>,
): JSONSchema {
  const schema = convertSchemaToJsonSchema(agent.inputSchema, {
    io: 'input',
  }) ?? {
    type: 'object',
    properties: { prompt: { type: 'string' } },
  }
  if (names.length === 0) return schema
  const extra: JSONSchema['properties'] = {
    ...(names.includes('sessionId') && {
      sessionId: {
        type: 'string',
        description:
          'The subagentRunId of an earlier result. The call continues that child.',
      },
    }),
    ...(names.includes('background') && {
      background: {
        type: 'boolean',
        description:
          'true starts the child and returns its subagentRunId at once.',
      },
    }),
  }
  // A top-level anyOf has no `properties`. Put the reserved fields beside it.
  if (schema.properties === undefined) {
    return { allOf: [schema, { type: 'object', properties: extra }] }
  }
  return { ...schema, properties: { ...schema.properties, ...extra } }
}

/**
 * The input schema of an agent tool. The tool loop checks it after
 * middleware, just before the tool runs, as for any tool. With reserved fields, a wrapper
 * checks the agent's fields and passes the reserved ones through.
 */
function agentToolInput(
  agent: DefinedAgent,
  names: ReadonlyArray<ReservedField>,
): SchemaInput {
  const inner = agent.inputSchema
  if (isStandardSchema(inner) && names.length === 0) return inner
  const schema = agentToolSchema(agent, names)
  if (!isStandardSchema(inner)) return schema
  const toJson = () => schema
  const wrapped: StandardSchemaV1 & StandardJSONSchemaV1 = {
    '~standard': {
      version: 1,
      vendor: 'tanstack-ai',
      validate: (value) => {
        const { fields, reserved } = splitReserved(value, names)
        const add = (result: StandardSchemaV1.Result<unknown>) => {
          if (
            result.issues !== undefined ||
            Object.keys(reserved).length === 0
          ) {
            return result
          }
          if (
            typeof result.value !== 'object' ||
            result.value === null ||
            Array.isArray(result.value)
          ) {
            return {
              issues: [
                {
                  message:
                    'Agent input must be an object when the call uses sessionId or background.',
                },
              ],
            }
          }
          return {
            value: {
              ...(result.value as Record<string, unknown>),
              ...reserved,
            },
          }
        }
        const result = inner['~standard'].validate(fields)
        return result instanceof Promise ? result.then(add) : add(result)
      },
      jsonSchema: { input: toJson, output: toJson },
    },
  }
  return wrapped
}

/**
 * Split a checked agent tool call into the agent's input and the reserved
 * fields. A reserved field of the wrong type throws a tool error.
 */
function readCall(
  agent: DefinedAgent,
  args: unknown,
  names: ReadonlyArray<ReservedField>,
): {
  input?: unknown
  prompt?: string
  sessionId?: string
  background: boolean
} {
  const { fields, reserved } = splitReserved(args, names)
  const { sessionId, background } = reserved
  const prompt =
    agent.inputSchema === undefined &&
    typeof fields === 'object' &&
    fields !== null
      ? Reflect.get(fields, 'prompt')
      : undefined
  const wrongType =
    (prompt !== undefined && typeof prompt !== 'string') ||
    (sessionId !== undefined && typeof sessionId !== 'string') ||
    (background !== undefined && typeof background !== 'boolean')
  if (wrongType) {
    throw new Error(
      'prompt and sessionId must be strings, and background a boolean.',
    )
  }
  return {
    // The tool loop checked these fields against `inputSchema`.
    ...(agent.inputSchema !== undefined && { input: fields }),
    ...(typeof prompt === 'string' && { prompt }),
    ...(typeof sessionId === 'string' && { sessionId }),
    background: background === true,
  }
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
    /** A middleware provides `loadChild`, so the tools take `sessionId`. */
    canContinue?: boolean
  },
): Array<Tool> {
  // One budget per root run. A child run inherits its parent's budget.
  const budget = treeBudget(bag)
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
    // A store that knows the child is the source of its messages. The card
    // came from the client, which could change a tool call before it answers
    // the interrupt of that call.
    const load = parent.childLoader?.()
    const pending =
      suspended && load
        ? (await load(suspended.subagentRunId))?.pending
        : undefined
    if (suspended && load && !pending) {
      throw new Error(
        `Subagent run "${suspended.subagentRunId}" is not waiting in this thread.`,
      )
    }
    const entry: SpawnEntry = {
      ...child,
      ...(suspended && {
        resume: {
          subagentRunId: suspended.subagentRunId,
          messages: pending ?? suspended.messages,
          entries: suspended.resume,
          text: suspended.text,
        },
      }),
    }
    const timeout = budget.childTimeout()
    // A resumed child already counted when it first started. A parent with
    // no time left starts no child.
    const refusal = suspended
      ? undefined
      : timeout === 0
        ? budget.limits.timeoutMs === 0
          ? 'subagent limit reached (timeoutMs 0)'
          : 'subagent limit reached (no time left)'
        : budget.reserve(active)
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
    let timedOut = false
    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true
            link.controller.abort(
              new Error(`subagent timed out after ${timeout} ms`),
            )
          }, timeout)
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
    if (timedOut) error = `subagent timed out after ${timeout} ms`
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
      // Only a stored child can be continued, through a tool with `sessionId`.
      ...(subagentRunId !== '' && parent.canContinue === true
        ? { keepRunId: true as const }
        : {}),
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

  const names = reservedFields(bag, parent.canContinue === true)
  // A thrown error in `execute` goes back to the model as a tool error.
  return bag.agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    inputSchema: agentToolInput(agent, names),
    [SUBAGENT_TOOL]: true,
    execute: async (args: unknown, context?: ToolExecutionContext) => {
      const call = readCall(agent, args, names)
      const fields = {
        ...(call.input !== undefined && { input: call.input }),
        ...(call.prompt !== undefined && { prompt: call.prompt }),
      }
      const child = { name: agent.name, ...fields }
      if (call.background) {
        if (call.sessionId !== undefined) {
          throw new Error('background cannot continue a sessionId.')
        }
        const start = bag.binding?.start
        if (!start) {
          throw new Error(
            'background needs a host that runs children in the background.',
          )
        }
        // A background child counts against the tree budget too.
        const refusal = budget.reserve(active)
        if (refusal !== undefined) throw new Error(refusal)
        active += 1
        let started: { subagentRunId: string; done: Promise<unknown> }
        try {
          started = await start(
            {
              agent: agent.name,
              ...fields,
              ...(context?.toolCallId !== undefined && {
                parentToolCallId: context.toolCallId,
              }),
            },
            { wake: true },
          )
        } catch (error) {
          active -= 1
          budget.release()
          throw error
        }
        void Promise.resolve(started.done).finally(() => {
          active -= 1
        })
        const { subagentRunId } = started
        return {
          subagentRunId,
          text: '',
          result: { status: 'started' },
          keepRunId: true,
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
  }))
}
