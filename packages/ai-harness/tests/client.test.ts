import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHandler, createHarnessHost, defineHarness } from '../src'
import { createHarnessClient } from '../src/client'
import { gate, messageTexts, mockAdapter, text } from './helpers'
import type { SessionEvent } from '../src'

describe('createHarnessClient', () => {
  it('sends inputs, reads events, and gets a snapshot through the handler', async () => {
    const pricer = defineAgent({
      name: 'pricer',
      description: 'Prices a vendor',
      inputSchema: z.object({ vendor: z.string() }),
      run: async (ctx) => ({ cents: ctx.input.vendor.length }),
    })
    const { adapter } = mockAdapter([() => text('hello from the host')])
    const studio = defineHarness({
      name: 'test/client',
      adapter,
      agents: [pricer],
      expose: { agents: ['pricer'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: (request) =>
        request.headers.get('authorization') === 'Bearer t'
          ? { id: 'u' }
          : null,
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness/',
      threadId: 'thread-c',
      headers: { authorization: 'Bearer t' },
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const receipt = await client.prompt('hi')
    expect(receipt.status).toBe('accepted')

    const controller = new AbortController()
    const seen: Array<SessionEvent> = []
    for await (const entry of client.events({ signal: controller.signal })) {
      seen.push(entry)
      if (
        entry.event.type === 'CUSTOM' &&
        entry.event.name === 'harness.operation.finished'
      ) {
        controller.abort()
      }
    }
    expect(JSON.stringify(seen)).toContain('hello from the host')

    const agent = await client.agents.pricer.start({ vendor: 'acme' })
    expect(agent.status).toBe('accepted')
    // @ts-expect-error the input is typed from the harness
    void client.agents.pricer.start({ vendor: 1 })

    const snapshot = await client.snapshot()
    expect(snapshot.threadId).toBe('thread-c')
    await host.close()
  })

  it('sends an inputId, so a retry gets the first receipt', async () => {
    const { adapter, calls } = mockAdapter([() => text('once')])
    const studio = defineHarness({ name: 'test/client-ids', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: () => ({ id: 'u' }),
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-ids',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const first = await client.prompt('hi', { inputId: 'req-1' })
    const retry = await client.prompt('hi', { inputId: 'req-1' })
    const steer = await client.steer('also', { inputId: 'req-2' })
    const steerRetry = await client.steer('also', { inputId: 'req-2' })

    expect(first).toMatchObject({ inputId: 'req-1', status: 'accepted' })
    expect(retry).toEqual(first)
    expect(steerRetry).toEqual(steer)
    expect(calls.length).toBeLessThanOrEqual(2)
    await host.close()
  })

  it('sends continue, and the model answers the stored transcript', async () => {
    const { adapter, calls } = mockAdapter([() => text('went')])
    const studio = defineHarness({ name: 'test/client-continue', adapter })
    const persistence = memoryPersistence()
    await persistence.stores.messages.saveThread('thread-go', [
      { id: 'u1', role: 'user', content: 'go' },
    ])
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: () => ({ id: 'u' }),
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-go',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const receipt = await client.continue({ inputId: 'c-1' })

    expect(receipt).toMatchObject({ inputId: 'c-1', status: 'accepted' })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0])).toEqual(['go'])
    await host.close()
  })

  it('sends ephemeral messages with prompt and continue, and no store keeps them', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('one'),
      () => text('two'),
    ])
    const studio = defineHarness({ name: 'test/client-ephemeral', adapter })
    const persistence = memoryPersistence()
    const { messages } = persistence.stores
    await messages.saveThread('thread-eph', [
      { id: 'u1', role: 'user', content: 'go' },
    ])
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: () => ({ id: 'u' }),
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-eph',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    await client.continue({ ephemeral: [{ role: 'user', content: 'note 1' }] })
    await client.prompt('again', {
      ephemeral: [{ role: 'user', content: 'note 2' }],
    })
    await vi.waitFor(async () =>
      expect(await messages.loadThread('thread-eph')).toHaveLength(4),
    )

    expect(messageTexts(calls[0])).toEqual(['go', 'note 1'])
    expect(messageTexts(calls[1])).toEqual(['go', 'one', 'again', 'note 2'])
    expect(
      JSON.stringify(await messages.loadThread('thread-eph')),
    ).not.toContain('note')
    await host.close()
  })

  it('throws on a refused request instead of retrying', async () => {
    const { adapter } = mockAdapter([])
    const studio = defineHarness({ name: 'test/client-denied', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: () => null,
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    await expect(client.prompt('hi')).rejects.toThrow('401')
    await expect(async () => {
      for await (const _ of client.events()) break
    }).rejects.toThrow('401')
    await host.close()
  })
})

describe('client.sendToAgent', () => {
  it('sends a message to an agent run, as the request principal', async () => {
    const hold = gate()
    const drafter = defineAgent({
      name: 'drafter',
      description: 'Drafts when the test lets it',
      inputSchema: z.object({ topic: z.string() }),
      run: async (ctx) => {
        await hold.opened
        return `a draft about ${ctx.input.topic}`
      },
    })
    const studio = defineHarness({
      name: 'test/client-agent-messages',
      adapter: mockAdapter([]).adapter,
      agents: [drafter],
      expose: { agents: ['drafter'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      authorize: () => ({ id: 'u' }),
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-m',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const started = await client.agents.drafter.start({ topic: 'tea' })
    const receipt = await client.sendToAgent(
      started.operationId ?? '',
      'Add a title.',
      { mode: 'followUp', inputId: 'm-1' },
    )

    expect(receipt).toMatchObject({ inputId: 'm-1', status: 'queued' })
    const session = await host.open(studio, { threadId: 'thread-m' })
    expect(session.agentRuns()).toMatchObject([
      { operationId: started.operationId, agent: 'drafter' },
      {
        operationId: receipt.operationId,
        status: 'queued',
        principal: { id: 'u' },
      },
    ])
    hold.open()
    await host.close()
  })
})
