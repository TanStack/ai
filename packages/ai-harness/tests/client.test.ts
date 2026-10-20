import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  logMessageStore,
  membersOnly,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { gate, messageTexts, mockAdapter, text } from './helpers'
import type { SessionEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }) =>
          request.headers.get('authorization') === 'Bearer t'
            ? { id: 'u' }
            : null,
        rules: { isAllowed: () => true },
      },
    })
    const handler = createHarnessHandler({ host, harness: studio })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness/',
      threadId: 'thread-c',
      headers: { authorization: 'Bearer t' },
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const receipt = await client.send('hi')
    expect(receipt.status).toBe('accepted')

    const controller = new AbortController()
    const seen: Array<SessionEvent> = []
    // From the start: the turn can send its events before this read.
    for await (const entry of client.events({
      from: '0',
      signal: controller.signal,
    })) {
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
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-ids',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const first = await client.send('hi', { inputId: 'req-1' })
    const retry = await client.send('hi', { inputId: 'req-1' })
    const steer = await client.send('also', { mode: 'steer', inputId: 'req-2' })
    const steerRetry = await client.send('also', {
      mode: 'steer',
      inputId: 'req-2',
    })

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
    await logMessageStore({ store: persistence.stores.log }).saveThread(
      'thread-go',
      [{ id: 'u1', role: 'user', content: 'go' }],
    )
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-go',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const receipt = await client.continueWithoutMessage({ inputId: 'c-1' })

    expect(receipt).toMatchObject({ inputId: 'c-1', status: 'accepted' })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(messageTexts(calls[0])).toEqual(['go'])
    await host.close()
  })

  it('runs an exposed tool with typed args, and refuses an append it does not expose', async () => {
    const stats = toolDefinition({
      name: 'fetch_stats',
      description: 'Stats of a queue',
      inputSchema: z.object({ queue: z.string() }),
    }).server(async ({ queue }) => ({ queue, open: 7 }))
    const { adapter, calls } = mockAdapter([])
    const studio = defineHarness({
      name: 'test/client-tool',
      adapter,
      tools: [stats],
      expose: { tools: ['fetch_stats'] },
    })
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-tool',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    expect(
      await client.runTool({
        name: 'fetch_stats',
        args: { queue: 'billing' },
        inputId: 't-1',
      }),
    ).toMatchObject({ inputId: 't-1', status: 'accepted' })
    void client
      .runTool({
        name: 'fetch_stats',
        // @ts-expect-error `queue` must be a string.
        args: { queue: 1 },
      })
      .catch(() => {})
    await waitFor(async () =>
      expect(
        JSON.stringify(
          await logMessageStore({ store: persistence.stores.log }).loadThread(
            'thread-tool',
          ),
        ),
      ).toContain('billing'),
    )
    expect(calls).toHaveLength(0)
    expect(
      await client.appendRecords({ records: [{ type: 'app.signal' }] }),
    ).toMatchObject({
      status: 'rejected',
      reason: 'not_exposed',
    })
    await host.close()
  })

  it('sends ephemeral messages with prompt and continue, and no store keeps them', async () => {
    const { adapter, calls } = mockAdapter([
      () => text('one'),
      () => text('two'),
    ])
    const studio = defineHarness({ name: 'test/client-ephemeral', adapter })
    const persistence = memoryPersistence()
    // The thread is in the default tenant.
    const messages = logMessageStore({ store: persistence.stores.log })
    const key = 'thread-eph'
    await messages.saveThread(key, [{ id: 'u1', role: 'user', content: 'go' }])
    const host = createHarnessHost({ persistence })
    const handler = createHarnessHandler({
      host,
      harness: studio,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-eph',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    await client.continueWithoutMessage({
      ephemeral: [{ role: 'user', content: 'note 1' }],
    })
    await client.send('again', {
      ephemeral: [{ role: 'user', content: 'note 2' }],
    })
    await waitFor(async () =>
      expect(await messages.loadThread(key)).toHaveLength(4),
    )

    expect(messageTexts(calls[0])).toEqual(['go', 'note 1'])
    expect(messageTexts(calls[1])).toEqual(['go', 'one', 'again', 'note 2'])
    expect(JSON.stringify(await messages.loadThread(key))).not.toContain('note')
    await host.close()
  })

  it('throws on a refused request instead of retrying', async () => {
    const { adapter } = mockAdapter([])
    const studio = defineHarness({ name: 'test/client-denied', adapter })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: () => null, rules: { isAllowed: () => true } },
    })
    const handler = createHarnessHandler({ host, harness: studio })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    await expect(client.send('hi')).rejects.toThrow('401')
    await expect(async () => {
      for await (const _ of client.events()) break
    }).rejects.toThrow('401')
    await host.close()
  })
})

