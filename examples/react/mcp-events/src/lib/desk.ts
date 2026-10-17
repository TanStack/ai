import { createMCPClient } from '@tanstack/ai-mcp'
import type { Transport } from '@tanstack/ai-mcp'
import {
  createMCPEventWebhook,
  inMemoryMCPEventStore,
} from '@tanstack/ai-mcp/events'
import type { MCPEventOccurrence } from '@tanstack/ai-mcp/events'
import { createServerFn } from '@tanstack/react-start'

const EVENTS_EXTENSION = 'io.modelcontextprotocol/events'

type RpcMessage = Parameters<NonNullable<Transport['onmessage']>>[0]
type RpcRequest = Extract<RpcMessage, { method: string }>

type StoredSub = {
  id: string
  name: string
  url: string
  secret: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hmacKeyBytes(secret: string): Uint8Array {
  if (!secret.startsWith('whsec_')) {
    throw new Error('Webhook secret must start with whsec_')
  }
  const encoded = secret.slice('whsec_'.length)
  const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function signWebhook(input: {
  secret: string
  messageId: string
  timestamp: number
  body: Uint8Array
}): Promise<string> {
  const keyBytes = hmacKeyBytes(input.secret)
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength)
  new Uint8Array(keyBuffer).set(keyBytes)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const prefix = new TextEncoder().encode(
    `${input.messageId}.${input.timestamp}.`,
  )
  const payload = new Uint8Array(prefix.byteLength + input.body.byteLength)
  payload.set(prefix)
  payload.set(input.body, prefix.byteLength)
  const payloadBuffer = new ArrayBuffer(payload.byteLength)
  new Uint8Array(payloadBuffer).set(payload)
  const signature = await crypto.subtle.sign('HMAC', key, payloadBuffer)
  let binary = ''
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte)
  }
  return `v1,${btoa(binary)}`
}

const handshakeResult = {
  protocolVersion: '2025-11-25',
  capabilities: {
    extensions: {
      [EVENTS_EXTENSION]: {},
    },
  },
  serverInfo: { name: 'desk-events', version: '1.0.0' },
}

const catalog = {
  events: [
    {
      name: 'incident.created',
      delivery: ['webhook'],
      inputSchema: { type: 'object' },
      payloadSchema: true,
    },
  ],
}

const subscriptions = new Map<string, StoredSub>()
const received: Array<MCPEventOccurrence> = []
const store = inMemoryMCPEventStore()

const webhook = createMCPEventWebhook({
  store,
  onEvent: ({ event }) => {
    received.push(event)
  },
})

function requestId(message: RpcRequest): string | number | undefined {
  if (!('id' in message)) return undefined
  return typeof message.id === 'string' || typeof message.id === 'number'
    ? message.id
    : undefined
}

function jsonRpcResult(
  message: RpcRequest,
  result: Record<string, unknown>,
): RpcMessage | undefined {
  const id = requestId(message)
  if (id === undefined) return undefined
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(
  message: RpcRequest,
  code: number,
  errorMessage: string,
): RpcMessage | undefined {
  const id = requestId(message)
  if (id === undefined) return undefined
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message: errorMessage },
  }
}

function replyTo(message: RpcMessage): RpcMessage | undefined {
  if (!('method' in message)) return undefined
  const rpc: RpcRequest = message
  if (rpc.method === 'initialize' || rpc.method === 'server/discover') {
    return jsonRpcResult(rpc, handshakeResult)
  }
  if (rpc.method === 'notifications/initialized' || rpc.method === 'ping') {
    return rpc.method === 'ping' ? jsonRpcResult(rpc, {}) : undefined
  }
  if (rpc.method === 'events/list') {
    return jsonRpcResult(rpc, catalog)
  }
  if (rpc.method === 'events/subscribe') {
    const params = isRecord(rpc.params) ? rpc.params : {}
    const name = typeof params.name === 'string' ? params.name : ''
    if (name !== 'incident.created') {
      return jsonRpcError(rpc, -32023, 'Event not found')
    }
    const delivery = isRecord(params.delivery) ? params.delivery : {}
    const url = typeof delivery.url === 'string' ? delivery.url : ''
    const secret = typeof delivery.secret === 'string' ? delivery.secret : ''
    hmacKeyBytes(secret)
    const id = 'sub_desk'
    subscriptions.set(id, { id, name, url, secret })
    return jsonRpcResult(rpc, {
      id,
      refreshBefore: new Date(Date.now() + 3_600_000).toISOString(),
      cursor: null,
      truncated: false,
    })
  }
  if (rpc.method === 'events/unsubscribe') {
    subscriptions.delete('sub_desk')
    return jsonRpcResult(rpc, {})
  }
  return jsonRpcError(rpc, -32601, 'Method not found')
}

function createDeskTransport(): Transport {
  const transport: Transport = {
    async start() {},
    async close() {},
    async send(message) {
      const reply = replyTo(message)
      if (reply !== undefined) {
        transport.onmessage?.(reply)
      }
    },
  }
  return transport
}

export function handleWebhook(request: Request) {
  return webhook(request)
}

async function signAndDeliver(sub: StoredSub, bodyObj: unknown) {
  const raw = new TextEncoder().encode(JSON.stringify(bodyObj))
  const timestamp = Math.floor(Date.now() / 1000)
  const messageId =
    isRecord(bodyObj) && typeof bodyObj.eventId === 'string'
      ? bodyObj.eventId
      : `msg_${crypto.randomUUID()}`
  const signature = await signWebhook({
    secret: sub.secret,
    messageId,
    timestamp,
    body: raw,
  })
  await webhook(
    new Request(sub.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': messageId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': signature,
      },
      body: raw,
    }),
  )
}

export type DeskSnapshot = {
  names: Array<string>
  subscriptionId: string | null
  events: Array<MCPEventOccurrence>
}

export const subscribeDesk = createServerFn({ method: 'POST' }).handler(
  async (): Promise<DeskSnapshot> => {
    const client = await createMCPClient({
      transport: createDeskTransport(),
      experimental_events: { store },
    })
    try {
      const listed = await client.experimental_events.list()
      const sub = await client.experimental_events.subscribe({
        name: 'incident.created',
        delivery: {
          mode: 'webhook',
          url: 'http://127.0.0.1/api/mcp-events',
          allowInsecureLocalhost: true,
        },
      })
      return {
        names: listed.map((event) => event.name),
        subscriptionId: sub.id,
        events: [...received],
      }
    } finally {
      await client.close()
    }
  },
)

export const emitDesk = createServerFn({ method: 'POST' }).handler(
  async (): Promise<DeskSnapshot> => {
    const sub = subscriptions.get('sub_desk')
    if (sub === undefined) {
      throw new Error('Subscribe before you emit.')
    }
    const eventId = `evt_${crypto.randomUUID()}`
    await signAndDeliver(sub, {
      eventId,
      name: 'incident.created',
      timestamp: new Date().toISOString(),
      data: { id: 'inc_desk', summary: 'Disk is full' },
    })
    return {
      names: ['incident.created'],
      subscriptionId: sub.id,
      events: [...received],
    }
  },
)
