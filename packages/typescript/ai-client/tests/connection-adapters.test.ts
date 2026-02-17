import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchHttpStream,
  fetchServerSentEvents,
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
})
