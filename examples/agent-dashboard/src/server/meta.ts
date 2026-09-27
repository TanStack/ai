/**
 * The meta-chat: the dashboard's own tool-using agent. It answers questions
 * about the dashboard by calling tools over live state (agents, sessions, runs,
 * config) and can edit agent config. It runs on the same host as every other
 * agent, so its own runs and tool calls show up in the trace view and history.
 *
 * Server-only. The model is scripted (no API key): it routes the prompt to a
 * tool, then summarizes the real result.
 */
import { EventType, toolDefinition } from '@tanstack/ai'
import { applyInput, defineHarness } from '@tanstack/ai-harness'
import { z } from 'zod'
import {
  getHarnessForThread,
  getHost,
  getPersistence,
  harnessRegistry,
  listThreads,
  registerHarness,
  triage,
} from './harness'
// Register the demo team agents (pr-watcher, security/review) as a side effect,
// so any route that imports meta also gets them in the registry.
import './demo-agents'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

let seq = 0
const id = (p: string) => `${p}-meta-${(seq += 1)}`

async function snapshotOf(threadId: string) {
  const harness = getHarnessForThread(threadId)
  const session = await getHost().open(harness, { threadId })
  return { session, snapshot: session.snapshot() }
}

const listAgents = toolDefinition({
  name: 'list_agents',
  description: 'List the agents this host can run',
  inputSchema: z.object({}),
}).server(async () =>
  Object.values(harnessRegistry).map((h) => ({
    name: h.name,
    description: h.description ?? '',
  })),
)

const listSessions = toolDefinition({
  name: 'list_sessions',
  description: 'List active sessions and their status',
  inputSchema: z.object({}),
}).server(async () => {
  const rows = await Promise.all(
    listThreads().map(async (t) => {
      const { snapshot } = await snapshotOf(t.id)
      return {
        threadId: t.id,
        harness: t.harness,
        status: snapshot.status,
        pendingInterrupts: snapshot.pendingInterrupts.length,
      }
    }),
  )
  return rows
})

