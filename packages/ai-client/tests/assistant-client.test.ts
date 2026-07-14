import { describe, expect, expectTypeOf, it } from 'vitest'
import { chat, toolDefinition } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { z } from 'zod'
import { AssistantClient } from '../src/assistant-client.js'
import { fetchServerSentEvents } from '../src/connection-adapters.js'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AssistantSystem } from '../src/assistant-types.js'

// Declared, never executed — used only inside chat callbacks that the type
// tests never invoke (`defineAssistant` only runs `Object.keys`). Ambient, so
// it emits no runtime binding and is never read.
declare const adapter: AnyTextAdapter

describe('AssistantClient', () => {
  it('creates one sub-client per declared capability', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    expect(client.has('chat')).toBe(true)
    expect(client.has('image')).toBe(true)
    expect(client.has('speech')).toBe(false)
    expect(client.chat).toBeDefined()
    expect(client.get('image')).toBeDefined()
    expect(client.capabilities).toEqual(['chat', 'image'])
  })

  it('tags each sub-client with its capability', () => {
    const assistant = defineAssistant({
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    expect(client.chat).toBeUndefined()
    expect(client.has('chat')).toBe(false)
    expect(client.get('image')).toBeDefined()
  })

  it('dispose() tears down the chat client and every one-shot client', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
      speech: async () => ({}) as any,
    })
    const client = new AssistantClient({
      assistant,
      connection: fetchServerSentEvents('/api/assistant'),
    })

    const chatDisposeCalls: Array<true> = []
    const imageDisposeCalls: Array<true> = []
    const speechDisposeCalls: Array<true> = []
    client.chat!.dispose = () => {
      chatDisposeCalls.push(true)
    }
    client.get('image')!.dispose = () => {
      imageDisposeCalls.push(true)
    }
    client.get('speech')!.dispose = () => {
      speechDisposeCalls.push(true)
    }

    client.dispose()

    expect(chatDisposeCalls).toHaveLength(1)
    expect(imageDisposeCalls).toHaveLength(1)
    expect(speechDisposeCalls).toHaveLength(1)
  })

  it('AssistantSystem exposes only declared capabilities, typed', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })
    type Sys = AssistantSystem<typeof assistant>
    expectTypeOf<Sys>().toHaveProperty('chat')
    expectTypeOf<Sys>().toHaveProperty('image')
    // @ts-expect-error speech was not declared
    expectTypeOf<Sys>().toHaveProperty('speech')
    expectTypeOf<Sys['image']['result']>().toMatchTypeOf<{
      id: string
      model: string
      images: Array<any>
    } | null>()
  })
})

/**
 * Type-only tests: the chat surface is inferred from the chat callback's
 * return — its captured tools type the message tool-call parts, and its
 * `outputSchema` (if any) adds typed `partial` / `final`. `defineAssistant` is
 * called for real (only `Object.keys` runs); the `chat(...)` callbacks are
 * never invoked, so a declared `AnyTextAdapter` never runs.
 */
describe('AssistantSystem chat surface inference', () => {
  it('callback tools narrow the chat messages tool-call parts', () => {
    const weatherDef = toolDefinition({
      name: 'get_weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({ city: z.string() }),
      outputSchema: z.object({ tempC: z.number() }),
    })

    const assistant = defineAssistant({
      chat: (req) =>
        chat({ adapter, messages: req.messages, tools: [weatherDef] }),
    })

    type Sys = AssistantSystem<typeof assistant>
    type Part = Sys['chat']['messages'][number]['parts'][number]
    type WeatherCall = Extract<Part, { type: 'tool-call'; name: 'get_weather' }>

    // The tool-call part named `get_weather` exists and its input/output are
    // narrowed to the tool's schema-inferred types.
    expectTypeOf<WeatherCall['name']>().toEqualTypeOf<'get_weather'>()
    expectTypeOf<WeatherCall['input']>().toEqualTypeOf<
      { city: string } | undefined
    >()
    expectTypeOf<WeatherCall['output']>().toEqualTypeOf<
      { tempC: number } | undefined
    >()
  })

  it('outputSchema adds typed partial/final to the chat surface', () => {
    const outputSchema = z.object({ answer: z.string(), score: z.number() })

    const assistant = defineAssistant({
      chat: (req) =>
        chat({ adapter, messages: req.messages, outputSchema, stream: true }),
    })

    type ChatSurface = AssistantSystem<typeof assistant>['chat']

    expectTypeOf<ChatSurface['final']>().toEqualTypeOf<{
      answer: string
      score: number
    } | null>()
    expectTypeOf<ChatSurface['partial']>().toEqualTypeOf<{
      answer?: string
      score?: number
    }>()
  })

  it('a plain chat (no schema) exposes no partial/final', () => {
    const assistant = defineAssistant({
      chat: (req) => chat({ adapter, messages: req.messages }),
    })

    type ChatSurface = AssistantSystem<typeof assistant>['chat']

    // @ts-expect-error no outputSchema → no `partial` on the chat surface
    expectTypeOf<ChatSurface>().toHaveProperty('partial')
    // @ts-expect-error no outputSchema → no `final` on the chat surface
    expectTypeOf<ChatSurface>().toHaveProperty('final')
  })
})
