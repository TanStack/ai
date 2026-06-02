import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  StreamTruncatedError,
  xhrHttpStream,
  xhrServerSentEvents,
} from '../src/connection-adapters'

type XhrEventHandler = ((event: ProgressEvent) => void) | null

function createProgressEvent(): ProgressEvent {
  return { type: 'progress' } as ProgressEvent
}

class FakeXMLHttpRequest {
  method: string | undefined
  url: string | undefined
  requestBody: string | undefined
  responseText = ''
  status = 200
  statusText = 'OK'
  withCredentials = false
  onprogress: XhrEventHandler = null
  onload: XhrEventHandler = null
  onerror: XhrEventHandler = null
  onabort: XhrEventHandler = null
  onloadend: XhrEventHandler = null
  readonly requestHeaders: Record<string, string> = {}
  readonly abort = vi.fn(() => {
    this.onabort?.(createProgressEvent())
    this.onloadend?.(createProgressEvent())
  })

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value
  }

  readonly send = vi.fn((body?: string): void => {
    this.requestBody = body
  })

  progress(text: string): void {
    this.responseText += text
    this.onprogress?.(createProgressEvent())
  }

  load(): void {
    this.onload?.(createProgressEvent())
    this.onloadend?.(createProgressEvent())
  }

  error(): void {
    this.onerror?.(createProgressEvent())
    this.onloadend?.(createProgressEvent())
  }
}

function createFakeXhrFactory() {
  const xhr = new FakeXMLHttpRequest()
  return {
    xhr,
    xhrFactory: () => xhr as unknown as XMLHttpRequest,
  }
}

async function nextTick(): Promise<void> {
  await Promise.resolve()
}

