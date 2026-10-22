import { MCPEventConfigError } from '../errors'
import { listEventDefinitions } from './list'
import type {
  ManagedMCPEvents,
  MCPEventOperations,
  MCPEventsContext,
} from './types'
import { isRecord } from './value'

function isThenable(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

/**
 * Validate the object returned by `adapter.createAdapter`.
 * `createAdapter` must be synchronous.
 *
 * @experimental
 */
export function validateMCPEventOperations(value: unknown): MCPEventOperations {
  if (isThenable(value)) {
    throw new MCPEventConfigError(
      'createAdapter must return operations synchronously, not a Promise',
    )
  }
  if (!isRecord(value)) {
    throw new MCPEventConfigError('createAdapter must return event operations')
  }
  const subscribe = value.subscribe
  const getSubscription = value.getSubscription
  const listSubscriptions = value.listSubscriptions
  const unsubscribe = value.unsubscribe
  if (typeof getSubscription !== 'function') {
    throw new MCPEventConfigError('adapter operations missing getSubscription')
  }
  if (typeof subscribe !== 'function') {
    throw new MCPEventConfigError('adapter operations missing subscribe')
  }
  if (typeof listSubscriptions !== 'function') {
    throw new MCPEventConfigError(
      'adapter operations missing listSubscriptions',
    )
  }
  if (typeof unsubscribe !== 'function') {
    throw new MCPEventConfigError('adapter operations missing unsubscribe')
  }
  const operations: MCPEventOperations = {
    subscribe(input) {
      return subscribe.call(value, input)
    },
    getSubscription(id) {
      return getSubscription.call(value, id)
    },
    listSubscriptions() {
      return listSubscriptions.call(value)
    },
    unsubscribe(id) {
      return unsubscribe.call(value, id)
    },
  }
  return operations
}

/**
 * Managed-mode events API. Subscribe operations go to the adapter; `list()` is MCP.
 *
 * @experimental
 */
export function createManagedMCPEvents(
  ctx: MCPEventsContext,
  operations: MCPEventOperations,
): ManagedMCPEvents {
  return {
    list(options) {
      return listEventDefinitions(ctx, options?.signal)
    },
    subscribe: (input) => operations.subscribe(input),
    getSubscription: (id) => operations.getSubscription(id),
    listSubscriptions: () => operations.listSubscriptions(),
    unsubscribe: (id) => operations.unsubscribe(id),
  }
}
