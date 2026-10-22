import { MCPEventConfigError } from '../errors'
import { MCPEventWebhookError } from './types'
import type {
  MCPEventSubscription,
  MCPEventSubscriptionInfo,
  MCPEventWebhookOptions,
  MCPEventWebhookStage,
} from './types'
import { readCallbackKey } from './callback-url'
import { verifyMCPEventSignature } from './signature'
import { classifyWebhookBody } from './wire'

const DEFAULT_TOLERANCE_SECONDS = 300
const DEFAULT_MAX_BODY_BYTES = 262144

function isJsonMediaType(value: string | null): boolean {
  if (value === null) return false
  const media = value.split(';', 1)[0]?.trim().toLowerCase()
  return media === 'application/json'
}

function empty(status: number, extra?: HeadersInit): Response {
  return new Response(null, { status, headers: extra })
}

function toInfo(record: MCPEventSubscription): MCPEventSubscriptionInfo {
  return {
    key: record.key,
    id: record.id ?? '',
    name: record.name,
    arguments: record.arguments,
    delivery: { mode: 'webhook', url: record.delivery.url },
    refreshBefore: record.refreshBefore ?? null,
  }
}

function isExpired(record: MCPEventSubscription, nowMs: number): boolean {
  if (typeof record.refreshBefore !== 'string') return false
  const expires = Date.parse(record.refreshBefore)
  return !Number.isNaN(expires) && expires < nowMs
}

function isPending(record: MCPEventSubscription): boolean {
  return record.status === 'pending' || record.id === undefined
}

function header(request: Request, name: string): string | null {
  const value = request.headers.get(name)
  return value === null || value.trim() === '' ? null : value
}

function report(
  onError: MCPEventWebhookOptions['onError'],
  error: MCPEventWebhookError,
) {
  try {
    onError?.(error)
  } catch {
    // Receiver errors must not throw out of the handler.
  }
}

