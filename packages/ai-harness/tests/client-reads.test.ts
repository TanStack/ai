import { describe, expect, it, vi } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { mockAdapter, questionsOf, text, toolCall } from './helpers'

const asker = definePlugin({
  name: 'test/asker',
  setup: () => ({
    config: { tone: configOption.text({ default: 'plain' }) },
    commands: {
      confirm: defineCommand({
        description: 'Ask, then answer',
        run: async (_input, ctx) =>
          `got ${String(await ctx.step.ask({ name: 'sure', message: 'Sure?' }))}`,
      }),
    },
  }),
})

const user = { id: 'u' }

/** A host where `user` may use every thread but `someone-else`. */
const accessHost = () =>
  createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: () => user,
      rules: {
        isAllowed: ({ session }) => session.threadId !== 'someone-else',
      },
    },
  })

function setup(
  fetchWrap?: (fetch: typeof globalThis.fetch) => typeof globalThis.fetch,
) {
  const { adapter } = mockAdapter([() => text('hello from the host')])
  const harness = defineHarness({
    name: 'test/client-reads',
    adapter,
    plugins: () => [asker],
    expose: { config: ['tone'], commands: ['confirm'] },
  })
  const host = accessHost()
  const handler = createHarnessHandler({ host, harness })
  const direct: typeof globalThis.fetch = (input, init) =>
    handler(new Request(input, init))
  const client = createHarnessClient({
    url: 'http://local/api/harness',
    threadId: 'thread-r',
    fetch: fetchWrap ? fetchWrap(direct) : direct,
    reconnectDelayMs: 1,
  })
  return { host, harness, client, handler }
}

describe('client reads and actions', () => {
  it('reads the transcript and the description', async () => {
    const { host, client } = setup()
    await client.send('hi')
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

    expect((await client.runCommand({ name: 'confirm' })).status).toBe(
      'accepted',
    )
    await vi.waitFor(async () =>
      expect(questionsOf(await client.snapshot())).toHaveLength(1),
    )
    const [question] = questionsOf(await client.snapshot())
    expect(
      (
        await client.answer({
          questionId: question?.questionId ?? '',
          value: 'yes',
        })
      ).status,
    ).toBe('accepted')
    await vi.waitFor(async () =>
      expect(questionsOf(await client.snapshot())).toHaveLength(0),
    )

    expect(
      (await client.setPluginSetting({ key: 'tone', value: 'warm' })).status,
    ).toBe('accepted')
    expect((await client.describe()).config[0]?.value).toBe('warm')
    await host.close()
  })

  it('renames, updates, and forks a session of the user', async () => {
    const { host, client } = setup()
    await client.send('hi')
    await vi.waitFor(async () =>
      expect(await client.transcript()).toHaveLength(2),
    )
    const [first] = await client.transcript()

    const renamed = await client.sessions.rename({
      threadId: 'thread-r',
      title: 'Greeting',
    })
    const pinned = await client.sessions.update({
      threadId: 'thread-r',
      pinned: true,
    })
    const fork = await client.sessions.fork({
      threadId: 'thread-r',
      at: { through: first?.id ?? '' },
    })

    expect(renamed).toMatchObject({ threadId: 'thread-r', title: 'Greeting' })
    expect(pinned).toMatchObject({ title: 'Greeting', pinned: true })
    expect(fork).toMatchObject({ title: 'Greeting (fork)' })
    expect(fork.threadId).not.toBe('thread-r')
    await host.close()
  })

  it('refuses a read without a thread id, or for a thread the user may not open', async () => {
    const { host, harness, handler } = setup()
    await host.open(harness, {
      threadId: 'someone-else',
      user: { id: 'other' },
    })
    const statusOf = async (path: string) =>
      (await handler(new Request(`http://local/api/harness/${path}`))).status

    expect(await statusOf('transcript')).toBe(400)
    expect(await statusOf('describe')).toBe(400)
    expect(await statusOf('transcript?threadId=someone-else')).toBe(403)
    expect(await statusOf('describe?threadId=someone-else')).toBe(403)
    await host.close()
  })

  it('reads the transcript of a child agent run', async () => {
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) =>
        ctx.chat({ adapter: mockAdapter(() => text('Note 1')).adapter }),
    })
    const { adapter } = mockAdapter([
      () => toolCall('writer', { prompt: 'Take notes' }, 'call-1'),
      () => text('Done.'),
    ])
    const host = accessHost()
    const harness = defineHarness({
      name: 'test/client-reads-agents',
      adapter,
      subagents: { agents: [writer] },
    })
    await host.open(harness, {
      threadId: 'someone-else',
      user: { id: 'other' },
    })
    const handler = createHarnessHandler({ host, harness })
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 'thread-a',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    await client.send('Notes, please')
    const childId = await vi.waitFor(async () => {
      const result = (await client.transcript()).find(
        (message) => message.role === 'tool',
      )
      const { subagentRunId } = JSON.parse(String(result?.content))
      if (typeof subagentRunId !== 'string') throw new Error('no child yet')
      return subagentRunId
    })
    const statusOf = async (path: string) =>
      (await handler(new Request(`http://local/api/harness/${path}`))).status

    const transcript = await client.agentTranscript({ subagentRunId: childId })

    expect(transcript.map((message) => message.content)).toEqual([
      'Take notes',
      'Note 1',
    ])
    expect(await client.agentTranscript({ subagentRunId: 'unknown' })).toEqual(
      [],
    )
    expect(await statusOf('agent-transcript?threadId=thread-a')).toBe(400)
    expect(
      await statusOf(
        `agent-transcript?threadId=someone-else&subagentRunId=${childId}`,
      ),
    ).toBe(403)
    await host.close()
  })

  it('reads the transcript of an agent run that code starts, by its run id', async () => {
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) =>
        ctx.chat({ adapter: mockAdapter(() => text('Note 1')).adapter }),
    })
    const host = accessHost()
    const harness = defineHarness({
      name: 'test/client-reads-agents',
      adapter: mockAdapter([]).adapter,
      agents: [writer],
    })
    const session = await host.open(harness, {
      threadId: 'thread-a',
      user,
    })
    const run = session.agents.writer.start(undefined, { addResultNote: false })
    await run
    const handler = createHarnessHandler({ host, harness })
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 'thread-a',
      fetch: (input, init) => handler(new Request(input, init)),
    })

    const byRun = await client.agentTranscript({ runId: run.id })
    expect(byRun.map((message) => message.content)).toContain('Note 1')
    expect(
      await client.agentTranscript({ subagentRunId: run.subagentRunId }),
    ).toEqual(byRun)
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
    const { host, harness, client } = setup((fetch) => async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/events') && calls++ === 0) {
        return new Response('down', { status: 500 })
      }
      return fetch(input, init)
    })
    // With host access, a thread with no session has no events to read.
    const opened = await host.open(harness, {
      threadId: 'thread-r',
      user,
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
    await opened.close()
    await host.close()
  })
})
