import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  fetchHttpStream,
  xhrHttpStream,
  xhrServerSentEvents,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

/**
 * Resumability across the NON-SSE-fetch transports. The reconnect engine
 * (offset tracking, de-dupe, Last-Event-ID resend, terminal detection, ceiling)
 * is exercised exhaustively over fetch-SSE in `connection-adapters-resumable`.
 * All four adapters share that engine, so these focus on the two things that
 * differ per transport: the NDJSON `{ id, chunk }` envelope wire format, and the
 * XHR transport re-issuing a fresh request with `Last-Event-ID` on reconnect.
 */

function contentChunk(delta: string): object {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    model: 'test',
    timestamp: 0,
    delta,
    content: delta,
  }
}

function finishedChunk(): object {
  return {
    type: EventType.RUN_FINISHED,
    threadId: 't',
    runId: 'r',
    model: 'test',
    timestamp: 0,
    finishReason: 'stop',
  }
}

/** A durable NDJSON line: an `{ id, chunk }` envelope carrying the offset. */
function envelopeLine(id: string, chunk: object): string {
  return `${JSON.stringify({ id, chunk })}\n`
}

/** A non-durable NDJSON line: a bare chunk, no offset. */
function bareLine(chunk: object): string {
  return `${JSON.stringify(chunk)}\n`
}

function ndjsonResponse(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

function deltasOf(chunks: Array<StreamChunk>): Array<string> {
  return chunks
    .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((c) => c.delta)
}

describe('resumable NDJSON (fetchHttpStream)', () => {
  it('reconnects with Last-Event-ID and de-dupes already-seen chunks', async () => {
    const fetchClient = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe('/api/chat?runId=r')
      if (fetchClient.mock.calls.length === 1) {
        // First response: 3 enveloped lines, then a clean end with no terminal.
        return ndjsonResponse(
          envelopeLine('run@1', contentChunk('1')) +
            envelopeLine('run@2', contentChunk('2')) +
            envelopeLine('run@3', contentChunk('3')),
        )
      }
      // Reconnect: server replays seq 3 (must be de-duped), then tail + terminal.
      expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('run@3')
      return ndjsonResponse(
        envelopeLine('run@3', contentChunk('3')) +
          envelopeLine('run@4', contentChunk('4')) +
          envelopeLine('run@5', finishedChunk()),
      )
    })

    const adapter = fetchHttpStream('/api/chat', {
      fetchClient,
      reconnect: { delayMs: 0 },
    })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      { threadId: 't', runId: 'r' },
    )) {
      chunks.push(chunk)
    }

    expect(deltasOf(chunks)).toEqual(['1', '2', '3', '4'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(fetchClient).toHaveBeenCalledTimes(2)
  })

  it('joinRun opens the stream from the start with ?offset=-1', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      ndjsonResponse(envelopeLine('run@1', finishedChunk())),
    )
    const adapter = fetchHttpStream('/api/chat', { fetchClient })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.joinRun('run-x')) {
      chunks.push(chunk)
    }

    const calledUrl = String(fetchClient.mock.calls[0]![0])
    expect(calledUrl).toContain('offset=-1')
    expect(calledUrl).toContain('runId=run-x')
    expect(chunks.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
  })

  it('treats a bare-line (non-durable) stream as a single fetch with no reconnect', async () => {
    const fetchClient = vi.fn<typeof fetch>(async () =>
      ndjsonResponse(
        bareLine(contentChunk('1')) +
          bareLine(contentChunk('2')) +
          bareLine(finishedChunk()),
      ),
    )
    const adapter = fetchHttpStream('/api/chat', { fetchClient })

    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.connect(
      [{ role: 'user', content: 'hi' }],
      undefined,
      undefined,
      { threadId: 't', runId: 'r' },
    )) {
      chunks.push(chunk)
    }

    expect(deltasOf(chunks)).toEqual(['1', '2'])
    // No offsets were ever seen, so a clean end is final — no reconnect.
    expect(fetchClient).toHaveBeenCalledTimes(1)
  })
})

type XhrEventHandler = ((event: ProgressEvent) => void) | null

