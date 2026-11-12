import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, ModelMessage } from '@tanstack/ai'
import type { AnyAgent, HarnessRouting } from '../src'
import type { Reply } from './helpers'

/** A session whose harness routes, with `routing.history`. */
async function openRouting(options: {
  agents: ReadonlyArray<AnyAgent>
  router: HarnessRouting['router']
  history?: HarnessRouting['history']
  replies?: Array<Reply>
}) {
  const { metadata } = memoryPersistence().stores
  const main = mockAdapter(options.replies ?? [])
  const host = createHarnessHost({
    persistence: { stores: { log: memoryLogStore(), metadata } },
    credentials: memoryCredentialStore(),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/routing-history',
      adapter: main.adapter,
      agents: options.agents,
      routing: {
        router: options.router,
        ...(options.history ? { history: options.history } : {}),
      },
    }),
    { threadId: 't1', user: { id: 'user-1' } },
  )
  return { host, session, main }
}

/** An agent that answers with its own model and tools. */
function modelAgent(
  name: string,
  replies: Array<Reply>,
  tools: ReadonlyArray<AnyTool> = [],
) {
  const model = mockAdapter(replies)
  const agent = defineAgent({
    name,
    description: `The ${name} desk`,
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [...tools] }),
  })
  return { agent, model }
}

/** A tool that answers `ok`. */
function plainTool(name: string) {
  return toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => 'ok')
}

/** A router that picks an agent for some inputs, else the active agent. */
const routeBy =
  (picks: Record<string, string>): HarnessRouting['router'] =>
  ({ input }) =>
    typeof input === 'string' ? picks[input] : undefined

/** The names of the tool calls in the messages of one model call. */
function calledTools(call: { messages: Array<ModelMessage> }) {
  return call.messages.flatMap((message) =>
    (message.toolCalls ?? []).map((made) => made.function.name),
  )
}

/** The tool call ids that have a tool result in one model call. */
function answeredCalls(call: { messages: Array<ModelMessage> }) {
  return call.messages.flatMap((message) =>
    message.role === 'tool' && message.toolCallId !== undefined
      ? [message.toolCallId]
      : [],
  )
}

/** billing calls `refund`, then answers. A later turn answers `Welcome`. */
function refundingBilling() {
  return modelAgent(
    'billing',
    [
      () => toolCall('refund', {}, 'call_r'),
      () => text('Refunded'),
      () => text('Welcome'),
    ],
    [plainTool('refund')],
  )
}

