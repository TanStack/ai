/**
 * Honcho memory adapter. Honcho models memory as peers exchanging messages in a
 * session and answers recall via a "dialectic" query over the user peer's
 * representation — so `recall` returns a synthesized answer (no discrete
 * fragments) and `save` appends the turn's messages to the session.
 *
 * `@honcho-ai/sdk` is an OPTIONAL peer dependency, loaded lazily on first use.
 */

import type { Peer, Session } from '@honcho-ai/sdk'
import type {
  MemoryAdapter,
  MemoryFact,
  MemoryScope,
  MemorySnapshot,
  MemoryTurn,
  RecallResult,
  SaveReceipt,
} from '../../types'

export interface HonchoOptions {
  /** Durable user id. Falls back to `scope.userId`, then `'demo-user'`. */
  user?: string
  /** Honcho server URL. Defaults to `HONCHO_URL` or `http://localhost:8001`. */
  baseURL?: string
  /** Workspace id. Defaults to `HONCHO_APP_NAME` or `'ai-memory'`. */
  workspaceId?: string
  /** API key. Defaults to `HONCHO_API_KEY` (or `'dev-no-auth'`). */
  apiKey?: string
  /** Assistant peer id. Defaults to `'assistant'`. */
  assistantId?: string
}

type Timed<T> =
  | { ok: true; latencyMs: number; data: T }
  | { ok: false; latencyMs: number; error: string }

async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = Date.now()
  try {
    const data = await fn()
    return { ok: true, latencyMs: Date.now() - start, data }
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

const HONCHO_LINE_RE = /^\[(?<ts>[^\]]+)\]\s+(?<text>.+)$/

/** Parse a Honcho `peer.representation()` text blob into flat fact rows. */
export function parseHonchoRepresentation(raw: string): Array<MemoryFact> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith('##') &&
        !line.startsWith('Explicit Observations'),
    )
    .map((line, i): MemoryFact => {
      const m = line.match(HONCHO_LINE_RE)
      if (m?.groups?.ts && m.groups.text) {
        return {
          id: `honcho-${m.groups.ts}-${i}`,
          text: m.groups.text,
          source: 'observation',
          createdAt: m.groups.ts,
        }
      }
      return { id: `honcho-${i}`, text: line, source: 'representation' }
    })
}

export function honcho(options: HonchoOptions = {}): MemoryAdapter {
  const assistantId = options.assistantId ?? 'assistant'

  // Client + entity caches live in this factory's closure — each honcho()
  // instance owns its own.
  type Client = Awaited<ReturnType<typeof loadClient>>
  let clientPromise: Promise<Client> | null = null
  const sessionCache = new Map<string, Promise<Session>>()
  const userPeerCache = new Map<string, Promise<Peer>>()
  let assistantPeerPromise: Promise<Peer> | null = null

  async function loadClient() {
    const mod = await import('@honcho-ai/sdk')
    return new mod.Honcho({
      baseURL:
        options.baseURL ?? process.env.HONCHO_URL ?? 'http://localhost:8001',
      workspaceId:
        options.workspaceId ?? process.env.HONCHO_APP_NAME ?? 'ai-memory',
      apiKey: options.apiKey ?? process.env.HONCHO_API_KEY ?? 'dev-no-auth',
    })
  }

  function getClient(): Promise<Client> {
    if (!clientPromise) clientPromise = loadClient()
    return clientPromise
  }

  function cached<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    create: () => Promise<T>,
  ): Promise<T> {
    const existing = cache.get(key)
    if (existing) return existing
    const created = create().catch((err) => {
      if (cache.get(key) === created) cache.delete(key)
      throw err
    })
    cache.set(key, created)
    return created
  }

  function getUserPeer(userId: string): Promise<Peer> {
    return cached(userPeerCache, userId, async () =>
      (await getClient()).peer(userId),
    )
  }
  function getAssistantPeer(): Promise<Peer> {
    if (!assistantPeerPromise) {
      assistantPeerPromise = (async () =>
        (await getClient()).peer(assistantId))().catch((err) => {
        assistantPeerPromise = null
        throw err
      })
    }
    return assistantPeerPromise
  }
  function getSession(sessionId: string): Promise<Session> {
    return cached(sessionCache, sessionId, async () =>
      (await getClient()).session(sessionId),
    )
  }

  function userIdFor(scope: MemoryScope): string {
    return options.user ?? scope.userId ?? 'demo-user'
  }

  return {
    id: 'honcho',

    async save(scope, turn: MemoryTurn): Promise<Array<SaveReceipt>> {
      const result = await timed(async () => {
        const [userPeer, assistantPeer, session] = await Promise.all([
          getUserPeer(userIdFor(scope)),
          getAssistantPeer(),
          getSession(scope.sessionId),
        ])
        return session.addMessages([
          userPeer.message(turn.user),
          assistantPeer.message(turn.assistant),
        ])
      })
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
      const result = await timed(async () => {
        const [userPeer, session] = await Promise.all([
          getUserPeer(userIdFor(scope)),
          getSession(scope.sessionId),
        ])
        return userPeer.chat(query, { session })
      })
      if (!result.ok) {
        return { systemPrompt: '', raw: { error: result.error } }
      }
      const text = typeof result.data === 'string' ? result.data : ''
      return { systemPrompt: text, raw: { dialectic: text } }
    },

    async inspect(scope): Promise<MemorySnapshot> {
      const session = await getSession(scope.sessionId).catch(() => null)
      if (!session) {
        return {
          takenAt: new Date().toISOString(),
          data: { error: 'failed to get session' },
        }
      }
      const [messages, summaries] = await Promise.all([
        timed(() => session.messages({ size: 50 })),
        timed(() => session.summaries()),
      ])
      return {
        takenAt: new Date().toISOString(),
        data: {
          messages: messages.ok ? messages.data : { error: messages.error },
          summaries: summaries.ok ? summaries.data : { error: summaries.error },
        },
      }
    },

    async listFacts(scope): Promise<Array<MemoryFact>> {
      const result = await timed(async () => {
        const userPeer = await getUserPeer(userIdFor(scope))
        return userPeer.representation()
      })
      if (!result.ok) return []
      const raw =
        typeof result.data === 'string'
          ? result.data
          : String(
              (result.data as { representation?: unknown }).representation ??
                '',
            )
      return parseHonchoRepresentation(raw)
    },
  }
}
