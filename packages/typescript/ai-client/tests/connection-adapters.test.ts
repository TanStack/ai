import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import {
  fetchHttpStream,
  fetchJSON,
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
        type: EventType.TEXT_MESSAGE_CONTENT,
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

    it('should skip [DONE] markers and warn about deprecation', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

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
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DONE] sentinel'),
      )

      warnSpy.mockRestore()
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
          type: EventType.TEXT_MESSAGE_CONTENT,
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
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
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
          type: EventType.TEXT_MESSAGE_CONTENT,
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
      // eslint-disable-next-line require-yield
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
          type: EventType.RUN_ERROR,
          message: 'already failed',
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
        expect(received[0].error?.message).toBe('already failed')
      }
    })
  })

  describe('rpcStream', () => {
    it('should delegate to RPC call', async () => {
      const rpcCall = vi.fn().mockImplementation(function* () {
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
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
        type: EventType.TEXT_MESSAGE_CONTENT,
        delta: 'Hello',
      })
    })

    it('should pass messages and data to RPC call', async () => {
      const rpcCall = vi.fn().mockImplementation(function* () {
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
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

  describe('fetchJSON', () => {
    const jsonOk = (payload: unknown, init: ResponseInit = { status: 200 }) =>
      ({
        ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
        status: init.status ?? 200,
        statusText: init.statusText ?? 'OK',
        json: async () => payload,
        text: async () =>
          typeof payload === 'string' ? payload : JSON.stringify(payload),
      }) as unknown as Response

    const errorResponse = (
      body: string,
      init: ResponseInit = { status: 500, statusText: 'Internal Server Error' },
    ) =>
      ({
        ok: false,
        status: init.status ?? 500,
        statusText: init.statusText ?? 'Internal Server Error',
        text: async () => body,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      }) as unknown as Response

    it('drains a JSON array body into chunks', async () => {
      const payload = [
        asChunk({
          type: 'RUN_STARTED',
          runId: 'r1',
          model: 'test',
          timestamp: 1,
        }),
        asChunk({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm1',
          model: 'test',
          timestamp: 2,
          delta: 'Hi',
          content: 'Hi',
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'r1',
          model: 'test',
          timestamp: 3,
        }),
      ]
      fetchMock.mockResolvedValue(jsonOk(payload))

      const adapter = fetchJSON('/api/chat')
      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hi' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks).toEqual(payload)
    })

    it('throws on a non-2xx response', async () => {
      fetchMock.mockResolvedValue(
        jsonOk(null, { status: 500, statusText: 'Internal Server Error' }),
      )

      const adapter = fetchJSON('/api/chat')

      await expect(async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      }).rejects.toThrow(/500/)
    })

    it('throws a descriptive error when response body is not an array', async () => {
      fetchMock.mockResolvedValue(jsonOk({ message: 'not an array' }))

      const adapter = fetchJSON('/api/chat')

      await expect(async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      }).rejects.toThrow(/toJSONResponse/)
    })

    it('resolves url-as-function at call time', async () => {
      fetchMock.mockResolvedValue(jsonOk([]))

      const getUrl = vi.fn(() => '/api/dynamic')
      const adapter = fetchJSON(getUrl)
      for await (const _ of adapter.connect([{ role: 'user', content: 'x' }])) {
        // drain
      }

      expect(getUrl).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledWith('/api/dynamic', expect.any(Object))
    })

    it('resolves options-as-async-function at call time', async () => {
      fetchMock.mockResolvedValue(jsonOk([]))

      const getOptions = vi.fn(
        async () =>
          ({
            headers: { 'X-Custom': 'yes' },
            body: { runId: 'abc' },
          }) as const,
      )
      const adapter = fetchJSON('/api/chat', getOptions)
      for await (const _ of adapter.connect([{ role: 'user', content: 'x' }])) {
        // drain
      }

      expect(getOptions).toHaveBeenCalledOnce()
      const [, init] = fetchMock.mock.calls[0]!
      expect(init.headers).toMatchObject({ 'X-Custom': 'yes' })
      const parsed = JSON.parse(init.body as string) as {
        runId?: string
      }
      expect(parsed.runId).toBe('abc')
    })

    it('merges options.body into the POST body', async () => {
      fetchMock.mockResolvedValue(jsonOk([]))

      const adapter = fetchJSON('/api/chat', { body: { extra: 42 } })
      for await (const _ of adapter.connect([{ role: 'user', content: 'x' }], {
        sessionId: 'sess',
      })) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body).toMatchObject({
        messages: expect.any(Array),
        data: { sessionId: 'sess' },
        extra: 42,
      })
    })

    it('honors a custom fetchClient override', async () => {
      const customFetch = vi.fn().mockResolvedValue(jsonOk([]))

      const adapter = fetchJSON('/api/chat', { fetchClient: customFetch })
      for await (const _ of adapter.connect([{ role: 'user', content: 'x' }])) {
        // drain
      }

      expect(customFetch).toHaveBeenCalledOnce()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('propagates the abortSignal to fetch', async () => {
      fetchMock.mockResolvedValue(jsonOk([]))
      const controller = new AbortController()

      const adapter = fetchJSON('/api/chat')
      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'x' }],
        undefined,
        controller.signal,
      )) {
        // drain
      }

      const [, init] = fetchMock.mock.calls[0]!
      expect(init.signal).toBe(controller.signal)
    })

    it('stops yielding chunks once the abortSignal fires mid-replay', async () => {
      const payload = [
        asChunk({ type: 'RUN_STARTED', runId: 'r1', model: 't', timestamp: 1 }),
        asChunk({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm1',
          model: 't',
          timestamp: 2,
          delta: 'A',
          content: 'A',
        }),
        asChunk({
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm1',
          model: 't',
          timestamp: 3,
          delta: 'B',
          content: 'B',
        }),
        asChunk({
          type: 'RUN_FINISHED',
          runId: 'r1',
          model: 't',
          timestamp: 4,
        }),
      ]
      fetchMock.mockResolvedValue(jsonOk(payload))

      const controller = new AbortController()
      const adapter = fetchJSON('/api/chat')
      const seen: Array<StreamChunk> = []
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'x' }],
        undefined,
        controller.signal,
      )) {
        seen.push(chunk)
        if (seen.length === 2) controller.abort()
      }

      // Two chunks consumed before abort, then loop bails — last two never
      // surface to the consumer.
      expect(seen).toHaveLength(2)
      expect(seen[0]).toMatchObject({ type: 'RUN_STARTED' })
      expect(seen[1]).toMatchObject({ type: 'TEXT_MESSAGE_CONTENT' })
    })

    it('throws a descriptive error when the response body is not JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      } as unknown as Response)

      const adapter = fetchJSON('/api/chat')

      await expect(async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      }).rejects.toThrow(/failed to parse response body as JSON/)
    })

    it('includes the response body snippet in the HTTP error message', async () => {
      const errorBody = JSON.stringify({
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded for upstream',
        },
      })
      fetchMock.mockResolvedValue(
        errorResponse(errorBody, {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      )

      const adapter = fetchJSON('/api/chat')

      await expect(async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      }).rejects.toThrow(/429.*rate_limit_error/)
    })

    it('truncates oversized response bodies in the HTTP error message', async () => {
      const long = 'x'.repeat(2000)
      fetchMock.mockResolvedValue(
        errorResponse(long, { status: 502, statusText: 'Bad Gateway' }),
      )

      const adapter = fetchJSON('/api/chat')

      let captured: Error | undefined
      try {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      } catch (err) {
        captured = err as Error
      }

      expect(captured).toBeDefined()
      // 500-char snippet plus a single ellipsis character — keeps logs sane.
      expect(captured!.message).toMatch(/502/)
      expect(captured!.message).toContain('…')
      expect(captured!.message.length).toBeLessThan(700)
    })

    it('falls back to status-only when the error body is unreadable', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => {
          throw new Error('body stream already read')
        },
        json: async () => {
          throw new Error('not reached')
        },
      } as unknown as Response)

      const adapter = fetchJSON('/api/chat')

      await expect(async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'x' },
        ])) {
          // drain
        }
      }).rejects.toThrow(/503 Service Unavailable/)
    })
  })
})
