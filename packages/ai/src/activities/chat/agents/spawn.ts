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
import { INTERRUPT_BINDING_METADATA_KEY } from '../../../interrupt-resume'
import { EMIT_STREAM_CHUNK, SUBAGENT_TOOL } from '../tools/tool-calls'
import type { SubagentToolOutcome } from '../tools/tool-calls'
import type { SpecTokenUsage } from '../../../utilities/ag-ui-usage'
import type {
  Interrupt,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
  SubagentErrorEvent,
  SubagentFinishedEvent,
  SubagentStartedEvent,
  TokenUsage,
  Tool,
  UIMessage,
} from '../../../types'
import type { DefinedAgent, SubagentRunContext } from './define-agent'
import type { ChatMiddleware } from '../middleware/types'
import type { SubagentTurn } from './turn'

export const SUBAGENT_STARTED = EventType.SUBAGENT_STARTED
export const SUBAGENT_FINISHED = EventType.SUBAGENT_FINISHED
export const SUBAGENT_ERROR = EventType.SUBAGENT_ERROR

export type SubagentOrder = 'parallel' | 'sequence'

export interface SubagentRouterPlan {
  names: ReadonlyArray<string>
  /** Overrides `subagents.order` for this turn. */
  order?: SubagentOrder
}

export interface SubagentStep {
  names: ReadonlyArray<string>
  /** Overrides `subagents.order` for this step. */
  order?: SubagentOrder
}

export interface SubagentStepsPlan {
  steps: ReadonlyArray<SubagentStep>
}

export type SubagentRouterPick =
  | 'main'
  | string
  | ReadonlyArray<string>
  | SubagentRouterPlan
  | SubagentStepsPlan

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
    throw new Error(`Unknown subagent: ${name}`)
  }
  return agent
}

