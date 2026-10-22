import { listPages } from '../list-pages'
import { MCPEventsUnsupportedError } from '../errors'
import { isMethodNotFound, toMCPEventRequestError } from './errors-map'
import type { MCPEventDefinition, MCPEventsContext } from './types'
import { listEventsResult } from './wire'

/**
 * Walk every `events/list` page. Maps method-not-found to unsupported.
 */
export async function listEventDefinitions(
  ctx: MCPEventsContext,
  signal?: AbortSignal,
): Promise<Array<MCPEventDefinition>> {
  ctx.assertOpen()
  if (!ctx.supportsEvents) throw new MCPEventsUnsupportedError()
  try {
    return await listPages(async (cursor) => {
      const page = await ctx.request(
        'events/list',
        cursor === undefined ? {} : { cursor },
        listEventsResult,
        signal,
      )
      return { items: page.events, nextCursor: page.nextCursor }
    })
  } catch (err) {
    if (isMethodNotFound(err)) throw new MCPEventsUnsupportedError()
    throw toMCPEventRequestError(err)
  }
}
