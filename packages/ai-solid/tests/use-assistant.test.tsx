import { renderHook, waitFor } from '@solidjs/testing-library'
import { describe, expect, it } from 'vitest'
import { defineAssistant } from '@tanstack/ai/assistant'
import { stream } from '@tanstack/ai-client'
import type { StreamChunk } from '@tanstack/ai'
import { useAssistant } from '../src/use-assistant.js'
import { createTextChunks } from './test-utils'

/**
 * A canned connection shared by chat and one-shot sub-clients (mirroring how
 * `AssistantClient` composes them). Routes on `data.capability`, which
 * `AssistantClient` tags onto every request: `forwardedProps.capability` for
 * chat, `body.capability` for one-shot generation.
 */
function createAssistantConnection() {
  return stream(async function* (_messages, data): AsyncGenerator<StreamChunk> {
    const capability = (data as Record<string, unknown> | undefined)?.capability

    if (capability === 'chat') {
      yield* createTextChunks('Hello from chat')
      return
    }

    yield {
      type: 'RUN_STARTED',
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'CUSTOM',
      name: 'generation:result',
      value: { id: 'img-1', model: 'test-model', images: [] },
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'RUN_FINISHED',
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    } as StreamChunk
  })
}

describe('useAssistant', () => {
  it('exposes only the declared capabilities', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })

    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    expect(result.chat).toBeDefined()
    expect(result.image).toBeDefined()
    expect((result as any).speech).toBeUndefined()
  })

  it('populates the one-shot result after generate()', async () => {
    const assistant = defineAssistant({
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })

    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    expect(result.image.result).toBeNull()
    expect(result.image.isLoading).toBe(false)
    expect(result.image.status).toBe('idle')

    // generate() resolves to the fresh result...
    const generated = await result.image.generate({ prompt: 'A sunset' })
    expect(generated).toEqual({
      id: 'img-1',
      model: 'test-model',
      images: [],
    })

    // ...and the reactive result state is still populated.
    expect(result.image.result).toEqual({
      id: 'img-1',
      model: 'test-model',
      images: [],
    })
    expect(result.image.status).toBe('success')
    expect(result.image.isLoading).toBe(false)
  })

  it('populates chat messages after sendMessage()', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
    })

    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    expect(result.chat.messages).toEqual([])

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await result.chat.sendMessage('Hi there')
    expect(returned.length).toBeGreaterThanOrEqual(2)

    await waitFor(() => {
      expect(result.chat.messages.length).toBeGreaterThanOrEqual(2)
    })

    const userMessage = result.chat.messages.find((m) => m.role === 'user')
    expect(userMessage).toBeDefined()
    if (userMessage) {
      expect(userMessage.parts[0]).toEqual({
        type: 'text',
        content: 'Hi there',
      })
    }

    const assistantMessage = result.chat.messages.find(
      (m) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p) => p.type === 'text')
    expect(textPart).toBeDefined()
    if (textPart && textPart.type === 'text') {
      expect(textPart.content).toBe('Hello from chat')
    }
  })

  it('supports both chat and one-shot capabilities on the same assistant', async () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })

    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    await result.chat.sendMessage('Hi there')
    await waitFor(() => {
      expect(result.chat.messages.length).toBeGreaterThanOrEqual(2)
    })

    await result.image.generate({ prompt: 'A sunset' })
    expect(result.image.result).toEqual({
      id: 'img-1',
      model: 'test-model',
      images: [],
    })
  })

  it('exposes structured partial/final on the chat surface with no structured part present', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
    })

    const { result } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    expect((result.chat as any).partial).toEqual({})
    expect((result.chat as any).final).toBeNull()
  })

  it('disposes both the chat and one-shot sub-clients on cleanup', () => {
    const assistant = defineAssistant({
      chat: async function* () {} as any,
      image: async () => ({ id: '', model: '', images: [] }) as any,
    })

    const { result, cleanup } = renderHook(() =>
      useAssistant(assistant, { connection: createAssistantConnection() }),
    )

    expect(result.chat).toBeDefined()
    expect(() => cleanup()).not.toThrow()
  })
})
