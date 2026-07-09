import { decodeOffset, encodeOffset } from '@tanstack/ai'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

/**
 * Options for {@link durableStream}.
 */
export interface DurableStreamOptions {
  /** Base URL of the durable-streams server (no trailing slash needed). */
  server: string
  /**
   * Prefix for the stream name (`{prefix}/{runId}`). Defaults to `runs`, so a
   * run lands at `runs/{runId}`.
   */
  streamPrefix?: string
  /**
   * `fetch` implementation to use. Defaults to the global `fetch`. Injectable
   * for testing and for wiring a custom transport / auth layer.
   */
  fetch?: typeof globalThis.fetch
}

/** One parsed SSE event from a durable-streams read. */
interface SseEvent {
  id?: string
  event?: string
  data?: string
}

/** Read a byte `ReadableStream` as `\n`-delimited lines (blank lines included). */
async function* readLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const raw of parts) {
        yield raw.endsWith('\r') ? raw.slice(0, -1) : raw
      }
    }
    if (buffer) {
      yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse an SSE `ReadableStream` into discrete events. Events are separated by a
 * blank line; `id:` / `event:` / `data:` fields are collected per event. `:`
 * comment lines (proxy/CDN keepalives) are skipped. A final event not
 * terminated by a trailing blank line is still flushed.
 */
async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  let current: SseEvent = {}
  let hasField = false

  for await (const line of readLines(body)) {
    if (line === '') {
      if (hasField) {
        yield current
        current = {}
        hasField = false
      }
      continue
    }
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'id') current.id = value
    else if (field === 'event') current.event = value
    else if (field === 'data') {
      current.data =
        current.data === undefined ? value : `${current.data}\n${value}`
    }
    hasField = true
  }
  if (hasField) yield current
}

/** Extract the seq token (`-1` / `now` / a number) from a `runId@seq` offset. */
function offsetToken(offset: string): string {
  return offset.includes('@')
    ? offset.slice(offset.lastIndexOf('@') + 1)
    : offset
}

/**
 * Interpret a live-read `event: control` frame's `data`. A rollover frame
 * carries `{ offset }` (resume the read from there across a live-window
 * boundary); a close frame carries `{ closed: true }` (the server finalized the
 * stream). Anything else — absent data, invalid JSON, or an object with neither
 * signal — yields `{}`, which the caller treats as malformed.
 */
function parseControlFrame(data: string | undefined): {
  offset?: string
  closed?: boolean
} {
  if (data === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}
  const result: { offset?: string; closed?: boolean } = {}
  const offset = (parsed as { offset?: unknown }).offset
  if (typeof offset === 'string') result.offset = offset
  const closed = (parsed as { closed?: unknown }).closed
  if (closed === true) result.closed = true
  return result
}

function safeSearchParam(request: Request, key: string): string | null {
  try {
    return new URL(request.url).searchParams.get(key)
  } catch {
    return null
  }
}

/**
 * A {@link StreamDurability} backed by the
 * [durable-streams](https://durablestreams.com) HTTP protocol. We own **zero**
 * delivery-event storage — the durable-streams server owns the bytes (its own
 * WAL / group-commit), and this adapter is a thin append/read/resume shim.
 *
 * - `runId()` — fresh: minted; resume: parsed from `Last-Event-ID` / `?offset`.
 * - stream name — `${streamPrefix ?? 'runs'}/${runId}`.
 * - `append` — `PUT` the stream once (idempotent create), then `POST` each chunk
 *   INDIVIDUALLY (sequential awaited POSTs preserve order); every chunk is tagged
 *   with its OWN backend offset (from that POST's `Stream-Next-Offset`), so the
 *   returned offset array is fully populated (one resume offset per chunk) and
 *   exactly-once holds at any batch size. durable-streams is built for
 *   high-throughput per-append writes with server-side group-commit, so
 *   one-POST-per-chunk is the intended usage.
 * - `read` — `GET ?offset=&live=sse`, parsing `data` events into `{ seq, chunk }`
 *   and reconnecting across the CDN live-window boundary via the last offset. The
 *   `id:` the server replays for chunk i equals the offset `append` tagged chunk
 *   i with on the fresh pass — the invariant that makes resume exactly-once.
 *
 * @example
 * ```ts
 * import { toServerSentEventsResponse } from '@tanstack/ai'
 * import { durableStream } from '@tanstack/ai-durable-stream'
 *
 * export async function POST(request: Request) {
 *   const stream = chat({ adapter, model: 'gpt-5.5', messages })
 *   return toServerSentEventsResponse(stream, {
 *     durability: durableStream(request, { server: process.env.DS_URL! }),
 *   })
 * }
 * ```
 */
