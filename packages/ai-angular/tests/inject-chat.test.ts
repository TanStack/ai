import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ChatClient } from '@tanstack/ai-client'
import { injectChat } from '../src/inject-chat'
import {
  createMockConnectionAdapter,
  createTextChunks,
  renderInjectChat,
} from './test-utils'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('injectChat', () => {
  it('initializes with default state', () => {
    const adapter = createMockConnectionAdapter()
    const { result } = renderInjectChat({ connection: adapter })

    expect(result.messages()).toEqual([])
    expect(result.isLoading()).toBe(false)
    expect(result.error()).toBeUndefined()
    expect(result.status()).toBe('ready')
    expect(result.isSubscribed()).toBe(false)
    expect(result.connectionStatus()).toBe('disconnected')
    expect(result.sessionGenerating()).toBe(false)
  })
})

describe('injectChat — streaming', () => {
  it('streams assistant text into messages', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('Hello there'),
    })
    const { result, flush } = renderInjectChat({ connection: adapter })

    await result.sendMessage('Hi')
    await tick()
    flush()

    const assistant = result.messages().find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(result.isLoading()).toBe(false)
  })

  it('initializes with provided messages', () => {
    const adapter = createMockConnectionAdapter()
    const initialMessages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Hello' }],
        createdAt: new Date(),
      },
    ]
    const { result } = renderInjectChat({
      connection: adapter,
      initialMessages,
    })
    expect(result.messages()).toEqual(initialMessages)
  })

  it('clear() empties messages', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: createTextChunks('Hi'),
    })
    const { result, flush } = renderInjectChat({ connection: adapter })
    await result.sendMessage('Hi')
    await tick()
    result.clear()
    flush()
    expect(result.messages()).toEqual([])
  })
})

describe('injectChat — reactive options', () => {
  it('subscribes/unsubscribes when a live signal flips', async () => {
    const adapter = createMockConnectionAdapter()
    const live = signal(false)
    const { result, flush } = renderInjectChat({ connection: adapter, live })

    await tick()
    flush()
    expect(result.isSubscribed()).toBe(false)

    live.set(true)
    flush()
    await tick()
    expect(result.isSubscribed()).toBe(true)

    live.set(false)
    flush()
    await tick()
    expect(result.isSubscribed()).toBe(false)
  })

  it('pushes body-signal changes to the client', async () => {
    const updateSpy = vi.spyOn(ChatClient.prototype, 'updateOptions')
    try {
      const adapter = createMockConnectionAdapter()
      const body = signal<Record<string, any>>({ model: 'a' })
      const { flush } = renderInjectChat({ connection: adapter, body })

      // initial effect run picks up { model: 'a' }
      flush()
      await tick()
      updateSpy.mockClear()

      body.set({ model: 'b' })
      flush()
      await tick()

      expect(updateSpy).toHaveBeenCalled()
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ body: { model: 'b' } }),
      )
    } finally {
      updateSpy.mockRestore()
    }
  })
})

describe('injectChat — structured output', () => {
  it('exposes partial then final when outputSchema is supplied', async () => {
    const schema = z.object({ title: z.string() })
    const adapter: ConnectConnectionAdapter = createMockConnectionAdapter({
      chunks: createTextChunks('{"title":"Hi"}'),
    })

    // Mount injectChat directly so the `outputSchema` generic flows through and
    // the schema-gated `partial` / `final` signals are present on the result.
    // The shared renderInjectChat harness erases the schema type.
    @Component({ standalone: true, template: '' })
    class StructuredHost {
      chat = injectChat({ connection: adapter, outputSchema: schema })
    }
    const fixture = TestBed.createComponent(StructuredHost)
    fixture.detectChanges()
    const result = fixture.componentInstance.chat

    await result.sendMessage('go')
    await tick()
    fixture.detectChanges()

    expect(result.partial).toBeDefined()
    expect(result.final).toBeDefined()
    // partial is always an object (possibly empty); final is the validated
    // value once the structured-output part reports complete, else null.
    expect(typeof result.partial()).toBe('object')
  })
})
