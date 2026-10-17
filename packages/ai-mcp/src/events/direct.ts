import {
  MCPEventConfigError,
  MCPEventRequestError,
  MCPEventSubscriptionNotFoundError,
  MCPEventsUnsupportedError,
  MCPUnknownEventError,
} from '../errors'
import { validateCallbackUrl, withCallbackKey } from './callback-url'
import { isMethodNotFound, toMCPEventRequestError } from './errors-map'
import { listEventDefinitions } from './list'
import { createMCPEventSecret, decodeMCPEventSecret } from './secret'
import type {
  DirectMCPEventsOptions,
  JSONObject,
  MCPEventStore,
  MCPEventSubscribeResult,
  MCPEventSubscription,
  MCPEventSubscriptionRef,
  MCPEvents,
  MCPEventsContext,
  SubscribeMCPEventOptions,
} from './types'
import { isSafeInteger } from './value'
import { decodeEventResult, emptyResult, subscribeResult } from './wire'

function rethrowEvents(err: unknown): never {
  if (isMethodNotFound(err)) throw new MCPEventsUnsupportedError()
  throw toMCPEventRequestError(err)
}

function assertWebhookMode(mode: string) {
  if (mode !== 'webhook') {
    throw new MCPEventConfigError('delivery.mode must be webhook')
  }
}

function assertTtlMs(value: number | null | undefined) {
  if (value === undefined || value === null) return
  if (!isSafeInteger(value) || value <= 0) {
    throw new MCPEventConfigError(
      'ttlMs must be a positive safe integer or null',
    )
  }
}

function assertMaxAgeMs(value: number | undefined) {
  if (value === undefined) return
  if (!isSafeInteger(value) || value < 0) {
    throw new MCPEventConfigError(
      'maxAgeMs must be a non-negative safe integer',
    )
  }
}

async function resolveRecord(
  store: MCPEventStore,
  ref: MCPEventSubscriptionRef,
): Promise<MCPEventSubscription> {
  const found =
    ref.key !== undefined
      ? await store.get(ref.key)
      : await store.getById(ref.id)
  if (found === undefined) {
    throw new MCPEventSubscriptionNotFoundError(
      ref.key !== undefined ? { key: ref.key } : { id: ref.id },
    )
  }
  return found
}

function subscribeParams(record: MCPEventSubscription) {
  const params: Record<string, unknown> = {
    name: record.name,
    arguments: record.arguments,
    delivery: {
      mode: 'webhook',
      url: record.delivery.url,
      secret: record.delivery.secret,
    },
    cursor: record.cursor,
  }
  if (record.ttlMs !== undefined) params.ttlMs = record.ttlMs
  if (record.maxAgeMs !== undefined) params.maxAgeMs = record.maxAgeMs
  return params
}

function toResult(
  key: string,
  result: {
    id: string
    refreshBefore: string | null
    cursor: string | null
    truncated: boolean
    deliveryStatus?: MCPEventSubscribeResult['deliveryStatus']
  },
): MCPEventSubscribeResult {
  return {
    key,
    id: result.id,
    refreshBefore: result.refreshBefore,
    cursor: result.cursor,
    truncated: result.truncated,
    ...(result.deliveryStatus === undefined
      ? {}
      : { deliveryStatus: result.deliveryStatus }),
  }
}

/**
 * Direct-mode events API: MCP requests plus a local subscription store.
 *
 * @experimental
 */
export function createDirectMCPEvents(
  ctx: MCPEventsContext,
  options: DirectMCPEventsOptions,
): MCPEvents {
  const store = options.store

  return {
    list(listOptions) {
      return listEventDefinitions(ctx, listOptions?.signal)
    },

    async subscribe(input: SubscribeMCPEventOptions) {
      ctx.assertOpen()
      if (!ctx.supportsEvents) throw new MCPEventsUnsupportedError()
      assertWebhookMode(input.delivery.mode)
      assertTtlMs(input.ttlMs)
      assertMaxAgeMs(input.maxAgeMs)
      const parsedUrl = validateCallbackUrl(input.delivery.url, {
        allowInsecureLocalhost: input.delivery.allowInsecureLocalhost,
      })
      const secret = input.delivery.secret ?? createMCPEventSecret()
      decodeMCPEventSecret(secret)

      const definitions = await listEventDefinitions(ctx, input.signal)
      const definition = definitions.find((item) => item.name === input.name)
      if (definition === undefined) {
        throw new MCPUnknownEventError(input.name, 'not-found')
      }
      if (!definition.delivery.includes('webhook')) {
        throw new MCPUnknownEventError(input.name, 'webhook-unsupported')
      }

      const args: JSONObject = input.arguments ?? {}
      await options.validateArguments?.({ definition, arguments: args })

      const key = crypto.randomUUID()
      const url = withCallbackKey(parsedUrl, key)
      const record: MCPEventSubscription = {
        key,
        name: input.name,
        arguments: args,
        definition,
        delivery: { mode: 'webhook', url, secret },
        cursor: input.cursor === undefined ? null : input.cursor,
        truncated: false,
        status: 'pending',
        ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
        ...(input.maxAgeMs === undefined ? {} : { maxAgeMs: input.maxAgeMs }),
      }
      await store.set(record)

      let result
      try {
        result = decodeEventResult(
          subscribeResult,
          await ctx.request(
            'events/subscribe',
            subscribeParams(record),
            subscribeResult,
            input.signal,
          ),
        )
      } catch (err) {
        rethrowEvents(err)
      }

      await store.update(key, {
        id: result.id,
        refreshBefore: result.refreshBefore,
        cursor: result.cursor,
        truncated: result.truncated,
        status: 'active',
      })
      return toResult(key, result)
    },

    async refresh(ref) {
      ctx.assertOpen()
      if (!ctx.supportsEvents) throw new MCPEventsUnsupportedError()
      const record = await resolveRecord(store, ref)
      let result
      try {
        result = decodeEventResult(
          subscribeResult,
          await ctx.request(
            'events/subscribe',
            subscribeParams(record),
            subscribeResult,
            ref.signal,
          ),
        )
      } catch (err) {
        rethrowEvents(err)
      }
      await store.update(record.key, {
        id: result.id,
        refreshBefore: result.refreshBefore,
        cursor: result.cursor,
        truncated: result.truncated,
        status: 'active',
      })
      return toResult(record.key, result)
    },

    async unsubscribe(ref) {
      ctx.assertOpen()
      if (!ctx.supportsEvents) throw new MCPEventsUnsupportedError()
      const record = await resolveRecord(store, ref)
      try {
        decodeEventResult(
          emptyResult,
          await ctx.request(
            'events/unsubscribe',
            {
              name: record.name,
              arguments: record.arguments,
              delivery: { mode: 'webhook', url: record.delivery.url },
            },
            emptyResult,
            ref.signal,
          ),
        )
      } catch (err) {
        const mapped = toMCPEventRequestError(err)
        if (
          mapped instanceof MCPEventRequestError &&
          mapped.kind === 'not-found'
        ) {
          await store.delete(record.key)
          return
        }
        throw mapped
      }
      await store.delete(record.key)
    },
  }
}
