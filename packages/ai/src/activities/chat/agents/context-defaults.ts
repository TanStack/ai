import type { SubagentBinding } from './bound'
import type { SubagentRunContext } from './define-agent'

/** Gives fields for the `ctx` of an agent run, as `binding.extend` does. */
type ContextDefault = NonNullable<SubagentBinding['extend']>

// One entry per call, so two callers with the same function each remove only
// their own default.
const contextDefaults = new Set<{ extend: ContextDefault }>()

/**
 * Add default fields to the `ctx` of every agent run in this process. This
 * includes a run that a plain `chat({ subagents })` starts, with no host
 * binding. A host package calls it once, when its module loads, for a field
 * that it types as required on `SubagentContextExtension`. A
 * `binding.extend` value wins over a default.
 *
 * @param extend Returns the fields to add to `ctx`.
 * @returns A function that removes this default.
 *
 * @example
 * ```ts
 * registerSubagentContextDefaults(() => ({ harness: NO_SESSION_CONTEXT }))
 * ```
 */
export function registerSubagentContextDefaults(extend: ContextDefault) {
  const entry = { extend }
  contextDefaults.add(entry)
  return () => {
    contextDefaults.delete(entry)
  }
}

/** The fields of every registered default, merged in registration order. */
export function applySubagentContextDefaults(ctx: SubagentRunContext) {
  let fields: ReturnType<ContextDefault> = {}
  for (const { extend } of contextDefaults) {
    fields = { ...fields, ...extend(ctx) }
  }
  return fields
}
