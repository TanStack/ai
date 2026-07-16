import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  chatPlugin,
  definePlugin,
  generationPlugin,
} from '@tanstack/ai-plugin-toolkit'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { usePlugin } from '../src/use-plugin.js'

// A connection adapter that replays canned chunks per plugin, branching on the
// `plugin` discriminator forwarded by PluginClient — the same way a real server
// handler (`definePlugin(...).handler`) would route.
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

/**
 * Mount the composable inside a component (the harness style shared by the
 * other ai-vue tests), capturing its return via a closure so the declared
 * `PluginSystem` typing survives for the type-level assertions. Runtime
 * assertions on reactive fields unwrap the nested refs via `vm` (`as any`),
 * matching the runtime shape the composable actually returns.
 */
function renderUsePlugin<T>(setup: () => T) {
  let system!: T
  const TestComponent = defineComponent({
    setup() {
      system = setup()
      return {}
    },
    template: '<div></div>',
  })

  const wrapper = mount(TestComponent)
  return { wrapper, system, vm: system as any }
}

describe('usePlugin', () => {
  it('exposes only the declared plugins, by kind', () => {
    const def = makePlugin()
    const { system, vm } = renderUsePlugin(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect(system.primaryChat).toBeDefined()
    expect(system.primaryChat.sendMessage).toBeDefined()
    expect(system.banner).toBeDefined()
    expect(system.banner.run).toBeDefined()
    expect(vm.speech).toBeUndefined()
  })

  it('run() on a generation plugin populates its result, typed by the schema', async () => {
    const def = makePlugin()
    const { system, vm } = renderUsePlugin(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    // The input type comes from the plugin's schema.
    expectTypeOf(system.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // run() resolves to the fresh result...
    const returned = await system.banner.run({ prompt: 'a fox' })
    expect(returned?.url).toBe('u')
    await flushPromises()

    // ...and the reactive result ref is still populated.
    expect(vm.banner.result.value).toEqual({ url: 'u' })
    expect(vm.banner.isLoading.value).toBe(false)
    expect(vm.banner.status.value).toBe('success')
  })

  it('sendMessage() on a chat plugin populates its messages', async () => {
    const def = makePlugin()
    const { system, vm } = renderUsePlugin(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await system.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)
    await flushPromises()

    expect(vm.primaryChat.messages.value.length).toBeGreaterThan(0)
    const assistantMessage = vm.primaryChat.messages.value.find(
      (m: any) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p: any) => p.type === 'text')
    expect(textPart?.content).toBe('hello')
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const def = makePlugin()
    const { vm } = renderUsePlugin(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    expect(vm.primaryChat.partial.value).toEqual({})
    expect(vm.primaryChat.final.value).toBeNull()
  })

  it('applies a generation onResult transform and infers its type', async () => {
    const def = makePlugin()
    const { system, vm } = renderUsePlugin(() =>
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
    expectTypeOf(system.banner.result).toEqualTypeOf<string | null>()

    const returned = await system.banner.run({ prompt: 'a fox' })
    await flushPromises()

    expect(returned).toBe('u')
    expect(vm.banner.result.value).toBe('u')
  })

  it('threads flat per-plugin options through to the client', async () => {
    const def = makePlugin()
    const seen: Array<Record<string, unknown>> = []
    const { system, vm } = renderUsePlugin(() =>
      // A chat plugin's `forwardedProps` AND a generation plugin's `onResult`
      // provided as sibling top-level keys — proving the flat shape both wires
      // the request body and threads the result transform.
      usePlugin(def, {
        connection: capturingConnection(seen),
        primaryChat: { forwardedProps: { tone: 'punchy' } },
        banner: { onResult: (raw) => `url:${raw.url}` },
      }),
    )

    await system.primaryChat.sendMessage('hi')
    await flushPromises()
    await system.banner.run({ prompt: 'a fox' })
    await flushPromises()

    // The chat plugin's forwardedProps reached the request body alongside the
    // routing discriminator.
    const chatData = seen.find((d) => d.plugin === 'primaryChat')
    expect(chatData?.tone).toBe('punchy')
    // The generation plugin's onResult transform was applied to its result.
    expect(vm.banner.result.value).toBe('url:u')
  })

  it('disposes the underlying client on unmount without throwing', async () => {
    const def = makePlugin()
    const { wrapper, system } = renderUsePlugin(() =>
      usePlugin(def, { connection: fakeConnection() }),
    )

    await system.primaryChat.sendMessage('hi')
    await flushPromises()

    expect(() => wrapper.unmount()).not.toThrow()
  })
})
