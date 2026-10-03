import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHandler, createHarnessHost, defineHarness } from '../src'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text } from './helpers'
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
