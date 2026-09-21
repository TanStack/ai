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

export type SubagentLifecycleEvent =
  | SubagentStartedEvent
  | SubagentFinishedEvent
  | SubagentErrorEvent

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

export function isSubagentLifecycleType(type: string) {
  return (
    type === SUBAGENT_STARTED ||
    type === SUBAGENT_FINISHED ||
    type === SUBAGENT_ERROR
  )
}

export function isSubagentTool(tool: { name: string } & Record<string, unknown>) {
  return tool[SUBAGENT_TOOL_FLAG] === true
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
    throw new Error('subagents.router must return main, a name, or a list of names')
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

  try {
    const stream = await agent.run(ctx)
    for await (const chunk of stream) {
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
    yield {
      type: SUBAGENT_FINISHED,
      subagentRunId: ctx.runId,
      timestamp: Date.now(),
    } satisfies SubagentFinishedEvent
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    yield {
      type: SUBAGENT_ERROR,
      subagentRunId: ctx.runId,
      message,
      timestamp: Date.now(),
    } satisfies SubagentErrorEvent
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
    return spawnAgentStream(agent, { ...ctx, runId })
  })
  if (streams.length === 1) {
    yield* streams[0]!
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
        const chunks: Array<StreamChunk> = []
        for await (const chunk of spawnAgentStream(agent, {
          messages: parent.messages,
          abortSignal: parent.abortSignal,
          threadId: parent.threadId,
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
