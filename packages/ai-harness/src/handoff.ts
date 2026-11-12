import { toolDefinition } from '@tanstack/ai'
import { isHumanTarget } from './log-records'
import { routedRunId } from './routed-history'
import { isRecord } from './utils'
import type {
  AfterToolCallInfo,
  AnyChatMiddleware,
  AnyTool,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
  SubagentRouterPick,
  ToolCallHookContext,
} from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import type { AnyAgent } from './agents'
import type { HandoffToolContext, HarnessRouterPick } from './define'
import type { HandoffRecord, HumanTarget } from './log-records'

/** What `ctx.harness.handoff` takes. */
export interface HandoffOptions {
  /**
   * The root agent that answers next, `'main'` for the main model, or
   * `{ human: true }` for a person. A handoff to a person needs
   * `routing.allowHandoffToHuman`. It opens a `human` wait, and the session pauses until
   * an operator answers it.
   */
  to: string | HumanTarget
  /** A note for the target. The log and the `harness.handoff` event keep it. */
  note?: string
}

/** The name of the tool that hands the turn to another agent. */
export const HANDOFF_TOOL = 'handoff'

/**
 * The most handoffs in one turn. Two agents that hand the turn to each other
 * again and again stop here.
 */
const MAX_HANDOFFS = 10

/** A handoff without the turn that made it. */
type Handoff = Omit<HandoffRecord, 'runId'>

/** The target of a handoff to a person. */
const HUMAN: HumanTarget = { human: true }

/** How a text names the target of a handoff. */
function targetName(to: HandoffRecord['to']) {
  if (to === null) return 'main'
  return isHumanTarget(to) ? 'a person' : to
}

/** The result text of a `handoff` tool call to `to`. */
function handoffText(to: string | HumanTarget) {
  if (typeof to !== 'string') {
    return 'Handed off to a person. The session waits for an operator.'
  }
  return `Handed off to ${to}. ${to} answers next.`
}

/** The middleware context fields that tell which chat runs. */
type ChatOf = Pick<
  ChatMiddlewareContext,
  'subagentName' | 'parentSubagentRunId'
>

/**
 * The built-in `handoff` tool. Its `to` lists `targets`, and
 * `{ human: true }` when `allowHuman` is set.
 */
function defaultHandoffTool({
  targets,
  allowHuman,
  handoff,
}: HandoffToolContext) {
  const agents = { type: 'string', enum: targets }
  const person = {
    type: 'object',
    properties: { human: { type: 'boolean', const: true } },
    required: ['human'],
  }
  return toolDefinition({
    name: HANDOFF_TOOL,
    description: `Hand the conversation to another agent. That agent answers the user next, in this turn and in later turns.${allowHuman ? ' Use { human: true } only when the user needs a person.' : ''} Stop after this call.`,
    inputSchema: {
      type: 'object',
      properties: {
        to: allowHuman ? { anyOf: [agents, person] } : agents,
        note: {
          type: 'string',
          description: 'What the next agent must know.',
        },
      },
      required: ['to'],
    },
  }).server(async (args: unknown) => {
    const to = isRecord(args) ? args.to : undefined
    const note = isRecord(args) ? args.note : undefined
    const target = isHumanTarget(to) ? HUMAN : to
    if (typeof target !== 'string' && !isHumanTarget(target)) {
      throw new Error('A handoff needs `to`: the name of an agent.')
    }
    await handoff({ to: target, ...(typeof note === 'string' ? { note } : {}) })
    return handoffText(target)
  })
}

/**
 * The messages that show a router or code handoff in the transcript, so the
 * target knows that it got the conversation, and why. They look like a
 * `handoff` tool call of the model and its result. With `asTool: false` (the
 * models have no `handoff` tool) they are one plain assistant note, with
 * the message id `id`.
 */