describe('client.events with no from', () => {
  it('starts at the head, so it does not send the old events again', async () => {
    const { adapter } = mockAdapter([
      () => text('the old answer'),
      () => text('the new answer'),
    ])
    const harness = defineHarness({ name: 'test/client-head', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof harness>({
      url: 'http://local/api/harness',
      threadId: 't-head',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const session = await host.open(harness, { threadId: 't-head' })
    await session.send('one')
    const { cursor } = await client.snapshot()

    const controller = new AbortController()
    const seen: Array<SessionEvent> = []
    const opened = gate()
    const reading = (async () => {
      const events = client.events({
        signal: controller.signal,
        onConnection: (state) => {
          if (state === 'open') opened.open()
        },
      })
      for await (const entry of events) {
        seen.push(entry)
        if (
          entry.event.type === 'CUSTOM' &&
          entry.event.name === 'harness.operation.finished'
        ) {
          controller.abort()
        }
      }
    })()
    // The read asks for the head first, then streams from it.
    await opened.opened
    await session.send('two')
    await reading

    const body = JSON.stringify(seen)
    expect(body).toContain('the new answer')
    expect(body).not.toContain('the old answer')
    expect(seen.every((entry) => Number(entry.cursor) > Number(cursor))).toBe(
      true,
    )
    await session.close()
    await host.close()
  })

  it('throws, with no retry, when the snapshot has no cursor', async () => {
    let reads = 0
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: async () => {
        reads += 1
        return Response.json({ status: 'idle' })
      },
    })

    await expect(async () => {
      for await (const _ of client.events()) break
    }).rejects.toThrow('no string "cursor"')
    expect(reads).toBe(1)
  })
})

describe('client.send to an agent run', () => {
  it('sends a message to an agent run, as the request user', async () => {
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
      openAccess: { user: { id: 'u' } },
    })
    const client = createHarnessClient<typeof studio>({
      url: 'http://local/api/harness',
      threadId: 'thread-m',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const started = await client.agents.drafter.start({ topic: 'tea' })
    const receipt = await client.send('Add a title.', {
      to: started.operationId ?? '',
      mode: 'followUp',
      inputId: 'm-1',
    })

    expect(receipt).toMatchObject({ inputId: 'm-1', status: 'queued' })
    const session = await host.open(studio, { threadId: 'thread-m' })
    expect(session.agentRuns()).toMatchObject([
      { operationId: started.operationId, agent: 'drafter' },
      {
        operationId: receipt.operationId,
        status: 'queued',
        user: { id: 'u' },
      },
    ])
    hold.open()
    await host.close()
  })
})

describe('client.sessions share and unshare', () => {
  it('shares a session with a user, unshares them, and throws for a missing thread', async () => {
    const studio = defineHarness({
      name: 'test/client-share',
      adapter: mockAdapter(() => text('ok')).adapter,
    })
    const users = new Map([
      ['olga', { id: 'olga' }],
      ['bea', { id: 'bea' }],
    ])
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }) =>
          users.get(request.headers.get('x-user') ?? '') ?? null,
        rules: membersOnly(),
      },
    })
    const handler = createHarnessHandler({ host, harness: studio })
    const clientOf = (userId: string) =>
      createHarnessClient<typeof studio>({
        url: 'http://local/api/harness',
        threadId: 't1',
        headers: { 'x-user': userId },
        fetch: (input, init) => handler(new Request(input, init)),
      })
    const olga = clientOf('olga')
    const bea = clientOf('bea')
    await olga.send('hi')

    const shared = await olga.sessions.share({
      threadId: 't1',
      userId: 'bea',
      role: 'viewer',
    })

    expect(shared.members).toEqual([
      { userId: 'olga', role: 'owner' },
      { userId: 'bea', role: 'viewer' },
    ])
    await expect(bea.transcript()).resolves.toBeDefined()

    const unshared = await olga.sessions.unshare({
      threadId: 't1',
      userId: 'bea',
    })

    expect(unshared.members).toEqual([{ userId: 'olga', role: 'owner' }])
    await expect(bea.transcript()).rejects.toThrow('403')
    await expect(
      olga.sessions.share({
        threadId: 't-none',
        userId: 'bea',
        role: 'member',
      }),
    ).rejects.toThrow('404')
    await host.close()
  })
})
