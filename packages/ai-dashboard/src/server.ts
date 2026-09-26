import { createServer } from 'node:http'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { DASHBOARD_HTML, MANIFEST_JSON, SERVICE_WORKER } from './ui'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** One frame the dashboard sends a host: a session-tier control frame for a thread. */
export interface ControlEnvelope {
  threadId: string
  frame: Record<string, unknown>
}

export interface DashboardOptions {
  port?: number
  hostname?: string
  /** The owner's login token. Default: a new random token, returned by `startDashboard`. */
  ownerToken?: string
  /** Events kept per session for replay. Default 2000. */
  cacheSize?: number
  /** How long an input waits for an offline host. Default 10 minutes. */
  queueTtlMs?: number
}

interface HostRecord {
  hostId: string
  name: string
  harnesses: Array<string>
  token: string
  lastSeen: number
  streams: Set<ServerResponse>
  queue: Array<{ envelope: ControlEnvelope; expiresAt: number }>
}

interface SessionRecord {
  hostId: string
  threadId: string
  harness?: string
  events: Array<{
    cursor: string
    operationId: string
    event: Record<string, unknown>
  }>
  lastActivity: number
  status: 'idle' | 'running' | 'waiting'
  clients: Set<ServerResponse>
}

const token = () => randomBytes(24).toString('base64url')

function sameSecret(
  given: string | null | undefined,
  expected: string,
): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function bearer(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer '))
    return header.slice(7)
  // EventSource cannot send headers, so SSE clients pass the token in the URL.
  return url.searchParams.get('token')
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 5_000_000) throw new Error('Body too large.')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Expected a JSON object.')
  // Checked to be a plain object above.
  return parsed as Record<string, unknown>
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function openSse(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(': connected\n\n')
}

function sse(res: ServerResponse, data: unknown, id?: string): void {
  res.write(`${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(data)}\n\n`)
}

