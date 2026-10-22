import { toolDefinition } from '@tanstack/ai'
import { isHumanTarget } from './log-records'
import { isRecord } from './utils'
import type {
  AnyChatMiddleware,
  ModelMessage,
  SubagentRouterPick,
} from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import type { AnyAgent } from './agents'
import type { HarnessRouterPick } from './define'
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
   * The messages that show a router or code handoff in the transcript. None
   * for a `handoff` tool call: the call of the model is there already.
   */
  messages(handoff: Handoff): Array<ModelMessage> {
    if (handoff.by !== 'router' && handoff.by !== 'code') return []
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
   */
  async handoff(
    options: HandoffOptions,
    from: string | null,
    by: 'tool' | 'code',
  ): Promise<void> {
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
      by,
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
   * The `handoff` tool of `from`: the main model (`null`) or a root agent.
   * Its `to` lists the root agents, and `'main'` for an agent, but not
   * `from`. With `routing.allowHandoffToHuman`, `{ human: true }` hands the conversation
   * to a person.
   */
  tool(from: string | null) {
    const { humans } = this.options
    const targets = [
      ...this.options.rootAgents.map((agent) => agent.name),
      ...(from === null ? [] : ['main']),
    ].filter((name) => name !== from)
    const agents = { type: 'string', enum: targets }
    const person = {
      type: 'object',
      properties: { human: { type: 'boolean', const: true } },
      required: ['human'],
    }
    return toolDefinition({
      name: HANDOFF_TOOL,
      description: `Hand the conversation to another agent. That agent answers the user next, in this turn and in later turns.${humans ? ' Use { human: true } only when the user needs a person.' : ''} Stop after this call.`,
      inputSchema: {
        type: 'object',
        properties: {
          to: humans ? { anyOf: [agents, person] } : agents,
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
      await this.handoff(
        { to: target, ...(typeof note === 'string' ? { note } : {}) },
        from,
        'tool',
      )
      return handoffText(target)
    })
  }

  /**
   * Middleware for the chat calls of a turn: a pending handoff stops the
   * tool loop of the chat that made it, so the target answers next. Other
   * chats of the part (a sibling root agent, a tool-mode child) go on. With
   * `roots`, it also gives each routed root agent its `handoff` tool, unless
   * `routing.giveModelsHandoffTool` is false. A nested child of a root agent gets no
   * tool, so it cannot move the whole session.
   */
  middleware(options: { roots?: boolean } = {}): AnyChatMiddleware {
    return {
      name: 'harness:handoff',
      onConfig: (ctx, config) => {
        const isRoot =
          options.roots === true &&
          this.options.tool &&
          ctx.subagentName !== undefined &&
          ctx.parentSubagentRunId === undefined
        if (!isRoot) return
        if (config.tools.some((tool) => tool.name === HANDOFF_TOOL)) return
        return { tools: [...config.tools, this.tool(ctx.subagentName ?? null)] }
      },
      onShouldContinue: (ctx) => {
        const { pending } = this
        if (!pending || ctx.parentSubagentRunId !== undefined) return undefined
        // ponytail: a chat is known by its agent name ('main' has none). The
        // root agents of one pick have different names.
        return (ctx.subagentName ?? null) === pending.from ? false : undefined
      },
    }
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
  return messages.findIndex((message) => {
    const tanstack = message.metadata?.tanstack
    return isRecord(tanstack) && tanstack.runId === runId
  })
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
