import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchHttpStream,
  fetchServerSentEvents,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai'

describe('Connection Adapters - Abort Signal Handling', () => {
  let originalFetch: typeof fetch
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalFetch = global.fetch
    fetchMock = vi.fn()
    // @ts-ignore - we're mocking fetch here
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.clearAllMocks()
  })

  describe('fetchServerSentEvents', () => {
    it('should pass abortSignal to fetch', async () => {
      const abortController = new AbortController()
      const abortSignal = abortController.signal

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: () => ({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat')
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        abortSignal,
      )

      // Consume generator to trigger fetch
      for await (const _ of generator) {
        // Consume all chunks
      }

      expect(fetchMock).toHaveBeenCalled()
      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[1]?.signal).toBe(abortSignal)
    })

    it('should use provided abortSignal over options.signal', async () => {
      const providedSignal = new AbortController().signal
      const optionsSignal = new AbortController().signal

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: () => ({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchServerSentEvents('/api/chat', {
        signal: optionsSignal,
      })
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        providedSignal,
      )

      for await (const _ of generator) {
        // Consume all chunks
      }

      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[1]?.signal).toBe(providedSignal)
    })

    it('should stop reading stream when aborted', async () => {
      const abortController = new AbortController()
      const abortSignal = abortController.signal

      let readCount = 0
      const mockReader = {
        read: () => {
          readCount++
          if (readCount === 1) {
            // Abort after first read
            abortController.abort()
            return {
              done: false,
              value: new TextEncoder().encode(
                'data: {"type":"content","id":"1","model":"test","timestamp":123,"delta":"Hello","content":"Hello","role":"assistant"}\n\n',
              ),
            }
          }
          return { done: true, value: undefined }
        },
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
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        abortSignal,
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of generator) {
        chunks.push(chunk)
      }

      // Should have read at least once but stopped after abort
      expect(readCount).toBeGreaterThan(0)
      expect(mockReader.releaseLock).toHaveBeenCalled()
    })

    it('should check abortSignal before each read', async () => {
      const abortController = new AbortController()
      const abortSignal = abortController.signal

      let readCount = 0
      const mockReader = {
        read: () => {
          readCount++
          if (readCount === 1) {
            abortController.abort()
          }
          return {
            done: false,
            value: new TextEncoder().encode(
              'data: {"type":"content","id":"1","model":"test","timestamp":123,"delta":"Hello","content":"Hello","role":"assistant"}\n\n',
            ),
          }
        },
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
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        abortSignal,
      )

      const chunks: Array<StreamChunk> = []
      try {
        for await (const chunk of generator) {
          chunks.push(chunk)
        }
      } catch (err) {
        // Ignore abort errors
      }

      // Should stop reading after abort
      expect(readCount).toBeLessThanOrEqual(2) // At most 2 reads (one before check, one after)
    })
  })

  describe('fetchHttpStream', () => {
    it('should pass abortSignal to fetch', async () => {
      const abortController = new AbortController()
      const abortSignal = abortController.signal

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: () => ({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      }

      fetchMock.mockResolvedValue(mockResponse as any)

      const adapter = fetchHttpStream('/api/chat')
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        abortSignal,
      )

      for await (const _ of generator) {
        // Consume all chunks
      }

      expect(fetchMock).toHaveBeenCalled()
      const fetchCall = fetchMock.mock.calls[0]
      expect(fetchCall?.[1]?.signal).toBe(abortSignal)
    })

    it('should stop reading stream when aborted', async () => {
      const abortController = new AbortController()
      const abortSignal = abortController.signal

      let readCount = 0
      const mockReader = {
        read: () => {
          readCount++
          if (readCount === 1) {
            abortController.abort()
            return {
              done: false,
              value: new TextEncoder().encode(
                '{"type":"content","id":"1","model":"test","timestamp":123,"delta":"Hello","content":"Hello","role":"assistant"}\n',
              ),
            }
          }
          return { done: true, value: undefined }
        },
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
      const generator = adapter.connect(
        [{ role: 'user', content: 'Hello' }],
        undefined,
        abortSignal,
      )

      const chunks: Array<StreamChunk> = []
      for await (const chunk of generator) {
        chunks.push(chunk)
      }

      expect(readCount).toBeGreaterThan(0)
      expect(mockReader.releaseLock).toHaveBeenCalled()
    })
  })
})