describe('xhr connection adapters', () => {
  describe('xhrServerSentEvents', () => {
    it('parses split SSE chunks across multiple progress events and sends AG-UI request body', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', {
        headers: { Authorization: 'Bearer token' },
        body: { model: 'test-model' },
        withCredentials: true,
        xhrFactory,
      })

      const iterator = adapter
        .connect(
          [{ role: 'user', content: 'Hello' }],
          { temperature: 0 },
          undefined,
          { threadId: 'thread-1', runId: 'run-1' },
        )
        [Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      expect(xhr.method).toBe('POST')
      expect(xhr.url).toBe('/api/chat')
      expect(xhr.withCredentials).toBe(true)
      expect(xhr.requestHeaders).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      })
      const body = JSON.parse(xhr.requestBody ?? '{}')
      expect(body).toMatchObject({
        threadId: 'thread-1',
        runId: 'run-1',
        forwardedProps: { model: 'test-model', temperature: 0 },
        data: { model: 'test-model', temperature: 0 },
      })

      xhr.progress('data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg')
      await nextTick()
      xhr.progress(
        '-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n\n',
      )

      await expect(nextChunk).resolves.toMatchObject({
        done: false,
        value: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Hello',
        },
      })
    })

    it('synthesizes RUN_FINISHED for [DONE] and ignores later bytes', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter
        .connect([], undefined, undefined, {
          threadId: 'thread-1',
          runId: 'run-1',
        })
        [Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('data: [DONE]\n\n')
      xhr.progress(
        'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"late","timestamp":1,"delta":"late","content":"late"}\n\n',
      )

      await expect(nextChunk).resolves.toMatchObject({
        done: false,
        value: {
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: 'run-1',
          finishReason: 'stop',
        },
      })
      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it('aborts the XHR after [DONE] so late bytes stop downloading', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter
        .connect([], undefined, undefined, {
          threadId: 'thread-1',
          runId: 'run-1',
        })
        [Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('data: [DONE]\n\n')

      await expect(nextChunk).resolves.toMatchObject({
        done: false,
        value: { type: EventType.RUN_FINISHED },
      })
      expect(xhr.abort).toHaveBeenCalledTimes(1)
    })

    it('parses SSE data frames without a space after the colon', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress(
        'data:{"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","model":"test","timestamp":123,"delta":"Hello","content":"Hello"}\n\n',
      )

      await expect(nextChunk).resolves.toMatchObject({
        done: false,
        value: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'msg-1',
          delta: 'Hello',
        },
      })
    })

    it('throws a SyntaxError on malformed JSON', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('data: not json\n\n')

      await expect(nextChunk).rejects.toThrow(SyntaxError)
    })

    it('throws a meaningful error for non-2xx status', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.status = 503
      xhr.statusText = 'Service Unavailable'
      xhr.load()

      await expect(nextChunk).rejects.toThrow(
        'XHR error! status: 503 Service Unavailable',
      )
    })

    it('throws status error instead of yielding or parsing body chunks when status is non-2xx before progress', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.status = 500
      xhr.statusText = 'Internal Server Error'
      xhr.progress('data: not json\n\n')

      await expect(nextChunk).rejects.toThrow(
        'XHR error! status: 500 Internal Server Error',
      )
      await expect(nextChunk).rejects.not.toThrow(SyntaxError)
    })

    it('does not send when the abort signal is already aborted', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const abortController = new AbortController()
      abortController.abort()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter
        .connect([], undefined, abortController.signal)
        [Symbol.asyncIterator]()

      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      expect(xhr.abort).toHaveBeenCalledTimes(1)
      expect(xhr.send).not.toHaveBeenCalled()
      expect(xhr.onprogress).toBeNull()
      expect(xhr.onload).toBeNull()
      expect(xhr.onerror).toBeNull()
      expect(xhr.onabort).toBeNull()
      expect(xhr.onloadend).toBeNull()
    })

    it('maps AbortSignal to xhr.abort, stops output, and cleans up handlers', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const abortController = new AbortController()
      const removeEventListener = vi.spyOn(
        abortController.signal,
        'removeEventListener',
      )
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter
        .connect([], undefined, abortController.signal)
        [Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      abortController.abort()

      await expect(nextChunk).resolves.toEqual({
        done: true,
        value: undefined,
      })
      expect(xhr.abort).toHaveBeenCalledTimes(1)
      expect(removeEventListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      )
      expect(xhr.onprogress).toBeNull()
      expect(xhr.onload).toBeNull()
      expect(xhr.onerror).toBeNull()
      expect(xhr.onabort).toBeNull()
      expect(xhr.onloadend).toBeNull()
    })

    it('cleans up abort listener and xhr handlers after success and error', async () => {
      const success = createFakeXhrFactory()
      const successAbortController = new AbortController()
      const successRemoveEventListener = vi.spyOn(
        successAbortController.signal,
        'removeEventListener',
      )
      const successIterator = xhrServerSentEvents('/api/chat', {
        xhrFactory: success.xhrFactory,
      })
        .connect([], undefined, successAbortController.signal)
        [Symbol.asyncIterator]()
      const successNext = successIterator.next()
      await nextTick()
      success.xhr.progress('data: [DONE]\n\n')
      await successNext
      await successIterator.next()

      expect(successRemoveEventListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      )
      expect(success.xhr.onprogress).toBeNull()
      expect(success.xhr.onload).toBeNull()
      expect(success.xhr.onerror).toBeNull()
      expect(success.xhr.onabort).toBeNull()
      expect(success.xhr.onloadend).toBeNull()

      const failure = createFakeXhrFactory()
      const failureAbortController = new AbortController()
      const failureRemoveEventListener = vi.spyOn(
        failureAbortController.signal,
        'removeEventListener',
      )
      const failureIterator = xhrServerSentEvents('/api/chat', {
        xhrFactory: failure.xhrFactory,
      })
        .connect([], undefined, failureAbortController.signal)
        [Symbol.asyncIterator]()
      const failureNext = failureIterator.next()
      await nextTick()
      failure.xhr.error()

      await expect(failureNext).rejects.toThrow('XHR request failed')
      expect(failureRemoveEventListener).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      )
      expect(failure.xhr.onprogress).toBeNull()
      expect(failure.xhr.onload).toBeNull()
      expect(failure.xhr.onerror).toBeNull()
      expect(failure.xhr.onabort).toBeNull()
      expect(failure.xhr.onloadend).toBeNull()
    })

    it('throws StreamTruncatedError on trailing unterminated SSE data', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrServerSentEvents('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('data: {"type":"RUN_STARTED"')
      xhr.load()

      await expect(nextChunk).rejects.toBeInstanceOf(StreamTruncatedError)
    })
  })

  describe('xhrHttpStream', () => {
    it('parses split newline-delimited JSON across progress events', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrHttpStream('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('{"type":"RUN_STARTED","runId":"run')
      await nextTick()
      xhr.progress('-1","timestamp":100}\n')

      await expect(nextChunk).resolves.toMatchObject({
        done: false,
        value: { type: EventType.RUN_STARTED, runId: 'run-1' },
      })
    })

    it('throws a SyntaxError for malformed newline-delimited JSON', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrHttpStream('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.progress('not json\n')

      await expect(nextChunk).rejects.toThrow(SyntaxError)
    })

    it('throws status error instead of yielding or parsing body chunks when status is non-2xx before progress', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const adapter = xhrHttpStream('/api/chat', { xhrFactory })
      const iterator = adapter.connect([])[Symbol.asyncIterator]()
      const nextChunk = iterator.next()
      await nextTick()

      xhr.status = 500
      xhr.statusText = 'Internal Server Error'
      xhr.progress('not json\n')

      await expect(nextChunk).rejects.toThrow(
        'XHR error! status: 500 Internal Server Error',
      )
      await expect(nextChunk).rejects.not.toThrow(SyntaxError)
    })

    it('does not send when the abort signal is already aborted', async () => {
      const { xhr, xhrFactory } = createFakeXhrFactory()
      const abortController = new AbortController()
      abortController.abort()
      const adapter = xhrHttpStream('/api/chat', { xhrFactory })
      const iterator = adapter
        .connect([], undefined, abortController.signal)
        [Symbol.asyncIterator]()

      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: undefined,
      })
      expect(xhr.abort).toHaveBeenCalledTimes(1)
      expect(xhr.send).not.toHaveBeenCalled()
      expect(xhr.onprogress).toBeNull()
      expect(xhr.onload).toBeNull()
      expect(xhr.onerror).toBeNull()
      expect(xhr.onabort).toBeNull()
      expect(xhr.onloadend).toBeNull()
    })
  })
})
