import { toolDefinition } from '@tanstack/ai'
import { applyInput } from '@tanstack/ai-harness'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import { z } from 'zod'
import { getHarnessForThread, getHost } from './harness'
import { runInjection, runPrompt, schedules } from './injection'
import { metaTools } from './meta'
import { computeNextFire } from './scheduler'
import { getRoster } from './store'

async function control(
  threadId: string,
  input:
    | { op: 'steer'; message: string }
    | { op: 'cancel' }
    | { op: 'answer'; questionId: string; value: unknown },
) {
  const harness = getHarnessForThread(threadId)
  const session = await getHost().open(harness, { threadId })
  return applyInput(harness, session, input)
}

const listTeams = toolDefinition({
  name: 'list_teams',
  description: 'List dashboard teams, channels, and agent memberships',
  inputSchema: z.object({}),
}).server(() => getRoster())

const sendMessage = toolDefinition({
  name: 'send_message',
  description: 'Send a message to an agent thread',
  inputSchema: z.object({ threadId: z.string(), message: z.string() }),
}).server(({ threadId, message }) => runPrompt({ threadId, message }))

const steer = toolDefinition({
  name: 'steer',
  description: 'Add guidance to a running agent turn',
  inputSchema: z.object({ threadId: z.string(), message: z.string() }),
}).server(({ threadId, message }) =>
  control(threadId, { op: 'steer', message }),
)

const cancel = toolDefinition({
  name: 'cancel',
  description: 'Cancel a running agent turn',
  inputSchema: z.object({ threadId: z.string() }),
}).server(({ threadId }) => control(threadId, { op: 'cancel' }))

const answer = toolDefinition({
  name: 'answer',
  description: 'Answer a pending agent question',
  inputSchema: z.object({
    threadId: z.string(),
    questionId: z.string(),
    value: z.unknown(),
  }),
}).server(({ threadId, questionId, value }) =>
  control(threadId, { op: 'answer', questionId, value }),
)

const resolveApproval = toolDefinition({
  name: 'resolve_approval',
  description: 'Approve or reject a pending approval',
  inputSchema: z.object({
    threadId: z.string(),
    approved: z.boolean(),
    interruptId: z.string().optional(),
  }),
}).server(async ({ threadId, approved, interruptId }) => {
  const harness = getHarnessForThread(threadId)
  const session = await getHost().open(harness, { threadId })
  const id = interruptId ?? session.snapshot().pendingInterrupts[0]?.id
  if (!id) return { status: 'rejected', reason: 'no pending approval' }
  return applyInput(harness, session, {
    op: 'resolve',
    resume: [
      {
        interruptId: id,
        status: approved ? 'resolved' : 'cancelled',
        payload: approved,
      },
    ],
  })
})

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
    resolveApproval,
    steer,
    cancel,
    answer,
    runTool,
    listSchedules,
    toggleSchedule,
  ],
})
