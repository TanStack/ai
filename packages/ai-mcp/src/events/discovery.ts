import { MCPEventConfigError } from '../errors'
import { listEventDefinitions } from './list'
import type { MCPEvents, MCPEventsContext } from './types'

/**
 * Discovery-only events API. `list()` works; subscribe/refresh/unsubscribe throw.
 *
 * @experimental
 */
export function createDiscoveryMCPEvents(ctx: MCPEventsContext): MCPEvents {
  return {
    list(options) {
      return listEventDefinitions(ctx, options?.signal)
    },
    async subscribe() {
      throw new MCPEventConfigError(
        'experimental_events.store or experimental_events.adapter is required to subscribe',
      )
    },
    async refresh() {
      throw new MCPEventConfigError(
        'experimental_events.store or experimental_events.adapter is required to refresh',
      )
    },
    async unsubscribe() {
      throw new MCPEventConfigError(
        'experimental_events.store or experimental_events.adapter is required to unsubscribe',
      )
    },
  }
}