/** A code a person can read out: 3 characters, a dash, 3 characters. */
function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () => alphabet.charAt(randomInt(alphabet.length))
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`
}

/**
 * Start a self-hosted dashboard server. Harness hosts dial out to it
 * (`connectDashboard`), and people open it in a browser or on a phone.
 *
 * - Hosts pair with a one-time code that the owner approves, and get a host token.
 * - The owner logs in with the owner token.
 * - The server relays session frames and keeps a cache of recent events.
 *   Hosts keep the transcripts.
 */
export async function startDashboard(options: DashboardOptions = {}) {
  const ownerToken = options.ownerToken ?? token()
  const cacheSize = options.cacheSize ?? 2000
  const queueTtlMs = options.queueTtlMs ?? 10 * 60_000
  const hosts = new Map<string, HostRecord>()
  const hostByToken = new Map<string, string>()
  const pairings = new Map<
    string,
    { code: string; name: string; expiresAt: number; hostId?: string }
  >()
  const sessions = new Map<string, SessionRecord>()
  const sessionKey = (hostId: string, threadId: string) =>
    `${hostId}\u0000${threadId}`

  const isOwner = (req: IncomingMessage, url: URL) =>
    sameSecret(bearer(req, url), ownerToken)
  const hostFor = (req: IncomingMessage, url: URL): HostRecord | undefined => {
    const given = bearer(req, url)
    const hostId = given ? hostByToken.get(given) : undefined
    const host = hostId ? hosts.get(hostId) : undefined
    return host && sameSecret(given, host.token) ? host : undefined
  }

  const sessionFor = (hostId: string, threadId: string): SessionRecord => {
    const key = sessionKey(hostId, threadId)
    let session = sessions.get(key)
    if (!session) {
      session = {
        hostId,
        threadId,
        events: [],
        lastActivity: Date.now(),
        status: 'idle',
        clients: new Set(),
      }
      sessions.set(key, session)
    }
    return session
  }

  const sendToHost = (
    host: HostRecord,
    envelope: ControlEnvelope,
  ): 'sent' | 'queued' => {
    if (host.streams.size === 0) {
      host.queue.push({ envelope, expiresAt: Date.now() + queueTtlMs })
      return 'queued'
    }
    for (const stream of host.streams) sse(stream, envelope)
    return 'sent'
  }

  const record = (session: SessionRecord, frame: Record<string, unknown>) => {
    session.lastActivity = Date.now()
    if (frame.type === 'harness.event') {
      const event = frame.event as Record<string, unknown>
      const name = event.type === 'CUSTOM' ? event.name : undefined
      if (name === 'harness.operation.started') session.status = 'running'
      if (name === 'harness.question') session.status = 'waiting'
      if (name === 'harness.operation.finished') {
        const value = event.value as { status?: unknown } | undefined
        session.status = value?.status === 'interrupted' ? 'waiting' : 'idle'
      }
      session.events.push({
        cursor: String(frame.cursor),
        operationId: String(frame.operationId),
        event,
      })
      if (session.events.length > cacheSize)
        session.events.splice(0, session.events.length - cacheSize)
    }
    for (const client of session.clients)
      sse(
        client,
        frame,
        typeof frame.cursor === 'string' ? frame.cursor : undefined,
      )
  }

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://dashboard')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // The app shell. It holds no data; every API call needs a token.
    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(DASHBOARD_HTML)
      return
    }
    if (method === 'GET' && path === '/manifest.webmanifest') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' })
      res.end(MANIFEST_JSON)
      return
    }
    if (method === 'GET' && path === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      res.end(SERVICE_WORKER)
      return
    }

    // Pairing: a host asks, the owner approves, the host gets a token.
    if (method === 'POST' && path === '/api/pair/start') {
      const input = await body(req)
      const pairingId = token()
      const code = pairingCode()
      pairings.set(pairingId, {
        code,
        name:
          typeof input.name === 'string' ? input.name.slice(0, 100) : 'host',
        expiresAt: Date.now() + 10 * 60_000,
      })
      json(res, 200, { pairingId, code })
      return
    }
    if (method === 'GET' && path === '/api/pair/status') {
      const pairing = pairings.get(url.searchParams.get('pairingId') ?? '')
      if (!pairing || pairing.expiresAt < Date.now())
        return json(res, 404, { error: 'unknown or expired pairing' })
      if (!pairing.hostId) return json(res, 200, { status: 'pending' })
      const host = hosts.get(pairing.hostId)
      pairings.delete(url.searchParams.get('pairingId') ?? '')
      return json(res, 200, {
        status: 'approved',
        hostId: pairing.hostId,
        token: host?.token,
      })
    }

    if (path.startsWith('/api/host/')) {
      const host = hostFor(req, url)
      if (!host) return json(res, 401, { error: 'unauthorized' })
      host.lastSeen = Date.now()
      if (method === 'GET' && path === '/api/host/stream') {
        openSse(res)
        host.streams.add(res)
        const now = Date.now()
        for (const queued of host.queue.splice(0)) {
          if (queued.expiresAt > now) sse(res, queued.envelope)
        }
        const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000)
        res.on('close', () => {
          clearInterval(heartbeat)
          host.streams.delete(res)
        })
        return
      }
      if (method === 'POST' && path === '/api/host/hello') {
        const input = await body(req)
        if (typeof input.name === 'string') host.name = input.name.slice(0, 100)
        if (Array.isArray(input.harnesses))
          host.harnesses = input.harnesses.map(String).slice(0, 50)
        return json(res, 200, { hostId: host.hostId })
      }
      if (method === 'POST' && path === '/api/host/frames') {
        const input = await body(req)
        if (
          typeof input.threadId !== 'string' ||
          !Array.isArray(input.frames)
        ) {
          return json(res, 400, { error: 'expected { threadId, frames }' })
        }
        const session = sessionFor(host.hostId, input.threadId)
        if (typeof input.harness === 'string') session.harness = input.harness
        for (const frame of input.frames) {
          if (typeof frame === 'object' && frame !== null)
            record(session, frame as Record<string, unknown>)
        }
        return json(res, 200, { ok: true })
      }
      return json(res, 404, { error: 'not found' })
    }

    // Everything below is for the owner.
    if (!path.startsWith('/api/')) return json(res, 404, { error: 'not found' })
    if (!isOwner(req, url)) return json(res, 401, { error: 'unauthorized' })

    if (method === 'GET' && path === '/api/pairings') {
      const now = Date.now()
      return json(
        res,
        200,
        [...pairings.values()]
          .filter((pairing) => !pairing.hostId && pairing.expiresAt > now)
          .map((pairing) => ({ code: pairing.code, name: pairing.name })),
      )
    }
    if (method === 'POST' && path === '/api/pair/approve') {
      const input = await body(req)
      const entry = [...pairings.entries()].find(
        ([, pairing]) =>
          pairing.code === input.code &&
          !pairing.hostId &&
          pairing.expiresAt > Date.now(),
      )
      if (!entry) return json(res, 404, { error: 'unknown or expired code' })
      const hostId = `host-${randomBytes(6).toString('hex')}`
      const hostToken = token()
      hosts.set(hostId, {
        hostId,
        name: entry[1].name,
        harnesses: [],
        token: hostToken,
        lastSeen: Date.now(),
        streams: new Set(),
        queue: [],
      })
      hostByToken.set(hostToken, hostId)
      entry[1].hostId = hostId
      return json(res, 200, { hostId })
    }
    if (method === 'POST' && path === '/api/hosts/revoke') {
      const input = await body(req)
      const host = hosts.get(String(input.hostId))
      if (!host) return json(res, 404, { error: 'unknown host' })
      hostByToken.delete(host.token)
      for (const stream of host.streams) stream.end()
      hosts.delete(host.hostId)
      return json(res, 200, { ok: true })
    }
    if (method === 'GET' && path === '/api/hosts') {
      return json(
        res,
        200,
        [...hosts.values()].map((host) => ({
          hostId: host.hostId,
          name: host.name,
          harnesses: host.harnesses,
          online: host.streams.size > 0,
          lastSeen: host.lastSeen,
        })),
      )
    }
    if (method === 'GET' && path === '/api/sessions') {
      return json(
        res,
        200,
        [...sessions.values()]
          .sort((a, b) => b.lastActivity - a.lastActivity)
          .map((session) => ({
            hostId: session.hostId,
            threadId: session.threadId,
            harness: session.harness,
            status: session.status,
            lastActivity: session.lastActivity,
            online: (hosts.get(session.hostId)?.streams.size ?? 0) > 0,
          })),
      )
    }

    const match =
      /^\/api\/sessions\/([^/]+)\/([^/]+)\/(events|input|open)$/.exec(path)
    if (match) {
      const hostId = decodeURIComponent(match[1] ?? '')
      const threadId = decodeURIComponent(match[2] ?? '')
      const host = hosts.get(hostId)
      if (!host) return json(res, 404, { error: 'unknown host' })
      if (method === 'GET' && match[3] === 'events') {
        const session = sessionFor(hostId, threadId)
        openSse(res)
        const from = Number(
          url.searchParams.get('from') ?? req.headers['last-event-id'] ?? 0,
        )
        for (const entry of session.events) {
          if (Number(entry.cursor) > from)
            sse(res, { type: 'harness.event', ...entry }, entry.cursor)
        }
        session.clients.add(res)
        const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000)
        res.on('close', () => {
          clearInterval(heartbeat)
          session.clients.delete(res)
        })
        return
      }
      if (method === 'POST' && match[3] === 'input') {
        const input = await body(req)
        const requestId = `dash-${randomBytes(6).toString('hex')}`
        const delivery = sendToHost(host, {
          threadId,
          frame: { type: 'harness.input', requestId, input: input.input },
        })
        return json(res, 202, { requestId, status: delivery })
      }
      if (method === 'POST' && match[3] === 'open') {
        const delivery = sendToHost(host, {
          threadId,
          frame: { type: 'harness.subscribe', threadId },
        })
        return json(res, 202, { status: delivery })
      }
    }
    return json(res, 404, { error: 'not found' })
  }

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (!res.headersSent)
        json(res, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      else res.end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 8790, options.hostname ?? '127.0.0.1', () =>
      resolve(),
    )
  })
  const address = server.address()
  const port =
    typeof address === 'object' && address
      ? address.port
      : (options.port ?? 8790)
  return {
    url: `http://${options.hostname ?? '127.0.0.1'}:${port}`,
    ownerToken,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
