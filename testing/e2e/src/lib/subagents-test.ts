import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Shared by `/api/subagents-test` (server) and `/subagents-test` (client).
 * The client needs the definition to render the child's approval.
 */
export const deleteLogs = toolDefinition({
  name: 'deleteLogs',
  description: 'Delete old log files',
  needsApproval: true,
  inputSchema: z.object({ folder: z.string() }),
})

export const lookupFacts = toolDefinition({
  name: 'lookupFacts',
  description: 'Look up facts about a topic',
  inputSchema: z.object({ topic: z.string() }),
})

export type SubagentScenario =
  | 'route'
  | 'approval'
  | 'tool-approval'
  | 'tool'
  | 'brief'
  | 'result'
  | 'limits'
  | 'session'
  | 'keys'
  | 'routed-brief'

/** The key the `keys` scenario passes in `subagents.keys`. */
export const SUBAGENT_E2E_KEY = 'sk-e2e-subagent-key'

/** The user message for each scenario. It matches `fixtures/subagents`. */
export const SUBAGENT_PROMPTS: Record<SubagentScenario, string> = {
  route: '[subagent-route] research squids',
  approval: '[subagent-approval] clean up the old logs',
  'tool-approval': '[subagent-tool-approval] clean up the old logs',
  tool: '[subagent-tool] research squids',
  brief: '[subagent-brief] compare squid facts',
  result: '[subagent-result] price vendor a',
  limits: '[subagent-limits] research two topics',
  session: '[subagent-session] take squid notes',
  keys: '[subagent-keys] write a draft',
  'routed-brief': '[subagent-routed-brief] compare squid facts',
}

export function isSubagentScenario(value: unknown): value is SubagentScenario {
  return (
    value === 'route' ||
    value === 'approval' ||
    value === 'tool-approval' ||
    value === 'tool' ||
    value === 'brief' ||
    value === 'result' ||
    value === 'limits' ||
    value === 'session' ||
    value === 'keys' ||
    value === 'routed-brief'
  )
}