class BodyTooLargeError extends Error {
  constructor() {
    super('Webhook body exceeds the maximum size')
    this.name = 'BodyTooLargeError'
  }
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Array<Uint8Array> = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Framework-agnostic MCP Events webhook receiver.
 *
 * Pass a Web `Request`. It verifies the Standard Webhooks signature on the
 * raw body, then calls `onEvent` / `onGap` / `onTerminated`.
 *
 * @experimental
 *
 * @example
 * ```ts
 * import { createMCPEventWebhook, inMemoryMCPEventStore } from '@tanstack/ai-mcp/events'
 *
 * const store = inMemoryMCPEventStore()
 * const webhook = createMCPEventWebhook({
 *   store,
 *   onEvent: async ({ event }) => {
 *     await queue.send({ eventId: event.eventId, data: event.data })
 *   },
 * })
 *
 * export const POST = async ({ request }: { request: Request }) => webhook(request)
 * ```
 */
export function createMCPEventWebhook(
  options: MCPEventWebhookOptions,
): (request: Request) => Promise<Response> {
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const now = options.now ?? Date.now

  return async (request) => {
    const key = readCallbackKey(request.url)
    const fail = (
      status: number,
      stage: MCPEventWebhookStage,
      message: string,
      cause?: unknown,
    ) => {
      report(
        options.onError,
        new MCPEventWebhookError(stage, message, {
          subscriptionKey: key,
          cause,
        }),
      )
      return empty(status)
    }

    if (request.method !== 'POST') {
      return empty(405, { Allow: 'POST' })
    }
    if (!isJsonMediaType(request.headers.get('content-type'))) {
      return fail(415, 'headers', 'Unsupported media type')
    }
    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return fail(413, 'body', 'Webhook body is too large')
    }

    const webhookId = header(request, 'webhook-id')
    const webhookTimestamp = header(request, 'webhook-timestamp')
    const webhookSignature = header(request, 'webhook-signature')
    const subscriptionId = header(request, 'x-mcp-subscription-id')
    if (
      webhookId === null ||
      webhookTimestamp === null ||
      webhookSignature === null ||
      subscriptionId === null
    ) {
      return fail(401, 'headers', 'Missing webhook headers')
    }

    if (key === undefined) {
      return fail(401, 'routing', 'Missing subscription key')
    }
    let record: MCPEventSubscription | undefined
    try {
      record = await options.store.get(key)
    } catch (cause) {
      return fail(503, 'store', 'Subscription lookup failed', cause)
    }
    if (record === undefined) {
      return fail(401, 'routing', 'Unknown subscription key')
    }
    if (record.id !== undefined && record.id !== subscriptionId) {
      return fail(401, 'routing', 'Subscription id mismatch')
    }

    if (!/^-?\d+$/.test(webhookTimestamp)) {
      return fail(401, 'timestamp', 'Invalid webhook timestamp')
    }
    const timestamp = Number(webhookTimestamp)
    if (Math.abs(Math.floor(now() / 1000) - timestamp) > tolerance) {
      return fail(
        401,
        'timestamp',
        'Webhook timestamp is outside the tolerance window',
      )
    }

    let body: Uint8Array
    try {
      body = await readBoundedBody(request, maxBodyBytes)
    } catch (cause) {
      return cause instanceof BodyTooLargeError
        ? fail(413, 'body', 'Webhook body is too large', cause)
        : fail(503, 'body', 'Failed to read webhook body', cause)
    }

    let verified: boolean
    try {
      verified = await verifyMCPEventSignature({
        secret: record.delivery.secret,
        messageId: webhookId,
        timestamp,
        body,
        header: webhookSignature,
      })
    } catch (cause) {
      // A bad stored secret is our fault, not the sender's: ask for a retry.
      if (cause instanceof MCPEventConfigError) {
        return fail(503, 'store', 'Stored webhook secret is invalid', cause)
      }
      return fail(
        401,
        'signature',
        'Webhook signature verification failed',
        cause,
      )
    }
    if (!verified) {
      return fail(401, 'signature', 'Webhook signature verification failed')
    }

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder().decode(body))
    } catch (cause) {
      return fail(400, 'body', 'Webhook body is not JSON', cause)
    }

    const classified = classifyWebhookBody(json)
    if (classified.kind === 'verification') {
      return Response.json({ challenge: classified.challenge })
    }
    if (classified.kind === 'invalid') {
      return fail(400, 'envelope', classified.issue)
    }
    const info = toInfo(record)
    if (classified.kind === 'terminated') {
      try {
        await options.onTerminated?.({
          subscription: info,
          messageId: webhookId,
          termination: classified.error,
        })
      } catch (cause) {
        return fail(503, 'handler', 'onTerminated failed', cause)
      }
      try {
        await options.store.delete(key)
      } catch (cause) {
        return fail(
          503,
          'store',
          'Failed to delete terminated subscription',
          cause,
        )
      }
      return empty(204)
    }
    if (isPending(record)) {
      return fail(503, 'routing', 'Subscription is still pending')
    }
    if (classified.kind === 'gap') {
      try {
        await options.onGap?.({
          subscription: info,
          messageId: webhookId,
          gap: { cursor: classified.cursor, truncated: true },
        })
      } catch (cause) {
        return fail(503, 'handler', 'onGap failed', cause)
      }
      try {
        await options.store.update(key, {
          cursor: classified.cursor,
          truncated: true,
        })
      } catch (cause) {
        return fail(503, 'store', 'Failed to persist gap cursor', cause)
      }
      return empty(204)
    }

    if (isExpired(record, now())) {
      return fail(410, 'routing', 'Subscription lease expired')
    }
    if (
      classified.event.name !== record.name ||
      classified.event.eventId !== webhookId
    ) {
      return fail(400, 'envelope', 'Event does not match the subscription')
    }
    try {
      await options.validatePayload?.({
        definition: record.definition,
        data: classified.event.data,
      })
    } catch (cause) {
      return fail(400, 'payload', 'Event payload was rejected', cause)
    }
    try {
      await options.onEvent({
        subscription: info,
        event: classified.event,
        messageId: webhookId,
      })
    } catch (cause) {
      return fail(503, 'handler', 'onEvent failed', cause)
    }
    if (classified.event.cursor !== undefined) {
      try {
        await options.store.update(key, { cursor: classified.event.cursor })
      } catch (cause) {
        return fail(503, 'store', 'Failed to persist event cursor', cause)
      }
    }
    return empty(204)
  }
}
