import { renderHook, waitFor } from '@solidjs/testing-library'
import { describe, expect, expectTypeOf, it } from 'vitest'
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

    expect(result.primaryChat).toBeDefined()
    expect(result.primaryChat.sendMessage).toBeDefined()
    expect(result.banner).toBeDefined()
    expect(result.banner.run).toBeDefined()
    expect((result as any).speech).toBeUndefined()
  })

  it('run() on a generation plugin populates its result, typed by the schema', async () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    // The input type comes from the plugin's schema.
    expectTypeOf(result.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    expect(result.banner.result).toBeNull()
    expect(result.banner.isLoading).toBe(false)
    expect(result.banner.status).toBe('idle')

    // run() resolves to the fresh result...
    const generated = await result.banner.run({ prompt: 'a fox' })
    expect(generated?.url).toBe('u')

    // ...and the reactive result state is still populated.
    expect(result.banner.result?.url).toBe('u')
    expect(result.banner.status).toBe('success')
    expect(result.banner.isLoading).toBe(false)
  })

  it('sendMessage() on a chat plugin populates its messages', async () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect(result.primaryChat.messages).toEqual([])

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await result.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(result.primaryChat.messages.length).toBeGreaterThan(0)
    })

    const userMessage = result.primaryChat.messages.find(
      (m) => m.role === 'user',
    )
    expect(userMessage).toBeDefined()
    if (userMessage) {
      expect(userMessage.parts[0]).toEqual({ type: 'text', content: 'hi' })
    }

    const assistantMessage = result.primaryChat.messages.find(
      (m) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p) => p.type === 'text')
    expect(textPart).toBeDefined()
    expect(textPart?.content).toBe('hello')
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const def = makePlugin()
    const { result } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect((result.primaryChat as any).partial).toEqual({})
    expect((result.primaryChat as any).final).toBeNull()
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
    expectTypeOf(result.banner.result).toEqualTypeOf<string | null>()

    const returned = await result.banner.run({ prompt: 'a fox' })
    expect(returned).toBe('u')
    expect(result.banner.result).toBe('u')
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

    await result.primaryChat.sendMessage('hi')
    await result.banner.run({ prompt: 'a fox' })

    // The chat plugin's forwardedProps reached the request body alongside the
    // routing discriminator.
    const chatData = seen.find((d) => d.plugin === 'primaryChat')
    expect(chatData?.tone).toBe('punchy')
    // The generation plugin's onResult transform was applied to its result.
    expect(result.banner.result).toBe('url:u')
  })

  it('disposes every chat and one-shot sub-client on cleanup', () => {
    const def = makePlugin()
    const { result, cleanup } = renderHook(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect(result.primaryChat).toBeDefined()
    expect(() => cleanup()).not.toThrow()
  })
})
