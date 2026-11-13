import { PolicyResolver } from './policies'
import { createContextRuntime } from './runtime'
import type { ChatMiddleware, Tool } from '@tanstack/ai'
import type { PolicyTool } from './policies'
import type { OptimizeConfig } from './types'

export interface OptimizeResult {
  /** The wrapped tool set: copies of the input (never the caller's objects),
   *  plus `retrieve_context` when any applicable rule is retrievable. */
  tools: Array<Tool>
  /** The projection middleware, sharing the runtime stash with the appended
   *  `retrieve_context` tool. */
  middleware: ChatMiddleware
}

/**
 * Wrap a tool set the consumer does not author (MCP above all) with
 * deterministic context projection.
 *
 * Consumer policy (defaults + per-tool result/args overrides + exclude) lives
 * in the middleware's resolver, keyed by tool name — it is NOT baked onto the
 * tool objects: args rules and `defaults.mode` have no place in the author
 * `context` shape, and author adornment must still win per field. The returned
 * tools are shallow copies so the caller's objects are never mutated.
 */
export function optimize(tools: Array<Tool>, config: OptimizeConfig = {}): OptimizeResult {
  const runtime = createContextRuntime(config)
  const resolver = new PolicyResolver(config)

  // Copies — never mutate the caller's tool objects.
  const copies: Array<Tool> = tools.map((t) => ({ ...t }))

  // Append retrieve_context iff any applicable rule is retrievable.
  const appendRetrieve = resolver.anyRetrievable(tools as Array<PolicyTool>)
  const outTools: Array<Tool> = appendRetrieve ? [...copies, runtime.retrieveTool] : copies

  return { tools: outTools, middleware: runtime.middleware }
}