export function handoffMessages(
  record: Handoff,
  id: string,
  asTool: boolean,
): Array<ModelMessage> {
  const to = isHumanTarget(record.to) ? HUMAN : (record.to ?? 'main')
  const metadata = {
    harness: {
      ...(typeof record.from === 'string' ? { agent: record.from } : {}),
      handoff: { by: record.by },
    },
  }
  const result = handoffText(to)
  if (!asTool) {
    const note = record.note === undefined ? '' : ` Note: ${record.note}`
    return [{ id, role: 'assistant', content: result + note, metadata }]
  }
  const args = {
    to,
    ...(record.note !== undefined ? { note: record.note } : {}),
  }
  return [
    {
      id,
      role: 'assistant',
      content: null,
      toolCalls: [
        {
          id,
          type: 'function',
          function: { name: HANDOFF_TOOL, arguments: JSON.stringify(args) },
        },
      ],
      metadata,
    },
    {
      id: `${id}_result`,
      role: 'tool',
      toolCallId: id,
      content: result,
      metadata,
    },
  ]
}

/**
 * The handoffs of one turn of a harness with `routing`. The router, the
 * `handoff` tool, and `ctx.harness.handoff` go through it. Each handoff
 * appends one `harness.handoff` record, before the target runs, and
 * publishes one `harness.handoff` event. A tool or code handoff ends the
 * part that made it. Then the turn runs the target.
 */
export class TurnHandoffs {
  /** The handoff that ends the current part. */
  private pending: Handoff | undefined
  private count = 0
  /** The handoff tool of each speaker, made once per turn. */
  private readonly tools = new Map<string | null, AnyTool>()
  /** The ids of the handoff tool calls that run now. */
  private readonly activeCalls = new Set<string>()

  constructor(
    private readonly options: {
      /** The operation id of the turn. */
      runId: string
      /**
       * The key of the ids of the handoff notes: the input of the turn, which
       * a run of the turn on the next host keeps.
       */
      noteKey: string
      /** The agents a handoff can go to. */
      rootAgents: ReadonlyArray<AnyAgent>
      /** The names of the agents that are only subagents, for the error text. */
      subagents: ReadonlyArray<string>
      /** `routing.allowHandoffToHuman`: a handoff can go to a person. */
      humans: boolean
      /** `routing.giveModelsHandoffTool`: the root agents get the `handoff` tool. */
      tool: boolean
      /** `routing.handoffTool`: makes the handoff tool of each speaker. */
      handoffTool?: (ctx: HandoffToolContext) => AnyTool
      /**
       * Append the record. A handoff to a person opens its `human` wait in
       * the same append. Resolves with the record as the log keeps it.
       */
      append: (record: HandoffRecord) => Promise<HandoffRecord>
      publish: (value: HandoffRecord) => void
    },
  ) {}

  /**
   * The pick that `chat()` runs for a router answer. A pick that changes who
   * answers the thread is a handoff with `by: 'router'`. `messages` show
   * that handoff in the transcript.
   */
  async route(
    chosen: HarnessRouterPick,
    activeAgent: string | null,
  ): Promise<{ pick: SubagentRouterPick; messages: Array<ModelMessage> }> {
    const { pick, handoff } = routerTarget(
      chosen,
      activeAgent,
      this.options.rootAgents,
    )
    if (!handoff) return { pick, messages: [] }
    const record = await this.write({ ...handoff, by: 'router' })
    return { pick, messages: this.messages(record) }
  }

  /**
   * The messages that show a handoff in the transcript. None for a tool
   * call of the main model: its call is in the thread already. A root agent
   * keeps its tool calls in its own transcript, so its handoff gets them,
   * and the next speaker reads who handed off.
   */
  messages(handoff: Handoff): Array<ModelMessage> {
    if (handoff.by === 'tool' && handoff.from === null) return []
    // A turn that runs again after a crash makes the same ids, so the store
    // keeps each note once.
    const id = `handoff_${this.options.noteKey}_${this.count}`
    return handoffMessages(handoff, id, this.options.tool)
  }

