import { describe, expect, expectTypeOf, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { defineAssistant } from '@tanstack/ai/assistant'
import { stream } from '@tanstack/ai-client'
import type { ImageGenerationResult } from '@tanstack/ai'
import { useAssistant } from '../src/use-assistant.js'

// A connection adapter that replays canned chunks for both capabilities,
// branching on the `capability` discriminator forwarded by AssistantClient.
function fakeConnection() {
  return stream(async function* (_messages, data) {
    const capability = (data as Record<string, unknown> | undefined)?.capability

    if (capability === 'chat') {
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
        value: { id: 'i', model: 'gpt-image-1', images: [{ url: 'u' }] },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    }
  })
}

describe('useAssistant', () => {
  it('exposes only the declared capabilities', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )
    expect(result.current.chat).toBeDefined()
    expect(result.current.image).toBeDefined()
    expect((result.current as any).speech).toBeUndefined()
  })

  it('generate() on a one-shot capability populates its result', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    // Holder object (not a bare `let`) so TS keeps the awaited return type at
    // the read site — a `let` assigned only inside the async `act` callback
    // gets narrowed away. The assignment still type-checks generate()'s return.
    const captured: { value: typeof result.current.image.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.image.generate({ prompt: 'a fox' })
    })

    // generate() resolves to the fresh result...
    expect(captured.value?.images[0]?.url).toBe('u')
    // ...and the reactive result state is still populated.
    expect(result.current.image.result?.images[0]?.url).toBe('u')
  })

  it('sendMessage() on the chat capability populates messages', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    // Holder object (see note in the generate() test) keeps the awaited
    // sendMessage() return type at the read site.
    const captured: { value: typeof result.current.chat.messages } = {
      value: [],
    }
    await act(async () => {
      captured.value = await result.current.chat.sendMessage('hi')
    })

    // With no outputSchema, sendMessage() resolves to the messages array...
    expect(captured.value.length).toBeGreaterThan(0)
    // ...and the reactive messages state is still populated.
    expect(result.current.chat.messages.length).toBeGreaterThan(0)
  })

  it('exposes chat.partial/final with cleared defaults on first render', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: fakeConnection() }),
    )

    expect((result.current.chat as any).partial).toEqual({})
    expect((result.current.chat as any).final).toBeNull()
  })

  it('applies a one-shot onResult transform and infers its type', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({}) as any,
    })
    const { result } = renderHook(() =>
      useAssistant(assistant, {
        connection: fakeConnection(),
        image: {
          onResult: (raw) => {
            // The transform's input is the raw backend result, fully typed
            // (`toEqualTypeOf` fails if `raw` were `any`).
            expectTypeOf(raw).toEqualTypeOf<ImageGenerationResult>()
            return raw.images[0]?.url ?? null
          },
        },
      }),
    )

    // The surface `result` is the transform's (non-nullish) return type — not
    // the raw result, and not `any`.
    expectTypeOf(result.current.image.result).toEqualTypeOf<string | null>()

    const captured: { value: typeof result.current.image.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.image.generate({ prompt: 'a fox' })
    })

    // The transformed value flows to both the resolved return and the
    // reactive result state.
    expect(captured.value).toBe('u')
    expect(result.current.image.result).toBe('u')
  })
})
