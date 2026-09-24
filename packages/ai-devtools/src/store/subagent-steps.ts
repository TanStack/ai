import type { Iteration, Message, ToolCall } from './ai-context'

/** One child agent from a chat snapshot. Nested children are listed too. */
export interface SubagentInfo {
  id: string
  name: string
  /** Agent names from the root, for example `researcher > writer`. */
  path: string
  status?: string
  error?: string
  /**
   * Zero-based index of the user turn this child belongs to (the last root
   * user message before it). A nested child takes its parent's turn.
   */
  turn: number
  messages: Array<unknown>
}

/** Child steps in the shape the iteration timeline renders. */
export interface SubagentSteps {
  iterations: Array<Iteration>
  messages: Array<Message>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Every subagent in a list of snapshot messages, in the order they appear.
 * A nested child comes right after its parent.
 */
export function collectSubagents(
  messages: Array<unknown>,
): Array<SubagentInfo> {
  const out: Array<SubagentInfo> = []
  let turn = -1
  const visit = (
    list: Array<unknown>,
    parentPath: string | undefined,
    parentTurn: number | undefined,
  ) => {
    for (const message of list) {
      if (!isRecord(message)) continue
      if (parentTurn === undefined && message.role === 'user') turn += 1
      if (!Array.isArray(message.parts)) continue
      for (const part of message.parts) {
        if (!isRecord(part) || part.type !== 'subagent') continue
        const subagent = part.subagent
        if (!isRecord(subagent) || typeof subagent.id !== 'string') continue
        const name = text(subagent.name) || 'subagent'
        const path = parentPath ? `${parentPath} > ${name}` : name
        const error = isRecord(subagent.error)
          ? text(subagent.error.message)
          : ''
        const childMessages = Array.isArray(subagent.messages)
          ? subagent.messages
          : []
        const info: SubagentInfo = {
          id: subagent.id,
          name,
          path,
          ...(typeof subagent.status === 'string'
            ? { status: subagent.status }
            : {}),
          ...(error ? { error } : {}),
          turn: parentTurn ?? Math.max(turn, 0),
          messages: childMessages,
        }
        out.push(info)
        visit(childMessages, path, info.turn)
      }
    }
  }
  visit(messages, undefined, undefined)
  return out
}

/**
 * The subagent a server run belongs to. A child run id is
 * `<parentRunId>:<subagentRunId>`, and a card id is the `subagentRunId`.
 */
export function subagentIdForRunId(
  runId: string | undefined,
  ids: ReadonlySet<string>,
): string | undefined {
  if (!runId) return undefined
  if (ids.has(runId)) return runId
  const last = runId.slice(runId.lastIndexOf(':') + 1)
  return last !== runId && ids.has(last) ? last : undefined
}

/** One child's steps: from server iterations when present, else the snapshot. */
export interface AgentStepGroup {
  agent: SubagentInfo
  iterations: Array<Iteration>
  messages: Array<Message>
  source: 'server' | 'snapshot'
}

/** A user message, the root steps it started, and its child agents. */
export interface TimelineGroup {
  userMessage: Message | null
  iterations: Array<Iteration>
  agents: Array<AgentStepGroup>
}

/** Request id to agent path, for server runs that belong to a child. */
export function childRequestAgents(
  iterations: Array<Iteration>,
  subagents: Array<SubagentInfo>,
): Map<string, string> {
  const ids = new Set(subagents.map((agent) => agent.id))
  const pathById = new Map(subagents.map((agent) => [agent.id, agent.path]))
  const out = new Map<string, string>()
  for (const iteration of iterations) {
    const id = subagentIdForRunId(iteration.runId, ids)
    const path = id ? pathById.get(id) : undefined
    if (path && iteration.requestId) out.set(iteration.requestId, path)
  }
  return out
}

interface StepSource {
  iterations: Array<Iteration>
  messages: Array<Message>
}

/**
 * The root conversation's steps plus each child's server steps. A child run
 * may have its own thread id (`<threadId>:<agent>` unless `sandbox: 'inherit'`),
 * so the store can file its steps under another conversation. They are found
 * by run id.
 */
export function collectServerSteps(
  root: StepSource | undefined,
  conversations: Array<StepSource>,
  subagents: Array<SubagentInfo>,
): StepSource {
  const ids = new Set(subagents.map((agent) => agent.id))
  const iterations: Array<Iteration> = [...(root?.iterations ?? [])]
  const messages: Array<Message> = [...(root?.messages ?? [])]
  const seenSteps = new Set(
    iterations.map((iteration) => `${iteration.requestId}:${iteration.index}`),
  )
  const seenMessages = new Set(messages.map((message) => message.id))
  for (const conversation of conversations) {
    if (conversation === root) continue
    const child = conversation.iterations.filter((iteration) =>
      subagentIdForRunId(iteration.runId, ids),
    )
    if (child.length === 0) continue
    for (const iteration of child) {
      const key = `${iteration.requestId}:${iteration.index}`
      if (seenSteps.has(key)) continue
      seenSteps.add(key)
      iterations.push(iteration)
    }
    for (const message of conversation.messages) {
      if (seenMessages.has(message.id)) continue
      seenMessages.add(message.id)
      messages.push(message)
    }
  }
  return { iterations, messages }
}

function timestampOf(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? undefined : time
}

/**
 * The user messages of a chat snapshot, as the turns of the timeline. The
 * snapshot is what the user sees, so it has every turn, also a routed turn
 * with no parent server steps. Empty when a user message has no `createdAt`.
 */
export function snapshotTurns(messages: Array<unknown>): Array<Message> {
  const turns: Array<Message> = []
  for (const message of messages) {
    if (!isRecord(message) || message.role !== 'user') continue
    const timestamp = timestampOf(message.createdAt)
    if (timestamp === undefined || typeof message.id !== 'string') return []
    const content = Array.isArray(message.parts)
      ? message.parts
          .map((part) =>
            isRecord(part) && part.type === 'text' ? text(part.content) : '',
          )
          .join('')
      : text(message.content)
    turns.push({ id: message.id, role: 'user', content, timestamp })
  }
  return turns
}

/**
 * Group steps under the user message that started them. Child server steps
 * leave the root list and join their agent. A child without server steps gets
 * steps built from the snapshot. A child `chat()` re-sends the history, so a
 * user message from a child request is not a new turn. Pass `turns` (from
 * {@link snapshotTurns}) to use the chat's own user messages as the turns.
 */
export function groupTimeline(
  iterations: Array<Iteration>,
  messages: Array<Message>,
  subagents: Array<SubagentInfo>,
  turns: Array<Message> = [],
): Array<TimelineGroup> {
  const ids = new Set(subagents.map((agent) => agent.id))
  const childRequests = childRequestAgents(iterations, subagents)
  const rootIterations = iterations.filter(
    (iteration) => !subagentIdForRunId(iteration.runId, ids),
  )
  const agents: Array<AgentStepGroup> = subagents.map((agent) => {
    const server = iterations.filter(
      (iteration) => subagentIdForRunId(iteration.runId, ids) === agent.id,
    )
    return server.length > 0
      ? { agent, iterations: server, messages, source: 'server' }
      : { agent, ...buildSubagentSteps(agent), source: 'snapshot' }
  })

  // ponytail: snapshot turns use the browser clock and server steps use the
  // server clock. Fine for local dev; a large skew can move a step one turn.
  const users = (
    turns.length > 0
      ? [...turns]
      : messages.filter(
          (message) =>
            message.role === 'user' &&
            !(message.requestId && childRequests.has(message.requestId)),
        )
  ).sort((a, b) => a.timestamp - b.timestamp)

  if (users.length === 0) {
    return rootIterations.length > 0 || agents.length > 0
      ? [{ userMessage: null, iterations: rootIterations, agents }]
      : []
  }

  const groups: Array<TimelineGroup> = []
  const first = users[0]
  const early = first
    ? rootIterations.filter(
        (iteration) => iteration.startedAt < first.timestamp,
      )
    : []
  if (early.length > 0) {
    groups.push({ userMessage: null, iterations: early, agents: [] })
  }
  users.forEach((user, turn) => {
    const next = users[turn + 1]
    const own = rootIterations.filter(
      (iteration) =>
        iteration.startedAt >= user.timestamp &&
        (!next || iteration.startedAt < next.timestamp),
    )
    const isLast = turn === users.length - 1
    const ownAgents = agents.filter((group) =>
      isLast ? group.agent.turn >= turn : group.agent.turn === turn,
    )
    if (own.length > 0 || ownAgents.length > 0) {
      groups.push({ userMessage: user, iterations: own, agents: ownAgents })
    }
  })
  return groups
}

function resultText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Split one child's messages into steps. A step ends after its tool results,
 * which is where the child's `chat()` starts its next iteration.
 */
export function buildSubagentSteps(agent: SubagentInfo): SubagentSteps {
  const iterations: Array<Iteration> = []
  const messages: Array<Message> = []
  let current:
    | { message: Message; results: Array<Message>; hasResult: boolean }
    | undefined

  const close = () => {
    if (!current) return
    const index = iterations.length
    const { message, results } = current
    const hasContent =
      message.content ||
      message.thinkingContent ||
      (message.toolCalls?.length ?? 0) > 0 ||
      results.length > 0
    if (hasContent) {
      messages.push(message, ...results)
      iterations.push({
        requestId: `subagent:${agent.id}`,
        index,
        messageId: message.id,
        // ponytail: the snapshot has no timestamps, so steps have no duration.
        startedAt: 1,
        completedAt: 1,
        finishReason:
          (message.toolCalls?.length ?? 0) > 0 ? 'tool_calls' : 'stop',
        middlewareEvents: [],
        messageIds: [message.id, ...results.map((result) => result.id)],
      })
    }
    current = undefined
  }

  const open = () => {
    const index = iterations.length
    current = {
      message: {
        id: `${agent.id}:step-${index}`,
        role: 'assistant',
        content: '',
        timestamp: 1,
        toolCalls: [],
      },
      results: [],
      hasResult: false,
    }
    return current
  }

  for (const message of agent.messages) {
    if (!isRecord(message) || message.role !== 'assistant') continue
    if (!Array.isArray(message.parts)) continue
    for (const part of message.parts) {
      if (!isRecord(part)) continue
      // A tool result joins the step of its call. Any other part after a
      // result starts the next step.
      const step =
        part.type === 'tool-result'
          ? (current ?? open())
          : current && !current.hasResult
            ? current
            : (close(), open())
      if (part.type === 'thinking') {
        step.message.thinkingContent =
          (step.message.thinkingContent ?? '') + text(part.content)
      } else if (part.type === 'text') {
        step.message.content += text(part.content)
      } else if (part.type === 'tool-call') {
        const toolCall: ToolCall = {
          id: text(part.id),
          name: text(part.name) || 'tool',
          arguments: text(part.arguments),
          state: text(part.state),
          ...(part.output !== undefined ? { result: part.output } : {}),
        }
        step.message.toolCalls?.push(toolCall)
      } else if (part.type === 'tool-result') {
        const toolCallId = text(part.toolCallId)
        const content = resultText(part.content ?? part.error)
        const call = step.message.toolCalls?.find((tc) => tc.id === toolCallId)
        if (call && call.result === undefined) call.result = content
        step.results.push({
          id: `${agent.id}:result-${toolCallId || step.results.length}`,
          role: 'tool',
          content,
          timestamp: 1,
        })
        step.hasResult = true
      }
    }
  }
  close()

  const last = iterations.at(-1)
  if (last && agent.status === 'running') delete last.completedAt
  if (last && agent.status === 'error') last.finishReason = 'error'
  return { iterations, messages }
}
