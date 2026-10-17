import { createHash, timingSafeEqual } from 'node:crypto'
import {
  McpServer,
  ProtocolError,
  Server,
  createMcpHandler,
  isLegacyRequest,
  legacyStatelessFallback,
} from '@modelcontextprotocol/server'
import { signMCPEventPayload } from '../../src/events/signature'
import { decodeMCPEventSecret } from '../../src/events/secret'
import type { JSONObject, MCPEventDefinition } from '../../src/events/types'
import { passThroughSchema } from './pass-through-schema'

const EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

const defaultEvent: MCPEventDefinition = {
  name: 'incident.created',
  delivery: ['webhook'],
  inputSchema: {},
  payloadSchema: true,
}

export interface TestEventsServerOptions {
  events?: Array<MCPEventDefinition>
  deliver?: (request: Request) => Promise<Response>
  principal?: string
  ttlMs?: { default: number; min?: number }
  verify?: 'challenge' | 'skip'
  allowHttpLoopback?: boolean
  pageSize?: number
  maxAttempts?: number
  /**
   * Wire capability keys. SDK ServerCapabilitiesSchema strips top-level
   * `events`, so that key is injected on HTTP discover/initialize JSON and
   * on legacy initialize SSE (`text/event-stream`).
   * Defaults: extensions and events both on (ChatGPT + SEP).
   */
  advertise?: { extensions?: boolean; events?: boolean }
  errorOn?: Partial<
    Record<
      'events/subscribe' | 'events/unsubscribe',
      { code: number; message: string; data?: unknown }
    >
  >
}

