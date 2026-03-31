/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import {
  collectChunks,
  createMockAdapter,
  ev,
  getDeltas,
  serverTool,
} from './test-utils'
import type { StreamChunk } from '../src/types'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'

// ============================================================================
// Tests
// ============================================================================

describe('chat() middleware', () => {
  // ==========================================================================
  // Basic lifecycle hooks
  // ==========================================================================
  describe('lifecycle hooks', () => {
    it('should call onStart and onFinish for a simple stream', async () => {
      const onStart = vi.fn()
      const onFinish = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hello'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart,
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onStart).toHaveBeenCalledOnce()
      expect(onFinish).toHaveBeenCalledOnce()
      expect(onFinish.mock.calls[0]![1]).toMatchObject({
        finishReason: 'stop',
        content: 'Hello',
      })
    })

    it('should call onError on adapter errors', async () => {
      const onError = vi.fn()
      const onFinish = vi.fn()

      const { adapter } = createMockAdapter({
        // eslint-disable-next-line require-yield
        chatStreamFn: async function* () {
          throw new Error('Adapter failure')
        },
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onError,
        onFinish,
      }

      try {
        const stream = chat({
          adapter,
          messages: [{ role: 'user', content: 'Hi' }],
          middleware: [middleware],
        })
        await collectChunks(stream as AsyncIterable<StreamChunk>)
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledOnce()
      expect(onFinish).not.toHaveBeenCalled()
    })

    it('should call exactly one terminal hook per run', async () => {
      const onStart = vi.fn()
      const onFinish = vi.fn()
      const onAbort = vi.fn()
      const onError = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart,
        onFinish,
        onAbort,
        onError,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Exactly one terminal hook
      const terminalCalls =
        onFinish.mock.calls.length +
        onAbort.mock.calls.length +
        onError.mock.calls.length
      expect(terminalCalls).toBe(1)
      expect(onFinish).toHaveBeenCalledOnce()
    })
  })

  // ==========================================================================
  // onConfig
  // ==========================================================================
  describe('onConfig', () => {
    it('should call onConfig at init phase', async () => {
      const phases: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onConfig: (ctx) => {
          // Capture phase at call time since context is mutable
          phases.push(ctx.phase)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Called at least twice: init + beforeModel
      expect(phases).toEqual(['init', 'beforeModel'])
    })

    it('should allow onConfig to transform system prompts', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onConfig: (_ctx, config) => ({
          systemPrompts: [...config.systemPrompts, 'Added by middleware'],
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        systemPrompts: ['Original'],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // The adapter should receive the transformed system prompts
      expect(calls[0]!.systemPrompts).toContain('Added by middleware')
      expect(calls[0]!.systemPrompts).toContain('Original')
    })

    it('should pipe config through multiple middlewares in order', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const mw1: ChatMiddleware = {
        name: 'first',
        onConfig: () => ({
          maxTokens: 100,
        }),
      }

      const mw2: ChatMiddleware = {
        name: 'second',
        onConfig: (_ctx, config) => ({
          // Can see what first middleware set
          maxTokens: (config.maxTokens ?? 0) + 50,
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [mw1, mw2],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Adapter should get maxTokens = 150 (100 + 50)
      expect(calls[0]!.maxTokens).toBe(150)
    })
  })

  // ==========================================================================
  // onChunk
  // ==========================================================================
  describe('onChunk', () => {
    it('should observe all chunks', async () => {
      const chunkTypes: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hello'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'observer',
        onChunk: (_ctx, chunk) => {
          chunkTypes.push(chunk.type)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(chunkTypes).toEqual([
        'RUN_STARTED',
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'RUN_FINISHED',
      ])
    })

    it('should allow chunk transformation', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('secret'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'redact',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return { ...chunk, delta: '***' }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const deltas = getDeltas(chunks)
      expect(deltas).toEqual(['***'])
    })

    it('should allow chunk dropping (null)', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('Hello'),
            ev.textContent('World'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'dropper',
        onChunk: (_ctx, chunk) => {
          if (
            chunk.type === 'TEXT_MESSAGE_CONTENT' &&
            chunk.delta === 'Hello'
          ) {
            return null
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(getDeltas(chunks)).toEqual(['World'])
    })

    it('should allow chunk expansion (chunk[])', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('AB'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'expander',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return [
              { ...chunk, delta: 'A' } as StreamChunk,
              { ...chunk, delta: 'B' } as StreamChunk,
            ]
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(getDeltas(chunks)).toEqual(['A', 'B'])
    })

    it('should pipe chunks through multiple middleware in order', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hello'), ev.runFinished('stop')],
        ],
      })

      const mw1: ChatMiddleware = {
        name: 'upper',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return { ...chunk, delta: chunk.delta.toUpperCase() }
          }
          return undefined
        },
      }

      const mw2: ChatMiddleware = {
        name: 'exclaim',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return { ...chunk, delta: chunk.delta + '!' }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [mw1, mw2],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // First middleware uppercases, second appends !
      expect(getDeltas(chunks)).toEqual(['HELLO!'])
    })

    it('should handle expansion followed by another middleware', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('AB'), ev.runFinished('stop')],
        ],
      })

      const mw1: ChatMiddleware = {
        name: 'expander',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return [
              { ...chunk, delta: 'A' } as StreamChunk,
              { ...chunk, delta: 'B' } as StreamChunk,
            ]
          }
          return undefined
        },
      }

      const mw2: ChatMiddleware = {
        name: 'suffix',
        onChunk: (_ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return { ...chunk, delta: chunk.delta + '!' }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [mw1, mw2],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Both expanded chunks go through suffix middleware
      expect(getDeltas(chunks)).toEqual(['A!', 'B!'])
    })
  })

  // ==========================================================================
  // onBeforeToolCall / onAfterToolCall
  // ==========================================================================
  describe('tool call hooks', () => {
    it('should call onBeforeToolCall and onAfterToolCall', async () => {
      const onBeforeToolCall = vi.fn()
      const onAfterToolCall = vi.fn()

      const tool = serverTool('myTool', () => ({ result: 'done' }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onBeforeToolCall,
        onAfterToolCall,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onBeforeToolCall).toHaveBeenCalledOnce()
      expect(onBeforeToolCall.mock.calls[0]![1].toolName).toBe('myTool')
      expect(onAfterToolCall).toHaveBeenCalledOnce()
      expect(onAfterToolCall.mock.calls[0]![1].ok).toBe(true)
    })

    it('should support transformArgs decision', async () => {
      const executeFn = vi.fn(() => ({ result: 'done' }))
      const tool = serverTool('myTool', executeFn)

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{"x":1}'),
            ev.toolEnd('tc-1', 'myTool', { input: { x: 1 } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onBeforeToolCall: () => ({
          type: 'transformArgs' as const,
          args: { x: 42 },
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool should be called with transformed args
      expect(executeFn).toHaveBeenCalledWith({ x: 42 }, expect.anything())
    })

    it('should support skip decision to return a cached result', async () => {
      const executeFn = vi.fn(() => ({ result: 'should not be called' }))
      const onAfterToolCall = vi.fn()
      const tool = serverTool('myTool', executeFn)

      const cachedResult = { weather: 'sunny', temp: 72 }

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{"city":"NYC"}'),
            ev.toolEnd('tc-1', 'myTool', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'cache',
        onBeforeToolCall: () => ({
          type: 'skip' as const,
          result: cachedResult,
        }),
        onAfterToolCall,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool execute should NOT be called
      expect(executeFn).not.toHaveBeenCalled()

      // onAfterToolCall should receive the cached result with ok=true, duration=0
      expect(onAfterToolCall).toHaveBeenCalledOnce()
      const afterInfo = onAfterToolCall.mock.calls[0]![1]
      expect(afterInfo.ok).toBe(true)
      expect(afterInfo.duration).toBe(0)
      expect(afterInfo.result).toEqual(cachedResult)
      expect(afterInfo.toolName).toBe('myTool')
      expect(afterInfo.toolCallId).toBe('tc-1')

      // The cached result should be fed back to the model in the next iteration
      // (the adapter is called a second time with tool result messages)
      expect(calls.length).toBe(2)
      const secondCallMessages = calls[1]!.messages as Array<{
        role: string
        content?: unknown
      }>
      const toolResultMsg = secondCallMessages.find((m) => m.role === 'tool')
      expect(toolResultMsg).toBeDefined()
    })

    it('should skip multiple tools independently based on cache', async () => {
      const executeA = vi.fn(() => ({ a: 'executed' }))
      const executeB = vi.fn(() => ({ b: 'executed' }))
      const toolA = serverTool('toolA', executeA)
      const toolB = serverTool('toolB', executeB)

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'toolA'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'toolA', { input: {} }),
            ev.toolStart('tc-2', 'toolB'),
            ev.toolArgs('tc-2', '{}'),
            ev.toolEnd('tc-2', 'toolB', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('done'), ev.runFinished('stop')],
        ],
      })

      // Cache only toolA, let toolB execute normally
      const middleware: ChatMiddleware = {
        name: 'selective-cache',
        onBeforeToolCall: (_ctx, hookCtx) => {
          if (hookCtx.toolName === 'toolA') {
            return {
              type: 'skip' as const,
              result: { a: 'cached' },
            }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [toolA, toolB],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // toolA skipped, toolB executed
      expect(executeA).not.toHaveBeenCalled()
      expect(executeB).toHaveBeenCalledOnce()
    })

    it('should support abort decision from onBeforeToolCall', async () => {
      const onAbort = vi.fn()
      const onFinish = vi.fn()
      const executeFn = vi.fn(() => ({ result: 'should not be called' }))
      const tool = serverTool('myTool', executeFn)

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onBeforeToolCall: () => ({
          type: 'abort' as const,
          reason: 'policy violation',
        }),
        onAbort,
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool should NOT be called
      expect(executeFn).not.toHaveBeenCalled()
      // onAbort should be called, not onFinish
      expect(onAbort).toHaveBeenCalledOnce()
      expect(onAbort.mock.calls[0]![1].reason).toBe('policy violation')
      expect(onFinish).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // onUsage
  // ==========================================================================
  describe('onUsage', () => {
    it('should call onUsage once with usage from RUN_FINISHED', async () => {
      const onUsage = vi.fn()
      const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('hi'),
            ev.runFinished('stop', 'run-1', usage),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onUsage,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Called once when the RUN_FINISHED chunk has usage
      expect(onUsage).toHaveBeenCalledTimes(1)
      expect(onUsage.mock.calls[0]![1]).toEqual(usage)
    })
  })

  // ==========================================================================
  // Context
  // ==========================================================================
  describe('context', () => {
    it('should pass user context to middleware hooks', async () => {
      const receivedCtx: Array<unknown> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart: (ctx) => {
          receivedCtx.push(ctx.context)
        },
        onChunk: (ctx) => {
          receivedCtx.push(ctx.context)
        },
      }

      const userContext = { userId: 'u-123', sessionId: 's-abc' }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
        context: userContext,
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // All hooks should receive the same context object
      for (const ctx of receivedCtx) {
        expect(ctx).toBe(userContext)
      }
    })

    it('should provide requestId and streamId in context', async () => {
      let capturedCtx: ChatMiddlewareContext | undefined

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart: (ctx) => {
          capturedCtx = ctx
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(capturedCtx).toBeDefined()
      expect(capturedCtx!.requestId).toBeTruthy()
      expect(capturedCtx!.streamId).toBeTruthy()
    })
  })

  // ==========================================================================
  // Backward compatibility
  // ==========================================================================
  describe('backward compatibility', () => {
    it('should work exactly the same without middleware', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hello'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(chunks.length).toBe(5)
      expect(chunks.map((c) => c.type)).toEqual([
        'RUN_STARTED',
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'RUN_FINISHED',
      ])
    })

    it('should work with empty middleware array', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('Hello'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(chunks.length).toBe(3)
    })
  })

  // ==========================================================================
  // Defer
  // ==========================================================================
  describe('defer', () => {
    it('should await deferred promises after terminal hook', async () => {
      const order: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart: (ctx) => {
          ctx.defer(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                order.push('deferred')
                resolve()
              }, 10)
            }),
          )
        },
        onFinish: () => {
          order.push('finish')
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Both should have completed
      expect(order).toContain('finish')
      expect(order).toContain('deferred')
    })
  })

  // ==========================================================================
  // Async middleware
  // ==========================================================================
  describe('async middleware', () => {
    it('should handle async onChunk without reordering chunks', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('A'),
            ev.textContent('B'),
            ev.textContent('C'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'slow',
        onChunk: async (_ctx, chunk) => {
          // Simulate async delay
          await new Promise((r) => setTimeout(r, 5))
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
            return {
              ...chunk,
              delta: chunk.delta.toLowerCase(),
            }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Order should be preserved despite async middleware
      expect(getDeltas(chunks)).toEqual(['a', 'b', 'c'])
    })
  })

  // ==========================================================================
  // Per-iteration onConfig
  // ==========================================================================
  describe('per-iteration onConfig', () => {
    it('should call onConfig before each model iteration', async () => {
      const phases: Array<string> = []
      const iterations: Array<number> = []

      const tool = serverTool('myTool', () => ({ result: 'done' }))

      const { adapter } = createMockAdapter({
        iterations: [
          // First iteration: model calls a tool
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          // Second iteration: model responds with text
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onConfig: (ctx) => {
          phases.push(ctx.phase)
          iterations.push(ctx.iteration)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // init + beforeModel (iter 0) + beforeModel (iter 1)
      expect(phases).toEqual(['init', 'beforeModel', 'beforeModel'])
      expect(iterations).toEqual([0, 0, 1])
    })
  })

  // ==========================================================================
  // ctx.abort() from middleware hooks
  // ==========================================================================
  describe('ctx.abort()', () => {
    it('should abort the run when ctx.abort() is called from onChunk', async () => {
      const onAbort = vi.fn()
      const onFinish = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('A'),
            ev.textContent('B'),
            ev.textContent('C'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'aborter',
        onChunk: (ctx, chunk) => {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta === 'B') {
            ctx.abort('seen enough')
          }
          return undefined
        },
        onAbort,
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onAbort).toHaveBeenCalledOnce()
      expect(onAbort.mock.calls[0]![1].reason).toBe('seen enough')
      expect(onFinish).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // onAfterToolCall error path
  // ==========================================================================
  describe('onAfterToolCall error handling', () => {
    it('should report tool execution errors in onAfterToolCall', async () => {
      const afterCalls: Array<{ ok: boolean; error?: unknown }> = []

      const tool = serverTool('failTool', () => {
        throw new Error('tool exploded')
      })

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'failTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'failTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textContent('recovered'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'error-observer',
        onAfterToolCall: (_ctx, info) => {
          afterCalls.push({ ok: info.ok, error: info.error })
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(afterCalls).toHaveLength(1)
      expect(afterCalls[0]!.ok).toBe(false)
      expect(afterCalls[0]!.error).toBeInstanceOf(Error)
    })
  })

  // ==========================================================================
  // Multiple middleware onBeforeToolCall composition
  // ==========================================================================
  describe('onBeforeToolCall composition', () => {
    it('should use first non-void decision from multiple middleware', async () => {
      const executeFn = vi.fn(() => ({ result: 'done' }))
      const tool = serverTool('myTool', executeFn)

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{"x":1}'),
            ev.toolEnd('tc-1', 'myTool', { input: { x: 1 } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      // First middleware returns void (passes through)
      const mw1: ChatMiddleware = {
        name: 'pass-through',
        onBeforeToolCall: vi.fn(),
      }

      // Second middleware transforms args
      const mw2: ChatMiddleware = {
        name: 'transformer',
        onBeforeToolCall: () => ({
          type: 'transformArgs' as const,
          args: { x: 99 },
        }),
      }

      // Third middleware should NOT be reached since mw2 returned a decision
      const mw3OnBefore = vi.fn()
      const mw3: ChatMiddleware = {
        name: 'should-not-run',
        onBeforeToolCall: mw3OnBefore,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [mw1, mw2, mw3],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool should be called with mw2's transformed args
      expect(executeFn).toHaveBeenCalledWith({ x: 99 }, expect.anything())
      // mw3's onBeforeToolCall should NOT have been called
      expect(mw3OnBefore).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // onConfig tools transform
  // ==========================================================================
  describe('onConfig tools transform', () => {
    it('should allow middleware to add tools via onConfig', async () => {
      const addedToolExecute = vi.fn(() => ({ added: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'addedTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'addedTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'tool-injector',
        onConfig: (_ctx, config) => ({
          tools: [
            ...config.tools,
            {
              name: 'addedTool',
              description: 'Added by middleware',
              execute: addedToolExecute,
            },
          ],
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(addedToolExecute).toHaveBeenCalledOnce()
    })
  })

  // ==========================================================================
  // Async onStart
  // ==========================================================================
  describe('async onStart', () => {
    it('should await async onStart before streaming begins', async () => {
      const order: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'async-start',
        onStart: async () => {
          await new Promise((r) => setTimeout(r, 20))
          order.push('onStart-done')
        },
        onChunk: () => {
          order.push('chunk')
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // onStart should complete before any chunks are processed
      expect(order[0]).toBe('onStart-done')
      expect(order.filter((o) => o === 'chunk').length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // chunkIndex tracking
  // ==========================================================================
  describe('chunkIndex tracking', () => {
    it('should increment chunkIndex for each yielded chunk', async () => {
      const indices: Array<number> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('A'),
            ev.textContent('B'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'index-tracker',
        onChunk: (ctx) => {
          indices.push(ctx.chunkIndex)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Should be sequential indices starting from 0
      expect(indices).toEqual([0, 1, 2, 3])
    })
  })

  // ==========================================================================
  // conversationId propagation
  // ==========================================================================
  describe('conversationId', () => {
    it('should propagate conversationId to middleware context', async () => {
      let capturedConvId: string | undefined

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart: (ctx) => {
          capturedConvId = ctx.conversationId
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
        conversationId: 'conv-42',
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(capturedConvId).toBe('conv-42')
    })
  })

  // ==========================================================================
  // End-to-end hook ordering with tool loop
  // ==========================================================================
  describe('full hook ordering', () => {
    it('should fire all hooks in correct order during a tool-call loop', async () => {
      const events: Array<string> = []

      const tool = serverTool('myTool', () => ({ done: true }))

      const usage = {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      }

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls', 'run-1', usage),
          ],
          [
            ev.runStarted(),
            ev.textContent('Done'),
            ev.runFinished('stop', 'run-2', usage),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'order-tracker',
        onConfig: (ctx) => {
          events.push(`onConfig:${ctx.phase}`)
        },
        onStart: () => {
          events.push('onStart')
        },
        onChunk: (_ctx, chunk) => {
          events.push(`onChunk:${chunk.type}`)
        },
        onBeforeToolCall: (_ctx, hookCtx) => {
          events.push(`onBeforeToolCall:${hookCtx.toolName}`)
        },
        onAfterToolCall: (_ctx, info) => {
          events.push(`onAfterToolCall:${info.toolName}:${info.ok}`)
        },
        onUsage: () => {
          events.push('onUsage')
        },
        onFinish: () => {
          events.push('onFinish')
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Verify the expected ordering
      expect(events).toEqual([
        // Init phase
        'onConfig:init',
        'onStart',
        // First model call (beforeModel phase)
        'onConfig:beforeModel',
        'onChunk:RUN_STARTED',
        'onChunk:TOOL_CALL_START',
        'onChunk:TOOL_CALL_ARGS',
        'onChunk:TOOL_CALL_END',
        'onChunk:RUN_FINISHED',
        'onUsage',
        // Tool execution phase
        'onBeforeToolCall:myTool',
        'onAfterToolCall:myTool:true',
        // Tool result events (piped through middleware)
        'onChunk:TOOL_CALL_END',
        'onChunk:TOOL_CALL_RESULT',
        // Second model call (beforeModel phase)
        'onConfig:beforeModel',
        'onChunk:RUN_STARTED',
        'onChunk:TEXT_MESSAGE_CONTENT',
        'onChunk:RUN_FINISHED',
        'onUsage',
        // Terminal
        'onFinish',
      ])
    })
  })

  // ==========================================================================
  // Phase transitions in context
  // ==========================================================================
  describe('phase transitions', () => {
    it('should set correct phase during each hook', async () => {
      const phaseLog: Array<{ hook: string; phase: string }> = []

      const tool = serverTool('myTool', () => ({ ok: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'phase-tracker',
        onConfig: (ctx) => {
          phaseLog.push({ hook: 'onConfig', phase: ctx.phase })
        },
        onStart: (ctx) => {
          phaseLog.push({ hook: 'onStart', phase: ctx.phase })
        },
        onChunk: (ctx) => {
          phaseLog.push({ hook: 'onChunk', phase: ctx.phase })
        },
        onBeforeToolCall: (ctx) => {
          phaseLog.push({ hook: 'onBeforeToolCall', phase: ctx.phase })
        },
        onAfterToolCall: (ctx) => {
          phaseLog.push({ hook: 'onAfterToolCall', phase: ctx.phase })
        },
        onFinish: (ctx) => {
          phaseLog.push({ hook: 'onFinish', phase: ctx.phase })
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Verify phases for key hooks
      const configPhases = phaseLog
        .filter((e) => e.hook === 'onConfig')
        .map((e) => e.phase)
      expect(configPhases).toEqual(['init', 'beforeModel', 'beforeModel'])

      // onChunk phases: model stream chunks are 'modelStream', tool result chunks are 'afterTools'
      const chunkPhases = phaseLog
        .filter((e) => e.hook === 'onChunk')
        .map((e) => e.phase)
      // All chunk phases should be either 'modelStream' or 'afterTools'
      expect(
        chunkPhases.every((p) => p === 'modelStream' || p === 'afterTools'),
      ).toBe(true)
      // At least one should be 'modelStream' (from the adapter stream)
      expect(
        chunkPhases.filter((p) => p === 'modelStream').length,
      ).toBeGreaterThan(0)
      // Tool result chunks should be in 'afterTools' phase
      expect(
        chunkPhases.filter((p) => p === 'afterTools').length,
      ).toBeGreaterThan(0)

      // onBeforeToolCall should be in 'beforeTools' phase
      const beforeToolPhases = phaseLog
        .filter((e) => e.hook === 'onBeforeToolCall')
        .map((e) => e.phase)
      expect(beforeToolPhases).toEqual(['beforeTools'])

      // onAfterToolCall should be in 'beforeTools' phase (still in tool execution)
      const afterToolPhases = phaseLog
        .filter((e) => e.hook === 'onAfterToolCall')
        .map((e) => e.phase)
      expect(afterToolPhases).toEqual(['beforeTools'])
    })
  })

  // ==========================================================================
  // onConfig transforms messages
  // ==========================================================================
  describe('onConfig message transform', () => {
    it('should allow middleware to prepend messages via onConfig', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'message-injector',
        onConfig: (_ctx, config) => ({
          messages: [
            { role: 'user' as const, content: 'Context: you are helpful' },
            ...config.messages,
          ],
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Adapter should receive the extra message prepended
      const adapterMessages = calls[0]!.messages as Array<{ content: string }>
      expect(adapterMessages.length).toBeGreaterThanOrEqual(2)
      expect(adapterMessages[0]!.content).toBe('Context: you are helpful')
    })
  })

  // ==========================================================================
  // onConfig transforms temperature/topP/maxTokens
  // ==========================================================================
  describe('onConfig parameter transforms', () => {
    it('should allow middleware to transform temperature, topP, and maxTokens', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'param-override',
        onConfig: () => ({
          temperature: 0.9,
          topP: 0.8,
          maxTokens: 500,
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.1,
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls[0]!.temperature).toBe(0.9)
      expect(calls[0]!.topP).toBe(0.8)
      expect(calls[0]!.maxTokens).toBe(500)
    })
  })

  // ==========================================================================
  // onFinish info fields
  // ==========================================================================
  describe('onFinish info', () => {
    it('should provide duration and usage in FinishInfo', async () => {
      const onFinish = vi.fn()
      const usage = { promptTokens: 20, completionTokens: 10, totalTokens: 30 }

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('Hello world'),
            ev.runFinished('stop', 'run-1', usage),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onFinish).toHaveBeenCalledOnce()
      const info = onFinish.mock.calls[0]![1]
      expect(info.finishReason).toBe('stop')
      expect(info.content).toBe('Hello world')
      expect(info.duration).toBeGreaterThanOrEqual(0)
      expect(info.usage).toEqual(usage)
    })

    it('should accumulate content across multiple text chunks', async () => {
      const onFinish = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('Hello'),
            ev.textContent(' '),
            ev.textContent('world'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onFinish.mock.calls[0]![1].content).toBe('Hello world')
    })
  })

  // ==========================================================================
  // onError info fields
  // ==========================================================================
  describe('onError info', () => {
    it('should provide the error object and duration in ErrorInfo', async () => {
      const onError = vi.fn()

      const { adapter } = createMockAdapter({
        // eslint-disable-next-line require-yield
        chatStreamFn: async function* () {
          throw new Error('network timeout')
        },
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onError,
      }

      try {
        const stream = chat({
          adapter,
          messages: [{ role: 'user', content: 'Hi' }],
          middleware: [middleware],
        })
        await collectChunks(stream as AsyncIterable<StreamChunk>)
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledOnce()
      const info = onError.mock.calls[0]![1]
      expect(info.error).toBeInstanceOf(Error)
      expect((info.error as Error).message).toBe('network timeout')
      expect(info.duration).toBeGreaterThanOrEqual(0)
    })
  })

  // ==========================================================================
  // Multiple tools with middleware
  // ==========================================================================
  describe('multiple tools', () => {
    it('should call onBeforeToolCall and onAfterToolCall for each tool', async () => {
      const beforeNames: Array<string> = []
      const afterNames: Array<string> = []

      const toolA = serverTool('toolA', () => ({ a: true }))
      const toolB = serverTool('toolB', () => ({ b: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'toolA'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'toolA', { input: {} }),
            ev.toolStart('tc-2', 'toolB'),
            ev.toolArgs('tc-2', '{}'),
            ev.toolEnd('tc-2', 'toolB', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'multi-tool-observer',
        onBeforeToolCall: (_ctx, hookCtx) => {
          beforeNames.push(hookCtx.toolName)
        },
        onAfterToolCall: (_ctx, info) => {
          afterNames.push(info.toolName)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [toolA, toolB],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(beforeNames).toEqual(['toolA', 'toolB'])
      expect(afterNames).toEqual(['toolA', 'toolB'])
    })
  })

  // ==========================================================================
  // Deferred promise rejection doesn't crash
  // ==========================================================================
  describe('deferred rejection', () => {
    it('should not crash when a deferred promise rejects', async () => {
      const onFinish = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onStart: (ctx) => {
          ctx.defer(Promise.reject(new Error('fire and forget failure')))
        },
        onFinish,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })

      // Should not throw
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onFinish).toHaveBeenCalledOnce()
    })
  })

  // ==========================================================================
  // onAfterToolCall result and duration
  // ==========================================================================
  describe('onAfterToolCall details', () => {
    it('should provide result and positive duration on success', async () => {
      const afterCalls: Array<{
        result: unknown
        duration: number
        toolCallId: string
      }> = []

      const tool = serverTool('slowTool', async () => {
        await new Promise((r) => setTimeout(r, 15))
        return { data: 42 }
      })

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'slowTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'slowTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onAfterToolCall: (_ctx, info) => {
          afterCalls.push({
            result: info.result,
            duration: info.duration,
            toolCallId: info.toolCallId,
          })
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(afterCalls).toHaveLength(1)
      expect(afterCalls[0]!.result).toEqual({ data: 42 })
      expect(afterCalls[0]!.duration).toBeGreaterThanOrEqual(10)
      expect(afterCalls[0]!.toolCallId).toBe('tc-1')
    })
  })

  // ==========================================================================
  // Multiple middleware hook ordering
  // ==========================================================================
  describe('multiple middleware ordering', () => {
    it('should call hooks on all middlewares in array order', async () => {
      const order: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const mw1: ChatMiddleware = {
        name: 'first',
        onStart: () => {
          order.push('mw1:onStart')
        },
        onChunk: () => {
          order.push('mw1:onChunk')
        },
        onFinish: () => {
          order.push('mw1:onFinish')
        },
      }

      const mw2: ChatMiddleware = {
        name: 'second',
        onStart: () => {
          order.push('mw2:onStart')
        },
        onChunk: () => {
          order.push('mw2:onChunk')
        },
        onFinish: () => {
          order.push('mw2:onFinish')
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [mw1, mw2],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // onStart: mw1 then mw2
      const startEvents = order.filter((e) => e.includes('onStart'))
      expect(startEvents).toEqual(['mw1:onStart', 'mw2:onStart'])

      // onChunk: for each chunk, mw1 then mw2
      // With 3 chunks (RUN_STARTED, TEXT_MESSAGE_CONTENT, RUN_FINISHED),
      // each should go through mw1 then mw2
      const chunkEvents = order.filter((e) => e.includes('onChunk'))
      for (let i = 0; i < chunkEvents.length; i += 2) {
        expect(chunkEvents[i]).toBe('mw1:onChunk')
        expect(chunkEvents[i + 1]).toBe('mw2:onChunk')
      }

      // onFinish: mw1 then mw2
      const finishEvents = order.filter((e) => e.includes('onFinish'))
      expect(finishEvents).toEqual(['mw1:onFinish', 'mw2:onFinish'])
    })
  })

  // ==========================================================================
  // ctx.abort() from onStart
  // ==========================================================================
  describe('abort from onStart', () => {
    it('should abort before streaming when ctx.abort() is called in onStart', async () => {
      const onAbort = vi.fn()
      const onChunk = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'early-aborter',
        onStart: (ctx) => {
          ctx.abort('not allowed')
        },
        onChunk,
        onAbort,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onAbort).toHaveBeenCalledOnce()
      expect(onAbort.mock.calls[0]![1].reason).toBe('not allowed')
      // No chunks should have been processed since we aborted before streaming
      expect(onChunk).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // onConfig returning void passes through
  // ==========================================================================
  describe('onConfig passthrough', () => {
    it('should pass through config unchanged when onConfig returns void', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'observer-only',
        onConfig: () => {
          // observe but don't return anything
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        systemPrompts: ['Be helpful'],
        temperature: 0.5,
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Original config should reach the adapter untouched
      expect(calls[0]!.systemPrompts).toEqual(['Be helpful'])
      expect(calls[0]!.temperature).toBe(0.5)
    })
  })

  // ==========================================================================
  // onConfig metadata and modelOptions transform
  // ==========================================================================
  describe('onConfig metadata transform', () => {
    it('should allow middleware to set metadata and modelOptions', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'meta-injector',
        onConfig: (_ctx, config) => ({
          metadata: { ...config.metadata, injected: true },
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        metadata: { original: true },
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls[0]!.metadata).toEqual({ original: true, injected: true })
    })
  })

  // ==========================================================================
  // onUsage not called when no usage data
  // ==========================================================================
  describe('onUsage without usage data', () => {
    it('should not call onUsage when RUN_FINISHED has no usage', async () => {
      const onUsage = vi.fn()

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'test',
        onUsage,
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(onUsage).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // All hooks from a single middleware object
  // ==========================================================================
  describe('single middleware with all hooks', () => {
    it('should invoke every hook on one middleware in a full tool-call flow', async () => {
      const hooksCalled = new Set<string>()

      const tool = serverTool('myTool', () => ({ ok: true }))
      const usage = { promptTokens: 5, completionTokens: 3, totalTokens: 8 }

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls', 'run-1', usage),
          ],
          [
            ev.runStarted(),
            ev.textContent('Done'),
            ev.runFinished('stop', 'run-2', usage),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'all-hooks',
        onConfig: () => {
          hooksCalled.add('onConfig')
        },
        onStart: () => {
          hooksCalled.add('onStart')
        },
        onChunk: () => {
          hooksCalled.add('onChunk')
        },
        onBeforeToolCall: () => {
          hooksCalled.add('onBeforeToolCall')
        },
        onAfterToolCall: () => {
          hooksCalled.add('onAfterToolCall')
        },
        onUsage: () => {
          hooksCalled.add('onUsage')
        },
        onFinish: () => {
          hooksCalled.add('onFinish')
        },
        onAbort: () => {
          hooksCalled.add('onAbort')
        },
        onError: () => {
          hooksCalled.add('onError')
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // All hooks except onAbort and onError should have been called
      expect(hooksCalled).toContain('onConfig')
      expect(hooksCalled).toContain('onStart')
      expect(hooksCalled).toContain('onChunk')
      expect(hooksCalled).toContain('onBeforeToolCall')
      expect(hooksCalled).toContain('onAfterToolCall')
      expect(hooksCalled).toContain('onUsage')
      expect(hooksCalled).toContain('onFinish')
      // These are exclusive terminal hooks — only onFinish should fire
      expect(hooksCalled).not.toContain('onAbort')
      expect(hooksCalled).not.toContain('onError')
    })
  })

  // ==========================================================================
  // onConfig tools sent to adapter (Fix: this.tools vs this.params.tools)
  // ==========================================================================
  describe('onConfig tools sent to adapter', () => {
    it('should send middleware-modified tools to the adapter chatStream', async () => {
      const injectedToolExecute = vi.fn(() => ({ injected: true }))

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'tool-injector',
        onConfig: (_ctx, config) => ({
          tools: [
            ...config.tools,
            {
              name: 'injectedTool',
              description: 'Injected by middleware',
              execute: injectedToolExecute,
            },
          ],
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // The adapter should receive the tools array including the injected tool
      const adapterCall = calls[0] as { tools?: Array<{ name: string }> }
      expect(adapterCall.tools).toBeDefined()
      expect(adapterCall.tools!.some((t) => t.name === 'injectedTool')).toBe(
        true,
      )
    })
  })

  // ==========================================================================
  // Pending tool calls run middleware hooks (Fix: checkForPendingToolCalls)
  // ==========================================================================
  describe('pending tool calls middleware hooks', () => {
    it('should call onBeforeToolCall/onAfterToolCall for pending tool calls in messages', async () => {
      const beforeNames: Array<string> = []
      const afterNames: Array<string> = []

      const tool = serverTool('myTool', () => ({ done: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          // After pending tool replay, model responds with text
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'hook-tracker',
        onBeforeToolCall: (_ctx, hookCtx) => {
          beforeNames.push(hookCtx.toolName)
        },
        onAfterToolCall: (_ctx, info) => {
          afterNames.push(info.toolName)
        },
      }

      // Pass messages with an assistant tool call but NO corresponding tool result
      // This triggers checkForPendingToolCalls
      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Hi' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tc-pending',
                type: 'function' as const,
                function: { name: 'myTool', arguments: '{}' },
              },
            ],
          },
        ],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Middleware hooks should have been called for the pending tool call
      expect(beforeNames).toContain('myTool')
      expect(afterNames).toContain('myTool')
    })
  })

  // ==========================================================================
  // Tools returning plain text (Fix: safe JSON.parse)
  // ==========================================================================
  describe('tools returning plain text', () => {
    it('should not throw when a tool returns a non-JSON string', async () => {
      const tool = serverTool('greet', () => 'Hello, world!')

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'greet'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'greet', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
      })

      // Should not throw — previously would throw JSON.parse error
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should still parse valid JSON string results', async () => {
      const afterResults: Array<unknown> = []
      const tool = serverTool('getData', () => '{"value":42}')

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'getData'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'getData', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'result-observer',
        onAfterToolCall: (_ctx, info) => {
          afterResults.push(info.result)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Valid JSON string results are parsed into objects
      expect(afterResults[0]).toEqual({ value: 42 })
    })
  })

  // ==========================================================================
  // Abort check in pending tool calls
  // ==========================================================================
  describe('pending tool calls abort check', () => {
    it('should stop processing when middleware aborts during pending tool execution', async () => {
      const tool = serverTool('myTool', () => ({ done: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'aborter',
        onBeforeToolCall: (ctx) => {
          ctx.abort('stop now')
          return { type: 'abort', reason: 'stop now' }
        },
      }

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Hi' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tc-pending',
                type: 'function' as const,
                function: { name: 'myTool', arguments: '{}' },
              },
            ],
          },
        ],
        tools: [tool],
        middleware: [middleware],
      })

      // Should not throw — abort should be handled gracefully
      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      // Stream should be short (aborted before model response)
      expect(chunks.length).toBeLessThanOrEqual(1)
    })
  })

  // ==========================================================================
  // accumulatedContent sync to middleware context
  // ==========================================================================
  describe('accumulatedContent sync', () => {
    it('should keep ctx.accumulatedContent in sync during streaming', async () => {
      const contentSnapshots: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textContent('Hello'),
            ev.textContent(' world'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'content-observer',
        onChunk: (ctx) => {
          contentSnapshots.push(ctx.accumulatedContent)
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // After each text content chunk, accumulatedContent should be updated
      // Snapshots include non-text chunks too (RUN_STARTED, RUN_FINISHED)
      // but the text ones should show accumulated content
      const nonEmpty = contentSnapshots.filter((s) => s.length > 0)
      expect(nonEmpty).toContain('Hello')
      expect(nonEmpty).toContain('Hello world')
    })
  })

  // ==========================================================================
  // onConfig removing tools
  // ==========================================================================
  describe('onConfig tool removal', () => {
    it('should allow middleware to remove tools via onConfig', async () => {
      const executeFn = vi.fn(() => ({ result: 'done' }))
      const toolToRemove = serverTool('blocked', executeFn)
      const toolToKeep = serverTool('allowed', () => ({ ok: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'blocked'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'blocked', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('ok'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'tool-filter',
        onConfig: (_ctx, config) => ({
          tools: config.tools.filter((t) => t.name !== 'blocked'),
        }),
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [toolToRemove, toolToKeep],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // 'blocked' tool was removed by middleware, so it should NOT execute
      expect(executeFn).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Multiple deferred promises
  // ==========================================================================
  describe('multiple deferred promises', () => {
    it('should await all deferred promises from multiple hooks', async () => {
      const completed: Array<string> = []

      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('hi'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'multi-defer',
        onStart: (ctx) => {
          ctx.defer(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                completed.push('defer-1')
                resolve()
              }, 5)
            }),
          )
          ctx.defer(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                completed.push('defer-2')
                resolve()
              }, 10)
            }),
          )
        },
        onChunk: (ctx) => {
          ctx.defer(
            new Promise<void>((resolve) => {
              setTimeout(() => {
                completed.push('defer-3')
                resolve()
              }, 5)
            }),
          )
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // All deferred promises should have settled
      expect(completed).toContain('defer-1')
      expect(completed).toContain('defer-2')
      expect(completed).toContain('defer-3')
    })
  })

  // ==========================================================================
  // Per-iteration config transforms (multi-step agent loop)
  // ==========================================================================
  describe('per-iteration config transforms', () => {
    it('should apply different config transforms at init, iteration 0, and iteration 1', async () => {
      const tool = serverTool('myTool', () => ({ ok: true }))

      const { adapter, calls } = createMockAdapter({
        iterations: [
          // Iteration 0: model calls a tool
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          // Iteration 1: model responds with text
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const middleware: ChatMiddleware = {
        name: 'per-step-config',
        onConfig: (ctx) => {
          if (ctx.phase === 'init') {
            return {
              systemPrompts: ['init-prompt'],
              temperature: 0.1,
            }
          }
          if (ctx.phase === 'beforeModel' && ctx.iteration === 0) {
            return {
              systemPrompts: ['iter-0-prompt'],
              temperature: 0.5,
              maxTokens: 100,
            }
          }
          if (ctx.phase === 'beforeModel' && ctx.iteration === 1) {
            return {
              systemPrompts: ['iter-1-prompt'],
              temperature: 0.9,
              maxTokens: 200,
            }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Iteration 0: adapter receives iter-0 config (overrides init)
      expect(calls[0]!.systemPrompts).toEqual(['iter-0-prompt'])
      expect(calls[0]!.temperature).toBe(0.5)
      expect(calls[0]!.maxTokens).toBe(100)

      // Iteration 1: adapter receives iter-1 config
      expect(calls[1]!.systemPrompts).toEqual(['iter-1-prompt'])
      expect(calls[1]!.temperature).toBe(0.9)
      expect(calls[1]!.maxTokens).toBe(200)
    })

    it('should accumulate config changes across multiple middleware per iteration', async () => {
      const tool = serverTool('myTool', () => ({ ok: true }))

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      // First middleware: adds a system prompt each iteration
      const mw1: ChatMiddleware = {
        name: 'prompt-adder',
        onConfig: (ctx, config) => {
          if (ctx.phase === 'beforeModel') {
            return {
              systemPrompts: [
                ...config.systemPrompts,
                `added-by-mw1-iter-${ctx.iteration}`,
              ],
            }
          }
          return undefined
        },
      }

      // Second middleware: doubles maxTokens on iteration 1
      const mw2: ChatMiddleware = {
        name: 'token-scaler',
        onConfig: (ctx, config) => {
          if (ctx.phase === 'beforeModel' && ctx.iteration === 1) {
            return {
              maxTokens: (config.maxTokens ?? 100) * 2,
            }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        systemPrompts: ['base'],
        maxTokens: 100,
        middleware: [mw1, mw2],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Iteration 0: mw1 adds prompt, mw2 does nothing
      expect(calls[0]!.systemPrompts).toEqual(['base', 'added-by-mw1-iter-0'])
      expect(calls[0]!.maxTokens).toBe(100)

      // Iteration 1: mw1 adds prompt, mw2 doubles maxTokens
      // Note: mw1's change from iter-0 persists since applyMiddlewareConfig updates the engine
      expect(calls[1]!.systemPrompts).toContain('added-by-mw1-iter-1')
      expect(calls[1]!.maxTokens).toBe(200)
    })

    it('should let middleware observe config changes from the previous iteration', async () => {
      const configSnapshots: Array<{
        phase: string
        iteration: number
        maxTokens?: number
        systemPrompts: Array<string>
      }> = []

      const tool = serverTool('myTool', () => ({ ok: true }))

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'myTool'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'myTool', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      // Middleware that modifies maxTokens and observes state
      const middleware: ChatMiddleware = {
        name: 'observer-mutator',
        onConfig: (ctx, config) => {
          configSnapshots.push({
            phase: ctx.phase,
            iteration: ctx.iteration,
            maxTokens: config.maxTokens,
            systemPrompts: [...config.systemPrompts],
          })

          // On each beforeModel call, bump maxTokens by 50
          if (ctx.phase === 'beforeModel') {
            return {
              maxTokens: (config.maxTokens ?? 0) + 50,
            }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        maxTokens: 100,
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // init: sees original maxTokens=100
      expect(configSnapshots[0]).toMatchObject({
        phase: 'init',
        iteration: 0,
        maxTokens: 100,
      })

      // beforeModel iter 0: sees maxTokens=100 (init didn't modify it)
      expect(configSnapshots[1]).toMatchObject({
        phase: 'beforeModel',
        iteration: 0,
        maxTokens: 100,
      })

      // beforeModel iter 1: sees maxTokens=150 (iter 0 added 50)
      expect(configSnapshots[2]).toMatchObject({
        phase: 'beforeModel',
        iteration: 1,
        maxTokens: 150,
      })
    })

    it('should let middleware change tools between iterations', async () => {
      const executedTools: Array<string> = []
      let onConfigCallCount = 0

      const toolA = serverTool('toolA', () => {
        executedTools.push('toolA')
        return { a: true }
      })

      const toolB = serverTool('toolB', () => {
        executedTools.push('toolB')
        return { b: true }
      })

      const { adapter } = createMockAdapter({
        iterations: [
          // Iteration 0: model calls toolA
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'toolA'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'toolA', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          // Iteration 1: model calls toolB
          [
            ev.runStarted(),
            ev.toolStart('tc-2', 'toolB'),
            ev.toolArgs('tc-2', '{}'),
            ev.toolEnd('tc-2', 'toolB', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          // Iteration 2: model responds with text
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      // Middleware swaps the tools on iteration 1
      const middleware: ChatMiddleware = {
        name: 'tool-swapper',
        onConfig: (ctx) => {
          onConfigCallCount++
          if (ctx.phase === 'beforeModel' && ctx.iteration === 0) {
            // Only expose toolA
            return { tools: [toolA] }
          }
          if (ctx.phase === 'beforeModel' && ctx.iteration >= 1) {
            // Expose both tools
            return { tools: [toolA, toolB] }
          }
          return undefined
        },
      }

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [toolA, toolB],
        middleware: [middleware],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // toolA executed on iteration 0, toolB on iteration 1
      expect(executedTools).toContain('toolA')
      expect(executedTools).toContain('toolB')
      // onConfig called at init + 3 beforeModel iterations
      expect(onConfigCallCount).toBe(4)
    })
  })
})
