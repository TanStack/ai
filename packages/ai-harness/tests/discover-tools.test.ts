import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { SessionEvent } from '../src'

const echoTool = (name: string, reply: string) =>
  toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => reply)

describe('discoverTools', () => {
  it('adds tools a plugin finds at run time, skips taken names, and warns on failure', async () => {
    let online = false
    const connector = definePlugin({
      name: 'test/connector',
      setup: () => ({
        discoverTools: () =>
          online
            ? [
                echoTool('remote_search', 'remote result'),
                echoTool('lookup', 'shadowed'),
              ]
            : [],
      }),
    })
    const broken = definePlugin({
      name: 'test/broken',
      setup: () => ({
        discoverTools: async () => {
          throw new Error('server is down')
        },
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => text('nothing yet'),
      () => toolCall('remote_search', {}),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/discover',
        adapter,
        tools: [echoTool('lookup', 'local result')],
        plugins: () => [connector, broken],
      }),
      {
        threadId: 't',
      },
    )
    const names = (call: number) =>
      (calls[call].tools ?? []).map((tool: { name: string }) => tool.name)

    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal }))
        seen.push(entry)
    })()

    await session.send('before sign-in')
    expect(names(0)).toEqual(['lookup'])

    online = true
    const turn = await session.send('after sign-in')
    expect(turn.text).toBe('done')
    // The static `lookup` wins over the discovered one with the same name.
    expect(names(1)).toEqual(['lookup', 'remote_search'])
    expect(JSON.stringify(calls[2].messages)).toContain('remote result')

    controller.abort()
    await reading
    const warnings = seen.filter(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === 'harness.plugin.warning',
    )
    expect(warnings[0]?.event).toMatchObject({
      value: { plugin: 'test/broken', message: 'server is down' },
    })
    await host.close()
  })
})

describe('onTurnStart', () => {
  it('runs once per turn, before the prompts, and a hook that throws does not stop the turn', async () => {
    let turns = 0
    const counter = definePlugin({
      name: 'test/counter',
      setup: () => ({
        onTurnStart: (turn) => {
          turns += 1
          expect(turn.run.runId).toBe(turn.operationId)
        },
        prompts: [() => `Turn ${turns}.`],
      }),
    })
    const broken = definePlugin({
      name: 'test/broken-start',
      setup: () => ({
        onTurnStart: () => {
          throw new Error('cannot start')
        },
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('lookup', {}),
      () => text('one'),
      () => text('two'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/turn-start',
        adapter,
        tools: [echoTool('lookup', 'found')],
        plugins: () => [counter, broken],
      }),
      { threadId: 't' },
    )

    expect((await session.send('first')).text).toBe('one')
    expect((await session.send('second')).text).toBe('two')

    // Two model calls in the first turn, but one hook call per turn.
    expect(turns).toBe(2)
    expect(calls[0].systemPrompts).toContain('Turn 1.')
    expect(calls[2].systemPrompts).toContain('Turn 2.')
    await host.close()
  })
})

describe('a tool name that two plugins give', () => {
  it('keeps the tool of the earlier plugin and warns once with both names', async () => {
    const finder = (name: string, reply: string) =>
      definePlugin({
        name,
        setup: () => ({ discoverTools: () => [echoTool('search', reply)] }),
      })
    const { adapter, calls } = mockAdapter([
      () => toolCall('search', {}),
      () => text('found'),
      () => text('again'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/tool-clash',
        adapter,
        plugins: () => [
          finder('test/first', 'first'),
          finder('test/second', 'second'),
        ],
      }),
      { threadId: 't' },
    )
    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal }))
        seen.push(entry)
    })()

    await session.send('search')
    await session.send('search again')

    expect(JSON.stringify(calls[1].messages)).toContain('first')
    expect(JSON.stringify(calls[1].messages)).not.toContain('second')
    controller.abort()
    await reading
    const warnings = seen.filter(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === 'harness.plugin.warning',
    )
    expect(warnings.map((entry) => entry.event)).toMatchObject([
      {
        value: {
          plugin: 'test/second',
          message:
            'Two tools are named "search": the tool of plugin test/first is used, and the tool of plugin test/second is not.',
        },
      },
    ])
    await host.close()
  })
})

describe('the default agent loop', () => {
  it('keeps calling the model past five steps', async () => {
    const steps = Array.from(
      { length: 7 },
      (_, index) => () => toolCall('lookup', {}, `call-${index}`),
    )
    const { adapter, calls } = mockAdapter([...steps, () => text('finally')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/long-turn',
        adapter,
        tools: [echoTool('lookup', 'fact')],
      }),
      {
        threadId: 't',
      },
    )
    const turn = await session.send('dig deep')
    expect(calls).toHaveLength(8)
    expect(turn.text).toBe('finally')
    await host.close()
  })
})
