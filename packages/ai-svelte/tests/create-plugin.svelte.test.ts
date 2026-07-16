import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  chatPlugin,
  definePlugin,
  generationPlugin,
} from '@tanstack/ai-plugin-toolkit'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { createPlugin } from '../src/create-plugin.svelte.js'

// A connection adapter that replays canned chunks per plugin, branching on the
// `plugin` discriminator forwarded by PluginClient.
function fakeConnection() {
  return stream(async function* (_messages, data) {
    const pluginName = (data as Record<string, unknown> | undefined)?.plugin

    if (pluginName === 'primaryChat') {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'm1',
        role: 'assistant',
      } as any
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        delta: 'hello',
      } as any
      yield { type: 'TEXT_MESSAGE_END', messageId: 'm1' } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    } else {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: { url: 'u' },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    }
  })
}

// A connection adapter that records every request body it sees, so tests can
// assert per-plugin options (forwardedProps) reached the client's request.
function capturingConnection(seen: Array<Record<string, unknown>>) {
  return stream(async function* (_messages, data) {
    seen.push((data ?? {}) as Record<string, unknown>)
    const pluginName = (data as Record<string, unknown> | undefined)?.plugin
    if (pluginName === 'primaryChat') {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'm1',
        role: 'assistant',
      } as any
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        delta: 'hello',
      } as any
      yield { type: 'TEXT_MESSAGE_END', messageId: 'm1' } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    } else {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: { url: 'u' },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    }
  })
}

function makePlugin() {
  return definePlugin({
    primaryChat: chatPlugin(async function* (r: any) {
      yield { type: 'RUN_STARTED', threadId: r.threadId, runId: r.runId } as any
    } as any),
    banner: generationPlugin({
      input: z.object({ prompt: z.string() }),
      execute: async ({ input }) => ({ url: `img:${input.prompt}` }),
    }),
  })
}

describe('createPlugin', () => {
  it('exposes only the declared plugins, by kind', () => {
    const def = makePlugin()
    const system = createPlugin(def, { connection: fakeConnection() })

    expect(system.primaryChat).toBeDefined()
    expect(system.primaryChat.sendMessage).toBeDefined()
    expect(system.banner).toBeDefined()
    expect(system.banner.run).toBeDefined()
    expect((system as any).speech).toBeUndefined()

    system.dispose()
  })

  it('run() on a generation plugin populates its result, typed by the schema', async () => {
    const def = makePlugin()
    const system = createPlugin(def, { connection: fakeConnection() })

    // The input type comes from the plugin's schema.
    expectTypeOf(system.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // run() resolves to the fresh result...
    const generated = await system.banner.run({ prompt: 'a fox' })
    expect(generated?.url).toBe('u')

    // ...and the reactive result state is still populated.
    expect(system.banner.result?.url).toBe('u')

    system.dispose()
  })

  it('sendMessage() on a chat plugin populates its messages', async () => {
    const def = makePlugin()
    const system = createPlugin(def, { connection: fakeConnection() })

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await system.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)

    expect(system.primaryChat.messages.length).toBeGreaterThan(0)

    system.dispose()
  })

  it('exposes chat partial/final with cleared defaults on creation', () => {
    const def = makePlugin()
    const system = createPlugin(def, { connection: fakeConnection() })

    expect((system.primaryChat as any).partial).toEqual({})
    expect((system.primaryChat as any).final).toBeNull()

    system.dispose()
  })

  it('applies a generation onResult transform and infers its type', async () => {
    const def = makePlugin()
    // Flat options: the per-plugin `banner` entry sits at the top level
    // alongside `connection`, no nested `plugins`/`verbs` wrapper.
    const system = createPlugin(def, {
      connection: fakeConnection(),
      banner: {
        onResult: (raw) => {
          // The transform's input is the plugin's typed result
          // (`toEqualTypeOf` fails if `raw` were `any`).
          expectTypeOf(raw).toEqualTypeOf<{ url: string }>()
          return raw.url
        },
      },
    })

    // The surface `result` is the transform's (non-nullish) return type.
    expectTypeOf(system.banner.result).toEqualTypeOf<string | null>()

    const generated = await system.banner.run({ prompt: 'a fox' })
    expect(generated).toBe('u')
    expect(system.banner.result).toBe('u')

    system.dispose()
  })

  it('threads flat per-plugin options through to the client', async () => {
    const def = makePlugin()
    const seen: Array<Record<string, unknown>> = []
    // A chat plugin's `forwardedProps` AND a generation plugin's `onResult`
    // provided as sibling top-level keys — proving the flat shape both wires
    // the request body and threads the result transform.
    const system = createPlugin(def, {
      connection: capturingConnection(seen),
      primaryChat: { forwardedProps: { tone: 'punchy' } },
      banner: { onResult: (raw) => `url:${raw.url}` },
    })

    await system.primaryChat.sendMessage('hi')
    await system.banner.run({ prompt: 'a fox' })

    // The chat plugin's forwardedProps reached the request body alongside the
    // routing discriminator.
    const chatData = seen.find((d) => d.plugin === 'primaryChat')
    expect(chatData?.tone).toBe('punchy')
    // The generation plugin's onResult transform was applied to its result.
    expect(system.banner.result).toBe('url:u')

    system.dispose()
  })
})