  /**
   * Hand the turn from `from` (an agent name, or `null` for the main model)
   * to `options.to`. The part of `from` ends, and the target answers next.
   * A handoff to a person ends the turn, and the session pauses. Throws for
   * a target that is not a root agent, for a person without
   * `routing.allowHandoffToHuman`, and for a second handoff in the same part.
   * A code handoff inside a call of the handoff tool counts as a tool
   * handoff: the tool call is in the transcript.
   */
  async handoff(
    options: HandoffOptions,
    from: string | null,
    by: 'tool' | 'code',
  ): Promise<void> {
    // ponytail: any running handoff tool call of the turn counts. A parallel
    // tool that calls `run.handoff` while a handoff call runs is also 'tool'.
    // Keep the speaker of each call if that matters.
    const recordedBy = this.activeCalls.size > 0 ? 'tool' : by
    const { to, note } = options
    const isHuman = isHumanTarget(to)
    if (isHuman && !this.options.humans) {
      throw new Error(
        'A handoff to a person needs `routing: { humans: true }` in the harness.',
      )
    }
    if (!isHuman && typeof to !== 'string') {
      throw new Error(
        'A handoff needs `to`: the name of a root agent, or { human: true }.',
      )
    }
    const names = this.options.rootAgents.map((agent) => agent.name)
    if (!isHuman && to !== 'main' && !names.includes(to)) {
      const kind = this.options.subagents.includes(to)
        ? `Agent "${to}" is only a subagent.`
        : `Unknown agent "${to}".`
      throw new Error(
        `${kind} A handoff goes to a root agent (${[...names, "'main'"].join(', ')}).`,
      )
    }
    const target = isHuman ? HUMAN : to === 'main' ? null : to
    if (target === from) {
      throw new Error(
        `${targetName(target)} answers already. Hand off to another agent.`,
      )
    }
    if (this.pending) {
      throw new Error(
        `This part handed off to ${targetName(this.pending.to)} already.`,
      )
    }
    if (this.count >= MAX_HANDOFFS) {
      throw new Error(
        `A turn can hand off ${MAX_HANDOFFS} times at most. Answer the user.`,
      )
    }
    const handoff: Handoff = {
      from,
      to: target,
      ...(typeof note === 'string' ? { note } : {}),
      by: recordedBy,
      // The agents an operator can hand back to: the ones this turn offers.
      ...(isHuman ? { agents: names } : {}),
    }
    this.pending = await this.write(handoff)
  }

  /** The handoff that ended the last part, once. */
  take(): Handoff | undefined {
    const { pending } = this
    this.pending = undefined
    return pending
  }

  /**
   * Make `handoff` pending again, with no new record: the log has it. A
   * resolve turn gets the handoff of the part that stopped for interrupts.
   * Its part ends after the answered tools, and the target runs.
   */
  restore(handoff: Handoff) {
    this.count += 1
    this.pending = handoff
  }

  /**
   * The handoff tool of `from`: the main model (`null`) or a root agent.
   * `routing.handoffTool` makes it, else the built-in `handoff` tool. Its
   * targets are the root agents, and `'main'` for an agent, but not `from`.
   * With `routing.allowHandoffToHuman`, `{ human: true }` hands the
   * conversation to a person. Each speaker gets one tool per turn.
   */
  tool(from: string | null) {
    const made = this.tools.get(from)
    if (made) return made
    const targets = [
      ...this.options.rootAgents.map((agent) => agent.name),
      ...(from === null ? [] : ['main']),
    ].filter((name) => name !== from)
    const ctx: HandoffToolContext = {
      from,
      targets,
      allowHuman: this.options.humans,
      handoff: (options) => this.handoff(options, from, 'tool'),
    }
    const tool = this.options.handoffTool?.(ctx) ?? defaultHandoffTool(ctx)
    this.tools.set(from, tool)
    return tool
  }

