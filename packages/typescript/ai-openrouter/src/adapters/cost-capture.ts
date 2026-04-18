import { HTTPClient } from '@openrouter/sdk'

export interface CostInfo {
  cost?: number
  costDetails?: {
    upstreamInferenceCost?: number | null
    cacheDiscount?: number | null
  }
}

interface CostEntry {
  info: CostInfo
  timer: ReturnType<typeof setTimeout>
}

interface ParseEntry {
  parse: Promise<unknown>
  timer?: ReturnType<typeof setTimeout>
}

/**
 * Per-response cost cache, keyed by upstream response id.
 *
 * The chat-completion response carries `usage.cost` in its trailing chunk,
 * but the @openrouter/sdk Zod parser strips it (the schema doesn't declare
 * the field, and Zod defaults to strip mode). We clone the response inside
 * the SDK's own response hook, parse our copy out-of-band, and stash cost
 * here so the adapter can read it after the SDK-parsed stream ends.
 *
 * The hook runs the parse as a fire-and-forget Promise, so by the time the
 * adapter's `for await` loop exits, `store.set(id, cost)` may not yet have
 * run — there's no direct happens-before relationship between the SDK's
 * stream consumer and the tee'd parse reader. `take(id)` awaits **only the
 * parse that has announced this id** (via `announceId`), so overlapping
 * `chat.send` calls on the same adapter cannot block each other's cost
 * delivery. If no parse has announced the id yet, `take(id)` waits for the
 * next announcement or for all currently-pending parses to settle,
 * whichever comes first.
 *
 * Entries also auto-expire so a missing read (errored stream, missing id,
 * etc.) cannot leak memory across long-lived adapters.
 */
export class CostStore {
  private entries = new Map<string, CostEntry>()
  private pendingParses = new Set<Promise<unknown>>()
  private idToParse = new Map<string, ParseEntry>()
  private announcementWaiters = new Set<() => void>()
  private readonly ttlMs: number

  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs
  }

  set(id: string, info: CostInfo): void {
    const existing = this.entries.get(id)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => this.entries.delete(id), this.ttlMs)
    // In browser/Deno runtimes `setTimeout` returns a number — `'unref' in
    // <number>` would throw. Gate on object-ness before probing for unref().
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.entries.set(id, { info, timer })
  }

  recordParse(parse: Promise<unknown>): void {
    this.pendingParses.add(parse)
    parse.finally(() => this.pendingParses.delete(parse))
  }

  announceId(id: string, parse: Promise<unknown>): void {
    const existing = this.idToParse.get(id)
    if (existing?.timer) clearTimeout(existing.timer)
    const entry: ParseEntry = { parse }
    this.idToParse.set(id, entry)
    // After the parse settles, keep the entry around briefly so a late
    // `take(id)` can resolve without falling through to the pending-parses
    // wait (which would reintroduce head-of-line blocking on unrelated
    // concurrent streams — especially for responses that announce an id
    // but never produce `usage.cost`). TTL eventually drops it.
    parse.finally(() => {
      const timer = setTimeout(() => {
        if (this.idToParse.get(id) === entry) this.idToParse.delete(id)
      }, this.ttlMs)
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()
      entry.timer = timer
    })
    // Wake every `take()` that was parked waiting for *some* announcement —
    // the ones whose id doesn't match will fall back into the wait loop.
    const waiters = [...this.announcementWaiters]
    this.announcementWaiters.clear()
    for (const w of waiters) w()
  }

  async take(id: string): Promise<CostInfo | undefined> {
    // Fast path: the tee'd parser typically finishes before the SDK's
    // stream consumer exits (less work per chunk than the Zod pipeline),
    // so skip the wait entirely when the entry is already populated.
    const preset = this.entries.get(id)
    if (preset) {
      clearTimeout(preset.timer)
      this.entries.delete(id)
      return preset.info
    }
    // Slow path: prefer per-id matching so an unrelated long-running stream
    // on the same adapter cannot delay our RUN_FINISHED. If the matching
    // parse hasn't announced yet, park on the next announcement or on the
    // current wave of parses draining (whichever happens first), then loop.
    for (;;) {
      const match = this.idToParse.get(id)
      if (match) {
        await match.parse.catch(() => {})
        if (match.timer) clearTimeout(match.timer)
        if (this.idToParse.get(id) === match) this.idToParse.delete(id)
        break
      }
      if (this.pendingParses.size === 0) break
      let resolveSignal: () => void = () => {}
      const nextAnnouncement = new Promise<void>((resolve) => {
        resolveSignal = resolve
        this.announcementWaiters.add(resolve)
      })
      const currentWaveDrained = Promise.allSettled([
        ...this.pendingParses,
      ]).then(() => {})
      await Promise.race([nextAnnouncement, currentWaveDrained])
      this.announcementWaiters.delete(resolveSignal)
    }
    const entry = this.entries.get(id)
    if (!entry) return undefined
    clearTimeout(entry.timer)
    this.entries.delete(id)
    return entry.info
  }

  clear(): void {
    for (const { timer } of this.entries.values()) clearTimeout(timer)
    for (const entry of this.idToParse.values()) {
      if (entry.timer) clearTimeout(entry.timer)
    }
    this.entries.clear()
    this.pendingParses.clear()
    this.idToParse.clear()
    this.announcementWaiters.clear()
  }
}