const queryRuns = toolDefinition({
  name: 'query_runs',
  description: 'Query run history across all sessions',
  inputSchema: z.object({}),
}).server(async () => {
  const runs = (
    await Promise.all(
      listThreads().map(
        async (t) =>
          (await getPersistence().stores.runs?.listByThread?.(t.id)) ?? [],
      ),
    )
  ).flat()
  const byStatus: Record<string, number> = {}
  for (const r of runs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  return { total: runs.length, byStatus }
})

const getAgentConfig = toolDefinition({
  name: 'get_agent_config',
  description: 'Read an agent config',
  inputSchema: z.object({ agent: z.string().optional() }),
}).server(async () => {
  const session = await getHost().open(triage, { threadId: 'settings' })
  const config = session.config()
  return Object.entries(config).map(([key, entry]) => ({
    key,
    value: entry.value,
    type: entry.option.type,
  }))
})

const setAgentConfig = toolDefinition({
  name: 'set_agent_config',
  description: 'Change an agent config value',
  inputSchema: z.object({ key: z.string(), value: z.any() }),
}).server(async ({ key, value }) => {
  const session = await getHost().open(triage, { threadId: 'settings' })
  const receipt = await applyInput(triage, session, {
    op: 'config',
    key,
    value,
  })
  return { key, value, status: receipt.status }
})

const summarizeSession = toolDefinition({
  name: 'summarize_session',
  description: 'Summarize a session (defaults to the most recent)',
  inputSchema: z.object({ threadId: z.string().optional() }),
}).server(async ({ threadId }) => {
  const target = threadId ?? listThreads().find((t) => t.harness === triage.name)?.id
  if (!target) return { error: 'no sessions yet' }
  const { snapshot } = await snapshotOf(target)
  const messages = await getPersistence().stores.messages.loadThread(target)
  const last = [...messages].reverse().find((m) => m.role === 'assistant')
  return {
    threadId: target,
    status: snapshot.status,
    messageCount: messages.length,
    pendingApprovals: snapshot.pendingInterrupts.length,
    lastAssistant:
      typeof last?.content === 'string' ? last.content : undefined,
  }
})

/** Route a prompt to a tool by keyword. */
function pickTool(text: string): { name: string; args: Record<string, unknown> } {
  const t = text.toLowerCase()
  if (t.includes('config') || t.includes('setting'))
    return { name: 'get_agent_config', args: {} }
  if (t.includes('run') || t.includes('history') || t.includes('spend'))
    return { name: 'query_runs', args: {} }
  if (t.includes('summar')) return { name: 'summarize_session', args: {} }
  if (t.includes('agent')) return { name: 'list_agents', args: {} }
  return { name: 'list_sessions', args: {} }
}

/** Turn the tool result JSON into a short human summary. */
function summarize(toolName: string, result: unknown): string {
  try {
    if (toolName === 'list_agents') {
      const agents = result as Array<{ name: string }>
      return `This host runs ${agents.length} agent(s): ${agents.map((a) => a.name).join(', ')}.`
    }
    if (toolName === 'list_sessions') {
      const rows = result as Array<{ status: string; pendingInterrupts: number }>
      const waiting = rows.filter((r) => r.pendingInterrupts > 0).length
      return `${rows.length} session(s); ${waiting} awaiting approval.`
    }
    if (toolName === 'query_runs') {
      const r = result as { total: number; byStatus: Record<string, number> }
      const parts = Object.entries(r.byStatus).map(([s, n]) => `${n} ${s}`)
      return `${r.total} run(s) total${parts.length ? ` — ${parts.join(', ')}` : ''}.`
    }
    if (toolName === 'get_agent_config') {
      const rows = result as Array<{ key: string; value: unknown }>
      return `Config: ${rows.map((c) => `${c.key}=${JSON.stringify(c.value)}`).join(', ')}.`
    }
    if (toolName === 'summarize_session') {
      const s = result as {
        threadId?: string
        status?: string
        messageCount?: number
        pendingApprovals?: number
      }
      if (!s.threadId) return 'No sessions to summarize yet.'
      return `Session ${s.threadId} is ${s.status} with ${s.messageCount} messages and ${s.pendingApprovals} pending approval(s).`
    }
  } catch {
    /* fall through */
  }
  return `Done: ${JSON.stringify(result).slice(0, 200)}`
}

function metaModel(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'demo-meta',
    model: 'demo-meta',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) =>
      (async function* () {
        const now = Date.now()
        const toolMessages = options.messages.filter((m) => m.role === 'tool')
        if (toolMessages.length === 0) {
          const lastUser = [...options.messages]
            .reverse()
            .find((m) => m.role === 'user')
          const text =
            typeof lastUser?.content === 'string' ? lastUser.content : ''
          const tool = pickTool(text)
          const messageId = id('msg')
          const toolCallId = id('call')
          yield { type: EventType.RUN_STARTED, runId: 'run', threadId: 't', timestamp: now } as StreamChunk
          yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now } as StreamChunk
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: `Let me check that — calling ${tool.name}.`,
            timestamp: now,
          } as StreamChunk
          yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now } as StreamChunk
          yield { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: tool.name, timestamp: now } as StreamChunk
          yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(tool.args), timestamp: now } as StreamChunk
          yield { type: EventType.TOOL_CALL_END, toolCallId, timestamp: now } as StreamChunk
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run',
            threadId: 't',
            timestamp: now,
            usage: [{ inputTokens: 180, outputTokens: 20 }],
            metadata: { tanstack: { finishReason: 'tool_calls' } },
          } as StreamChunk
          return
        }
        // Final turn: summarize the tool result.
        const lastTool = toolMessages.at(-1)
        const assistant = [...options.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && (m as any).toolCalls?.length)
        const toolName =
          (assistant as any)?.toolCalls?.[0]?.function?.name ?? 'tool'
        let result: unknown = {}
        try {
          result =
            typeof lastTool?.content === 'string'
              ? JSON.parse(lastTool.content)
              : lastTool?.content
        } catch {
          result = lastTool?.content
        }
        const messageId = id('msg')
        yield { type: EventType.RUN_STARTED, runId: 'run', threadId: 't', timestamp: now } as StreamChunk
        yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now } as StreamChunk
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: summarize(toolName, result),
          timestamp: now,
        } as StreamChunk
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now } as StreamChunk
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'run',
          threadId: 't',
          timestamp: now,
          usage: [{ inputTokens: 260, outputTokens: 40 }],
          metadata: { tanstack: { finishReason: 'stop' } },
        } as StreamChunk
      })(),
  }
}

export const meta = defineHarness({
  name: 'dashboard/meta',
  description: "The dashboard's own tool-using chat over live agent state",
  adapter: metaModel(),
  systemPrompts: [
    'You are the dashboard meta-agent. Use tools to answer questions about agents, sessions, runs, and config.',
  ],
  tools: [
    listAgents,
    listSessions,
    queryRuns,
    getAgentConfig,
    setAgentConfig,
    summarizeSession,
  ],
})

registerHarness(meta)
