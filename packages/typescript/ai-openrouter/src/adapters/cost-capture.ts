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
 * stream consumer and the tee'd parse reader. `take()` awaits any in-flight
 * parses (registered via `recordParse`) before reading, so cost is
 * deterministic even under fast responses or heavy event-loop pressure.
 *
 * Entries also auto-expire so a missing read (errored stream, missing id,
 * etc.) cannot leak memory across long-lived adapters.
 */
export class CostStore {
  private entries = new Map<string, CostEntry>()
  private pendingParses = new Set<Promise<unknown>>()
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

  async take(id: string): Promise<CostInfo | undefined> {
    // Fast path: the tee'd parser typically finishes before the SDK's
    // stream consumer exits (less work per chunk than the Zod pipeline),
    // so skip the allSettled barrier entirely when the entry is already
    // populated. This also prevents over-waiting on unrelated in-flight
    // parses from a concurrent chat.send on the same adapter.
    const preset = this.entries.get(id)
    if (preset) {
      clearTimeout(preset.timer)
      this.entries.delete(id)
      return preset.info
    }
    // Slow path: parse may still be running; await outstanding ones so
    // `store.set` has a chance to run before we decide there is no cost
    // for this id.
    if (this.pendingParses.size > 0) {
      await Promise.allSettled([...this.pendingParses])
    }
    const entry = this.entries.get(id)
    if (!entry) return undefined
    clearTimeout(entry.timer)
    this.entries.delete(id)
    return entry.info
  }

  clear(): void {
    for (const { timer } of this.entries.values()) clearTimeout(timer)
    this.entries.clear()
    this.pendingParses.clear()
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
    const contentType = res.headers.get('content-type') ?? ''
    const parse = parseAndStore(copy.body, contentType, store).catch(() => {})
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

async function parseAndStore(
  body: ReadableStream<Uint8Array>,
  contentType: string,
  store: CostStore,
): Promise<void> {
  if (contentType.includes('text/event-stream')) {
    await parseSseAndStore(body, store)
  } else {
    await parseJsonAndStore(body, store)
  }
}

async function parseSseAndStore(
  body: ReadableStream<Uint8Array>,
  store: CostStore,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let responseId: string | undefined
  let cost: CostInfo | undefined
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: true })
      // Network reads may split SSE events or batch several together — drain
      // only \n\n-delimited frames and keep any trailing partial in `buffer`
      // for the next read so we never parse a half-received JSON payload.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const payload = extractDataPayload(event)
        if (!payload || payload === '[DONE]') continue
        const parsed = safeParseJson(payload)
        if (!parsed) continue
        if (!responseId && typeof parsed.id === 'string') {
          responseId = parsed.id
        }
        const usage = parsed.usage as Record<string, unknown> | undefined
        if (usage) {
          const extracted = extractCostFromUsage(usage)
          if (extracted) cost = extracted
        }
      }
      // Cost arrives in the trailing usage chunk, after which there's no
      // more data we care about. Cancel our clone early so the upstream
      // body can be GC'd; the SDK's clone half is unaffected.
      if (responseId && cost) {
        await reader.cancel().catch(() => {})
        break
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
  if (responseId && cost) store.set(responseId, cost)
}

async function parseJsonAndStore(
  body: ReadableStream<Uint8Array>,
  store: CostStore,
): Promise<void> {
  const text = await new Response(body).text()
  const parsed = safeParseJson(text)
  if (!parsed) return
  const id = typeof parsed.id === 'string' ? parsed.id : undefined
  const usage = parsed.usage as Record<string, unknown> | undefined
  if (!id || !usage) return
  const cost = extractCostFromUsage(usage)
  if (cost) store.set(id, cost)
}

function extractDataPayload(event: string): string | undefined {
  const lines: Array<string> = []
  for (const line of event.split('\n')) {
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