/**
 * Returns a response hook for the SDK's public `HTTPClient` that captures
 * `usage.cost` and `usage.cost_details` from chat-completion responses
 * without consuming the SDK's body.
 *
 * `Response.clone()` tees the body internally — our consumer reads one
 * branch while the SDK reads the other exactly as if no interception
 * happened. Any parse error is silently swallowed because cost is a
 * secondary signal and must not break the chat stream.
 */
export function createCostCaptureHook(
  store: CostStore,
): (res: Response, req: Request) => void {
  return (res, req) => {
    if (!isChatCompletionsRequest(req.url)) return
    // Content-Type is case-insensitive per RFC 9110. OpenRouter today
    // serves lowercase `text/event-stream`, but a proxy on the path could
    // legitimately return a different casing — normalize before matching.
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    // Cost capture is only wired for streaming chat completions. Non-SSE
    // responses on `/chat/completions` (e.g. `structuredOutput()` which
    // calls `chat.send({ stream: false })`) never consume `costStore` —
    // skipping them here avoids cloning the response and second-parsing
    // potentially large JSON bodies for no downstream consumer.
    if (!contentType.includes('text/event-stream')) return
    if (!res.body) return
    let copy: Response
    try {
      copy = res.clone()
    } catch {
      // A preceding response hook consumed the body (e.g. read `res.text()`
      // for logging). Cloning now throws `TypeError: Body already read`;
      // give up on cost rather than bubbling a failure that the SDK's hook
      // loop would surface as a whole-request error.
      return
    }
    if (!copy.body) return
    // Announce the id the moment the parser sees it so concurrent `take(id)`
    // calls can await only *this* parse instead of every in-flight one.
    // Forward-ref: the parser needs a callback that references `parse`, but
    // `parse` isn't bound yet at construction time. The stable `onId`
    // trampoline delegates to `announce`, which we swap in right after
    // `parse` is assigned — the parser only fires `onId` after its first
    // async read, by which point the swap has happened.
    let announce: (id: string) => void = () => {}
    const onId = (id: string) => announce(id)
    const parse = parseSseAndStore(copy.body, store, onId).catch(() => {})
    announce = (id) => store.announceId(id, parse)
    store.recordParse(parse)
  }
}

/**
 * Returns an `HTTPClient` with cost capture attached. When `client` is
 * provided, clones it — the clone inherits the caller's fetcher and any
 * hooks they registered, and our hook is appended. We never mutate the
 * caller's instance, so they can reuse it for unrelated SDK calls without
 * picking up our cost-capture behavior as a side effect.
 */
export function attachCostCapture(
  store: CostStore,
  client?: HTTPClient,
): HTTPClient {
  const wrapped = client ? client.clone() : new HTTPClient()
  wrapped.addHook('response', createCostCaptureHook(store))
  return wrapped
}