interface StoredSub {
  id: string
  name: string
  arguments: JSONObject
  url: string
  secret: string
  refreshBefore: string | null
  cursor: string | null
  ttlMs: number | null
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJSON(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
    .join(',')}}`
}

function subscriptionId(
  principal: string,
  url: string,
  name: string,
  args: JSONObject,
): string {
  return createHash('sha256')
    .update(canonicalJSON([principal, url, name, args]))
    .digest('hex')
}

function isLoopbackHttp(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1')
  )
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function jsonArgs(value: unknown): JSONObject {
  return asObject(value) as JSONObject
}

function echoChallenge(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined
  }
  const challenge = (body as { challenge?: unknown }).challenge
  return typeof challenge === 'string' ? challenge : undefined
}

function challengesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.byteLength !== b.byteLength) return false
  return timingSafeEqual(a, b)
}

/**
 * Test-only MCP Events server. Shared subscription state survives per-request
 * `McpServer` rebuilds used by Streamable HTTP.
 */
export function createTestEventsServer(options: TestEventsServerOptions = {}) {
  const eventDefs = options.events ?? [defaultEvent]
  const principal = options.principal ?? 'test-user'
  const ttlDefault = options.ttlMs?.default ?? 3_600_000
  const ttlMin = options.ttlMs?.min
  const verify = options.verify ?? (options.deliver ? 'challenge' : 'skip')
  const deliver =
    options.deliver ?? (async () => new Response(null, { status: 204 }))
  const maxAttempts = options.maxAttempts ?? 3
  const pageSize = options.pageSize
  const allowHttpLoopback = options.allowHttpLoopback === true
  const advertiseExtensions = options.advertise?.extensions !== false
  const advertiseEvents = options.advertise?.events !== false
  const capturedClientCapabilities: Array<unknown> = []
  const requests: Array<{ method: string; params: unknown }> = []
  const subscriptions = new Map<string, StoredSub>()
  const verifiedCallbacks = new Set<string>()

  async function postSigned(
    sub: StoredSub,
    messageId: string,
    bodyObj: unknown,
  ): Promise<number> {
    const raw = new TextEncoder().encode(JSON.stringify(bodyObj))
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = await signMCPEventPayload({
      secret: sub.secret,
      messageId,
      timestamp,
      body: raw,
    })
    const response = await deliver(
      new Request(sub.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'webhook-id': messageId,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': signature,
          'x-mcp-subscription-id': sub.id,
        },
        body: raw,
      }),
    )
    return response.status
  }

  async function deliverWithRetries(
    sub: StoredSub,
    messageId: string,
    bodyObj: unknown,
  ): Promise<{ status: number; attempts: number }> {
    let status = 0
    let attempts = 0
    while (attempts < maxAttempts) {
      attempts += 1
      status = await postSigned(sub, messageId, bodyObj)
      if (status >= 200 && status < 300) return { status, attempts }
      if (status === 410 || status === 413) return { status, attempts }
    }
    return { status, attempts }
  }

  async function verifyCallback(sub: StoredSub) {
    if (verify !== 'challenge') return
    const cacheKey = `${principal}\n${sub.url}`
    if (verifiedCallbacks.has(cacheKey)) return
    const challenge = crypto.randomUUID()
    const raw = new TextEncoder().encode(
      JSON.stringify({ type: 'verification', challenge }),
    )
    const timestamp = Math.floor(Date.now() / 1000)
    const messageId = `msg_verification_${crypto.randomUUID()}`
    const signature = await signMCPEventPayload({
      secret: sub.secret,
      messageId,
      timestamp,
      body: raw,
    })
    let response: Response
    try {
      response = await deliver(
        new Request(sub.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'webhook-id': messageId,
            'webhook-timestamp': String(timestamp),
            'webhook-signature': signature,
            'x-mcp-subscription-id': sub.id,
          },
          body: raw,
        }),
      )
    } catch {
      throw new ProtocolError(-32027, 'Callback endpoint error', {
        reason: 'connection_refused',
      })
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ProtocolError(-32027, 'Callback endpoint error', {
        reason: response.status >= 500 ? 'http_5xx' : 'challenge_failed',
      })
    }
    let echoed: string | undefined
    try {
      echoed = echoChallenge(await response.json())
    } catch {
      echoed = undefined
    }
    if (echoed === undefined || !challengesMatch(echoed, challenge)) {
      throw new ProtocolError(-32027, 'Callback endpoint error', {
        reason: 'challenge_failed',
      })
    }
    verifiedCallbacks.add(cacheKey)
  }

  function attachEvents(server: Server) {
    server.setRequestHandler(
      'events/list',
      { params: passThroughSchema },
      async (params) => {
        capturedClientCapabilities.push(server.getClientCapabilities())
        requests.push({ method: 'events/list', params })
        const cursorRaw = asObject(params).cursor
        const start =
          typeof cursorRaw === 'string' && cursorRaw.length > 0
            ? Number(cursorRaw)
            : 0
        const size = pageSize ?? eventDefs.length
        const slice = eventDefs.slice(start, start + size)
        const next = start + size
        return {
          events: slice,
          ...(next < eventDefs.length ? { nextCursor: String(next) } : {}),
        }
      },
    )

    server.setRequestHandler(
      'events/subscribe',
      { params: passThroughSchema },
      async (params) => {
        requests.push({ method: 'events/subscribe', params })
        const forced = options.errorOn?.['events/subscribe']
        if (forced) {
          throw new ProtocolError(forced.code, forced.message, forced.data)
        }
        const body = asObject(params)
        const name = typeof body.name === 'string' ? body.name : ''
        const definition = eventDefs.find((item) => item.name === name)
        if (definition === undefined) {
          throw new ProtocolError(-32023, 'Event not found')
        }
        const delivery = asObject(body.delivery)
        const urlValue = typeof delivery.url === 'string' ? delivery.url : ''
        let parsed: URL
        try {
          parsed = new URL(urlValue)
        } catch {
          throw new ProtocolError(-32602, 'Invalid callback URL')
        }
        if (parsed.protocol !== 'https:') {
          if (!(allowHttpLoopback && isLoopbackHttp(parsed))) {
            throw new ProtocolError(-32602, 'Callback URL must use https')
          }
        }
        const secret =
          typeof delivery.secret === 'string' ? delivery.secret : ''
        try {
          decodeMCPEventSecret(secret)
        } catch {
          throw new ProtocolError(-32602, 'Invalid webhook secret')
        }
        const args = jsonArgs(body.arguments)
        let ttlMs: number | null = ttlDefault
        if (body.ttlMs === null) ttlMs = null
        else if (typeof body.ttlMs === 'number') {
          ttlMs =
            ttlMin !== undefined && body.ttlMs < ttlMin ? ttlMin : body.ttlMs
        }
        const id = subscriptionId(principal, urlValue, name, args)
        const refreshBefore =
          ttlMs === null ? null : new Date(Date.now() + ttlMs).toISOString()
        const cursor =
          body.cursor === undefined || body.cursor === null
            ? null
            : typeof body.cursor === 'string'
              ? body.cursor
              : null
        const record: StoredSub = {
          id,
          name,
          arguments: args,
          url: urlValue,
          secret,
          refreshBefore,
          cursor,
          ttlMs,
        }
        subscriptions.set(id, record)
        await verifyCallback(record)
        return {
          id,
          refreshBefore,
          cursor,
          truncated: false,
        }
      },
    )

    server.setRequestHandler(
      'events/unsubscribe',
      { params: passThroughSchema },
      async (params) => {
        requests.push({ method: 'events/unsubscribe', params })
        const forced = options.errorOn?.['events/unsubscribe']
        if (forced) {
          throw new ProtocolError(forced.code, forced.message, forced.data)
        }
        const body = asObject(params)
        const name = typeof body.name === 'string' ? body.name : ''
        const args = jsonArgs(body.arguments)
        const delivery = asObject(body.delivery)
        const urlValue = typeof delivery.url === 'string' ? delivery.url : ''
        const id = subscriptionId(principal, urlValue, name, args)
        if (!subscriptions.has(id)) {
          throw new ProtocolError(-32023, 'Subscription not found')
        }
        subscriptions.delete(id)
        return {}
      },
    )
  }

  const capabilities: Record<string, unknown> = {
    ...(advertiseExtensions ? { extensions: { [EVENTS_EXTENSION]: {} } } : {}),
  }
  const server = new Server(
    { name: 'events-test', version: '1.0.0' },
    { capabilities },
  )
  attachEvents(server)

  async function emit(
    name: string,
    data: JSONObject,
    opts?: { arguments?: JSONObject; cursor?: string | null; eventId?: string },
  ) {
    const matches = [...subscriptions.values()].filter((sub) => {
      if (sub.name !== name) return false
      if (opts?.arguments === undefined) return true
      return canonicalJSON(sub.arguments) === canonicalJSON(opts.arguments)
    })
    const results: Array<{ status: number; attempts: number }> = []
    for (const sub of matches) {
      const eventId = opts?.eventId ?? `evt_${crypto.randomUUID()}`
      const body: Record<string, unknown> = {
        eventId,
        name,
        timestamp: new Date().toISOString(),
        data,
      }
      if (opts && 'cursor' in opts) body.cursor = opts.cursor
      const result = await deliverWithRetries(sub, eventId, body)
      results.push(result)
    }
    return results
  }

  async function gap(subscriptionIdValue: string, cursor: string) {
    const sub = subscriptions.get(subscriptionIdValue)
    if (sub === undefined) throw new Error('subscription not found')
    sub.cursor = cursor
    return postSigned(sub, `msg_gap_${crypto.randomUUID()}`, {
      type: 'gap',
      cursor,
    })
  }

  async function terminate(
    subscriptionIdValue: string,
    error: { code: number; message: string; data?: unknown },
  ) {
    const sub = subscriptions.get(subscriptionIdValue)
    if (sub === undefined) throw new Error('subscription not found')
    const status = await postSigned(
      sub,
      `msg_terminated_${crypto.randomUUID()}`,
      { type: 'terminated', error },
    )
    subscriptions.delete(subscriptionIdValue)
    return status
  }

  return {
    server,
    capturedClientCapabilities,
    capabilities,
    advertiseEvents,
    requests,
    attach: attachEvents,
    emit,
    gap,
    terminate,
    subscriptions: () => [...subscriptions.values()],
  }
}

const MCP_NAME_SENTINEL_PREFIX = '=?base64?'
const MCP_NAME_SENTINEL_SUFFIX = '?='

function decodeMcpNameHeader(value: string): string {
  if (
    !value.startsWith(MCP_NAME_SENTINEL_PREFIX) ||
    !value.endsWith(MCP_NAME_SENTINEL_SUFFIX)
  ) {
    return value
  }
  const encoded = value.slice(
    MCP_NAME_SENTINEL_PREFIX.length,
    value.length - MCP_NAME_SENTINEL_SUFFIX.length,
  )
  try {
    const binary = atob(encoded)
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0)
    return new TextDecoder().decode(bytes)
  } catch {
    return value
  }
}

async function headerMismatchResponse(
  request: Request,
): Promise<Response | undefined> {
  if (request.method !== 'POST') return undefined
  let json: unknown
  try {
    json = await request.clone().json()
  } catch {
    return undefined
  }
  if (!isRecord(json)) return undefined
  if (
    json.method !== 'events/subscribe' &&
    json.method !== 'events/unsubscribe'
  ) {
    return undefined
  }
  const name =
    isRecord(json.params) && typeof json.params.name === 'string'
      ? json.params.name
      : undefined
  const header = request.headers.get('mcp-name')
  const decoded = header === null ? undefined : decodeMcpNameHeader(header)
  if (decoded !== undefined && decoded === name) return undefined
  const id =
    typeof json.id === 'string' || typeof json.id === 'number' ? json.id : null
  return Response.json(
    {
      jsonrpc: '2.0',
      id,
      error: { code: -32020, message: 'HeaderMismatch' },
    },
    { status: 400 },
  )
}

function patchAdvertisedEvents(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(patchAdvertisedEvents)
  if (!isRecord(value) || !isRecord(value.result)) return value
  if (!isRecord(value.result.capabilities)) return value
  if (isRecord(value.result.capabilities.events)) return value
  return {
    ...value,
    result: {
      ...value.result,
      capabilities: { ...value.result.capabilities, events: {} },
    },
  }
}

function patchSseAdvertisedEvents(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!line.startsWith('data:')) return line
      const payload = line.slice('data:'.length).trimStart()
      if (payload.length === 0) return line
      try {
        return `data: ${JSON.stringify(patchAdvertisedEvents(JSON.parse(payload)))}`
      } catch {
        return line
      }
    })
    .join('\n')
}

function replayResponse(response: Response, body: BodyInit): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function patchSseStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true })
        const lastNewline = pending.lastIndexOf('\n')
        if (lastNewline === -1) return
        const complete = pending.slice(0, lastNewline + 1)
        pending = pending.slice(lastNewline + 1)
        controller.enqueue(encoder.encode(patchSseAdvertisedEvents(complete)))
      },
      flush(controller) {
        if (pending.length === 0) return
        controller.enqueue(encoder.encode(patchSseAdvertisedEvents(pending)))
      },
    }),
  )
}

async function withAdvertisedEvents(
  response: Response,
  advertiseEvents: boolean,
): Promise<Response> {
  if (!(response instanceof Response) || !advertiseEvents) return response
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.includes('text/event-stream')) {
    if (response.body === null) return response
    return replayResponse(response, patchSseStream(response.body))
  }
  if (!contentType.includes('json')) return response
  const text = await response.text()
  if (text.length === 0) return replayResponse(response, text)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return replayResponse(response, text)
  }
  return replayResponse(response, JSON.stringify(patchAdvertisedEvents(parsed)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Streamable HTTP fetch handler around a test events server. */
export function eventsHttpFetch(
  events: ReturnType<typeof createTestEventsServer>,
) {
  const factory = () => {
    const mcp = new McpServer(
      { name: 'events-test', version: '1.0.0' },
      { capabilities: events.capabilities },
    )
    events.attach(mcp.server)
    return mcp
  }
  const modern = createMcpHandler(factory, {
    legacy: 'reject',
    keepAliveMs: 0,
  })
  const stateless = legacyStatelessFallback(factory)
  return async (request: Request) => {
    const mismatch = await headerMismatchResponse(request)
    if (mismatch) return mismatch
    const response = (await isLegacyRequest(request))
      ? await stateless(request)
      : await modern.fetch(request)
    return withAdvertisedEvents(response, events.advertiseEvents)
  }
}
