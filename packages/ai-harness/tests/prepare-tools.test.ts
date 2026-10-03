import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { mockAdapter, text } from './helpers'
import type { SessionEvent } from '../src'

const tool = (name: string) =>
  toolDefinition({
    name,
    description: `The ${name} tool`,
    inputSchema: z.object({}),
  }).server(async () => name)

describe('prepareTools', () => {
  it('lets plugins rewrite the tool list in order, before prompts resolve', async () => {
    let described = ''
    const bundle = definePlugin({
      name: 'test/bundle',
      setup: () => ({
        prompts: [{ id: 'test/bundle', text: () => described }],
        prepareTools: (tools) => {
          described = `Bundled: ${tools.map((entry) => entry.name).join(', ')}`
          return [tool('bundled')]
        },
      }),
    })
    const extra = definePlugin({
      name: 'test/extra',
      setup: () => ({
        prepareTools: async (tools) => [...tools, tool('extra')],
      }),
    })
    const broken = definePlugin({
      name: 'test/broken',
      setup: () => ({
        prepareTools: () => {
          throw new Error('cannot prepare')
        },
      }),
    })
    const { adapter, calls } = mockAdapter([() => text('ok')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/prepare',
        adapter,
        tools: [tool('a'), tool('b')],
        plugins: () => [bundle, broken, extra],
      }),
      { threadId: 't' },
    )
    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({ signal: controller.signal }))
        seen.push(entry)
    })()

    await session.prompt('go')
    expect(calls[0].tools.map((entry: { name: string }) => entry.name)).toEqual(
      ['bundled', 'extra'],
    )
    expect(JSON.stringify(calls[0].systemPrompts)).toContain('Bundled: a, b')

    controller.abort()
    await reading
    expect(
      seen.find(
        (entry) =>
          entry.event.type === EventType.CUSTOM &&
          entry.event.name === 'harness.plugin.warning',
      )?.event,
    ).toMatchObject({
      value: { plugin: 'test/broken', message: 'cannot prepare' },
    })
    await host.close()
  })
})
