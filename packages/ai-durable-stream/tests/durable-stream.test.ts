import { describe, expect, it, vi } from 'vitest'
import { encodeOffset, toServerSentEventsResponse } from '@tanstack/ai'
import { durableStream } from '../src'
import type { StreamChunk } from '@tanstack/ai'

function textChunk(delta: string): StreamChunk {
  return { type: 'TEXT_MESSAGE_CONTENT', delta, timestamp: 0 } as StreamChunk
}

async function readBody(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

function parseSseEvents(body: string): Array<{ id?: string; data: string }> {
  return body
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split('\n')
      const idLine = lines.find((l) => l.startsWith('id: '))
      const dataLine = lines.find((l) => l.startsWith('data: '))
      return {
        ...(idLine ? { id: idLine.slice('id: '.length) } : {}),
        data: dataLine ? dataLine.slice('data: '.length) : '',
      }
    })
}

/**
 * A fake DS server that assigns NON-1-based, non-contiguous offsets (1000,
 * 1007, 1014, …) so a test can prove the client-facing ids are the BACKEND's
 * offsets rather than a transport-local 1-based counter.
 */
function makeNon1BasedDsServer() {
  const entries: Array<{ offset: number; data: string }> = []
  let nextOffset = 1000
  const fetchStub = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PUT') return new Response(null, { status: 201 })
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Array<unknown>
        let last = nextOffset
        for (const c of body) {
          last = nextOffset
          entries.push({ offset: nextOffset, data: JSON.stringify(c) })
          nextOffset += 7
        }
        return new Response(null, {
          status: 200,
          headers: { 'Stream-Next-Offset': String(last) },
        })
      }
      // GET (read strictly after ?offset)
      const offsetParam = url.searchParams.get('offset') ?? '-1'
      const from =
        offsetParam === '-1' || offsetParam === ''
          ? Number.NEGATIVE_INFINITY
          : Number(offsetParam)
      let sse = ''
      for (const e of entries) {
        if (e.offset > from) sse += `id: ${e.offset}\ndata: ${e.data}\n\n`
      }
      return new Response(sse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Stream-Closed': 'true',
        },
      })
    },
  )
  return { fetchStub, entries }
}

/**
 * An in-memory fake of the durable-streams HTTP protocol:
 * - PUT  /streams/{name}         create (idempotent)
 * - POST /streams/{name}         append JSON array; sets `Stream-Next-Offset`
 * - GET  /streams/{name}?offset= read SSE from strictly after `offset`
 */
function makeFakeDsServer() {
  const streams = new Map<string, Array<string>>()
  const puts: Array<{ name: string; created: boolean }> = []

  const fetchStub = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      const method = (init?.method ?? 'GET').toUpperCase()
      const name = decodeURIComponent(
        url.pathname.replace(/^\/streams\//, ''),
      )

      if (method === 'PUT') {
        const created = !streams.has(name)
        if (created) streams.set(name, [])
        puts.push({ name, created })
        return new Response(null, { status: created ? 201 : 200 })
      }

      if (method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Array<unknown>
        const arr = streams.get(name) ?? []
        if (!streams.has(name)) streams.set(name, arr)
        for (const c of body) arr.push(JSON.stringify(c))
        return new Response(null, {
          status: 200,
          headers: { 'Stream-Next-Offset': String(arr.length) },
        })
      }

      // GET (read)
      const arr = streams.get(name) ?? []
      const offsetParam = url.searchParams.get('offset') ?? '-1'
      const from =
        offsetParam === '-1' || offsetParam === ''
          ? 0
          : offsetParam === 'now'
            ? arr.length
            : Number(offsetParam)
      let sse = ''
      for (let i = from; i < arr.length; i++) {
        const pos = i + 1
        sse += `id: ${pos}\ndata: ${arr[i]}\n\n`
      }
      // This fake returns the finalized stored range then EOF, so flag the
      // stream closed — a genuine end (not a cut-short live window).
      return new Response(sse, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Stream-Closed': 'true',
        },
      })
    },
  )

  return { fetchStub, streams, puts }
}

