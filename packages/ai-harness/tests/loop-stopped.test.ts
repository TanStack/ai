import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, maxIterations, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '../src'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text, toolCall } from './helpers'
import type { ModelMessage } from '@tanstack/ai'
import type { InputSettlement } from '../src'
import type { Reply } from './helpers'

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look something up',
  inputSchema: z.object({ q: z.string() }),
}).server(async () => ({ found: true }))

/** A harness with `maxIterations(2)`, its host session, and a client. */
async function open(replies: Array<Reply>) {
  const { adapter, calls } = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/loop-stopped',
    adapter,
    tools: [lookup],
    agentLoopStrategy: maxIterations(2),
  })
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: () => ({ id: 'u' }),
      rules: { isAllowed: () => true },
    },
  })
  const handler = createHarnessHandler({ host, harness })
  const client = createHarnessClient<typeof harness>({
    url: 'http://local/api/harness/',
    threadId: 't1',
    fetch: (input, init) => handler(new Request(input, init)),
  })
  const session = await host.open(harness, {
    threadId: 't1',
    user: { id: 'u' },
  })
  return { host, session, client, calls }
}

/** The first `harness.input.settled` value that the client reads. */
async function clientSettlement(
  client: Awaited<ReturnType<typeof open>>['client'],
): Promise<InputSettlement | undefined> {
  for await (const { event } of client.events({
    from: '0',
    signal: AbortSignal.timeout(2_000),
  })) {
    if (
      event.type === EventType.CUSTOM &&
      event.name === HARNESS_EVENTS.inputSettled
    ) {
      return event.value
    }
  }
  return undefined
}

const loopStoppedOf = (message: ModelMessage | undefined) => {
  const metadata = message?.metadata
  if (typeof metadata !== 'object' || metadata === null) return undefined
  const tanstack: unknown = 'tanstack' in metadata ? metadata.tanstack : null
  if (typeof tanstack !== 'object' || tanstack === null) return undefined
  return 'loopStopped' in tanstack ? tanstack.loopStopped : undefined
}

describe('a turn that the agent loop stops', () => {
  it('settles completed with loopStopped, for the session and the client', async () => {
    const { host, session, client, calls } = await open([
      () => toolCall('lookup', { q: 'a' }, 'call-1'),
      () => toolCall('lookup', { q: 'b' }, 'call-2'),
      () => text('never'),
    ])

    await session.send('look it up', { inputId: 'in-1' })

    expect(calls).toHaveLength(2)
    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
      loopStopped: true,
    })
    expect(await clientSettlement(client)).toMatchObject({
      inputId: 'in-1',
      outcome: 'completed',
      loopStopped: true,
    })
    const assistant = (await client.transcript()).findLast(
      (message) => message.role === 'assistant',
    )
    expect(loopStoppedOf(assistant)).toBe(true)
    await host.close()
  })

  it('has no loopStopped when the model ends the turn', async () => {
    const { host, session, client } = await open([
      () => toolCall('lookup', { q: 'a' }, 'call-1'),
      () => text('Found it.'),
    ])

    await session.send('look it up', { inputId: 'in-1' })

    const settlement = await session.settled({ inputId: 'in-1' })
    expect(settlement).toMatchObject({ outcome: 'completed' })
    expect(settlement).not.toHaveProperty('loopStopped')
    expect(await clientSettlement(client)).not.toHaveProperty('loopStopped')
    const transcript = await client.transcript()
    expect(transcript.some((message) => loopStoppedOf(message))).toBe(false)
    await host.close()
  })
})
