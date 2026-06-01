import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { toolCacheMiddleware } from '../src/middlewares/tool-cache'
import type {
  ToolCacheEntry,
  ToolCacheStorage,
} from '../src/middlewares/tool-cache'
import type { StreamChunk } from '../src/types'
import { ev, createMockAdapter, collectChunks, serverTool } from './test-utils'

// ============================================================================
// Tests
// ============================================================================

describe('toolCacheMiddleware', () => {
  it('should cache tool results and skip execution on cache hit', async () => {
    let callCount = 0
    const tool = serverTool('getWeather', () => {
      callCount++
      return { temp: 72, condition: 'sunny' }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        // Iteration 0: model calls getWeather("NYC")
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'getWeather'),
          ev.toolArgs('tc-1', '{"city":"NYC"}'),
          ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
          ev.runFinished('tool_calls'),
        ],
        // Iteration 1: model calls getWeather("NYC") again (same args)
        [
          ev.runStarted(),
          ev.toolStart('tc-2', 'getWeather'),
          ev.toolArgs('tc-2', '{"city":"NYC"}'),
          ev.toolEnd('tc-2', 'getWeather', { input: { city: 'NYC' } }),
          ev.runFinished('tool_calls'),
        ],
        // Iteration 2: model responds with text
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [tool],
      middleware: [toolCacheMiddleware()],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Tool should only be executed once — second call served from cache
    expect(callCount).toBe(1)
  })

  it('should not cache when args differ', async () => {
    let callCount = 0
    const tool = serverTool('getWeather', (args) => {
      callCount++
      return { city: (args as { city: string }).city, temp: 72 }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'getWeather'),
          ev.toolArgs('tc-1', '{"city":"NYC"}'),
          ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
          ev.runFinished('tool_calls'),
        ],
        // Different args — should NOT hit cache
        [
          ev.runStarted(),
          ev.toolStart('tc-2', 'getWeather'),
          ev.toolArgs('tc-2', '{"city":"LA"}'),
          ev.toolEnd('tc-2', 'getWeather', { input: { city: 'LA' } }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [tool],
      middleware: [toolCacheMiddleware()],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Both calls should execute — different args
    expect(callCount).toBe(2)
  })

  it('should respect toolNames filter', async () => {
    let weatherCalls = 0
    let stockCalls = 0
    const weatherTool = serverTool('getWeather', () => {
      weatherCalls++
      return { temp: 72 }
    })
    const stockTool = serverTool('getStock', () => {
      stockCalls++
      return { price: 100 }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        // Both tools called
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'getWeather'),
          ev.toolArgs('tc-1', '{}'),
          ev.toolEnd('tc-1', 'getWeather', { input: {} }),
          ev.toolStart('tc-2', 'getStock'),
          ev.toolArgs('tc-2', '{}'),
          ev.toolEnd('tc-2', 'getStock', { input: {} }),
          ev.runFinished('tool_calls'),
        ],
        // Both called again
        [
          ev.runStarted(),
          ev.toolStart('tc-3', 'getWeather'),
          ev.toolArgs('tc-3', '{}'),
          ev.toolEnd('tc-3', 'getWeather', { input: {} }),
          ev.toolStart('tc-4', 'getStock'),
          ev.toolArgs('tc-4', '{}'),
          ev.toolEnd('tc-4', 'getStock', { input: {} }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    // Only cache getWeather
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [weatherTool, stockTool],
      middleware: [toolCacheMiddleware({ toolNames: ['getWeather'] })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // getWeather: 1 execute + 1 cache hit = 1 call
    expect(weatherCalls).toBe(1)
    // getStock: not cached, both calls execute
    expect(stockCalls).toBe(2)
  })

  it('should respect TTL and not serve expired entries', async () => {
    vi.useFakeTimers()

    try {
      let callCount = 0
      const tool = serverTool('getData', () => {
        callCount++
        return { data: callCount }
      })

      const { adapter: _adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'getData'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'getData', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          // Second call — same args but after TTL expires
          [
            ev.runStarted(),
            ev.toolStart('tc-2', 'getData'),
            ev.toolArgs('tc-2', '{}'),
            ev.toolEnd('tc-2', 'getData', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const cacheMiddleware = toolCacheMiddleware({ ttl: 5000 })

      // Manually simulate the cache flow with controlled time
      // First tool call: cache miss, execute, store
      const beforeResult1 = await cacheMiddleware.onBeforeToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onBeforeToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-1',
            type: 'function',
            function: { name: 'getData', arguments: '{}' },
          },
          tool: tool,
          args: {},
          toolName: 'getData',
          toolCallId: 'tc-1',
        },
      )
      // No cache entry — should proceed
      expect(beforeResult1).toBeUndefined()

      // Simulate successful execution and store result
      await cacheMiddleware.onAfterToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onAfterToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-1',
            type: 'function',
            function: { name: 'getData', arguments: '{}' },
          },
          tool: tool,
          toolName: 'getData',
          toolCallId: 'tc-1',
          ok: true,
          duration: 10,
          result: { data: 1 },
        },
      )

      // Second call immediately — should hit cache
      const beforeResult2 = await cacheMiddleware.onBeforeToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onBeforeToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-2',
            type: 'function',
            function: { name: 'getData', arguments: '{}' },
          },
          tool: tool,
          args: {},
          toolName: 'getData',
          toolCallId: 'tc-2',
        },
      )
      expect(beforeResult2).toEqual({ type: 'skip', result: { data: 1 } })

      // Advance time past TTL
      vi.advanceTimersByTime(6000)

      // Third call after TTL — should miss cache
      const beforeResult3 = await cacheMiddleware.onBeforeToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onBeforeToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-3',
            type: 'function',
            function: { name: 'getData', arguments: '{}' },
          },
          tool: tool,
          args: {},
          toolName: 'getData',
          toolCallId: 'tc-3',
        },
      )
      // Expired — should proceed with execution
      expect(beforeResult3).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('should respect maxSize and evict oldest entries', async () => {
    const results: Array<unknown> = []

    const { adapter } = createMockAdapter({
      iterations: [
        // Fill cache: key=a, key=b (maxSize=2)
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'lookup'),
          ev.toolArgs('tc-1', '{"key":"a"}'),
          ev.toolEnd('tc-1', 'lookup', { input: { key: 'a' } }),
          ev.toolStart('tc-2', 'lookup'),
          ev.toolArgs('tc-2', '{"key":"b"}'),
          ev.toolEnd('tc-2', 'lookup', { input: { key: 'b' } }),
          ev.runFinished('tool_calls'),
        ],
        // Add key=c — should evict key=a
        [
          ev.runStarted(),
          ev.toolStart('tc-3', 'lookup'),
          ev.toolArgs('tc-3', '{"key":"c"}'),
          ev.toolEnd('tc-3', 'lookup', { input: { key: 'c' } }),
          ev.runFinished('tool_calls'),
        ],
        // key=b should still be cached, key=a should miss
        [
          ev.runStarted(),
          ev.toolStart('tc-4', 'lookup'),
          ev.toolArgs('tc-4', '{"key":"b"}'),
          ev.toolEnd('tc-4', 'lookup', { input: { key: 'b' } }),
          ev.toolStart('tc-5', 'lookup'),
          ev.toolArgs('tc-5', '{"key":"a"}'),
          ev.toolEnd('tc-5', 'lookup', { input: { key: 'a' } }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    const executeSpy = vi.fn((args: unknown) => {
      const key = (args as { key: string }).key
      const result = { value: `result-${key}` }
      results.push(result)
      return result
    })
    const spyTool = serverTool('lookup', executeSpy)

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [spyTool],
      middleware: [toolCacheMiddleware({ maxSize: 2 })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Calls: a(exec), b(exec), c(exec, evicts a), b(cache hit), a(exec, was evicted)
    expect(executeSpy).toHaveBeenCalledTimes(4)
    const executedKeys = executeSpy.mock.calls.map(
      (call) => (call[0] as { key: string }).key,
    )
    expect(executedKeys).toEqual(['a', 'b', 'c', 'a'])
  })

  it('should use true LRU eviction (access refreshes recency)', async () => {
    const executeSpy = vi.fn((args: unknown) => {
      const key = (args as { key: string }).key
      return { value: `result-${key}` }
    })
    const spyTool = serverTool('lookup', executeSpy)

    const { adapter } = createMockAdapter({
      iterations: [
        // Fill cache: key=a, key=b (maxSize=2)
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'lookup'),
          ev.toolArgs('tc-1', '{"key":"a"}'),
          ev.toolEnd('tc-1', 'lookup', { input: { key: 'a' } }),
          ev.toolStart('tc-2', 'lookup'),
          ev.toolArgs('tc-2', '{"key":"b"}'),
          ev.toolEnd('tc-2', 'lookup', { input: { key: 'b' } }),
          ev.runFinished('tool_calls'),
        ],
        // Access key=a again (should refresh its recency, making b the LRU)
        [
          ev.runStarted(),
          ev.toolStart('tc-3', 'lookup'),
          ev.toolArgs('tc-3', '{"key":"a"}'),
          ev.toolEnd('tc-3', 'lookup', { input: { key: 'a' } }),
          ev.runFinished('tool_calls'),
        ],
        // Add key=c — should evict key=b (LRU), NOT key=a
        [
          ev.runStarted(),
          ev.toolStart('tc-4', 'lookup'),
          ev.toolArgs('tc-4', '{"key":"c"}'),
          ev.toolEnd('tc-4', 'lookup', { input: { key: 'c' } }),
          ev.runFinished('tool_calls'),
        ],
        // key=a should still be cached (was refreshed), key=b should miss (was evicted)
        [
          ev.runStarted(),
          ev.toolStart('tc-5', 'lookup'),
          ev.toolArgs('tc-5', '{"key":"a"}'),
          ev.toolEnd('tc-5', 'lookup', { input: { key: 'a' } }),
          ev.toolStart('tc-6', 'lookup'),
          ev.toolArgs('tc-6', '{"key":"b"}'),
          ev.toolEnd('tc-6', 'lookup', { input: { key: 'b' } }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [spyTool],
      middleware: [toolCacheMiddleware({ maxSize: 2 })],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Calls: a(exec), b(exec), a(cache hit), c(exec, evicts b), a(cache hit), b(exec, was evicted)
    expect(executeSpy).toHaveBeenCalledTimes(4)
    const executedKeys = executeSpy.mock.calls.map(
      (call) => (call[0] as { key: string }).key,
    )
    expect(executedKeys).toEqual(['a', 'b', 'c', 'b'])
  })

  it('should support custom keyFn', async () => {
    let callCount = 0
    const tool = serverTool('search', () => {
      callCount++
      return { results: [] }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'search'),
          ev.toolArgs('tc-1', '{"query":"hello","page":1}'),
          ev.toolEnd('tc-1', 'search', {
            input: { query: 'hello', page: 1 },
          }),
          ev.runFinished('tool_calls'),
        ],
        // Same query but different page — custom keyFn ignores page
        [
          ev.runStarted(),
          ev.toolStart('tc-2', 'search'),
          ev.toolArgs('tc-2', '{"query":"hello","page":2}'),
          ev.toolEnd('tc-2', 'search', {
            input: { query: 'hello', page: 2 },
          }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    // Custom keyFn that only uses the query field, ignoring page
    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [tool],
      middleware: [
        toolCacheMiddleware({
          keyFn: (toolName, args) => {
            const query = (args as { query: string }).query
            return `${toolName}:${query}`
          },
        }),
      ],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Second call should hit cache since keyFn ignores page
    expect(callCount).toBe(1)
  })

  it('should not cache failed tool executions', async () => {
    let callCount = 0
    const tool = serverTool('flaky', () => {
      callCount++
      if (callCount === 1) {
        throw new Error('temporary failure')
      }
      return { ok: true }
    })

    const { adapter } = createMockAdapter({
      iterations: [
        // First call — will fail
        [
          ev.runStarted(),
          ev.toolStart('tc-1', 'flaky'),
          ev.toolArgs('tc-1', '{}'),
          ev.toolEnd('tc-1', 'flaky', { input: {} }),
          ev.runFinished('tool_calls'),
        ],
        // Second call — same args, should NOT be cached (first failed)
        [
          ev.runStarted(),
          ev.toolStart('tc-2', 'flaky'),
          ev.toolArgs('tc-2', '{}'),
          ev.toolEnd('tc-2', 'flaky', { input: {} }),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [tool],
      middleware: [toolCacheMiddleware()],
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    // Both calls should execute — failed results are not cached
    expect(callCount).toBe(2)
  })

  it('should return the middleware with name "tool-cache"', () => {
    const mw = toolCacheMiddleware()
    expect(mw.name).toBe('tool-cache-middleware')
  })

  // ==========================================================================
  // Custom storage
  // ==========================================================================

  describe('custom storage', () => {
    function createMapStorage(): ToolCacheStorage & {
      store: Map<string, ToolCacheEntry>
    } {
      const store = new Map<string, ToolCacheEntry>()
      return {
        store,
        getItem: (key) => store.get(key),
        setItem: (key, value) => {
          store.set(key, value)
        },
        deleteItem: (key) => {
          store.delete(key)
        },
      }
    }

    it('should use custom storage for cache hits', async () => {
      let callCount = 0
      const tool = serverTool('getWeather', () => {
        callCount++
        return { temp: 72 }
      })

      const storage = createMapStorage()

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'getWeather'),
            ev.toolArgs('tc-1', '{"city":"NYC"}'),
            ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.toolStart('tc-2', 'getWeather'),
            ev.toolArgs('tc-2', '{"city":"NYC"}'),
            ev.toolEnd('tc-2', 'getWeather', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [toolCacheMiddleware({ storage })],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(callCount).toBe(1)
      expect(storage.store.size).toBe(1)
    })

    it('should work with async storage', async () => {
      let callCount = 0
      const tool = serverTool('getData', () => {
        callCount++
        return { value: callCount }
      })

      const store = new Map<string, ToolCacheEntry>()
      const asyncStorage: ToolCacheStorage = {
        getItem: async (key) => store.get(key),
        setItem: async (key, value) => {
          store.set(key, value)
        },
        deleteItem: async (key) => {
          store.delete(key)
        },
      }

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'getData'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'getData', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.toolStart('tc-2', 'getData'),
            ev.toolArgs('tc-2', '{}'),
            ev.toolEnd('tc-2', 'getData', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [tool],
        middleware: [toolCacheMiddleware({ storage: asyncStorage })],
      })
      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(callCount).toBe(1)
      expect(store.size).toBe(1)
    })

    it('should call deleteItem for expired entries', async () => {
      vi.useFakeTimers()

      try {
        const tool = serverTool('getData', () => ({ data: 1 }))

        const storage = createMapStorage()
        const deleteSpy = vi.fn(storage.deleteItem.bind(storage))
        storage.deleteItem = deleteSpy

        const cacheMiddleware = toolCacheMiddleware({
          ttl: 5000,
          storage,
        })

        // Store an entry via onAfterToolCall
        await cacheMiddleware.onAfterToolCall!(
          {} as Parameters<
            NonNullable<typeof cacheMiddleware.onAfterToolCall>
          >[0],
          {
            toolCall: {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getData', arguments: '{}' },
            },
            tool: tool,
            toolName: 'getData',
            toolCallId: 'tc-1',
            ok: true,
            duration: 10,
            result: { data: 1 },
          },
        )

        // Advance time past TTL
        vi.advanceTimersByTime(6000)

        // Try to get — should be expired
        const result = await cacheMiddleware.onBeforeToolCall!(
          {} as Parameters<
            NonNullable<typeof cacheMiddleware.onBeforeToolCall>
          >[0],
          {
            toolCall: {
              id: 'tc-2',
              type: 'function',
              function: { name: 'getData', arguments: '{}' },
            },
            tool: tool,
            args: {},
            toolName: 'getData',
            toolCallId: 'tc-2',
          },
        )

        expect(result).toBeUndefined()
        // deleteItem called for expired entry
        expect(deleteSpy).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('should call storage methods with correct keys', async () => {
      const tool = serverTool('search', () => ({ results: [] }))

      const storage = createMapStorage()
      const getSpy = vi.fn(storage.getItem.bind(storage))
      const setSpy = vi.fn(storage.setItem.bind(storage))
      storage.getItem = getSpy
      storage.setItem = setSpy

      const cacheMiddleware = toolCacheMiddleware({ storage })

      // Trigger a before check (miss)
      await cacheMiddleware.onBeforeToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onBeforeToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-1',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"hello"}' },
          },
          tool: tool,
          args: { q: 'hello' },
          toolName: 'search',
          toolCallId: 'tc-1',
        },
      )

      const expectedKey = JSON.stringify(['search', { q: 'hello' }])
      expect(getSpy).toHaveBeenCalledWith(expectedKey)

      // Store a result
      await cacheMiddleware.onAfterToolCall!(
        {} as Parameters<
          NonNullable<typeof cacheMiddleware.onAfterToolCall>
        >[0],
        {
          toolCall: {
            id: 'tc-1',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"hello"}' },
          },
          tool: tool,
          toolName: 'search',
          toolCallId: 'tc-1',
          ok: true,
          duration: 5,
          result: { results: [] },
        },
      )

      expect(setSpy).toHaveBeenCalledWith(expectedKey, {
        result: { results: [] },
        timestamp: expect.any(Number),
      })
    })

    it('should share cache across multiple chat() calls via shared storage', async () => {
      let callCount = 0
      const tool = serverTool('getWeather', () => {
        callCount++
        return { temp: 72 }
      })

      const storage = createMapStorage()

      // First chat() call — populates cache
      const { adapter: adapter1 } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-1', 'getWeather'),
            ev.toolArgs('tc-1', '{"city":"NYC"}'),
            ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      await collectChunks(
        chat({
          adapter: adapter1,
          messages: [{ role: 'user', content: 'Hi' }],
          tools: [tool],
          middleware: [toolCacheMiddleware({ storage })],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(callCount).toBe(1)

      // Second chat() call — should hit shared storage cache
      const { adapter: adapter2 } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('tc-2', 'getWeather'),
            ev.toolArgs('tc-2', '{"city":"NYC"}'),
            ev.toolEnd('tc-2', 'getWeather', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
        ],
      })

      await collectChunks(
        chat({
          adapter: adapter2,
          messages: [{ role: 'user', content: 'Hi' }],
          tools: [tool],
          middleware: [toolCacheMiddleware({ storage })],
        }) as AsyncIterable<StreamChunk>,
      )

      // Still 1 — second call served from shared storage
      expect(callCount).toBe(1)
    })
  })
})
