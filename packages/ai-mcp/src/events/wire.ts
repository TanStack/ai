import type { StandardSchemaV1Sync } from '@modelcontextprotocol/client'
import type {
  MCPEventDefinition,
  MCPEventDeliveryMode,
  MCPEventDeliveryStatus,
  MCPEventOccurrence,
} from './types'
import { isJsonObject, isNonEmptyString, isRecord, issues } from './value'

const DELIVERY_MODES = new Set<string>(['poll', 'push', 'webhook'])

function isIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

function isDeliveryMode(value: unknown): value is MCPEventDeliveryMode {
  return typeof value === 'string' && DELIVERY_MODES.has(value)
}

function parseEventDefinition(value: unknown): MCPEventDefinition | undefined {
  if (!isRecord(value)) return undefined
  if (!isNonEmptyString(value.name)) return undefined
  if (!Array.isArray(value.delivery) || value.delivery.length === 0) {
    return undefined
  }
  const delivery: Array<MCPEventDeliveryMode> = []
  for (const mode of value.delivery) {
    if (!isDeliveryMode(mode)) return undefined
    delivery.push(mode)
  }
  if (!('inputSchema' in value) || !('payloadSchema' in value)) return undefined
  const description =
    typeof value.description === 'string' ? value.description : undefined
  const meta = isJsonObject(value._meta) ? value._meta : undefined
  return {
    name: value.name,
    ...(description === undefined ? {} : { description }),
    delivery,
    inputSchema: value.inputSchema,
    payloadSchema: value.payloadSchema,
    ...(meta === undefined ? {} : { _meta: meta }),
  }
}

export interface ListEventsResult {
  events: Array<MCPEventDefinition>
  nextCursor?: string
}

export const listEventsResult: StandardSchemaV1Sync<unknown, ListEventsResult> =
  {
    '~standard': {
      version: 1,
      vendor: 'tanstack-ai-mcp',
      validate(value: unknown) {
        if (!isRecord(value) || !Array.isArray(value.events)) {
          return issues('events/list result must include an events array')
        }
        const events: Array<MCPEventDefinition> = []
        for (const item of value.events) {
          const event = parseEventDefinition(item)
          if (event === undefined) {
            return issues('events/list contains an invalid event descriptor')
          }
          events.push(event)
        }
        const nextCursor = value.nextCursor
        if (nextCursor !== undefined && typeof nextCursor !== 'string') {
          return issues('nextCursor must be a string')
        }
        return {
          value: {
            events,
            ...(nextCursor === undefined ? {} : { nextCursor }),
          },
        }
      },
    },
  }

const DELIVERY_STATUS_TYPES: Record<keyof MCPEventDeliveryStatus, string> = {
  active: 'boolean',
  lastDeliveryAt: 'string',
  lastError: 'string',
  failedSince: 'string',
  throttled: 'boolean',
  retryAfterMs: 'number',
}

function isDeliveryStatus(value: unknown): value is MCPEventDeliveryStatus {
  if (!isRecord(value)) return false
  return Object.entries(DELIVERY_STATUS_TYPES).every(([field, type]) => {
    const fieldValue = value[field]
    if (fieldValue === undefined) return true
    if (field === 'lastError' && fieldValue === null) return true
    return typeof fieldValue === type
  })
}

/** `undefined` when absent, `null` when present but malformed. */
function parseDeliveryStatus(
  value: unknown,
): MCPEventDeliveryStatus | undefined | null {
  if (value === undefined) return undefined
  return isDeliveryStatus(value) ? value : null
}

export interface SubscribeEventsResult {
  id: string
  refreshBefore: string | null
  cursor: string | null
  truncated: boolean
  deliveryStatus?: MCPEventDeliveryStatus
}

export const subscribeResult: StandardSchemaV1Sync<
  unknown,
  SubscribeEventsResult
