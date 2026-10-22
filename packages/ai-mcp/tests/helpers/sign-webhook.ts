import { signMCPEventPayload } from '../../src/events/signature'
import type { MCPEventSubscription } from '../../src/events/types'

export async function signedRequest(input: {
  record: MCPEventSubscription
  body: unknown
  headers?: Record<string, string | undefined>
  timestamp?: number
  url?: string
  messageId?: string
  method?: string
  rawBody?: Uint8Array
}): Promise<Request> {
  const json = JSON.stringify(input.body)
  const bodyBytes = input.rawBody ?? new TextEncoder().encode(json)
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const messageId =
    input.messageId ??
    (isRecord(input.body) && typeof input.body.eventId === 'string'
      ? input.body.eventId
      : 'msg_test_1')
  const signature = await signMCPEventPayload({
    secret: input.record.delivery.secret,
    messageId,
    timestamp,
    body: bodyBytes,
  })
  const url =
    input.url ??
    `https://hooks.example.test/mcp?mcp_event_subscription=${input.record.key}`
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'webhook-id': messageId,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': signature,
    'x-mcp-subscription-id': input.record.id ?? 'pending-id',
  }
  if (input.headers) {
    for (const [name, value] of Object.entries(input.headers)) {
      if (value === undefined) delete headers[name]
      else headers[name] = value
    }
  }
  return new Request(url, {
    method: input.method ?? 'POST',
    headers,
    body: bodyBytes as BodyInit,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
