/**
 * mem0 memory adapter — talks to a mem0 server over plain HTTP (no SDK, so no
 * peer dependency). mem0 owns extraction and ranking server-side; this adapter
 * maps the `recall`/`save` contract onto its `/memories` and `/search` endpoints.
 *
 * Requires a running mem0 server. Point it at one via `baseUrl` (or the
 * `MEM0_URL` env var); pass `apiKey` (or `MEM0_ADMIN_API_KEY`) when it's secured.
 */

import type {
  MemoryAdapter,
  MemoryFact,
  MemoryFragment,
  MemoryScope,
  MemorySnapshot,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '../../types'

export interface Mem0Options {
  /** Durable user id. Falls back to `scope.userId`, then `'demo-user'`. */
  user?: string
  /** mem0 server URL. Defaults to `MEM0_URL` or `http://localhost:8000`. */
  baseUrl?: string
  /** Bearer token. Defaults to `MEM0_ADMIN_API_KEY`. */
  apiKey?: string
  /** Ask mem0 to rerank search results. Defaults to `true`. */
  rerank?: boolean
  /** Minimum search score. Defaults to `0.1`. */
  threshold?: number
}

type JsonResult =
  | { ok: true; latencyMs: number; data: unknown }
  | { ok: false; latencyMs: number; error: string }

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Pull the array of items out of a mem0 response (`{results: []}` or a bare array). */
function itemsOf(data: unknown): Array<Record<string, unknown>> {
  const rec = asRecord(data)
  const candidate = rec && 'results' in rec ? rec.results : data
  if (!Array.isArray(candidate)) return []
  return candidate.filter(
    (m): m is Record<string, unknown> => !!m && typeof m === 'object',
  )
}

export function mem0(options: Mem0Options = {}): MemoryAdapter {
  const baseUrl =
    options.baseUrl ?? process.env.MEM0_URL ?? 'http://localhost:8000'
  const apiKey = options.apiKey ?? process.env.MEM0_ADMIN_API_KEY ?? ''
  const rerank = options.rerank ?? true
  const threshold = options.threshold ?? 0.1

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) h.Authorization = `Bearer ${apiKey}`
    return h
  }

  function userId(scope: MemoryScope): string {
    return options.user ?? scope.userId ?? 'demo-user'
  }

  async function safeJson(fn: () => Promise<Response>): Promise<JsonResult> {
    const start = Date.now()
    try {
      const res = await fn()
      const latencyMs = Date.now() - start
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          ok: false,
          latencyMs,
          error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
        }
      }
      const data = await res.json().catch(() => null)
      return { ok: true, latencyMs, data }
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async function loadMemories(scope: MemoryScope): Promise<JsonResult> {
    const url = `${baseUrl}/memories?user_id=${encodeURIComponent(userId(scope))}`
    return safeJson(() => fetch(url, { method: 'GET', headers: headers() }))
  }

  return {
    id: 'mem0',

    async save(scope, turn: MemoryTurn): Promise<Array<SaveReceipt>> {
      const result = await safeJson(() =>
        fetch(`${baseUrl}/memories`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            messages: [
              { role: 'user', content: turn.user },
              { role: 'assistant', content: turn.assistant },
            ],
            user_id: userId(scope),
          }),
        }),
      )
      return [
        {
          ok: result.ok,
          latencyMs: result.latencyMs,
          raw: result.ok ? result.data : undefined,
          error: result.ok ? undefined : result.error,
        },
      ]
    },

    async recall(scope, query): Promise<RecallResult> {
      const result = await safeJson(() =>
        fetch(`${baseUrl}/search`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            query,
            user_id: userId(scope),
            rerank,
            threshold,
          }),
        }),
      )
      if (!result.ok) {
        return { systemPrompt: '', fragments: [], raw: { error: result.error } }
      }
      const fragments: Array<MemoryFragment> = itemsOf(result.data).map(
        (m) => ({
          text: asString(m.memory) ?? asString(m.text) ?? JSON.stringify(m),
          source: asString(m.id) ?? 'mem0',
        }),
      )
      const systemPrompt =
        fragments.length === 0
          ? ''
          : `Recalled memory:\n${fragments.map((f) => `- (${f.source}) ${f.text}`).join('\n')}`
      return { systemPrompt, fragments, raw: result.data }
    },

    async inspect(scope): Promise<MemorySnapshot> {
      const result = await loadMemories(scope)
      return {
        takenAt: new Date().toISOString(),
        data: result.ok ? result.data : { error: result.error },
      }
    },

    async listFacts(scope): Promise<Array<MemoryFact>> {
      const result = await loadMemories(scope)
      if (!result.ok) return []
      return itemsOf(result.data)
        .map((m): MemoryFact | null => {
          const text = asString(m.memory)
          if (!text) return null
          return {
            id: asString(m.id) ?? 'mem0',
            text,
            source: 'memory',
            createdAt: asString(m.updated_at) ?? asString(m.created_at),
          }
        })
        .filter((f): f is MemoryFact => f !== null)
    },
  }
}
