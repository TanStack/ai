import { toolDefinition } from '@tanstack/ai'
import { isRecord } from './utils'
import type {
  AnyChatMiddleware,
  ModelMessage,
  SubagentRouterPick,
} from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import type { AnyAgent } from './agents'
import type { HarnessRouterPick } from './define'
import type { HandoffRecord } from './log-records'

/** What `ctx.harness.handoff` takes. */
export interface HandoffOptions {
  /** The root agent that answers next, or `'main'` for the main model. */
  to: string
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
      /** The agents a handoff can go to. */
      rootAgents: ReadonlyArray<AnyAgent>
      /** The names of the agents that are only subagents, for the error text. */
      subagents: ReadonlyArray<string>
      append: (record: HandoffRecord) => Promise<unknown>
      publish: (value: HandoffRecord) => void
    },
  ) {}

  /**
   * The pick that `chat()` runs for a router answer. A pick that changes who
   * answers the thread is a handoff with `by: 'router'`.
   */
  async route(
    chosen: HarnessRouterPick,
    activeAgent: string | null,
  ): Promise<SubagentRouterPick> {
    const { pick, handoff } = routerTarget(
      chosen,
      activeAgent,
      this.options.rootAgents,
    )
    if (handoff) await this.write({ ...handoff, by: 'router' })
    return pick
  }

  /**
   * Hand the turn from `from` (an agent name, or `null` for the main model)
   * to `options.to`. The part of `from` ends, and the target answers next.
   * Throws for a target that is not a root agent, and for a second handoff
   * in the same part.
   */
  async handoff(
    options: HandoffOptions,
    from: string | null,
    by: 'tool' | 'code',
  ): Promise<void> {
    const { to, note } = options
    if (typeof to !== 'string') {
      throw new Error('A handoff needs `to`: the name of a root agent.')
    }
    const names = this.options.rootAgents.map((agent) => agent.name)
    if (to !== 'main' && !names.includes(to)) {
      const kind = this.options.subagents.includes(to)
        ? `Agent "${to}" is only a subagent.`
        : `Unknown agent "${to}".`
      throw new Error(
        `${kind} A handoff goes to a root agent (${[...names, "'main'"].join(', ')}).`,
      )
    }
    const target = to === 'main' ? null : to
    if (target === from) {
      throw new Error(`${to} answers already. Hand off to another agent.`)
    }
    if (this.pending) {
      throw new Error(
        `This part handed off to ${this.pending.to ?? 'main'} already.`,
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
    }
    await this.write(handoff)
    this.pending = handoff
  }

  /** The handoff that ended the last part, once. */
  take(): Handoff | undefined {
    const { pending } = this
    this.pending = undefined
    return pending
  }

  /**
   * The `handoff` tool of `from`: the main model (`null`) or a root agent.
   * Its `to` lists the root agents, and `'main'` for an agent, but not
   * `from`.
   */
  tool(from: string | null) {
    const targets = [
      ...this.options.rootAgents.map((agent) => agent.name),
      ...(from === null ? [] : ['main']),
    ].filter((name) => name !== from)
    return toolDefinition({
      name: HANDOFF_TOOL,
      description:
        'Hand the conversation to another agent. That agent answers the user next, in this turn and in later turns. Stop after this call.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', enum: targets },
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
      if (typeof to !== 'string') {
        throw new Error('A handoff needs `to`: the name of an agent.')
      }
      await this.handoff(
        { to, ...(typeof note === 'string' ? { note } : {}) },
        from,
        'tool',
      )
      return `Handed off to ${to}. ${to} answers next.`
    })
  }

  /**
   * Middleware for the chat calls of a turn: a pending handoff stops the
   * tool loop of the part, so the target answers next. With `roots`, it
   * also gives each routed root agent its `handoff` tool. A nested child of
   * a root agent gets neither, so it cannot move the whole session.
   */
  middleware(options: { roots?: boolean } = {}): AnyChatMiddleware {
    return {
      name: 'harness:handoff',
      onConfig: (ctx, config) => {
        const isRoot =
          options.roots === true &&
          ctx.subagentName !== undefined &&
          ctx.parentSubagentRunId === undefined
        if (!isRoot) return
        if (config.tools.some((tool) => tool.name === HANDOFF_TOOL)) return
        return { tools: [...config.tools, this.tool(ctx.subagentName ?? null)] }
      },
      onShouldContinue: () => (this.pending ? false : undefined),
    }
  }

  private async write(handoff: Handoff) {
    this.count += 1
    const record = { ...handoff, runId: this.options.runId }
    await this.options.append(record)
    this.options.publish(record)
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
    // An active agent that this turn does not have (a plugin went away)
    // gives the turn to the main model.
    return {
      pick: activeAgent !== null && isRoot(activeAgent) ? activeAgent : 'main',
    }
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

/** The text of the routed message of run `runId`, when the thread has one. */
export async function routedText(
  store: MessageStore,
  threadId: string,
  runId: string,
) {
  const history = await store.loadThread(threadId)
  const content = history[routedIndex(history, runId)]?.content
  return typeof content === 'string' ? content : undefined
}

/**
 * Mark the routed message of run `runId` with the agent that wrote it, in
 * `metadata.harness.agent`. chat() writes that message again for each routed
 * part of the run, so `earlier` (the text of the parts before a handoff in
 * the same turn) goes back in front of it.
 *
 * ponytail: a resume of a later part writes the message again, and the text
 * of the earlier parts goes. Each agent keeps its own transcript all the same.
 */
export async function markRouted(
  store: MessageStore,
  threadId: string,
  runId: string,
  mark: { agent?: string; earlier?: string },
) {
  const { agent, earlier } = mark
  if (agent === undefined && earlier === undefined) return
  const history = await store.loadThread(threadId)
  const index = routedIndex(history, runId)
  const message = history[index]
  if (!message) return
  const own = typeof message.content === 'string' ? message.content : ''
  const content =
    earlier === undefined || own.startsWith(earlier)
      ? own
      : [earlier, own].filter((part) => part !== '').join('\n\n')
  const harness = isRecord(message.metadata?.harness)
    ? message.metadata.harness
    : {}
  const updated: ModelMessage = {
    ...message,
    content,
    metadata: {
      ...message.metadata,
      harness: { ...harness, ...(agent !== undefined ? { agent } : {}) },
    },
  }
  await store.saveThread(threadId, history.with(index, updated))
}