describe('durableStream', () => {
  it('parses runId and stream identity from the request', () => {
    const { fetchStub } = makeFakeDsServer()
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-1', { method: 'POST' }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    expect(d.resumeFrom()).toBeNull()
    expect(d.runId()).toBe('run-1')
  })

  it('creates the stream once (PUT idempotent) and advances the offset on append', async () => {
    const { fetchStub, puts } = makeFakeDsServer()
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-2', { method: 'POST' }),
      { server: 'https://ds.test', fetch: fetchStub },
    )

    // append POSTs each chunk INDIVIDUALLY and reads back its own backend
    // offset, so EVERY chunk carries a resume offset (fully populated array,
    // no `undefined`) — this is what makes a mid-batch reconnect exactly-once.
    const first = await d.append([textChunk('a'), textChunk('b'), textChunk('c')], 1)
    expect(first).toEqual([
      encodeOffset('run-2', 1),
      encodeOffset('run-2', 2),
      encodeOffset('run-2', 3),
    ])

    const second = await d.append([textChunk('d'), textChunk('e')], 4)
    expect(second).toEqual([
      encodeOffset('run-2', 4),
      encodeOffset('run-2', 5),
    ])

    // The stream is created exactly once, on the first append (PUT-once);
    // per-chunk POSTs never re-PUT. The server-side PUT stays idempotent.
    expect(puts).toHaveLength(1)
    expect(puts[0]).toEqual({ name: 'runs/run-2', created: true })
  })

  it('reads the full stream from the start', async () => {
    const { fetchStub } = makeFakeDsServer()
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-3', { method: 'POST' }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    await d.append([textChunk('a'), textChunk('b'), textChunk('c')], 1)

    const read: Array<{ seq: number; delta: string }> = []
    for await (const { seq, chunk } of d.read('-1')) {
      read.push({ seq, delta: (chunk as { delta: string }).delta })
    }
    expect(read).toEqual([
      { seq: 1, delta: 'a' },
      { seq: 2, delta: 'b' },
      { seq: 3, delta: 'c' },
    ])
  })

  it('reads exactly the tail strictly after a resume offset', async () => {
    const { fetchStub } = makeFakeDsServer()
    // Produce under a known run.
    const producer = durableStream(
      new Request('https://app.test/api/chat?runId=run-4', { method: 'POST' }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    await producer.append(
      [textChunk('a'), textChunk('b'), textChunk('c'), textChunk('d')],
      1,
    )

    // Reconnect carrying Last-Event-ID at seq 2.
    const reconnect = durableStream(
      new Request('https://app.test/api/chat', {
        method: 'POST',
        headers: { 'Last-Event-ID': encodeOffset('run-4', 2) },
      }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    expect(reconnect.resumeFrom()).toBe(encodeOffset('run-4', 2))
    expect(reconnect.runId()).toBe('run-4')

    const read: Array<{ seq: number; delta: string }> = []
    for await (const { seq, chunk } of reconnect.read(reconnect.resumeFrom()!)) {
      read.push({ seq, delta: (chunk as { delta: string }).delta })
    }
    expect(read).toEqual([
      { seq: 3, delta: 'c' },
      { seq: 4, delta: 'd' },
    ])
  })

  // Finding 7b: a malformed server URL is rejected at construction.
  it('rejects a malformed server URL at construction', () => {
    expect(() =>
      durableStream(
        new Request('https://app.test/api/chat', { method: 'POST' }),
        { server: 'not a url' },
      ),
    ).toThrow(/invalid server URL/)
  })

  // Finding 7c: a read data event without a usable numeric id must throw rather
  // than yield a `NaN` seq that would corrupt the resume cursor.
  it('throws on a read data event missing its id', async () => {
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PUT') return new Response(null, { status: 201 })
      // A data event with no `id:` line.
      return new Response(`data: ${JSON.stringify(textChunk('x'))}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-noid', {
        method: 'POST',
      }),
      { server: 'https://ds.test', fetch: fetchStub as unknown as typeof fetch },
    )
    await expect(async () => {
      for await (const _ of d.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/missing id/)
  })

  it('throws on a read data event with a non-numeric id', async () => {
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PUT') return new Response(null, { status: 201 })
      return new Response(
        `id: abc\ndata: ${JSON.stringify(textChunk('x'))}\n\n`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        },
      )
    })
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-badid', {
        method: 'POST',
      }),
      { server: 'https://ds.test', fetch: fetchStub as unknown as typeof fetch },
    )
    await expect(async () => {
      for await (const _ of d.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/non-numeric id/)
  })

  // Finding 5: a read that ends without a terminal / close signal (a cut-short
  // live window) must surface rather than silently truncating.
  it('surfaces a bare-EOF end of a still-in-flight read', async () => {
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PUT') return new Response(null, { status: 201 })
      // Two data events, then EOF — no terminal chunk, no Stream-Closed header,
      // no rollover control frame.
      return new Response(
        `id: 1\ndata: ${JSON.stringify(textChunk('a'))}\n\n` +
          `id: 2\ndata: ${JSON.stringify(textChunk('b'))}\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      )
    })
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-trunc', {
        method: 'POST',
      }),
      { server: 'https://ds.test', fetch: fetchStub as unknown as typeof fetch },
    )
    const seen: Array<string> = []
    await expect(async () => {
      for await (const { chunk } of d.read('-1')) {
        seen.push((chunk as { delta: string }).delta)
      }
    }).rejects.toThrow(/ended without a terminal event or close signal/)
    // It still delivered what it saw before surfacing the truncation.
    expect(seen).toEqual(['a', 'b'])
  })

  it('surfaces a malformed control frame instead of silently ending', async () => {
    const fetchStub = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'PUT') return new Response(null, { status: 201 })
      // A control frame with unparseable data (neither a rollover offset nor a
      // close signal).
      return new Response(`event: control\ndata: not-json\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })
    const d = durableStream(
      new Request('https://app.test/api/chat?runId=run-ctrl', {
        method: 'POST',
      }),
      { server: 'https://ds.test', fetch: fetchStub as unknown as typeof fetch },
    )
    await expect(async () => {
      for await (const _ of d.read('-1')) {
        // drain
      }
    }).rejects.toThrow(/malformed control frame/)
  })
})

// Finding 1: the client-facing SSE ids on a FRESH run must be the offsets the
// backend actually assigns (here, non-1-based 1000/1007/1014…), and a reconnect
// carrying one of those backend offsets must resume correctly.
describe('durableStream + toServerSentEventsResponse (backend-offset ids)', () => {
  function textStream(deltas: Array<string>): AsyncIterable<StreamChunk> {
    return {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) yield textChunk(d)
      },
    }
  }

  async function sseIds(res: Response): Promise<Array<string | undefined>> {
    return parseSseEvents(await readBody(res)).map((e) => e.id)
  }

  it('tags fresh-run events with the backend offsets (not a 1-based counter)', async () => {
    const { fetchStub } = makeNon1BasedDsServer()
    const durability = durableStream(
      new Request('https://app.test/api/chat?runId=run-x', { method: 'POST' }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    // batch:1 so every chunk flushes as its own append and carries a backend id.
    const res = toServerSentEventsResponse(textStream(['1', '2', '3']), {
      durability,
      batch: 1,
    })
    expect(await sseIds(res)).toEqual([
      encodeOffset('run-x', 1000),
      encodeOffset('run-x', 1007),
      encodeOffset('run-x', 1014),
    ])
  })

  it('resumes from a backend offset carried in Last-Event-ID', async () => {
    const { fetchStub } = makeNon1BasedDsServer()
    // Produce the full run first.
    await readBody(
      toServerSentEventsResponse(textStream(['1', '2', '3']), {
        durability: durableStream(
          new Request('https://app.test/api/chat?runId=run-x', {
            method: 'POST',
          }),
          { server: 'https://ds.test', fetch: fetchStub },
        ),
        batch: 1,
      }),
    )

    // Reconnect at the backend offset 1007; the input stream must NOT be
    // iterated on resume.
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }
    const reconnect = durableStream(
      new Request('https://app.test/api/chat', {
        method: 'POST',
        headers: { 'Last-Event-ID': encodeOffset('run-x', 1007) },
      }),
      { server: 'https://ds.test', fetch: fetchStub },
    )
    const res = toServerSentEventsResponse(exploding, { durability: reconnect })
    const events = parseSseEvents(await readBody(res))
    expect(events.map((e) => e.id)).toEqual([encodeOffset('run-x', 1014)])
    expect(events.map((e) => JSON.parse(e.data).delta)).toEqual(['3'])
  })
})

// Finding 1 (exactly-once): with the DEFAULT batch (>1), an entire short run is
// one `append` call. Per-chunk POSTing tags EVERY chunk with its own backend
// offset, so a mid-batch drop (including a drop within the very first batch)
// resumes at the exact chunk it dropped on — each chunk is delivered exactly
// once, no dup and no skip. The old per-batch tagging left every non-last chunk
// id-less, so this fails against it (and it must NOT be weakened to batch:1).
describe('durableStream — exactly-once across a mid-batch reconnect', () => {
  function textStream(deltas: Array<string>): AsyncIterable<StreamChunk> {
    return {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) yield textChunk(d)
      },
    }
  }

  it('delivers each chunk exactly once when the socket drops mid-first-batch', async () => {
    const { fetchStub } = makeNon1BasedDsServer()
    const full = ['a', 'b', 'c', 'd', 'e', 'f']

    // Produce the whole run with the DEFAULT batch (no `batch` option). All 6
    // chunks (< 32) buffer into a single `append`; the fix POSTs them one-by-one
    // so each gets its own backend offset (1000, 1007, 1014, …).
    const produced = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(textStream(full), {
          durability: durableStream(
            new Request('https://app.test/api/chat?runId=run-eo', {
              method: 'POST',
            }),
            { server: 'https://ds.test', fetch: fetchStub },
          ),
        }),
      ),
    )

    // Core of the fix: EVERY chunk in the batch carries a resume id. Under the
    // old per-batch tagging only the last chunk did (the rest were id-less), so
    // this assertion fails against the pre-fix code.
    expect(produced).toHaveLength(6)
    expect(produced.every((e) => e.id !== undefined)).toBe(true)
    expect(produced.map((e) => JSON.parse(e.data).delta)).toEqual(full)

    // Simulate a socket drop MID-BATCH after receiving only the first 2 chunks
    // (well within the single 6-chunk first batch). The client's last-seen id is
    // the 2nd chunk's backend offset — defined only because of per-chunk tagging.
    const beforeDrop = produced.slice(0, 2)
    const lastSeenId = beforeDrop.at(-1)?.id
    expect(lastSeenId).toBeDefined()

    // Reconnect carrying that id as Last-Event-ID; the input stream must NOT be
    // re-iterated on resume (replay reads only from the backend).
    const exploding: AsyncIterable<StreamChunk> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            throw new Error('input stream must not be iterated on resume')
          },
        }
      },
    }
    const afterDrop = parseSseEvents(
      await readBody(
        toServerSentEventsResponse(exploding, {
          durability: durableStream(
            new Request('https://app.test/api/chat', {
              method: 'POST',
              headers: { 'Last-Event-ID': lastSeenId! },
            }),
            { server: 'https://ds.test', fetch: fetchStub },
          ),
        }),
      ),
    )

    // What the joiner actually saw = pre-drop prefix + post-reconnect tail. The
    // backend replays strictly AFTER the offset, so there is no overlap: each
    // chunk appears exactly once, in order, with none skipped.
    const received = [...beforeDrop, ...afterDrop].map(
      (e) => JSON.parse(e.data).delta as string,
    )
    expect(received).toEqual(full)
  })
})
