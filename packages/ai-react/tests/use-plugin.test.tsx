import { describe, expect, expectTypeOf, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { chatPlugin, definePlugin, generationPlugin } from '@tanstack/ai/plugin'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { usePlugin } from '../src/use-plugin.js'

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

describe('usePlugin', () => {
  it('exposes only the declared plugins, by kind', () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )
    expect(result.current.primaryChat).toBeDefined()
    expect(result.current.primaryChat.sendMessage).toBeDefined()
    expect(result.current.banner).toBeDefined()
    expect(result.current.banner.run).toBeDefined()
    expect((result.current as any).speech).toBeUndefined()
  })

  it('run() on a generation plugin populates its result, typed by the schema', async () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    // The input type comes from the plugin's schema.
    expectTypeOf(result.current.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // Holder object (not a bare `let`) so TS keeps the awaited return type
    // at the read site.
    const captured: { value: typeof result.current.banner.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.banner.run({ prompt: 'a fox' })
    })

    expect(captured.value?.url).toBe('u')
    expect(result.current.banner.result?.url).toBe('u')
  })

  it('sendMessage() on a chat plugin populates its messages', async () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    const captured: { value: typeof result.current.primaryChat.messages } = {
      value: [],
    }
    await act(async () => {
      captured.value = await result.current.primaryChat.sendMessage('hi')
    })

    expect(captured.value.length).toBeGreaterThan(0)
    expect(result.current.primaryChat.messages.length).toBeGreaterThan(0)
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect((result.current.primaryChat as any).partial).toEqual({})
    expect((result.current.primaryChat as any).final).toBeNull()
  })

  it('applies a generation onResult transform and infers its type', async () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      // Flat options: the per-plugin `banner` entry sits at the top level
      // alongside `connection`, no nested `plugins`/`verbs` wrapper.
      usePlugin(def, {
        connection: fakeConnection(),
        banner: {
          onResult: (raw) => {
            // The transform's input is the plugin's typed result
            // (`toEqualTypeOf` fails if `raw` were `any`).
            expectTypeOf(raw).toEqualTypeOf<{ url: string }>()
            return raw.url
          },
        },
      }),
    )

    // The surface `result` is the transform's (non-nullish) return type.
    expectTypeOf(result.current.banner.result).toEqualTypeOf<string | null>()

    const captured: { value: typeof result.current.banner.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.banner.run({ prompt: 'a fox' })
    })

    expect(captured.value).toBe('u')
    expect(result.current.banner.result).toBe('u')
  })

  it('threads flat per-plugin options through to the client', async () => {
    const def = makePlugin()
    const seen: Array<Record<string, unknown>> = []
    const { result } = renderHook(() =>
      // A chat plugin's `forwardedProps` AND a generation plugin's `onResult`
      // provided as sibling top-level keys — proving the flat shape both wires
      // the request body and threads the result transform.
      usePlugin(def, {
        connection: capturingConnection(seen),
        primaryChat: { forwardedProps: { tone: 'punchy' } },
        banner: { onResult: (raw) => `url:${raw.url}` },
      }),
    )

    await act(async () => {
      await result.current.primaryChat.sendMessage('hi')
    })
    await act(async () => {
      await result.current.banner.run({ prompt: 'a fox' })
    })

    // The chat plugin's forwardedProps reached the request body alongside the
    // routing discriminator.
    const chatData = seen.find((d) => d.plugin === 'primaryChat')
    expect(chatData?.tone).toBe('punchy')
    // The generation plugin's onResult transform was applied to its result.
    expect(result.current.banner.result).toBe('url:u')
  })
})
