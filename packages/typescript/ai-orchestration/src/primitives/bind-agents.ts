import type { AgentMap, BoundAgents, StepDescriptor } from '../types'

/**
 * Convert a declared `agents` map into bound, callable functions that produce
 * step generators. Used by the engine to construct the `agents` argument
 * passed into the user's workflow `run`.
 */
export function bindAgents<TAgents extends AgentMap>(
  agents: TAgents,
): BoundAgents<TAgents> {
  const bound = {} as Record<string, unknown>

  for (const [name, def] of Object.entries(agents)) {
    if (def.__kind === 'agent') {
      bound[name] = function* (input: unknown): Generator<StepDescriptor, unknown, unknown> {
        const descriptor: StepDescriptor = {
          kind: 'agent',
          name,
          input,
          agent: def,
        }
        const result = yield descriptor
        return result
      }
    } else {
      bound[name] = function* (input: unknown): Generator<StepDescriptor, unknown, unknown> {
        const descriptor: StepDescriptor = {
          kind: 'nested-workflow',
          name,
          input,
          workflow: def,
        }
        const result = yield descriptor
        return result
      }
    }
  }

  return bound as BoundAgents<TAgents>
}
