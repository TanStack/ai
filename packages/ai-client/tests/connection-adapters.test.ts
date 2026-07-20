import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  fetchHttpStream,
  fetcherToConnectionAdapter,
  fetchServerSentEvents,
  normalizeConnectionAdapter,
  rpcStream,
  stream,
} from '../src/connection-adapters'
import { UnsupportedResponseStreamError } from '../src'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ChatFetcher } from '../src/types'

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

    it('should handle SSE format with data: prefix and no space', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n\n',
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

    it('does not truncate an agentic run at the first RUN_FINISHED (multiple terminals per run)', async () => {
      // An agent loop emits one RUN_STARTED/RUN_FINISHED pair PER turn, so a
      // tool-calling run streams several RUN_FINISHED events in a single
      // non-durable (untagged) response: turn 1 ends with RUN_FINISHED, then the
      // tool result + turn 2 (the final answer) follow. Regression guard: the
      // client must forward EVERY event and stop only when the source closes,
      // never returning early on the first terminal.
      const body =
        'data: {"type":"RUN_STARTED","timestamp":1}\n\n' +
        'data: {"type":"TOOL_CALL_END","timestamp":2}\n\n' +
        'data: {"type":"RUN_FINISHED","timestamp":3}\n\n' +
        'data: {"type":"TOOL_CALL_RESULT","timestamp":4}\n\n' +
        'data: {"type":"RUN_STARTED","timestamp":5}\n\n' +
        'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m","model":"t","timestamp":6,"delta":"final","content":"final"}\n\n' +
        'data: {"type":"RUN_FINISHED","timestamp":7}\n\n'

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(body),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }

      fetchMock.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      } as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const chunks: Array<StreamChunk> = []
      for await (const chunk of adapter.connect([
        { role: 'user', content: 'Hello' },
      ])) {
        chunks.push(chunk)
      }

      expect(chunks.map((c) => c.type)).toEqual([
        EventType.RUN_STARTED,
        EventType.TOOL_CALL_END,
        EventType.RUN_FINISHED,
        EventType.TOOL_CALL_RESULT,
        EventType.RUN_STARTED,
        EventType.TEXT_MESSAGE_CONTENT,
        EventType.RUN_FINISHED,
      ])
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

    it('should synthesize RUN_FINISHED on [DONE] and stop reading', async () => {
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

      expect(chunks).toHaveLength(1)
      expect(chunks[0]!.type).toBe('RUN_FINISHED')
    })

    it('should throw a SyntaxError on malformed JSON', async () => {
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

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow(SyntaxError)
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
      ).rejects.toMatchObject({
        name: 'UnsupportedResponseStreamError',
        missingFeature: 'Response.body',
      })
    })

    it('should throw an actionable unsupported-stream error when getReader is missing', async () => {
      const mockResponse = {
        ok: true,
        body: {},
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
      ).rejects.toMatchObject({
        name: 'UnsupportedResponseStreamError',
        missingFeature: 'Response.body.getReader',
        message: expect.stringContaining('compatible fetch'),
      })
    })

    it('should preserve HTTP errors before stream capability checks', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null,
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const consume = async () => {
        for await (const _ of adapter.connect([
          { role: 'user', content: 'Hello' },
        ])) {
          // Consume
        }
      }

      await expect(consume()).rejects.toThrow(
        'HTTP error! status: 500 Internal Server Error',
      )
      await expect(consume()).rejects.not.toBeInstanceOf(
        UnsupportedResponseStreamError,
      )
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

    it('should pass data to request body forwardedProps', async () => {
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
      expect(body.forwardedProps).toMatchObject({ key: 'value' })
    })

    it('should include resume in the AG-UI request body', async () => {
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
        undefined,
        undefined,
        {
          threadId: 'thread-1',
          runId: 'run-1',
          parentRunId: 'interrupted-run',
          resume: [
            {
              interruptId: 'interrupt-1',
              status: 'resolved',
              payload: { approved: true },
            },
            {
              interruptId: 'interrupt-2',
              status: 'cancelled',
            },
          ],
        },
      )) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      expect(body.resume).toEqual([
        {
          interruptId: 'interrupt-1',
          status: 'resolved',
          payload: { approved: true },
        },
        {
          interruptId: 'interrupt-2',
          status: 'cancelled',
        },
      ])
    })

    it('should mirror forwardedProps under legacy `data` field for backward-compat', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }
      const mockResponse = {
        ok: true,
        body: { getReader: () => mockReader },
      }
      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { provider: 'openai', model: 'gpt-5.5' },
      )) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      // Legacy server code reads `body.data.X`; new server code reads
      // `body.forwardedProps.X`. Both must contain the same content
      // until the legacy `body` client option is removed.
      expect(body.data).toEqual(body.forwardedProps)
      expect(body.data).toMatchObject({ provider: 'openai', model: 'gpt-5.5' })
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

    it('should merge options.body into request body forwardedProps', async () => {
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
        body: { model: 'gpt-5.5', provider: 'openai' },
      })

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { key: 'value' },
      )) {
        // Consume
      }

      const call = fetchMock.mock.calls[0]
      const body = JSON.parse(call?.[1]?.body as string)
      expect(body.forwardedProps).toMatchObject({
        model: 'gpt-5.5',
        provider: 'openai',
        key: 'value',
      })
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
              'data: {"type":"RUN_FINISHED","runId":"run-1","finishReason":"stop","timestamp":300}\n\n',
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

    it('should throw a SyntaxError on malformed JSON', async () => {
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

      await expect(
        (async () => {
          for await (const _ of adapter.connect([
            { role: 'user', content: 'Hello' },
          ])) {
            // Consume
          }
        })(),
      ).rejects.toThrow(SyntaxError)
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
      ).rejects.toMatchObject({
        name: 'UnsupportedResponseStreamError',
        missingFeature: 'Response.body',
      })
    })

    it('should throw an actionable unsupported-stream error when TextDecoder is missing', async () => {
      const originalTextDecoder = globalThis.TextDecoder
      // @ts-expect-error - simulate React Native runtimes without TextDecoder.
      globalThis.TextDecoder = undefined
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

      const adapter = fetchHttpStream('/api/chat')

      try {
        await expect(
          (async () => {
            for await (const _ of adapter.connect([
              { role: 'user', content: 'Hello' },
            ])) {
              // Consume
            }
          })(),
        ).rejects.toMatchObject({
          name: 'UnsupportedResponseStreamError',
          missingFeature: 'TextDecoder',
          message: expect.stringContaining('TextDecoder'),
        })
      } finally {
        globalThis.TextDecoder = originalTextDecoder
      }
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

    it('should pass data to request body forwardedProps', async () => {
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
      expect(body.forwardedProps).toMatchObject({ key: 'value' })
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
        undefined,
        undefined,
      )
    })

    it('should pass run context to stream factory', async () => {
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
      const runContext = {
        threadId: 'thread-1',
        runId: 'run-1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'resolved' as const,
            payload: { approved: true },
          },
        ],
      }

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { key: 'value' },
        undefined,
        runContext,
      )) {
        // Consume
      }

      expect(streamFactory).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        { key: 'value' },
        undefined,
        runContext,
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

      await adapter.send(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        undefined,
        { threadId: 'thread-test', runId: 'run-test' },
      )
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
        adapter.send(
          [{ role: 'user', content: 'Hello' }],
          undefined,
          undefined,
          { threadId: 'thread-test', runId: 'run-test' },
        ),
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

    it('preserves read-only join and explicit interrupt recovery operations', async () => {
      const recovery = {
        schemaVersion: 1 as const,
        state: 'pending' as const,
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        generation: 2,
        pendingInterrupts: [],
      }
      const loadInterruptState = vi.fn(async () => recovery)
      const base = {
        async *connect() {
          yield {
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId: 'run-new',
            timestamp: Date.now(),
          } as const
        },
        async *joinRun(runId: string) {
          yield {
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId,
            timestamp: Date.now(),
          } as const
        },
        loadInterruptState,
      }
      const adapter = normalizeConnectionAdapter(base)
      const abortController = new AbortController()
      const received = (async () => {
        for await (const chunk of adapter.subscribe(abortController.signal)) {
          abortController.abort()
          return chunk
        }
        return undefined
      })()

      await adapter.joinRun?.('winner-run')
      expect(await received).toMatchObject({
        type: EventType.RUN_FINISHED,
        runId: 'winner-run',
      })
      await expect(
        adapter.loadInterruptState?.({
          threadId: 'thread-1',
          interruptedRunId: 'run-1',
          knownGeneration: 1,
        }),
      ).resolves.toBe(recovery)
      expect(loadInterruptState).toHaveBeenCalledTimes(1)
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
      const data = { model: 'gpt-5.5' }

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        data,
      )) {
        // Consume
      }

      expect(rpcCall).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        data,
        undefined,
        undefined,
      )
    })

    it('should pass run context to RPC call', async () => {
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
      const runContext = {
        threadId: 'thread-1',
        runId: 'run-1',
        resume: [
          {
            interruptId: 'interrupt-1',
            status: 'cancelled' as const,
          },
        ],
      }

      for await (const _ of adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        { model: 'gpt-5.5' },
        undefined,
        runContext,
      )) {
        // Consume
      }

      expect(rpcCall).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        { model: 'gpt-5.5' },
        undefined,
        runContext,
      )
    })
  })

  describe('fetcherToConnectionAdapter', () => {
    it('should forward resume to custom fetchers', async () => {
      const fetcher = vi.fn<ChatFetcher>(async function* () {
        yield {
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: 'run-1',
          timestamp: Date.now(),
        } as StreamChunk
      })
      const adapter = fetcherToConnectionAdapter(fetcher)
      const abortController = new AbortController()

      for await (const _ of adapter.connect(
        [],
        undefined,
        abortController.signal,
        {
          threadId: 'thread-1',
          runId: 'run-1',
          parentRunId: 'interrupted-run',
          resume: [
            {
              interruptId: 'interrupt-1',
              status: 'resolved',
              payload: { approved: true },
            },
          ],
        },
      )) {
        // Consume
      }

      const [input] = fetcher.mock.calls[0]!
      expect(input.resume).toEqual([
        {
          interruptId: 'interrupt-1',
          status: 'resolved',
          payload: { approved: true },
        },
      ])
      expect(input.parentRunId).toBe('interrupted-run')
    })
  })
})
