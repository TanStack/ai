import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType } from '@tanstack/ai/client'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ChatClient } from '@tanstack/ai-client'
import { injectChat } from '../src/inject-chat'
import {
  createInterruptResumeSnapshot,
  createMockConnectionAdapter,
  createTextChunks,
  renderInjectChat,
} from './test-utils'

const tick = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('injectChat', () => {
  describe('interrupt state', () => {
    it('projects one immutable reactive snapshot with the deprecated pending alias', () => {
      const onInterruptStateChange = vi.fn()
      const { result, flush } = renderInjectChat({
        connection: createMockConnectionAdapter(),
        initialResumeSnapshot: createInterruptResumeSnapshot(),
        onInterruptStateChange,
      })

      expect(Object.isFrozen(result.interrupts())).toBe(true)
      expect(result.pendingInterrupts()).toBe(result.interrupts())
      expect(result.interrupts()[0]).toMatchObject({
        id: 'staged-interrupt',
        status: 'staged',
      })
      expect(result.interrupts()[1]).toMatchObject({
        id: 'invalid-interrupt',
        status: 'error',
        error: { code: 'invalid-payload' },
      })
      expect(result.interruptErrors()).toEqual([])
      expect(result.resuming()).toBe(false)
      expect(result.interrupts()[0]).toEqual(
        expect.objectContaining({
          resolveInterrupt: expect.any(Function),
          cancel: expect.any(Function),
          clearResolution: expect.any(Function),
        }),
      )

      result.resolveInterrupts(false)
      TestBed.flushEffects()
      flush()
      expect(result.interruptErrors()[0]?.code).toBe(
        'unsupported-bulk-operation',
      )
      expect(onInterruptStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          interrupts: result.interrupts(),
          interruptErrors: result.interruptErrors(),
        }),
      )
    })

    it('delegates every root interrupt control to ChatClient', async () => {
      const resolve = vi
        .spyOn(ChatClient.prototype, 'resolveInterrupts')
        .mockImplementation(() => {})
      const cancel = vi
        .spyOn(ChatClient.prototype, 'cancelInterrupts')
        .mockImplementation(() => {})
      const retry = vi
        .spyOn(ChatClient.prototype, 'retryInterrupts')
        .mockImplementation(() => {})
      const unsafe = vi
        .spyOn(ChatClient.prototype, 'resumeInterruptsUnsafe')
        .mockResolvedValue(true)
      const { result } = renderInjectChat({
        connection: createMockConnectionAdapter(),
      })
      const resolver = () => undefined
      const resume = [{ interruptId: 'one', status: 'cancelled' as const }]

      result.resolveInterrupts(resolver)
      result.cancelInterrupts()
      result.retryInterrupts()
      await expect(result.resumeInterruptsUnsafe(resume)).resolves.toBe(true)

      expect(resolve).toHaveBeenCalledWith(resolver)
      expect(cancel).toHaveBeenCalledOnce()
      expect(retry).toHaveBeenCalledOnce()
      expect(unsafe).toHaveBeenCalledWith(resume, undefined)
    })
  })

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

describe('injectChat — resume', () => {
  it('forwards onResumeStateChange to ChatClient', async () => {
    const onResumeStateChange = vi.fn()
    const adapter = createMockConnectionAdapter({
      chunks: [
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          timestamp: Date.now(),
          delta: 'Hi',
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: Date.now(),
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'interrupt-1', reason: 'client_tool_input' }],
          },
        },
      ],
    })
    const { result } = renderInjectChat({
      connection: adapter,
      threadId: 'thread-1',
      onResumeStateChange,
    })

    await result.sendMessage('Hi')

    // A run that pauses on an interrupt forwards interrupt (state) resume —
    // the thread/run ids to target on a follow-up. No delivery cursor.
    expect(onResumeStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        runId: expect.any(String),
      }),
      expect.arrayContaining([expect.objectContaining({ id: 'interrupt-1' })]),
    )
  })
})

describe('injectChat — structured output', () => {
  // Mount injectChat directly so the `outputSchema` generic flows through and
  // the schema-gated `partial` / `final` signals are present on the result.
  // The shared renderInjectChat harness erases the schema type.
  function mountStructuredHost(schema: z.ZodTypeAny) {
    const adapter = createMockConnectionAdapter()

    @Component({ standalone: true, template: '' })
    class StructuredHost {
      chat = injectChat({ connection: adapter, outputSchema: schema })
    }
    const fixture = TestBed.createComponent(StructuredHost)
    fixture.detectChanges()
    return {
      result: fixture.componentInstance.chat,
      flush: () => fixture.detectChanges(),
    }
  }

  it('partial → final transition via setMessages', () => {
    const schema = z.object({ title: z.string() })
    const { result, flush } = mountStructuredHost(schema)

    // Feed a partial structured-output part (status: 'streaming').
    result.setMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'go' }],
        createdAt: new Date(),
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'streaming',
            partial: { title: 'Hi' },
            raw: '{"title":"Hi"',
          },
        ],
        createdAt: new Date(),
      },
    ])
    flush()

    expect(result.partial()).toEqual({ title: 'Hi' })
    expect(result.final()).toBeNull()

    // Transition to complete: status becomes 'complete' and data is populated.
    result.setMessages([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'go' }],
        createdAt: new Date(),
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'complete',
            partial: { title: 'Hi' },
            data: { title: 'Hi' },
            raw: '{"title":"Hi"}',
          },
        ],
        createdAt: new Date(),
      },
    ])
    flush()

    expect(result.final()).toEqual({ title: 'Hi' })
    // partial() falls back to data when status is complete
    expect(result.partial()).toMatchObject({ title: 'Hi' })
  })

  it('guard case: no preceding user message → final() is null', () => {
    const schema = z.object({ title: z.string() })
    const { result, flush } = mountStructuredHost(schema)

    // Only an assistant message — no preceding user message.
    result.setMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'structured-output',
            status: 'complete',
            data: { title: 'Hi' },
            raw: '{"title":"Hi"}',
          },
        ],
        createdAt: new Date(),
      },
    ])
    flush()

    // activeStructuredPart returns null when lastUserIndex === -1, so final() must be null.
    expect(result.final()).toBeNull()
  })
})