function isChatCompletionsRequest(url: string): boolean {
  // Match path segment to avoid false positives on hosts whose name happens
  // to end in "/chat/completions". The SDK always sends absolute URLs.
  return /\/chat\/completions(?:[/?#]|$)/.test(url)
}

// Event separators per SSE spec: a blank line between events may use any of
// `\n\n`, `\r\n\r\n`, or `\r\r`. Matching all three directly (instead of
// pre-normalizing line endings) avoids a chunk-boundary bug where a lone
// `\r` at the end of one read would be rewritten to `\n` before the paired
// `\n` of a CRLF landed in the next read, producing a false `\n\n` frame
// split in the middle of a line.
const SSE_EVENT_SEPARATOR = /\r\n\r\n|\r\r|\n\n/

async function parseSseAndStore(
  body: ReadableStream<Uint8Array>,
  store: CostStore,
  onId?: (id: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let responseId: string | undefined
  let cost: CostInfo | undefined
  const applyEvent = (event: string): void => {
    const payload = extractDataPayload(event)
    if (!payload || payload === '[DONE]') return
    const parsed = safeParseJson(payload)
    if (!parsed) return
    if (!responseId && typeof parsed.id === 'string') {
      responseId = parsed.id
      onId?.(responseId)
    }
    const usage = parsed.usage as Record<string, unknown> | undefined
    if (usage) {
      const extracted = extractCostFromUsage(usage)
      if (extracted) cost = extracted
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: true })
      // Network reads may split SSE events or batch several together — drain
      // separator-delimited frames and keep any trailing partial in `buffer`
      // for the next read so we never parse a half-received JSON payload.
      for (;;) {
        const match = SSE_EVENT_SEPARATOR.exec(buffer)
        if (!match) break
        const event = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        applyEvent(event)
      }
      if (done) {
        // EOF-terminated SSE can legitimately omit the final separator
        // (especially through proxies). Flush whatever is left as a final
        // event so the trailing usage chunk isn't silently dropped.
        if (buffer.length > 0) applyEvent(buffer)
        break
      }
      // Cost arrives in the trailing usage chunk, after which there's no
      // more data we care about. Cancel our clone early so the upstream
      // body can be GC'd; the SDK's clone half is unaffected.
      if (responseId && cost) {
        await reader.cancel().catch(() => {})
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (responseId && cost) store.set(responseId, cost)
}

function extractDataPayload(event: string): string | undefined {
  const lines: Array<string> = []
  // Split on any single-line terminator per SSE spec (`\r\n`, `\r`, or
  // `\n`) so we don't leave a trailing `\r` in the payload when servers
  // use CRLF inside a frame.
  for (const line of event.split(/\r\n|\r|\n/)) {
    if (!line.startsWith('data:')) continue
    lines.push(line.slice(5).replace(/^ /, ''))
  }
  if (!lines.length) return undefined
  return lines.join('\n')
}

function safeParseJson(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function pickNumberOrNull(
  obj: Record<string, unknown> | undefined,
  key: string,
): number | null | undefined {
  if (!obj) return undefined
  const v = obj[key]
  if (typeof v === 'number') return v
  if (v === null) return null
  return undefined
}

function extractCostFromUsage(
  usage: Record<string, unknown>,
): CostInfo | undefined {
  const cost = typeof usage.cost === 'number' ? usage.cost : undefined
  const details = usage.cost_details as Record<string, unknown> | undefined
  const upstream = pickNumberOrNull(details, 'upstream_inference_cost')
  const cacheDiscount = pickNumberOrNull(details, 'cache_discount')
  const hasDetails = upstream !== undefined || cacheDiscount !== undefined
  if (cost === undefined && !hasDetails) return undefined
  return {
    ...(cost !== undefined && { cost }),
    ...(hasDetails && {
      costDetails: {
        ...(upstream !== undefined && { upstreamInferenceCost: upstream }),
        ...(cacheDiscount !== undefined && { cacheDiscount }),
      },
    }),
  }
}
