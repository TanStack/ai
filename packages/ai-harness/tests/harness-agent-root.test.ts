import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessAgent } from '../src'
import { mockAdapter, storedThreadState, text, toolCall } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { AnyHarness, HarnessRouting } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** A tool of the child harness, so its model has a tool call to keep. */
const lookup = toolDefinition({
  name: 'lookup',
  description: 'Looks a thing up',
  inputSchema: z.object({}),
}).server(async () => 'found')

/** The child harness of the `desk` root agent, and its model. */
function deskHarness(replies: Array<Reply>) {
  const model = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/desk',
    adapter: model.adapter,
    tools: [lookup],
  })
  return { harness, model }
}

/** The stores of a host. A second host on the same stores reads the same log. */
function stores() {
  return {
    log: memoryLogStore(),
    metadata: memoryPersistence().stores.metadata,
  }
}

/**
 * Open the routed thread on a new host. Its only root agent is the
 * harnessAgent `desk` of `child`.
 */
async function openRouted(options: {
  child: AnyHarness
  router: HarnessRouting['router']
  mainReplies?: Array<Reply>
  stores?: ReturnType<typeof stores>
}) {
  const { log, metadata } = options.stores ?? stores()
  const main = mockAdapter(options.mainReplies ?? [])
  const host = createHarnessHost({ persistence: { stores: { log, metadata } } })
  const session = await host.open(
    defineHarness({
      name: 'test/front',
      adapter: main.adapter,
      agents: [harnessAgent(options.child, { name: 'desk' })],
      routing: { router: options.router },
    }),
    { threadId: THREAD },
  )
  return { host, session, main, log }
}

/**
 * The text that the user sent in each user message of one model call: the
 * string, or the last text part. The parts before it are the context.
 */
const userTexts = (call: { messages: Array<ModelMessage> }) =>
  call.messages
    .filter((message) => message.role === 'user')
    .map((message) =>
      typeof message.content === 'string'
        ? message.content
        : (message.content ?? []).findLast((part) => part.type === 'text')
            ?.content,
    )

/** The names of the tool calls in the messages of one model call. */
const calledTools = (call: { messages: Array<ModelMessage> }) =>
  call.messages.flatMap((message) =>
    (message.toolCalls ?? []).map((entry) => entry.function.name),
  )

/** A router that picks `picks[n]` on turn `n`. */
function picksInOrder(picks: Array<string | undefined>) {
  let turn = 0
  return () => picks[turn++]
}

