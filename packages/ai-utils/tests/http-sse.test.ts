import { describe, expect, it } from 'vitest'
import { parseSSE } from '../src/http/sse'

const encoder = new TextEncoder()

/** A response whose body sends each chunk as its own read. */
function streamResponse(chunks: Array<string | Uint8Array>) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        )
      }
      controller.close()
    },
  })
  return new Response(body)
}

/** A response that sends `first` and then stays open until cancelled. */
function openResponse(first: string) {
  const state = { cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(first))
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { response: new Response(body), state }
}

/** Splits bytes into one-byte chunks. */
function byteChunks(text: string) {
  return Array.from(encoder.encode(text), (byte) => Uint8Array.of(byte))
}

async function collect(chunks: Array<string | Uint8Array>) {
  const events = []
  for await (const event of parseSSE(streamResponse(chunks))) {
    events.push(event)
  }
  return events
}

describe('parseSSE', () => {
  it('reads event, data, id, and retry fields and skips comments', async () => {
    const events = await collect([
      ': keep-alive\n\nevent: message_start\nid: 7\nretry: 1500\ndata: {"a":1}\n\n',
    ])
    expect(events).toEqual([
      { event: 'message_start', id: '7', retry: 1500, data: '{"a":1}' },
    ])
  })

  it('joins many data lines with a newline', async () => {
    expect(await collect(['data: one\ndata: two\ndata:three\n\n'])).toEqual([
      { data: 'one\ntwo\nthree' },
    ])
  })

  it('handles CRLF, CR, and LF line endings split at every byte', async () => {
    const text =
      'data: a\r\n\r\ndata: b\r\rdata: c\n\nevent: e\r\ndata: d\r\n\r\n'
    expect(await collect(byteChunks(text))).toEqual([
      { data: 'a' },
      { data: 'b' },
      { data: 'c' },
      { event: 'e', data: 'd' },
    ])
  })

  it('keeps a multi-byte character that is split across chunks', async () => {
    expect(await collect(byteChunks('data: héllo 🌍\n\n'))).toEqual([
      { data: 'héllo 🌍' },
    ])
  })

  it('sends the last event when the body ends without a blank line', async () => {
    expect(await collect(['data: one\n\ndata: last'])).toEqual([
      { data: 'one' },
      { data: 'last' },
    ])
  })

  it('sends nothing for a trailing comment', async () => {
    expect(await collect(['data: one\n\n: ping'])).toEqual([{ data: 'one' }])
  })

  it('reads a field with no colon as an empty value', async () => {
    expect(await collect(['data\n\n'])).toEqual([{ data: '' }])
  })

  it('stops and cancels the body when the signal aborts', async () => {
    const { response, state } = openResponse('data: first\n\n')
    const controller = new AbortController()
    const events = []
    for await (const event of parseSSE(response, controller.signal)) {
      events.push(event)
      controller.abort()
    }
    expect(events).toEqual([{ data: 'first' }])
    expect(state.cancelled).toBe(true)
  })

  it('cancels the body when the signal is already aborted', async () => {
    const { response, state } = openResponse('data: first\n\n')
    const events = []
    for await (const event of parseSSE(response, AbortSignal.abort())) {
      events.push(event)
    }
    expect(events).toEqual([])
    expect(state.cancelled).toBe(true)
  })

  it('cancels the body when the consumer stops early', async () => {
    const { response, state } = openResponse('data: first\n\n')
    for await (const _event of parseSSE(response)) break
    expect(state.cancelled).toBe(true)
  })

  it('throws for a response with no body', async () => {
    await expect(
      parseSSE(new Response(null))[Symbol.asyncIterator]().next(),
    ).rejects.toThrow('no body')
  })
})
