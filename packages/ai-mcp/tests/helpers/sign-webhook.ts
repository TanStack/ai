import { createHmac } from 'node:crypto'
import { signMCPEventPayload } from '../../src/events/signature'
import type { MCPEventSubscription } from '../../src/events/types'

export async function signedRequest(input: {
  record: MCPEventSubscription
  body: unknown
  headers?: Record<string, string | undefined>
  /** A string is the raw `webhook-timestamp` header, including leading zeros. */
  timestamp?: number | string
  url?: string
  messageId?: string
  method?: string
  rawBody?: Uint8Array
}): Promise<Request> {
  const json = JSON.stringify(input.body)
  const bodyBytes = input.rawBody ?? new TextEncoder().encode(json)
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000))
  const messageId =
    input.messageId ??
    (isRecord(input.body) && typeof input.body.eventId === 'string'
      ? input.body.eventId
      : 'msg_test_1')
  const signature =
    typeof timestamp === 'string'
      ? signRaw(input.record.delivery.secret, messageId, timestamp, bodyBytes)
      : await signMCPEventPayload({
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

function signRaw(
  secret: string,
  messageId: string,
  timestamp: string,
  body: Uint8Array,
): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const prefix = Buffer.from(`${messageId}.${timestamp}.`)
  return `v1,${createHmac('sha256', key).update(prefix).update(body).digest('base64')}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