describe('harnessAgent as a routed root agent', () => {
  it('keeps one child session, so turn 2 sees turn 1 and its own tool call', async () => {
    const desk = deskHarness([
      () => toolCall('lookup', {}, 'call-lookup'),
      () => text('Looked it up.'),
      () => text('Second answer.'),
    ])
    const { host, session } = await openRouted({
      child: desk.harness,
      router: () => 'desk',
    })

    await session.send('first question')
    await session.send('second question')

    const turn2 = desk.model.calls[2]
    expect(userTexts(turn2)).toEqual(['first question', 'second question'])
    expect(calledTools(turn2)).toEqual(['lookup'])
    expect(
      turn2.messages.some(
        (message: ModelMessage) =>
          message.role === 'tool' && message.content === 'found',
      ),
    ).toBe(true)
    await host.close()
  })

  it('sends what main said since its last turn, labeled main:', async () => {
    const desk = deskHarness([
      () => text('Desk one.'),
      () => text('Desk three.'),
    ])
    const { host, session } = await openRouted({
      child: desk.harness,
      router: picksInOrder(['desk', 'main', 'desk']),
      mainReplies: [() => text('Main two.')],
    })

    await session.send('first')
    await session.send('second')
    await session.send('third')

    const turn3 = desk.model.calls[1]
    const input = turn3.messages.at(-1)
    expect(input.role).toBe('user')
    expect(input.content).toEqual([
      {
        type: 'text',
        content: [
          'Since your last turn:',
          // Its own hand-back is in its own session, so it is not here.
          'user:\nsecond',
          'main:\nMain two.',
          'main handed off to desk.',
        ].join('\n\n'),
      },
      { type: 'text', content: 'third' },
    ])
    // The earlier turn of the desk stays in its own session once.
    expect(userTexts(turn3).filter((entry) => entry === 'first')).toHaveLength(
      1,
    )
    await host.close()
  })

  it('hands back to main with the handoff tool, and main stays active', async () => {
    const desk = deskHarness([() => toolCall('handoff', { to: 'main' })])
    const { host, session, main, log } = await openRouted({
      child: desk.harness,
      router: picksInOrder(['desk', undefined]),
      mainReplies: [() => text('Main took over.'), () => text('Main again.')],
    })

    const first = await session.send('help')

    // The child model has the outer handoff tool, to main only.
    const tool = desk.model.calls[0].tools.find(
      (entry: { name: string }) => entry.name === 'handoff',
    )
    expect(tool.inputSchema.properties.to).toEqual({
      type: 'string',
      enum: ['main'],
    })
    // The child stopped after the handoff, and main answered in the turn.
    expect(desk.model.calls).toHaveLength(1)
    expect(first.text).toContain('Main took over.')
    // The call is in the child thread, so the shared thread gets the note.
    // Main reads who handed the conversation back, as text of another
    // speaker, not as a call of its own.
    const transcript = await session.transcript()
    expect(
      transcript.find(
        (message) =>
          message.role === 'tool' &&
          message.content === 'Handed off to main. main answers next.',
      )?.metadata?.harness,
    ).toEqual({ agent: 'desk', handoff: { by: 'tool' } })
    expect(main.calls[0].messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'desk handed off to main.',
    })
    expect(
      (await storedThreadState(log, { threadId: THREAD })).activeAgent,
    ).toBeNull()

    expect((await session.send('more')).text).toBe('Main again.')
    expect(desk.model.calls).toHaveLength(1)
    expect(main.calls).toHaveLength(2)
    await host.close()
  })

  it('does not resend the original user message when invoked again in the same turn', async () => {
    const desk = deskHarness([
      () => toolCall('handoff', { to: 'main' }),
      () => text('Desk again.'),
    ])
    const { host, session } = await openRouted({
      child: desk.harness,
      router: () => 'desk',
      mainReplies: [() => toolCall('handoff', { to: 'desk' })],
    })

    await session.send('refund please')

    expect(desk.model.calls).toHaveLength(2)
    const second = desk.model.calls[1]
    expect(
      userTexts(second).filter((entry) => entry === 'refund please'),
    ).toHaveLength(1)
    expect(userTexts(second).at(-1)).not.toBe('refund please')
    await host.close()
  })

  it('fails the turn when the child harness has its own routing', async () => {
    const model = mockAdapter([() => text('Never.')])
    const child = defineHarness({
      name: 'test/routed-child',
      adapter: model.adapter,
      agents: [
        defineAgent({
          name: 'inner',
          description: 'An inner agent',
          run: async () => 'Inner.',
        }),
      ],
      routing: { router: () => undefined },
    })
    const { host, session } = await openRouted({
      child,
      router: () => 'desk',
    })

    await expect(session.send('hi')).rejects.toThrow(
      'A harnessAgent that is a root agent cannot have its own routing. Remove routing from "test/routed-child".',
    )
    expect(model.calls).toHaveLength(0)
    await host.close()
  })

  it('opens the kept child thread again on a new host', async () => {
    const desk = deskHarness([
      () => toolCall('lookup', {}, 'call-lookup'),
      () => text('Looked it up.'),
      () => text('Second answer.'),
      () => text('Third answer.'),
    ])
    const kept = stores()
    const before = await openRouted({
      child: desk.harness,
      router: () => 'desk',
      stores: kept,
    })
    await before.session.send('first question')
    await before.session.send('second question')
    await before.host.close()

    const after = await openRouted({
      child: desk.harness,
      router: () => 'desk',
      stores: kept,
    })
    await after.session.send('third question')

    const turn3 = desk.model.calls[3]
    expect(userTexts(turn3)).toEqual([
      'first question',
      'second question',
      'third question',
    ])
    expect(calledTools(turn3)).toEqual(['lookup'])
    await after.host.close()
  })
})
