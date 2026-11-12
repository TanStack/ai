import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { TurnHandoffs } from '../src/handoff'
import type { AnyTool } from '@tanstack/ai'
import type { HandoffToolContext } from '../src'
import type { HandoffRecord } from '../src/log-records'

function agent(name: string) {
  return defineAgent({
    name,
    description: `The ${name} desk`,
    run: async () => name,
  })
}

const ROOTS = [agent('billing'), agent('triage')]

/** The middleware context of the main model's chat. */
const MAIN = {}
/** The middleware context of the chat of root agent `name`. */
const rootChat = (name: string) => ({ subagentName: name })

/** `TurnHandoffs` with a fake log: `records` gets each published record. */
function turnHandoffs(
  options: {
    humans?: boolean
    tool?: boolean
    handoffTool?: (ctx: HandoffToolContext) => AnyTool
  } = {},
) {
  const records: Array<HandoffRecord> = []
  const handoffs = new TurnHandoffs({
    runId: 'run_1',
    noteKey: 'input_1',
    rootAgents: ROOTS,
    subagents: [],
    humans: options.humans ?? false,
    tool: options.tool ?? true,
    append: async (record) => record,
    publish: (record) => {
      records.push(record)
    },
    ...(options.handoffTool ? { handoffTool: options.handoffTool } : {}),
  })
  return { handoffs, records }
}

/** A `handoffTool` factory that keeps each context it gets. */
function transferFactory(name = 'transfer') {
  const contexts: Array<HandoffToolContext> = []
  const factory = (ctx: HandoffToolContext) => {
    contexts.push(ctx)
    return toolDefinition({
      name,
      description: 'Move the user to another desk.',
      inputSchema: z.object({ to: z.string(), note: z.string() }),
    }).server(async ({ to, note }) => {
      await ctx.handoff({ to, note })
      return `Moved to ${to}.`
    })
  }
  return { contexts, factory }
}

/** An app tool named `handoff`. */
const appHandoff = toolDefinition({
  name: 'handoff',
  description: 'The app hands off.',
  inputSchema: z.object({ to: z.string() }),
}).server(async ({ to }) => `App moved to ${to}.`)

/** The one record of `records`. */
function onlyRecord(records: Array<HandoffRecord>) {
  expect(records).toHaveLength(1)
  const [record] = records
  if (!record) throw new Error('No handoff record.')
  return record
}

describe('routing.handoffTool factory', () => {
  it.each([true, false])(
    'gets the speaker, its targets, and allowHuman %s',
    (humans) => {
      const { contexts, factory } = transferFactory()
      const { handoffs } = turnHandoffs({ humans, handoffTool: factory })

      handoffs.tool(null)
      handoffs.tool('billing')

      expect(
        contexts.map(({ from, targets, allowHuman }) => ({
          from,
          targets,
          allowHuman,
        })),
      ).toEqual([
        { from: null, targets: ['billing', 'triage'], allowHuman: humans },
        { from: 'billing', targets: ['triage', 'main'], allowHuman: humans },
      ])
    },
  )

  it('records a handoff of the factory tool with by tool, and adds a note only for a root agent', async () => {
    const { factory } = transferFactory()
    const { handoffs, records } = turnHandoffs({ handoffTool: factory })

    const result = await handoffs
      .tool('billing')
      .execute?.({ to: 'triage', note: 'Needs a ticket' })

    expect(result).toBe('Moved to triage.')
    const record = onlyRecord(records)
    expect(record).toEqual({
      runId: 'run_1',
      from: 'billing',
      to: 'triage',
      note: 'Needs a ticket',
      by: 'tool',
    })
    // A root agent keeps its tool calls in its own transcript, so the shared
    // thread gets the note pair. The main model's call is in the thread.
    expect(handoffs.messages(record)).toMatchObject([
      {
        role: 'assistant',
        toolCalls: [{ function: { name: 'handoff' } }],
        metadata: { harness: { agent: 'billing', handoff: { by: 'tool' } } },
      },
      { role: 'tool', content: 'Handed off to triage. triage answers next.' },
    ])
    expect(handoffs.messages({ ...record, from: null })).toEqual([])
  })

  it('keeps the default handoff tool when no factory is set', async () => {
    const { handoffs, records } = turnHandoffs()
    const tool = handoffs.tool(null)

    const result = await tool.execute?.({ to: 'billing' })

    expect(tool.name).toBe('handoff')
    expect(result).toBe('Handed off to billing. billing answers next.')
    expect(onlyRecord(records)).toEqual({
      runId: 'run_1',
      from: null,
      to: 'billing',
      by: 'tool',
    })
  })
})

describe('a code handoff inside a handoff tool call', () => {
  it('records by tool while a handoff-named call runs', async () => {
    const { handoffs, records } = turnHandoffs()
    const middleware = handoffs.middleware()

    await middleware.onGuardToolCall(MAIN, {
      toolName: 'handoff',
      toolCallId: 'call_1',
    })
    await handoffs.handoff({ to: 'billing', note: 'Refund' }, null, 'code')

    expect(onlyRecord(records).by).toBe('tool')
  })

  it('records by code after the handoff-named call ends', async () => {
    const { handoffs, records } = turnHandoffs()
    const middleware = handoffs.middleware()

    await middleware.onGuardToolCall(MAIN, {
      toolName: 'handoff',
      toolCallId: 'call_1',
    })
    await middleware.onAfterToolCall(MAIN, { toolCallId: 'call_1' })
    await handoffs.handoff({ to: 'billing' }, null, 'code')

    expect(onlyRecord(records).by).toBe('code')
  })

  it('records by code inside a call of another tool', async () => {
    const { handoffs, records } = turnHandoffs()
    const middleware = handoffs.middleware()

    await middleware.onGuardToolCall(MAIN, {
      toolName: 'search',
      toolCallId: 'call_1',
    })
    await handoffs.handoff({ to: 'billing' }, null, 'code')

    expect(onlyRecord(records).by).toBe('code')
  })
})

describe('the handoff tool of a root agent', () => {
  it('adds no tool and never calls the factory with giveModelsHandoffTool false', async () => {
    const { contexts, factory } = transferFactory()
    const { handoffs } = turnHandoffs({ tool: false, handoffTool: factory })
    const middleware = handoffs.middleware({ roots: true })

    const change = middleware.onConfig(rootChat('billing'), { tools: [] })
    await middleware.onGuardToolCall(rootChat('billing'), {
      toolName: 'transfer',
      toolCallId: 'call_1',
    })

    expect(change).toBeUndefined()
    expect(contexts).toEqual([])
  })

  it('keeps an app tool with the handoff name only for the agent that has it', () => {
    const { factory } = transferFactory('handoff')
    const { handoffs } = turnHandoffs({ handoffTool: factory })
    const middleware = handoffs.middleware({ roots: true })

    const billing = middleware.onConfig(rootChat('billing'), {
      tools: [appHandoff],
    })
    const triage = middleware.onConfig(rootChat('triage'), { tools: [] })

    expect(billing).toBeUndefined()
    expect(triage).toEqual({ tools: [handoffs.tool('triage')] })
    // The next model call of triage has the tool already.
    expect(
      middleware.onConfig(rootChat('triage'), { tools: triage?.tools ?? [] }),
    ).toBeUndefined()
  })
})
