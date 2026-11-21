import { listPages } from '../list-pages'
import { MCPEventsUnsupportedError } from '../errors'
import { isMethodNotFound, toMCPEventRequestError } from './errors-map'
import { eventHeaderFault } from './param-headers'
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
  let events: Array<MCPEventDefinition>
  try {
    events = await listPages(async (cursor) => {
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
  const kept = events.filter((event) => {
    const fault = eventHeaderFault(event.inputSchema)
    if (fault === undefined) return true
    console.warn(`MCP events: left ${event.name} out of events/list. ${fault}`)
    return false
  })
  ctx.noteEventSchemas?.(kept)
  return kept
}