describe('routing.history', () => {
  it("'own' gives a routed agent its own earlier tool calls", async () => {
    const billing = refundingBilling()
    const { host, session } = await openRouting({
      agents: [billing.agent],
      router: routeBy({ 'refund please': 'billing' }),
    })

    await session.send('refund please')
    expect((await session.send('thanks')).text).toBe('billing:\nWelcome')

    const later = billing.model.calls[2]
    expect(calledTools(later)).toContain('refund')
    expect(answeredCalls(later)).toContain('call_r')
    expect(messageTexts(later)).toContain('Refunded')
    expect(messageTexts(later)).not.toContain('billing:\nRefunded')
    await host.close()
  })

  it("'own' gives the main model a routed run as text only", async () => {
    const billing = refundingBilling()
    const { host, session, main } = await openRouting({
      agents: [billing.agent],
      router: routeBy({ 'refund please': 'billing', 'ask main': 'main' }),
      replies: [() => text('Main here')],
    })

    await session.send('refund please')
    expect((await session.send('ask main')).text).toBe('Main here')

    const [call] = main.calls
    expect(calledTools(call)).not.toContain('refund')
    expect(messageTexts(call)).toContain('billing:\nRefunded')
    await host.close()
  })

  it("'all' gives the main model the tool calls of a routed run", async () => {
    const billing = refundingBilling()
    const { host, session, main } = await openRouting({
      agents: [billing.agent],
      router: routeBy({ 'refund please': 'billing', 'ask main': 'main' }),
      history: 'all',
      replies: [() => text('Main here')],
    })

    await session.send('refund please')
    await session.send('ask main')

    const [call] = main.calls
    expect(calledTools(call)).toContain('refund')
    expect(answeredCalls(call)).toContain('call_r')
    expect(messageTexts(call)).not.toContain('billing:\nRefunded')
    await host.close()
  })

  it("'text' gives a routed agent its earlier run as text only", async () => {
    const billing = refundingBilling()
    const { host, session } = await openRouting({
      agents: [billing.agent],
      router: routeBy({ 'refund please': 'billing' }),
      history: 'text',
    })

    await session.send('refund please')
    await session.send('thanks')

    const later = billing.model.calls[2]
    expect(calledTools(later)).not.toContain('refund')
    expect(messageTexts(later)).toContain('billing:\nRefunded')
    await host.close()
  })

  it("'own' gives a routed agent the handoff of main as a text line", async () => {
    const billing = modelAgent('billing', [
      () => text('Refunded'),
      () => text('Welcome'),
    ])
    const { host, session } = await openRouting({
      agents: [billing.agent],
      router: () => undefined,
      replies: [
        () =>
          toolCall('handoff', { to: 'billing', note: 'order 42' }, 'call_h'),
      ],
    })

    expect((await session.send('refund please')).text).toBe(
      'billing:\nRefunded',
    )
    await session.send('thanks')

    const later = billing.model.calls[1]
    expect(answeredCalls(later)).not.toContain('call_h')
    expect(messageTexts(later)).toContain(
      'main handed off to billing. Note: order 42',
    )
    await host.close()
  })

  it('gives each pass of a turn with two routed passes to its own agent', async () => {
    const billing = modelAgent(
      'billing',
      [
        () => toolCall('refund', {}, 'call_r'),
        () => [
          ...text('Passing you to research.'),
          ...toolCall('handoff', { to: 'research' }, 'call_hb'),
        ],
        () => text('Back in billing'),
      ],
      [plainTool('refund')],
    )
    const research = modelAgent(
      'research',
      [() => toolCall('search', {}, 'call_s'), () => text('Found 3 papers.')],
      [plainTool('search')],
    )
    const { host, session } = await openRouting({
      agents: [billing.agent, research.agent],
      router: routeBy({
        'refund please': 'billing',
        'back to billing': 'billing',
      }),
    })

    expect((await session.send('refund please')).text).toBe(
      'research:\nFound 3 papers.',
    )
    await session.send('back to billing')

    const later = billing.model.calls[2]
    expect(calledTools(later)).toContain('refund')
    expect(calledTools(later)).not.toContain('search')
    expect(answeredCalls(later)).toEqual(
      expect.arrayContaining(['call_r', 'call_hb']),
    )
    expect(messageTexts(later)).toContain('research:\nFound 3 papers.')
    await host.close()
  })

  it('gives a resumed routed agent the messages of its paused run', async () => {
    // No server implementation: the turn waits for the result of the client.
    const openScreen = toolDefinition({
      name: 'openScreen',
      description: 'Open a screen',
      inputSchema: z.object({}),
    })
    const billing = modelAgent(
      'billing',
      [() => toolCall('openScreen', {}, 'call_o'), () => text('Screen open')],
      [openScreen],
    )
    const { host, session } = await openRouting({
      agents: [billing.agent],
      router: routeBy({ 'open it': 'billing' }),
    })

    const [interrupt] = (await session.send('open it')).interrupts ?? []
    if (!interrupt) throw new Error('No client tool interrupt.')
    await session.resolve({
      resume: [{ interruptId: interrupt.id, status: 'resolved', payload: {} }],
      inputId: 'opened',
    })
    expect(await session.settled({ inputId: 'opened' })).toMatchObject({
      outcome: 'completed',
    })

    const resumed = billing.model.calls[1]
    const opened = calledTools(resumed).filter((name) => name === 'openScreen')
    expect(opened).toEqual(['openScreen'])
    const answered = answeredCalls(resumed).filter((id) => id === 'call_o')
    expect(answered).toEqual(['call_o'])
    expect(messageTexts(resumed)).toContain('open it')
    await host.close()
  })
})
