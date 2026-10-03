import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHandler,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessClient } from '../src/client'
import { mockAdapter, text } from './helpers'

const asker = definePlugin({
  name: 'test/asker',
  setup: () => ({
    config: { tone: configOption.text({ default: 'plain' }) },
    commands: {
      confirm: defineCommand({
        description: 'Ask, then answer',
        run: async (_input, ctx) =>
          `got ${String(await ctx.session.ask({ message: 'Sure?' }))}`,
      }),
    },
  }),
})

function setup(
  fetchWrap?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch,
) {
  const { adapter } = mockAdapter([() => text('hello from the host')])
  const harness = defineHarness({
    name: 'test/client-reads',
    adapter,
    plugins: () => [asker],
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const handler = createHarnessHandler({
    host,
    harness,
    authorize: () => ({ id: 'u' }),
    canAccess: (_principal, threadId) => threadId !== 'someone-else',
  })
  const direct: typeof globalThis.fetch = (input, init) =>
    handler(new Request(input, init))
  const client = createHarnessClient({
    url: 'http://local/api/harness',
    threadId: 'thread-r',
    fetch: fetchWrap ? fetchWrap(direct) : direct,
    reconnectDelayMs: 1,
  })
  return { host, client, handler }
}

describe('client reads and actions', () => {
  it('reads the transcript and the description', async () => {
    const { host, client } = setup()
    await client.prompt('hi')
    await vi.waitFor(async () =>
      expect(JSON.stringify(await client.transcript())).toContain(
        'hello from the host',
      ),
    )

    const description = await client.describe()

    expect(description.commands.map((command) => command.name)).toEqual([
      'confirm',
    ])
    expect(description.config).toEqual([
      expect.objectContaining({ key: 'tone', value: 'plain' }),
    ])
    await host.close()
  })

  it('runs a command, answers its question, and changes a setting', async () => {
    const { host, client } = setup()

    expect((await client.command('confirm')).status).toBe('accepted')
    await vi.waitFor(async () =>
      expect((await client.snapshot()).pendingQuestions).toHaveLength(1),
    )
    const [question] = (await client.snapshot()).pendingQuestions
    expect(
      (await client.answer(question?.questionId ?? '', 'yes')).status,
    ).toBe('accepted')
    await vi.waitFor(async () =>
      expect((await client.snapshot()).pendingQuestions).toHaveLength(0),
    )

    expect((await client.setConfig('tone', 'warm')).status).toBe('accepted')
    expect((await client.describe()).config[0]?.value).toBe('warm')
    await host.close()
  })

  it('refuses a read without a thread id, or for a thread the user may not open', async () => {
    const { host, handler } = setup()
    const statusOf = async (path: string) =>
      (await handler(new Request(`http://local/api/harness/${path}`))).status

    expect(await statusOf('transcript')).toBe(400)
    expect(await statusOf('describe')).toBe(400)
    expect(await statusOf('transcript?threadId=someone-else')).toBe(403)
    expect(await statusOf('describe?threadId=someone-else')).toBe(403)
    await host.close()
  })

  it('throws with the route and the status when a read fails', async () => {
    const { host, client } = setup(
      () => async () => new Response('down', { status: 500 }),
    )

    await expect(client.describe()).rejects.toThrow(
      'Harness describe failed (500)',
    )
    await host.close()
  })

  it('reports the connection state of the event stream', async () => {
    let calls = 0
    const { host, client } = setup((fetch) => async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/events') && calls++ === 0) {
        return new Response('down', { status: 500 })
      }
      return fetch(input, init)
    })
    const states: Array<string> = []
    const reader = new AbortController()
    const reading = (async () => {
      for await (const _entry of client.events({
        signal: reader.signal,
        onConnection: (state) => states.push(state),
      })) {
        // Only the connection states matter here.
      }
    })()

    await vi.waitFor(() => expect(states).toEqual(['reconnecting', 'open']))
    reader.abort()
    await reading
    await host.close()
  })
})