function openAgentStream(
  entry: SpawnEntry,
  bag: SubagentsBag,
  ctx: SpawnContext,
  sink?: SubagentSink,
  parentToolCallId?: string,
) {
  const agent = agentByName(bag.agents, entry.name)
  const resume = entry.resume
  const subagentRunId = resume?.subagentRunId ?? createSubagentId()
  // The parent binds child interrupts to its own run (see rebindInterrupts),
  // so the resumed child continues from the interrupted parent run id.
  if (resume !== undefined && ctx.interruptedRunId === undefined) {
    throw new Error(
      `Subagent "${entry.name}" has interrupt answers, but the run has no parentRunId. Pass the interrupted run id as parentRunId.`,
    )
  }
  const resumed =
    resume !== undefined
      ? {
          messages: [...ctx.messages, ...resume.messages],
          parentRunId: ctx.interruptedRunId,
          resume: resume.entries,
        }
      : undefined
  return spawnAgentStream(
    agent,
    {
      messages: resumed?.messages ?? ctx.messages,
      ...(ctx.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
      threadId: childThreadId(bag.sandbox, ctx.threadId, entry.name),
      runId: childRunId(ctx.parentRunId, subagentRunId),
      parentRunId: resumed?.parentRunId ?? ctx.parentRunId,
      subagentRunId,
      ...(resumed ? { resume: resumed.resume } : {}),
    },
    sink,
    parentToolCallId,
  )
}

const ROUTER_PICK_ERROR =
  'subagents.router must return main, a name, a list of names, { names, order }, or { steps }.'

function assertOrder(order: SubagentOrder | undefined) {
  if (order !== undefined && order !== 'parallel' && order !== 'sequence') {
    throw new Error('subagents.router order must be parallel or sequence.')
  }
}

function normalizeNames(
  names: ReadonlyArray<string>,
  agents: ReadonlyArray<DefinedAgent>,
): ReadonlyArray<string> {
  if (names.length === 0) throw new Error(ROUTER_PICK_ERROR)
  const hasMain = names.includes('main')
  if (hasMain && names.length > 1) {
    throw new Error('Do not mix main into a subagent list.')
  }
  if (hasMain) return ['main']
  for (const name of names) agentByName(agents, name)
  return [...names]
}

function isStringList(pick: SubagentRouterPick): pick is ReadonlyArray<string> {
  return Array.isArray(pick)
}

export function normalizeRouterPick(
  pick: SubagentRouterPick,
  agents: ReadonlyArray<DefinedAgent>,
): { steps: ReadonlyArray<SubagentStep> } {
  if (pick === 'main' || typeof pick === 'string') {
    return { steps: [{ names: normalizeNames([pick], agents) }] }
  }
  if (isStringList(pick)) {
    return { steps: [{ names: normalizeNames(pick, agents) }] }
  }
  if ('steps' in pick) {
    if (pick.steps.length === 0) throw new Error(ROUTER_PICK_ERROR)
    const steps = pick.steps.map((step) => {
      assertOrder(step.order)
      const names = normalizeNames(step.names, agents)
      return step.order === undefined ? { names } : { names, order: step.order }
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
    steps: [
      pick.order === undefined ? { names } : { names, order: pick.order },
    ],
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

export async function* spawnAgentStream(
  agent: DefinedAgent,
  ctx: SubagentRunContext,
  sink?: SubagentSink,
  parentToolCallId?: string,
): AsyncIterable<StreamChunk> {
  const id = ctx.subagentRunId
  yield {
    type: SUBAGENT_STARTED,
    subagentRunId: id,
    name: agent.name,
    description: agent.description,
    ...(ctx.parentSubagentRunId !== undefined
      ? { parentSubagentRunId: ctx.parentSubagentRunId }
      : {}),
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
    const stream = await orAbort(
      Promise.resolve(agent.run(ctx)),
      ctx.abortSignal,
    )
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
  }
}

async function* mergeAgentStreams(streams: Array<AsyncIterable<StreamChunk>>) {
  const readers = streams.map((stream) => {
    const iterator = stream[Symbol.asyncIterator]()
    return {
      iterator,
      next: iterator.next(),
    }
  })

  try {
    while (readers.length > 0) {
      const indexed = readers.map((reader, index) =>
        reader.next.then((result) => ({ index, result, reader })),
      )
      const winner = await Promise.race(indexed)
      if (winner.result.done) {
        readers.splice(winner.index, 1)
        continue
      }
      yield winner.result.value
      winner.reader.next = winner.reader.iterator.next()
    }
  } finally {
    // The reader stopped early. Close every child so its finally runs.
    for (const reader of readers) {
      void reader.iterator.return?.().catch(() => {})
    }
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
    yield* mergeAgentStreams(streams)
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
 * child reads the conversation as it is at that call.
 */
export function subagentCallMessages(names: ReadonlySet<string>) {
  const byCall = new Map<string, Array<ModelMessage>>()
  const middleware: ChatMiddleware = {
    name: 'subagent-call-messages',
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
    abortSignal?: AbortSignal
    turn?: SubagentTurn
    sink: SubagentSink
  },
): Array<Tool> {
  return bag.agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    [SUBAGENT_TOOL]: true,
    execute: async (_input: unknown, context?: unknown) => {
      const toolContext = context as
        | {
            toolCallId?: string
            [EMIT_STREAM_CHUNK]?: (chunk: StreamChunk) => void
          }
        | undefined
      const toolCallId = toolContext?.toolCallId
      const suspended = parent.turn?.children.find(
        (child) =>
          child.status === 'suspended' &&
          child.parentToolCallId !== undefined &&
          child.parentToolCallId === toolCallId,
      )
      const entry: SpawnEntry = suspended
        ? {
            name: agent.name,
            resume: {
              subagentRunId: suspended.subagentRunId,
              messages: suspended.messages,
              entries: suspended.resume,
              text: suspended.text,
            },
          }
        : { name: agent.name }
      const sink = createSubagentSink()
      const link = linkAbort(parent.abortSignal)
      let subagentRunId = suspended?.subagentRunId ?? ''
      let text = suspended?.text ?? ''
      let error: string | undefined
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
          },
          sink,
          toolCallId,
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
          toolContext?.[EMIT_STREAM_CHUNK]?.(chunk)
        }
      } finally {
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
        ...(error !== undefined ? { error } : {}),
        ...(sink.interrupts.length > 0 ? { interrupts: sink.interrupts } : {}),
      } satisfies SubagentToolOutcome
    },
  }))
}