/** A push-driven fake XHR sufficient for the resumable transport tests. */
class FakeXhr {
  method: string | undefined
  url: string | undefined
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
    this.onabort?.({ type: 'abort' } as ProgressEvent)
    this.onloadend?.({ type: 'loadend' } as ProgressEvent)
  })
  readonly send = vi.fn()

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value
  }

  progress(text: string): void {
    this.responseText += text
    this.onprogress?.({ type: 'progress' } as ProgressEvent)
  }

  /** Clean end of the current response (socket rolled over, no terminal). */
  end(): void {
    this.onload?.({ type: 'load' } as ProgressEvent)
    this.onloadend?.({ type: 'loadend' } as ProgressEvent)
  }
}

/** A factory that hands out a fresh FakeXhr per open, tracked in `xhrs`. */
function createXhrQueue(): {
  xhrFactory: () => XMLHttpRequest
  xhrs: Array<FakeXhr>
} {
  const xhrs: Array<FakeXhr> = []
  return {
    xhrs,
    xhrFactory: () => {
      const xhr = new FakeXhr()
      xhrs.push(xhr)
      return xhr as unknown as XMLHttpRequest
    },
  }
}

/**
 * Yield to the macrotask queue so the reconnect loop's microtask chain (read →
 * de-dupe → throttle → re-open) fully settles and the next XHR is created.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('resumable XHR transports', () => {
  it('xhrHttpStream reconnects with Last-Event-ID across a fresh XHR (NDJSON envelopes)', async () => {
    const queue = createXhrQueue()
    const adapter = xhrHttpStream('/api/chat', {
      xhrFactory: queue.xhrFactory,
      reconnect: { delayMs: 0 },
    })

    const chunks: Array<StreamChunk> = []
    const done = (async () => {
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        chunks.push(chunk)
      }
    })()

    await flush()
    const first = queue.xhrs[0]!
    expect(first.url).toBe('/api/chat?runId=r')
    first.progress(
      envelopeLine('run@1', contentChunk('1')) +
        envelopeLine('run@2', contentChunk('2')),
    )
    first.end() // clean end, no terminal → reconnect

    await flush()
    const second = queue.xhrs[1]!
    expect(second.requestHeaders['Last-Event-ID']).toBe('run@2')
    second.progress(
      envelopeLine('run@2', contentChunk('2')) + // replayed, de-duped
        envelopeLine('run@3', contentChunk('3')) +
        envelopeLine('run@4', finishedChunk()),
    )
    second.end()

    await done
    expect(deltasOf(chunks)).toEqual(['1', '2', '3'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
    expect(queue.xhrs).toHaveLength(2)
  })

  it('xhrServerSentEvents is resumable too (durable SSE over XHR)', async () => {
    const queue = createXhrQueue()
    const adapter = xhrServerSentEvents('/api/chat', {
      xhrFactory: queue.xhrFactory,
      reconnect: { delayMs: 0 },
    })

    const sse = (id: string, chunk: object): string =>
      `id: ${id}\ndata: ${JSON.stringify(chunk)}\n\n`

    const chunks: Array<StreamChunk> = []
    const done = (async () => {
      for await (const chunk of adapter.connect(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        { threadId: 't', runId: 'r' },
      )) {
        chunks.push(chunk)
      }
    })()

    await flush()
    queue.xhrs[0]!.progress(sse('run@1', contentChunk('1')))
    queue.xhrs[0]!.end()

    await flush()
    expect(queue.xhrs[1]!.requestHeaders['Last-Event-ID']).toBe('run@1')
    queue.xhrs[1]!.progress(
      sse('run@1', contentChunk('1')) + sse('run@2', finishedChunk()),
    )
    queue.xhrs[1]!.end()

    await done
    expect(deltasOf(chunks)).toEqual(['1'])
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('xhrHttpStream joinRun issues a GET from the start with ?offset=-1', async () => {
    const queue = createXhrQueue()
    const adapter = xhrHttpStream('/api/chat', {
      xhrFactory: queue.xhrFactory,
      reconnect: { delayMs: 0 },
    })

    const chunks: Array<StreamChunk> = []
    const done = (async () => {
      for await (const chunk of adapter.joinRun('run-x')) {
        chunks.push(chunk)
      }
    })()

    await flush()
    const xhr = queue.xhrs[0]!
    expect(xhr.method).toBe('GET')
    expect(xhr.url).toContain('offset=-1')
    expect(xhr.url).toContain('runId=run-x')
    xhr.progress(envelopeLine('run@1', finishedChunk()))
    xhr.end()

    await done
    expect(chunks.map((c) => c.type)).toContain(EventType.RUN_FINISHED)
  })
})
