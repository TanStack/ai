import { MCPEventWebhookError } from './types'
import type {
  MCPEventSubscription,
  MCPEventSubscriptionInfo,
  MCPEventWebhookOptions,
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

class BodyTooLarge extends Error {
  constructor() {
    super('Webhook body exceeds the maximum size')
    this.name = 'BodyTooLarge'
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
      throw new BodyTooLarge()
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
    if (request.method !== 'POST') {
      return empty(405, { Allow: 'POST' })
    }
    if (!isJsonMediaType(request.headers.get('content-type'))) {
      report(
        options.onError,
        new MCPEventWebhookError('headers', 'Unsupported media type'),
      )
      return empty(415)
    }
    const contentLength = request.headers.get('content-length')
    if (contentLength !== null) {
      const size = Number(contentLength)
      if (Number.isFinite(size) && size > maxBodyBytes) {
        report(
          options.onError,
          new MCPEventWebhookError('body', 'Webhook body is too large'),
        )
        return empty(413)
      }
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
      report(
        options.onError,
        new MCPEventWebhookError('headers', 'Missing webhook headers'),
      )
      return empty(401)
    }

    const key = readCallbackKey(request.url)
    if (key === undefined) {
      report(
        options.onError,
        new MCPEventWebhookError('routing', 'Missing subscription key'),
      )
      return empty(401)
    }
    let record: MCPEventSubscription | undefined
    try {
      record = await options.store.get(key)
    } catch (cause) {
      report(
        options.onError,
        new MCPEventWebhookError('store', 'Subscription lookup failed', {
          subscriptionKey: key,
          cause,
        }),
      )
      return empty(503)
    }
    if (record === undefined) {
      report(
        options.onError,
        new MCPEventWebhookError('routing', 'Unknown subscription key', {
          subscriptionKey: key,
        }),
      )
      return empty(401)
    }
    if (record.id !== undefined && record.id !== subscriptionId) {
      report(
        options.onError,
        new MCPEventWebhookError('routing', 'Subscription id mismatch', {
          subscriptionKey: key,
        }),
      )
      return empty(401)
    }

    if (!/^-?\d+$/.test(webhookTimestamp)) {
      report(
        options.onError,
        new MCPEventWebhookError('timestamp', 'Invalid webhook timestamp', {
          subscriptionKey: key,
        }),
      )
      return empty(401)
    }
    const timestamp = Number(webhookTimestamp)
    const nowSec = Math.floor(now() / 1000)
    if (Math.abs(nowSec - timestamp) > tolerance) {
      report(
        options.onError,
        new MCPEventWebhookError(
          'timestamp',
          'Webhook timestamp is outside the tolerance window',
          {
            subscriptionKey: key,
          },
        ),
      )
      return empty(401)
    }

    let body: Uint8Array
    try {
      body = await readBoundedBody(request, maxBodyBytes)
    } catch (cause) {
      if (cause instanceof BodyTooLarge) {
        report(
          options.onError,
          new MCPEventWebhookError('body', 'Webhook body is too large', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(413)
      }
      report(
        options.onError,
        new MCPEventWebhookError('body', 'Failed to read webhook body', {
          subscriptionKey: key,
          cause,
        }),
      )
      return empty(503)
    }

    let verified = false
    try {
      verified = await verifyMCPEventSignature({
        secret: record.delivery.secret,
        messageId: webhookId,
        timestamp,
        body,
        header: webhookSignature,
      })
    } catch (cause) {
      report(
        options.onError,
        new MCPEventWebhookError(
          'signature',
          'Webhook signature verification failed',
          {
            subscriptionKey: key,
            cause,
          },
        ),
      )
      return empty(401)
    }
    if (!verified) {
      report(
        options.onError,
        new MCPEventWebhookError(
          'signature',
          'Webhook signature verification failed',
          {
            subscriptionKey: key,
          },
        ),
      )
      return empty(401)
    }

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder().decode(body))
    } catch (cause) {
      report(
        options.onError,
        new MCPEventWebhookError('body', 'Webhook body is not JSON', {
          subscriptionKey: key,
          cause,
        }),
      )
      return empty(400)
    }

    const classified = classifyWebhookBody(json)
    const info = toInfo(record)
    const nowMs = now()

    if (classified.kind === 'verification') {
      return Response.json({ challenge: classified.challenge })
    }
    if (classified.kind === 'invalid') {
      report(
        options.onError,
        new MCPEventWebhookError('envelope', classified.issue, {
          subscriptionKey: key,
        }),
      )
      return empty(400)
    }
    if (classified.kind === 'terminated') {
      try {
        await options.onTerminated?.({
          subscription: info,
          messageId: webhookId,
          termination: classified.error,
        })
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError('handler', 'onTerminated failed', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(503)
      }
      try {
        await options.store.delete(key)
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError(
            'store',
            'Failed to delete terminated subscription',
            {
              subscriptionKey: key,
              cause,
            },
          ),
        )
        return empty(503)
      }
      return empty(204)
    }
    if (isPending(record)) {
      return empty(503)
    }
    if (classified.kind === 'gap') {
      try {
        await options.onGap?.({
          subscription: info,
          messageId: webhookId,
          gap: { cursor: classified.cursor, truncated: true },
        })
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError('handler', 'onGap failed', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(503)
      }
      try {
        await options.store.update(key, {
          cursor: classified.cursor,
          truncated: true,
        })
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError('store', 'Failed to persist gap cursor', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(503)
      }
      return empty(204)
    }

    if (isExpired(record, nowMs)) {
      return empty(410)
    }
    if (
      classified.event.name !== record.name ||
      classified.event.eventId !== webhookId
    ) {
      report(
        options.onError,
        new MCPEventWebhookError(
          'envelope',
          'Event does not match the subscription',
          {
            subscriptionKey: key,
          },
        ),
      )
      return empty(400)
    }
    if (options.validatePayload !== undefined) {
      try {
        await options.validatePayload({
          definition: record.definition,
          data: classified.event.data,
        })
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError('payload', 'Event payload was rejected', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(400)
      }
    }
    try {
      await options.onEvent({
        subscription: info,
        event: classified.event,
        messageId: webhookId,
      })
    } catch (cause) {
      report(
        options.onError,
        new MCPEventWebhookError('handler', 'onEvent failed', {
          subscriptionKey: key,
          cause,
        }),
      )
      return empty(503)
    }
    if (classified.event.cursor !== undefined) {
      try {
        await options.store.update(key, { cursor: classified.event.cursor })
      } catch (cause) {
        report(
          options.onError,
          new MCPEventWebhookError('store', 'Failed to persist event cursor', {
            subscriptionKey: key,
            cause,
          }),
        )
        return empty(503)
      }
    }
    return empty(204)
  }
}
