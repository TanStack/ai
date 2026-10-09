import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { z } from 'zod'
import { runInjection, runPrompt, schedules } from './injection'
import { metaTools } from './meta'
import { computeNextFire } from './scheduler'
import { getRoster } from './store'

const listTeams = toolDefinition({
  name: 'list_teams',
  description: 'List dashboard teams, channels, and agent memberships',
  inputSchema: z.object({}),
}).server(() => getRoster())

// The dashboard tools. Each agent has its own harness MCP server too, with
// `chat`, `steer`, `cancel`, `approve`, `answer`, and `status`: see
// `routes/api.mcp.$.ts`. `send_message` differs from `chat`: it attaches the
// thread's pod memory and returns at once.
const sendMessage = toolDefinition({
  name: 'send_message',
  description: 'Send a message to an agent thread',
  inputSchema: z.object({ threadId: z.string(), message: z.string() }),
}).server(({ threadId, message }) => runPrompt({ threadId, message }))

const runTool = toolDefinition({
  name: 'run_tool',
  description: 'Run a public agent tool without a model turn',
  inputSchema: z.object({
    threadId: z.string(),
    tool: z.string(),
    args: z.unknown().optional(),
  }),
}).server(({ threadId, tool, args }) =>
  runInjection({ threadId, tool, args, trigger: 'mcp' }),
)

const listSchedules = toolDefinition({
  name: 'list_schedules',
  description: 'List dashboard schedules',
  inputSchema: z.object({}),
}).server(() => [...schedules.values()])

const toggleSchedule = toolDefinition({
  name: 'toggle_schedule',
  description: 'Enable or disable a dashboard schedule',
  inputSchema: z.object({ id: z.string(), enabled: z.boolean() }),
}).server(({ id, enabled }) => {
  const schedule = schedules.get(id)
  if (!schedule) return { status: 'rejected', reason: 'unknown schedule' }
  schedules.set(id, {
    ...schedule,
    enabled,
    nextFire: enabled ? computeNextFire(schedule, Date.now()) : undefined,
  })
  return { status: 'accepted', id, enabled }
})

export const dashboardMcp = createMCPServer({
  name: 'agent-dashboard',
  version: '1.0.0',
  tools: [
    ...metaTools,
    listTeams,
    sendMessage,
    runTool,
    listSchedules,
    toggleSchedule,
  ],
})
