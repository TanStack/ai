import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { defineAssistant } from '@tanstack/ai/assistant'
import { stream } from '@tanstack/ai-client'
import { useAssistant } from '../src/use-assistant.js'
import { createTextChunks } from './test-utils'
import type { StreamChunk } from '@tanstack/ai'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'

// Helper mirroring the `generation:result` CUSTOM chunk used across the
// ai-vue generation tests (see use-generation.test.ts).
function createGenerationChunks(result: unknown): Array<StreamChunk> {
  return [
    { type: 'RUN_STARTED', runId: 'run-1', timestamp: Date.now() },
    {
      type: 'CUSTOM',
      name: 'generation:result',
      value: result,
      timestamp: Date.now(),
    },
    {
      type: 'RUN_FINISHED',
      runId: 'run-1',
      finishReason: 'stop',
      timestamp: Date.now(),
    },
  ] as unknown as Array<StreamChunk>
}

/**
 * A single canned connection shared by chat and one-shot sub-clients.
 * `AssistantClient` tags each sub-client's requests with `capability` (via
 * `forwardedProps` for chat, `body` for one-shot), so a single `stream()`
 * adapter can route on `data.capability` the same way a real server handler
 * (`defineAssistant(...).handler`) would.
 */
function createAssistantConnection() {
  return stream(async function* (_messages, data) {
    if (data?.capability === 'chat') {
      yield* createTextChunks('Hello from assistant')
      return
    }
    if (data?.capability === 'image') {
      yield* createGenerationChunks({
        id: 'img-1',
        model: 'test',
        images: ['a.png'],
      })
      return
    }
  })
}

function renderUseAssistant(
  assistant: AssistantDefinition<any>,
  options: { connection: ConnectConnectionAdapter },
) {
  const TestComponent = defineComponent({
    setup() {
      return { system: useAssistant(assistant, options) }
    },
    template: '<div></div>',
  })

  const wrapper = mount(TestComponent)
  return { wrapper, system: wrapper.vm.system as any }
}

describe('useAssistant', () => {
  const assistant = defineAssistant({
    chat: async function* () {} as any,
    image: async () => ({ id: '', model: '', images: [] }) as any,
  })

  it('exposes only the declared capabilities', () => {
    const { system } = renderUseAssistant(assistant, {
      connection: createAssistantConnection(),
    })

    expect(system.chat).toBeDefined()
    expect(system.image).toBeDefined()
    expect(system.speech).toBeUndefined()
  })

  it('exposes structured partial/final with no structured part', () => {
    const { system } = renderUseAssistant(assistant, {
      connection: createAssistantConnection(),
    })

    expect(system.chat.partial.value).toEqual({})
    expect(system.chat.final.value).toBeNull()
  })

  it('sendMessage populates chat messages', async () => {
    const { system } = renderUseAssistant(assistant, {
      connection: createAssistantConnection(),
    })

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await system.chat.sendMessage('Hi')
    expect(returned.length).toBeGreaterThan(0)
    await flushPromises()

    expect(system.chat.messages.value.length).toBeGreaterThan(0)
    const assistantMessage = system.chat.messages.value.find(
      (m: any) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p: any) => p.type === 'text')
    expect(textPart?.content).toBe('Hello from assistant')
  })

  it('generate populates the one-shot result', async () => {
    const { system } = renderUseAssistant(assistant, {
      connection: createAssistantConnection(),
    })

    expect(system.image.result.value).toBeNull()
    expect(system.image.isLoading.value).toBe(false)

    // generate() resolves to the fresh result...
    const generated = await system.image.generate({ prompt: 'a cat' })
    expect(generated).toEqual({
      id: 'img-1',
      model: 'test',
      images: ['a.png'],
    })
    await flushPromises()

    // ...and the reactive result ref is still populated.
    expect(system.image.result.value).toEqual({
      id: 'img-1',
      model: 'test',
      images: ['a.png'],
    })
    expect(system.image.isLoading.value).toBe(false)
    expect(system.image.status.value).toBe('success')
  })

  it('disposes the underlying client on unmount without throwing', async () => {
    const { wrapper, system } = renderUseAssistant(assistant, {
      connection: createAssistantConnection(),
    })

    await system.chat.sendMessage('Hi')
    await flushPromises()

    expect(() => wrapper.unmount()).not.toThrow()
  })
})