> = {
  '~standard': {
    version: 1,
    vendor: 'tanstack-ai-mcp',
    validate(value: unknown) {
      if (!isRecord(value) || !isNonEmptyString(value.id)) {
        return issues('events/subscribe result must include id')
      }
      if (typeof value.truncated !== 'boolean') {
        return issues('events/subscribe result must include truncated')
      }
      if (
        value.refreshBefore !== null &&
        typeof value.refreshBefore !== 'string'
      ) {
        return issues('refreshBefore must be an ISO timestamp or null')
      }
      if (
        typeof value.refreshBefore === 'string' &&
        !isIsoDateTime(value.refreshBefore)
      ) {
        return issues('refreshBefore must be an ISO timestamp or null')
      }
      let cursor: string | null = null
      if (value.cursor === undefined || value.cursor === null) {
        cursor = null
      } else if (typeof value.cursor === 'string') {
        cursor = value.cursor
      } else {
        return issues('cursor must be a string or null')
      }
      const deliveryStatus = parseDeliveryStatus(value.deliveryStatus)
      if (deliveryStatus === null) {
        return issues('deliveryStatus has a field of the wrong type')
      }
      return {
        value: {
          id: value.id,
          refreshBefore: value.refreshBefore,
          cursor,
          truncated: value.truncated,
          ...(deliveryStatus === undefined ? {} : { deliveryStatus }),
        },
      }
    },
  },
}

function parseEventOccurrence(value: unknown): MCPEventOccurrence | undefined {
  if (!isRecord(value)) return undefined
  if (!isNonEmptyString(value.eventId) || !isNonEmptyString(value.name)) {
    return undefined
  }
  if (typeof value.timestamp !== 'string' || !isIsoDateTime(value.timestamp)) {
    return undefined
  }
  const data = value.data
  if (!isJsonObject(data)) return undefined
  const event: MCPEventOccurrence = {
    eventId: value.eventId,
    name: value.name,
    timestamp: value.timestamp,
    data,
  }
  if (value.cursor === undefined) return event
  if (value.cursor !== null && typeof value.cursor !== 'string')
    return undefined
  event.cursor = value.cursor
  return event
}

export type ClassifiedWebhookBody =
  | { kind: 'event'; event: MCPEventOccurrence }
  | { kind: 'verification'; challenge: string }
  | { kind: 'gap'; cursor: string }
  | {
      kind: 'terminated'
      error: { code: number; message: string; data?: unknown }
    }
  | { kind: 'invalid'; issue: string }

/**
 * Classify a parsed webhook JSON body as an event or a control envelope.
 *
 * @experimental
 */
export function classifyWebhookBody(json: unknown): ClassifiedWebhookBody {
  if (!isRecord(json))
    return { kind: 'invalid', issue: 'body must be an object' }
  if (typeof json.type === 'string') {
    if (json.type === 'verification') {
      if (!isNonEmptyString(json.challenge)) {
        return { kind: 'invalid', issue: 'verification requires challenge' }
      }
      return { kind: 'verification', challenge: json.challenge }
    }
    if (json.type === 'gap') {
      if (!isNonEmptyString(json.cursor)) {
        return { kind: 'invalid', issue: 'gap requires cursor' }
      }
      return { kind: 'gap', cursor: json.cursor }
    }
    if (json.type === 'terminated') {
      if (!isRecord(json.error)) {
        return { kind: 'invalid', issue: 'terminated requires error' }
      }
      if (typeof json.error.code !== 'number') {
        return {
          kind: 'invalid',
          issue: 'terminated error.code must be a number',
        }
      }
      if (typeof json.error.message !== 'string') {
        return {
          kind: 'invalid',
          issue: 'terminated error.message must be a string',
        }
      }
      return {
        kind: 'terminated',
        error: {
          code: json.error.code,
          message: json.error.message,
          ...(json.error.data === undefined ? {} : { data: json.error.data }),
        },
      }
    }
    return { kind: 'invalid', issue: `unknown control type ${json.type}` }
  }
  const event = parseEventOccurrence(json)
  if (event === undefined) {
    return { kind: 'invalid', issue: 'invalid event envelope' }
  }
  return { kind: 'event', event }
}

export const emptyResult: StandardSchemaV1Sync<
  unknown,
  Record<string, never>
> = {
  '~standard': {
    version: 1,
    vendor: 'tanstack-ai-mcp',
    validate() {
      return { value: {} }
    },
  },
}