export function durableStream(
  request: Request,
  options: DurableStreamOptions,
): StreamDurability {
  const fetchFn = options.fetch ?? globalThis.fetch
  const prefix = options.streamPrefix ?? 'runs'
  // Validate the server as an absolute URL at construction, so a malformed
  // base fails loudly here rather than surfacing later as an opaque fetch
  // error deep inside `append` / `read`.
  try {
    void new URL(options.server)
  } catch {
    throw new Error(
      `durableStream: invalid server URL: ${JSON.stringify(options.server)}`,
    )
  }
  const server = options.server.replace(/\/$/, '')

  const resumeOffset =
    request.headers.get('Last-Event-ID') ?? safeSearchParam(request, 'offset')

  let cachedRunId: string | undefined
  const runId = (): string => {
    if (cachedRunId === undefined) {
      if (resumeOffset && resumeOffset.includes('@')) {
        cachedRunId = decodeOffset(resumeOffset).runId
      } else {
        cachedRunId = safeSearchParam(request, 'runId') ?? crypto.randomUUID()
      }
    }
    return cachedRunId
  }

  const streamUrl = (): string =>
    `${server}/streams/${encodeURIComponent(`${prefix}/${runId()}`)}`

  let created = false
  const ensureCreated = async (): Promise<void> => {
    if (created) return
    // Idempotent create. A repeat PUT (e.g. a second server instance for the
    // same run) is a server-side no-op.
    const res = await fetchFn(streamUrl(), { method: 'PUT' })
    if (!res.ok) {
      throw new Error(
        `durableStream: failed to create stream (${res.status} ${res.statusText})`,
      )
    }
    created = true
  }

  return {
    resumeFrom: () => resumeOffset,
    runId,
    append: async (chunks, startSeq) => {
      await ensureCreated()
      // POST each chunk INDIVIDUALLY (sequential awaited POSTs preserve order)
      // and capture EACH message's own backend offset from its response's
      // `Stream-Next-Offset`. This yields a fully-populated per-chunk offset
      // array — every chunk carries a backend-addressable resume id — so a
      // mid-batch reconnect resumes at the exact chunk it dropped on and
      // exactly-once holds at ANY batch size (the transport `batch` option only
      // controls how many chunks are handed to one `append` call; we POST them
      // one-by-one internally). The tagged offset MUST equal the `id:` the
      // server will emit for that same chunk on a GET replay, so the fresh path
      // and the resume path share one key space.
      const id = runId()
      const offsets: Array<string> = []
      for (let i = 0; i < chunks.length; i++) {
        const res = await fetchFn(streamUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([chunks[i]]),
        })
        if (!res.ok) {
          throw new Error(
            `durableStream: failed to append (${res.status} ${res.statusText})`,
          )
        }
        const next = res.headers.get('Stream-Next-Offset')
        const seq =
          next !== null && Number.isFinite(Number(next))
            ? Number(next)
            : startSeq + i
        offsets.push(encodeOffset(id, seq))
      }
      return offsets
    },
    read: async function* (offset, signal) {
      let cursor = offsetToken(offset)
      // Reconnect loop: the CDN live window closes the SSE response
      // periodically (~60s); resume from the last delivered offset.
      reconnect: for (;;) {
        if (signal?.aborted) return
        const url = `${streamUrl()}?offset=${encodeURIComponent(
          cursor,
        )}&live=sse`
        const res = await fetchFn(url, { method: 'GET', signal })
        if (!res.ok) {
          throw new Error(
            `durableStream: failed to read (${res.status} ${res.statusText})`,
          )
        }
        if (!res.body) {
          throw new Error('durableStream: read response had no body')
        }
        // A read ends legitimately only when it saw the run's terminal event
        // or the server flagged the stream closed (`Stream-Closed` header /
        // a `{ closed: true }` control frame). A bare EOF without either means
        // the live window was cut mid-run — surface it rather than silently
        // truncating a still-in-flight read.
        const streamClosed = res.headers.get('Stream-Closed') === 'true'
        let genuineEnd = streamClosed
        for await (const evt of parseSseEvents(res.body)) {
          if (evt.event === 'control') {
            const parsed = parseControlFrame(evt.data)
            if (parsed.offset !== undefined) {
              cursor = parsed.offset
              continue reconnect
            }
            if (parsed.closed) {
              genuineEnd = true
              continue
            }
            // A control frame we cannot act on (unparseable, or neither a
            // rollover offset nor a close signal) — surface rather than
            // silently ending the read.
            throw new Error(
              'durableStream: malformed control frame (no offset or close signal) in read stream',
            )
          }
          if (evt.data === undefined) continue
          const chunk = JSON.parse(evt.data) as StreamChunk
          // Every data event MUST carry a numeric offset id; a missing /
          // non-numeric id would yield a `NaN` seq that corrupts the resume
          // cursor, so reject the frame instead.
          if (evt.id === undefined) {
            throw new Error(
              'durableStream: read event missing id (cannot derive resume offset)',
            )
          }
          const seq = Number(evt.id)
          if (!Number.isFinite(seq)) {
            throw new Error(
              `durableStream: read event has non-numeric id: ${JSON.stringify(
                evt.id,
              )}`,
            )
          }
          cursor = evt.id
          if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
            genuineEnd = true
          }
          yield { seq, chunk }
        }
        if (genuineEnd) return
        throw new Error(
          'durableStream: read stream ended without a terminal event or close signal — connection was likely cut short.',
        )
      }
    },
  }
}
