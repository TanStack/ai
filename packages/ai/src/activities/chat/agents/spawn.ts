import { EventType } from '../../../types'
import type { StreamChunk, Tool } from '../../../types'
import type { DefinedAgent, SubagentRunContext } from './define-agent'

export const SUBAGENT_STARTED = 'SUBAGENT_STARTED'
export const SUBAGENT_FINISHED = 'SUBAGENT_FINISHED'
export const SUBAGENT_ERROR = 'SUBAGENT_ERROR'

const SUBAGENT_TOOL_FLAG = '__tanstackSubagent'

export interface SubagentStartedEvent {
  type: typeof SUBAGENT_STARTED
  subagentRunId: string
  name: string
  description?: string
  parentSubagentRunId?: string
  timestamp: number
}

export interface SubagentFinishedEvent {
  type: typeof SUBAGENT_FINISHED
  subagentRunId: string
  timestamp: number
}

export interface SubagentErrorEvent {
  type: typeof SUBAGENT_ERROR
  subagentRunId: string
  message: string
  code?: string
  timestamp: number
}

export type SubagentRouterPick = 'main' | string | ReadonlyArray<string>

export interface SubagentsBag {
  agents: ReadonlyArray<DefinedAgent>
  router?: (ctx: {
    messages: SubagentRunContext['messages']
    agents: ReadonlyArray<DefinedAgent>
    abortSignal?: AbortSignal
  }) => SubagentRouterPick | Promise<SubagentRouterPick>
  strategy?: 'exclusive' | 'handoff'
  sandbox?: 'own' | 'inherit'
}

export function createSubagentId() {
  return `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
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

function stoppedEvent(runId: string) {
  return {
    type: SUBAGENT_ERROR,
    subagentRunId: runId,
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

function linkChildAbort(parent?: AbortSignal) {
  const childAbort = new AbortController()
  if (!parent) return childAbort
  if (parent.aborted) {
    childAbort.abort()
    return childAbort
  }
  parent.addEventListener(
    'abort',
    () => {
      childAbort.abort()
    },
    { once: true },
  )
  return childAbort
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

export function normalizeRouterPick(
  pick: SubagentRouterPick,
  agents: ReadonlyArray<DefinedAgent>,
) {
  const names = Array.isArray(pick) ? [...pick] : [pick]
  if (names.length === 0) {
    throw new Error(
      'subagents.router must return main, a name, or a list of names',
    )
  }
  const hasMain = names.includes('main')
  if (hasMain && names.length > 1) {
    throw new Error('Do not mix main into a parallel subagent list')
  }
  if (hasMain) return ['main'] as const
  for (const name of names) {
    agentByName(agents, name)
  }
  return names
}

function isLifecycleChunk(chunk: StreamChunk) {
  return (
    chunk.type === EventType.RUN_STARTED ||
    chunk.type === EventType.RUN_FINISHED
  )
}

export function stampSubagentRunId(chunk: StreamChunk, subagentRunId: string) {
  return { ...chunk, subagentRunId }
}

export async function* spawnAgentStream(
  agent: DefinedAgent,
  ctx: SubagentRunContext,
): AsyncIterable<StreamChunk> {
  const startedAt = Date.now()
  yield {
    type: SUBAGENT_STARTED,
    subagentRunId: ctx.runId,
    name: agent.name,
    description: agent.description,
    ...(ctx.parentSubagentRunId !== undefined
      ? { parentSubagentRunId: ctx.parentSubagentRunId }
      : {}),
    timestamp: startedAt,
  } satisfies SubagentStartedEvent

  let iterator: AsyncIterator<StreamChunk> | undefined
  try {
    if (ctx.abortSignal?.aborted) {
      yield stoppedEvent(ctx.runId)
      return
    }
    const stream = await orAbort(
      Promise.resolve(agent.run(ctx)),
      ctx.abortSignal,
    )
    iterator = stream[Symbol.asyncIterator]()
    while (true) {
      if (ctx.abortSignal?.aborted) {
        yield stoppedEvent(ctx.runId)
        return
      }
      const result = await orAbort(iterator.next(), ctx.abortSignal)
      if (result.done) break
      const chunk = result.value
      if (isLifecycleChunk(chunk)) continue
      if (chunk.type === EventType.RUN_ERROR) {
        const message =
          'message' in chunk && typeof chunk.message === 'string'
            ? chunk.message
            : 'Subagent failed'
        yield {
          type: SUBAGENT_ERROR,
          subagentRunId: ctx.runId,
          message,
          timestamp: Date.now(),
        } satisfies SubagentErrorEvent
        return
      }
      yield stampSubagentRunId(chunk, ctx.runId)
    }
    if (ctx.abortSignal?.aborted) {
      yield stoppedEvent(ctx.runId)
      return
    }
    yield {
      type: SUBAGENT_FINISHED,
      subagentRunId: ctx.runId,
      timestamp: Date.now(),
    } satisfies SubagentFinishedEvent
  } catch (error) {
    yield {
      type: SUBAGENT_ERROR,
      subagentRunId: ctx.runId,
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
}

export async function* spawnNamedAgents(
  names: ReadonlyArray<string>,
  bag: SubagentsBag,
  ctx: Omit<SubagentRunContext, 'runId'>,
) {
  if (bag.sandbox === 'inherit' && names.length > 1) {
    throw new Error(
      "subagents.sandbox 'inherit' cannot start two children in one turn",
    )
  }
  const streams = names.map((name) => {
    const agent = agentByName(bag.agents, name)
    const runId = createSubagentId()
    const childAbort = linkChildAbort(ctx.abortSignal)
    return spawnAgentStream(agent, {
      ...ctx,
      runId,
      threadId: childThreadId(bag.sandbox, ctx.threadId, name),
      abortSignal: childAbort.signal,
    })
  })
  const onlyStream = streams.length === 1 ? streams[0] : undefined
  if (onlyStream) {
    yield* onlyStream
    return
  }
  yield* mergeAgentStreams(streams)
}

export function collectSpawnedText(chunks: Array<StreamChunk>) {
  let text = ''
  for (const chunk of chunks) {
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT && 'delta' in chunk) {
      text += chunk.delta
    }
  }
  return text
}

export function createSyntheticSubagentTools(
  bag: SubagentsBag,
  parent: {
    messages: SubagentRunContext['messages']
    threadId: string
    parentRunId: string
    abortSignal?: AbortSignal
  },
) {
  return bag.agents.map((agent) => {
    const tool: Tool & { [SUBAGENT_TOOL_FLAG]?: true; agent?: DefinedAgent } = {
      name: agent.name,
      description: agent.description,
      execute: async () => {
        const runId = createSubagentId()
        const childAbort = linkChildAbort(parent.abortSignal)
        const chunks: Array<StreamChunk> = []
        for await (const chunk of spawnAgentStream(agent, {
          messages: parent.messages,
          abortSignal: childAbort.signal,
          threadId: childThreadId(bag.sandbox, parent.threadId, agent.name),
          runId,
          parentRunId: parent.parentRunId,
        })) {
          chunks.push(chunk)
        }
        const errorChunk = chunks.find((chunk) => chunk.type === SUBAGENT_ERROR)
        return {
          subagentRunId: runId,
          chunks,
          result: collectSpawnedText(chunks),
          ...(errorChunk && 'message' in errorChunk
            ? { error: errorChunk.message }
            : {}),
        }
      },
    }
    tool[SUBAGENT_TOOL_FLAG] = true
    tool.agent = agent
    return tool
  })
}
