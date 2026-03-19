import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchHttpStream,
  fetchServerSentEvents,
  normalizeConnectionAdapter,
  rpcStream,
  stream,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai'

describe('connection-adapters', () => {
  let originalFetch: typeof fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalFetch = global.fetch
    fetchMock = vi.fn()
    // @ts-ignore - we mock global fetch
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('fetchServerSentEvents', () => {
    it('should handle SSE format with data: prefix', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: 'Hello',
      })
    })

    it('should handle SSE format without data: prefix', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              '{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
    })

    it('should skip [DONE] markers', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
    })

    it('should handle malformed JSON gracefully', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: invalid json\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
      expect(consoleWarnSpy).toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow('HTTP error! status: 500 Internal Server Error')
    })

    it('should handle missing response body', async () => {
      const mockResponse = {
        ok: true,
        body: null,
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow('Response body is not readable')
    })

    it('should merge custom headers', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', {
        headers: { Authorization: 'Bearer token' },
      })

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(fetchMock).toHaveBeenCalled()
      const call = fetchMock.mock.calls[0]
      expect(call?.[1]?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      })
    })

    it('should handle Headers object', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const headers = new Headers()
      headers.set('Authorization', 'Bearer token')

      const adapter = fetchServerSentEvents('/api/chat', { headers })

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(fetchMock).toHaveBeenCalled()
      const call = fetchMock.mock.calls[0]
      const requestHeaders = call?.[1]?.headers

      // mergeHeaders converts Headers to plain object, then spread into new object
      // The headers should be a plain object with both Content-Type and Authorization
      const headersObj = requestHeaders as Record<string, string>
      expect(headersObj).toBeDefined()
      expect(headersObj['Content-Type']).toBe('application/json')
      // Check if Authorization exists (it should from the Headers object)
      // The mergeHeaders function should convert Headers.forEach to object keys
      const authValue = Object.entries(headersObj).find(
        ([key]) => key.toLowerCase() === 'authorization',
      )?.[1]
      expect(authValue).toBe('Bearer token')
    })

    it('should pass data to request body', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { key: 'value' },
      )) {
        // Consume
      }

      expect(fetchMock).toHaveBeenCalled()
      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      expect(body.data).toEqual({ key: 'value' })
    })

    it('should use custom fetchClient when provided', async () => {
      const customFetch = vi.fn()
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }
      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }
      customFetch.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', {
        fetchClient: customFetch,
      })

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(customFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should resolve dynamic URL from function', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents(() => '/api/dynamic')

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(fetchMock).toHaveBeenCalledWith('/api/dynamic', expect.any(Object))
    })

    it('should resolve dynamic options from sync function', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', () => ({
        headers: { 'X-Custom': 'dynamic' },
      }))

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      expect(call?.[1]?.headers).toMatchObject({ 'X-Custom': 'dynamic' })
    })

    it('should resolve dynamic options from async function', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', async () => ({
        headers: { 'X-Async': 'token' },
      }))

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      expect(call?.[1]?.headers).toMatchObject({ 'X-Async': 'token' })
    })

    it('should merge options.body into request body', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', {
        body: { model: 'gpt-4o', provider: 'openai' },
      })

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { key: 'value' },
      )) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      expect(body.model).toBe('gpt-4o')
      expect(body.provider).toBe('openai')
      expect(body.data).toEqual({ key: 'value' })
    })

    it('should handle multiple chunks across multiple reads', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"RUN_STARTED","runId":"run-1","timestamp":100}\n\n',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"CUSTOM","name":"generation:result","value":{"id":"1"},"timestamp":200}\n\n',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"RUN_FINISHED","runId":"run-1","finishReason":"stop","timestamp":300}\n\ndata: [DONE]\n\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/generate')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([], { prompt: 'test' })) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(3)
      expect(chunks[0]!.type).toBe('RUN_STARTED')
      expect(chunks[1]!.type).toBe('CUSTOM')
      expect(chunks[2]!.type).toBe('RUN_FINISHED')
    })
  })

  describe('fetchHttpStream', () => {
    it('should parse newline-delimited JSON', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              '{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
    })

    it('should handle malformed JSON gracefully', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('invalid json\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(0)
      expect(consoleWarnSpy).toHaveBeenCalled()
      consoleWarnSpy.mockRestore()
    })

    it('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow('HTTP error! status: 404 Not Found')
    })

    it('should use custom fetchClient when provided', async () => {
      const customFetch = vi.fn()
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }
      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }
      customFetch.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat', {
        fetchClient: customFetch,
      })

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(customFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('should handle missing response body', async () => {
      const mockResponse = {
        ok: true,
        body: null,
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow('Response body is not readable')
    })

    it('should merge custom headers', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat', {
        headers: { Authorization: 'Bearer token' },
      })

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      expect(call?.[1]?.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      })
    })

    it('should pass data to request body', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { key: 'value' },
      )) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      expect(body.data).toEqual({ key: 'value' })
    })

    it('should resolve dynamic URL from function', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream(() => '/api/dynamic')

      for await (const _ of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        // Consume
      }

      expect(fetchMock).toHaveBeenCalledWith('/api/dynamic', expect.any(Object))
    })

    it('should handle multiple chunks across multiple reads', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              '{"type":"RUN_STARTED","runId":"run-1","timestamp":100}\n',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              '{"type":"CUSTOM","name":"generation:result","value":{"id":"1"},"timestamp":200}\n',
            ),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              '{"type":"RUN_FINISHED","runId":"run-1","finishReason":"stop","timestamp":300}\n',
            ),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/generate')
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([], { prompt: 'test' })) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(3)
      expect(chunks[0]!.type).toBe('RUN_STARTED')
      expect(chunks[1]!.type).toBe('CUSTOM')
      expect(chunks[2]!.type).toBe('RUN_FINISHED')
    })
  })

  describe('stream', () => {
    it('should delegate to stream factory', async () => {
      const streamFactory = vi.fn().mockImplementation(function* () {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }
      })

      const adapter = stream(streamFactory)
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(streamFactory).toHaveBeenCalled()
      expect(chunks).toHaveLength(1)
    })

    it('should pass data to stream factory', async () => {
      const streamFactory = vi.fn().mockImplementation(function* () {
        yield {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      })

      const adapter = stream(streamFactory)
      const data = { key: 'value' }

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        data,
      )) {
        // Consume
      }

      expect(streamFactory).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        data,
      )
    })
  })

  describe('normalizeConnectionAdapter', () => {
    it('should throw when connection is not provided', () => {
      expect(() => normalizeConnectionAdapter(undefined)).toThrow(
        'Connection adapter is required',
      )
    })

    it('should throw when subscribe/send are partially implemented', () => {
      const invalidAdapters = [
        { subscribe: async function* () {} },
        { send: async () => {} },
      ] as const

      for (const adapter of invalidAdapters) {
        expect(() => normalizeConnectionAdapter(adapter as any)).toThrow(
          'Connection adapter must provide either connect or both subscribe and send',
        )
      }
    })

    it('should throw when both connection modes are provided', () => {
      const invalidAdapter = {
        connect: async function* () {},
        subscribe: async function* () {},
        send: async () => {},
      }

      expect(() => normalizeConnectionAdapter(invalidAdapter as any)).toThrow(
        'Connection adapter must provide either connect or both subscribe and send, not both modes',
      )
    })

    it('should synthesize RUN_FINISHED when wrapped connect stream has no terminal event', async () => {
      const base = stream(async function* () {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hi',
          content: 'Hi',
        }
      })

      const adapter = normalizeConnectionAdapter(base)
      const abortController = new AbortController()
      const receivedPromise = (async () => {
        const received: Array<StreamChunk> = []
        for await (const chunk of adapter.subscribe(abortController.signal)) {
          received.push(chunk)
          if (received.length === 2) {
            abortController.abort()
          }
        }
        return received
      })()

      await adapter.send([{ role: 'user', content: 'Hello' }])
      const received = await receivedPromise

      expect(received).toHaveLength(2)
      expect(received[1]?.type).toBe('RUN_FINISHED')
    })

    it('should synthesize RUN_ERROR when wrapped connect stream throws', async () => {
      const base = stream(async function* () {
        throw new Error('connect exploded')
      })

      const adapter = normalizeConnectionAdapter(base)
      const abortController = new AbortController()
      const receivedPromise = (async () => {
        const received: Array<StreamChunk> = []
        for await (const chunk of adapter.subscribe(abortController.signal)) {
          received.push(chunk)
          if (received.length === 1) {
            abortController.abort()
          }
        }
        return received
      })()

      await expect(
        adapter.send([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('connect exploded')
      const received = await receivedPromise

      expect(received).toHaveLength(1)
      expect(received[0]?.type).toBe('RUN_ERROR')
    })

    it('should not synthesize duplicate RUN_ERROR when stream already emitted one before throwing', async () => {
      const base = stream(async function* () {
        yield {
          type: 'RUN_ERROR',
          timestamp: Date.now(),
          error: {
            message: 'already failed',
          },
        }
        throw new Error('connect exploded')
      })

      const adapter = normalizeConnectionAdapter(base)
      const abortController = new AbortController()
      const receivedPromise = (async () => {
        const received: Array<StreamChunk> = []
        for await (const chunk of adapter.subscribe(abortController.signal)) {
          received.push(chunk)
          if (received.length === 1) {
            abortController.abort()
          }
        }
        return received
      })()

      await expect(
        adapter.send([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow('connect exploded')
      const received = await receivedPromise

      expect(received).toHaveLength(1)
      expect(received[0]?.type).toBe('RUN_ERROR')
      if (received[0]?.type === 'RUN_ERROR') {
        expect(received[0].error.message).toBe('already failed')
      }
    })
  })

  describe('rpcStream', () => {
    it('should delegate to RPC call', async () => {
      const rpcCall = vi.fn().mockImplementation(function* () {
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'msg-1',
          model: 'test',
          timestamp: Date.now(),
          delta: 'Hello',
          content: 'Hello',
        }
      })

      const adapter = rpcStream(rpcCall)
      const chunks: Array<StreamChunk> = []

      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(rpcCall).toHaveBeenCalled()
      expect(chunks).toHaveLength(1)
      expect(chunks[0]).toMatchObject({
        type: 'TEXT_MESSAGE_CONTENT',
        delta: 'Hello',
      })
    })

    it('should pass messages and data to RPC call', async () => {
      const rpcCall = vi.fn().mockImplementation(function* () {
        yield {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        }
      })

      const adapter = rpcStream(rpcCall)
      const data = { model: 'gpt-4o' }

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        data,
      )) {
        // Consume
      }

      expect(rpcCall).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        data,
      )
    })
  })
})
