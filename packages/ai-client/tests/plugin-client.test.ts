import { describe, expect, expectTypeOf, it } from 'vitest'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatPlugin, definePlugin, generationPlugin } from '@tanstack/ai/plugin'
import { z } from 'zod'
import { PluginClient } from '../src/plugin-client.js'
import { fetchServerSentEvents } from '../src/connection-adapters.js'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { PluginSystem } from '../src/plugin-types.js'

// Declared, never executed — used only inside chat callbacks that the type
// tests never invoke (`definePlugin` only runs `Object.keys`). Ambient,
// so it emits no runtime binding and is never read.
declare const adapter: AnyTextAdapter

const emptyChatPlugin = () => chatPlugin(async function* () {} as any)

describe('PluginClient', () => {
  it('creates one sub-client per declared plugin, by kind', () => {
    const def = definePlugin({
      primaryChat: emptyChatPlugin(),
      banner: generationPlugin({ execute: async () => ({ url: 'x' }) }),
    })
    const client = new PluginClient({
      plugin: def,
      connection: fetchServerSentEvents('/api/plugin'),
    })

    expect(client.has('primaryChat')).toBe(true)
    expect(client.has('banner')).toBe(true)
    expect(client.has('speech')).toBe(false)
    expect(client.chat('primaryChat')).toBeDefined()
    expect(client.oneShot('banner')).toBeDefined()
    expect(client.chat('banner')).toBeUndefined()
    expect(client.oneShot('primaryChat')).toBeUndefined()
    expect(client.plugins).toEqual(['primaryChat', 'banner'])
  })

  it('supports multiple chat plugins, each with its own ChatClient', () => {
    const def = definePlugin({
      primaryChat: emptyChatPlugin(),
      summaryChat: emptyChatPlugin(),
    })
    const client = new PluginClient({
      plugin: def,
      connection: fetchServerSentEvents('/api/plugin'),
    })

    expect(client.chat('primaryChat')).toBeDefined()
    expect(client.chat('summaryChat')).toBeDefined()
    expect(client.chat('primaryChat')).not.toBe(client.chat('summaryChat'))
  })

  it('dispose() tears down every sub-client', () => {
    const def = definePlugin({
      primaryChat: emptyChatPlugin(),
      banner: generationPlugin({ execute: async () => ({}) }),
      narration: generationPlugin({ execute: async () => ({}) }),
    })
    const client = new PluginClient({
      plugin: def,
      connection: fetchServerSentEvents('/api/plugin'),
    })

    const disposed: Array<string> = []
    client.chat('primaryChat')!.dispose = () => {
      disposed.push('primaryChat')
    }
    client.oneShot('banner')!.dispose = () => {
      disposed.push('banner')
    }
    client.oneShot('narration')!.dispose = () => {
      disposed.push('narration')
    }

    client.dispose()

    expect(disposed.sort()).toEqual(['banner', 'narration', 'primaryChat'])
  })
})

describe('PluginSystem typing', () => {
  it('exposes only declared plugins, typed by kind', () => {
    const def = definePlugin({
      primaryChat: emptyChatPlugin(),
      banner: generationPlugin({
        input: z.object({ prompt: z.string() }),
        execute: async ({ input }) => ({ url: `img:${input.prompt}` }),
      }),
    })
    type Sys = PluginSystem<typeof def>
    expectTypeOf<Sys>().toHaveProperty('primaryChat')
    expectTypeOf<Sys>().toHaveProperty('banner')
    // @ts-expect-error speech was not declared
    expectTypeOf<Sys>().toHaveProperty('speech')

    // Generation input comes from the plugin's schema; result from execute.
    expectTypeOf<Parameters<Sys['banner']['run']>[0]>().toEqualTypeOf<{
      prompt: string
    }>()
    expectTypeOf<Sys['banner']['result']>().toEqualTypeOf<{
      url: string
    } | null>()
  })

  it('chat plugin tools narrow that surface message tool-call parts', () => {
    const weatherDef = toolDefinition({
      name: 'get_weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({ city: z.string() }),
      outputSchema: z.object({ tempC: z.number() }),
    })

    const def = definePlugin({
      primaryChat: chatPlugin((req) =>
        chat({ adapter, messages: req.messages, tools: [weatherDef] }),
      ),
    })

    type Sys = PluginSystem<typeof def>
    type Part = Sys['primaryChat']['messages'][number]['parts'][number]
    type WeatherCall = Extract<Part, { type: 'tool-call'; name: 'get_weather' }>

    expectTypeOf<WeatherCall['name']>().toEqualTypeOf<'get_weather'>()
    expectTypeOf<WeatherCall['input']>().toEqualTypeOf<
      { city: string } | undefined
    >()
    expectTypeOf<WeatherCall['output']>().toEqualTypeOf<
      { tempC: number } | undefined
    >()
  })

  it('outputSchema adds typed partial/final to that chat surface only', () => {
    const outputSchema = z.object({ answer: z.string(), score: z.number() })

    const def = definePlugin({
      drafting: chatPlugin((req) =>
        chat({ adapter, messages: req.messages, outputSchema, stream: true }),
      ),
      support: chatPlugin((req) => chat({ adapter, messages: req.messages })),
    })

    type Drafting = PluginSystem<typeof def>['drafting']
    type Support = PluginSystem<typeof def>['support']

    expectTypeOf<Drafting['final']>().toEqualTypeOf<{
      answer: string
      score: number
    } | null>()
    expectTypeOf<Drafting['partial']>().toEqualTypeOf<{
      answer?: string
      score?: number
    }>()

    // @ts-expect-error no outputSchema → no `partial` on this chat surface
    expectTypeOf<Support>().toHaveProperty('partial')
    // @ts-expect-error no outputSchema → no `final` on this chat surface
    expectTypeOf<Support>().toHaveProperty('final')
  })
})