  /**
   * Middleware for the chat calls of a turn: a pending handoff stops the
   * tool loop of the chat that made it, so the target answers next. Other
   * chats of the part (a sibling root agent, a tool-mode child) go on. With
   * `roots`, it also gives each routed root agent its handoff tool, unless
   * `routing.giveModelsHandoffTool` is false. A tool in `config.tools` with
   * the same name wins. A nested child of a root agent gets no tool, so it
   * cannot move the whole session. It also tracks the calls of the handoff
   * tool, so a code handoff inside one records `by: 'tool'`.
   */
  middleware(options: { roots?: boolean } = {}) {
    /** The name of the handoff tool of a chat. Undefined when it has none. */
    const toolName = (ctx: ChatOf) =>
      this.options.tool && ctx.parentSubagentRunId === undefined
        ? this.tool(ctx.subagentName ?? null).name
        : undefined
    return {
      name: 'harness:handoff',
      onConfig: (ctx: ChatOf, config: Pick<ChatMiddlewareConfig, 'tools'>) => {
        const isRoot = options.roots === true && ctx.subagentName !== undefined
        const name = isRoot ? toolName(ctx) : undefined
        if (name === undefined) return undefined
        if (config.tools.some((tool) => tool.name === name)) return undefined
        return { tools: [...config.tools, this.tool(ctx.subagentName ?? null)] }
      },
      // The guard tier, not onBeforeToolCall: the first onBeforeToolCall
      // decision (such as changed args) stops the hooks after it.
      onGuardToolCall: (
        ctx: ChatOf,
        call: Pick<ToolCallHookContext, 'toolName' | 'toolCallId'>,
      ) => {
        if (call.toolName === toolName(ctx)) {
          this.activeCalls.add(call.toolCallId)
        }
        return undefined
      },
      onAfterToolCall: (
        _ctx: ChatOf,
        info: Pick<AfterToolCallInfo, 'toolCallId'>,
      ) => {
        this.activeCalls.delete(info.toolCallId)
        return undefined
      },
      onShouldContinue: (ctx: ChatOf) => {
        const { pending } = this
        if (!pending || ctx.parentSubagentRunId !== undefined) return undefined
        // ponytail: a chat is known by its agent name ('main' has none). The
        // root agents of one pick have different names.
        return (ctx.subagentName ?? null) === pending.from ? false : undefined
      },
    } satisfies AnyChatMiddleware
  }

  private async write(handoff: Handoff) {
    this.count += 1
    const record = await this.options.append({
      ...handoff,
      runId: this.options.runId,
    })
    this.options.publish(record)
    return record
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
    if (activeAgent === null || isRoot(activeAgent)) {
      return { pick: activeAgent ?? 'main' }
    }
    // An active agent that this turn does not have (a plugin went away)
    // gives the turn to the main model. The log keeps that, so the next
    // turn does not read the missing agent again.
    return { pick: 'main', handoff: { from: activeAgent, to: null } }
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

/** The agent that answers a part of a routed turn, when one agent does. */
export function answererOf(pick: SubagentRouterPick | undefined) {
  if (typeof pick === 'string') return pick === 'main' ? null : pick
  if (typeof pick === 'object' && 'name' in pick) return pick.name
  return undefined
}

/**
 * The message of a routed run in the thread: chat() keeps the text of the
 * root agents of run `runId` in one assistant message.
 */
function routedIndex(messages: ReadonlyArray<ModelMessage>, runId: string) {
  return messages.findIndex((message) => routedRunId(message) === runId)
}

/**
 * Mark the routed message of run `runId` with the agent that wrote it, in
 * `metadata.harness.agent`. A routed pass that runs again on the same run id
 * (a handoff to another root agent, a late join, a hook) first keeps this
 * message under its own id, so each pass keeps its own message.
 */
export async function markRouted(
  store: MessageStore,
  threadId: string,
  runId: string,
  mark: { agent?: string },
) {
  const { agent } = mark
  if (agent === undefined) return
  const history = await store.loadThread(threadId)
  const index = routedIndex(history, runId)
  const message = history[index]
  if (!message) return
  const harness = isRecord(message.metadata?.harness)
    ? message.metadata.harness
    : {}
  const updated: ModelMessage = {
    ...message,
    metadata: {
      ...message.metadata,
      harness: { ...harness, agent },
    },
  }
  await store.saveThread(threadId, history.with(index, updated))
}
