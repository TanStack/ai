/**
 * The demo agent host the dashboard drives. One embedded harness host with a
 * deterministic "support triage" agent, so the whole dashboard runs with no API
 * key and always shows the same flow: look up a ticket (auto tool), draft a
 * reply (approval-gated tool → interrupt), then send it after approval.
 *
 * This is server-only. Import it from server route handlers, never the client.
 */
import { EventType, toolDefinition } from '@tanstack/ai'
import {
  configOption,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { permissions, usage } from '@tanstack/ai-harness/plugins'
import { z } from 'zod'
import { filePersistence } from './store'
import { podToolNames, podTools } from './systools'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { AnyHarness, Principal } from '@tanstack/ai-harness'

let seq = 0
const id = (prefix: string) => `${prefix}-${(seq += 1)}`

/** Emit one model "turn" as AG-UI chunks: optional text, then optional tool. */
function turn(options: {
  text?: string
  tool?: { name: string; args: Record<string, unknown> }
  inputTokens: number
  outputTokens: number
}): Array<StreamChunk> {
  const now = Date.now()
  const chunks: Array<StreamChunk> = [
    {
      type: EventType.RUN_STARTED,
      runId: id('run'),
      threadId: 't',
      timestamp: now,
    },
  ]
  if (options.text) {
    const messageId = id('msg')
    chunks.push(
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp: now,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: options.text,
        timestamp: now,
      },
      { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now },
    )
  }
  if (options.tool) {
    const toolCallId = id('call')
    chunks.push(
      {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: options.tool.name,
        timestamp: now,
      } as StreamChunk,
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(options.tool.args),
        timestamp: now,
      } as StreamChunk,
      {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        timestamp: now,
      } as StreamChunk,
    )
  }
  chunks.push({
    type: EventType.RUN_FINISHED,
    runId: 'run',
    threadId: 't',
    timestamp: now,
    usage: [
      {
        inputTokens: options.inputTokens,
        outputTokens: options.outputTokens,
        totalTokens: options.inputTokens + options.outputTokens,
      },
    ],
    metadata: {
      tanstack: {
        finishReason: options.tool ? 'tool_calls' : 'stop',
      },
    },
  } as StreamChunk)
  return chunks
}

/**
 * A scripted model. It advances by counting tool results already in the thread,
 * so each turn is deterministic and the approval always happens on turn two.
 */
function triageModel(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'demo-triage',
    model: 'demo-triage',
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
        const toolResults = options.messages.filter(
          (message) => message.role === 'tool',
        ).length
        let chunks: Array<StreamChunk>
        if (toolResults === 0) {
          chunks = turn({
            text: "I'll pull up that ticket first.",
            tool: { name: 'lookup_ticket', args: { id: 'T-1042' } },
            inputTokens: 320,
            outputTokens: 24,
          })
        } else if (toolResults === 1) {
          chunks = turn({
            text: "Here's a draft reply for your approval.",
            tool: {
              name: 'send_reply',
              args: {
                to: 'ada@example.com',
                subject: 'Re: Cannot export invoices',
                body: "Hi Ada — exports are back up. Please try again and let us know if anything's still off. Sorry for the trouble!",
              },
            },
            inputTokens: 540,
            outputTokens: 96,
          })
        } else {
          chunks = turn({
            text: 'Sent ✅ — the customer has the reply. Anything else?',
            inputTokens: 610,
            outputTokens: 32,
          })
        }
        for (const chunk of chunks) yield chunk
      })(),
  }
}

const lookupTicket = toolDefinition({
  name: 'lookup_ticket',
  description: 'Look up a support ticket by id',
  inputSchema: z.object({ id: z.string() }),
}).server(async ({ id: ticketId }) => ({
  id: ticketId,
  customer: 'Ada Lovelace',
  plan: 'Pro',
  issue: 'Cannot export invoices',
  openedAt: '2026-09-24',
}))

const sendReply = toolDefinition({
  name: 'send_reply',
  description: 'Send a reply email to the customer',
  needsApproval: true,
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
}).server(async ({ to }) => ({ sent: true, to, at: new Date().toISOString() }))

/**
 * A deterministic, public, non-approval tool. It's the injection target: the
 * dashboard can run it on a schedule, on demand, or from a webhook (no model
 * turn, no tokens). Deterministic so the result is stable for the e2e.
 */
const fetchStats = toolDefinition({
  name: 'fetch_stats',
  description: 'Fetch the current support stats for a queue',
  inputSchema: z.object({ queue: z.string().optional() }),
}).server(async ({ queue }) => {
  const q = queue ?? 'default'
  const open = q.length * 3 + 7
  return {
    queue: q,
    open,
    slaBreaches: open % 5,
    avgFirstResponseMins: 12,
  }
})

/**
 * Typed config for the triage agent. The dashboard renders these `ConfigOption`
 * schemas as a form and writes changes back through the harness protocol.
 */
const triageSettings = definePlugin({
  name: 'support/triage-settings',
  setup: () => ({
    config: {
      tone: configOption.select({
        options: ['friendly', 'formal', 'concise'],
        default: 'friendly',
        description: 'The voice used when drafting replies',
      }),
      signature: configOption.text({
        default: 'The Support Team',
        description: 'Signature appended to replies',
      }),
      max_drafts: configOption.number({
        default: 3,
        min: 1,
        max: 10,
        description: 'How many drafts to keep before compacting',
      }),
      auto_send_low_risk: configOption.boolean({
        default: false,
        description: 'Skip approval for low-risk replies (demo only)',
      }),
    },
  }),
})

export const triage = defineHarness({
  name: 'support/triage',
  description: 'A support triage agent that drafts replies for human approval',
  adapter: triageModel(),
  systemPrompts: [
    'You are a support triage agent. Look up the ticket, then draft a reply for a human to approve before sending.',
  ],
  plugins: () => [
    permissions({
      rules: [{ tool: 'lookup_ticket', decision: 'ask' }],
    }),
    usage(),
    triageSettings,
  ],
  tools: [lookupTicket, sendReply, fetchStats, ...podTools],
  expose: {
    // The config form and the meta-chat `set_agent_config` tool write these.
    config: ['tone', 'signature', 'max_drafts', 'auto_send_low_risk'],
    // Only `fetch_stats` runs from the automations UI. The reply tools run
    // only in the agent's own turns. The `pod.*` tools are left out of the
    // run-now list (see `api.tools.ts`): they are plumbing.
    tools: ['fetch_stats', ...podToolNames],
  },
})

let persistence: ReturnType<typeof filePersistence> | undefined
export function getPersistence() {
  persistence ??= filePersistence()
  return persistence
}

let host: ReturnType<typeof createHarnessHost> | undefined
export function getHost() {
  host ??= createHarnessHost({ persistence: getPersistence() })
  return host
}

/** Every harness this host serves, by name — so routes can pick per thread. */
export const harnessRegistry: Record<string, AnyHarness> = {
  [triage.name]: triage as AnyHarness,
}

export function registerHarness(harness: AnyHarness): void {
  harnessRegistry[harness.name] = harness
}

/** Local single-user demo: every request is the same owner. */
export const LOCAL: Principal = { id: 'local', name: 'You' }
export const authorize = (): Principal => LOCAL

/**
 * The harness of a thread: `name` when the caller knows it, else the one in
 * the session index entry, else triage. The first open of a thread writes its
 * harness into the index, so pass `name` on that open.
 */
export async function harnessFor(
  threadId: string,
  name?: string | null,
): Promise<AnyHarness> {
  if (name && harnessRegistry[name]) return harnessRegistry[name]
  const entry = await getHost().sessions.get(threadId)
  return harnessRegistry[entry?.harness ?? ''] ?? triage
}

/** Open a thread on its harness, as the local owner (see `harnessFor`). */
export async function openThread(threadId: string, name?: string | null) {
  const harness = await harnessFor(threadId, name)
  const session = await getHost().open(harness, { threadId, principal: LOCAL })
  return { harness, session }
}

/** The top-level threads of the session index, newest first. */
export async function listThreads() {
  const { entries } = await getHost().sessions.list()
  return entries.map((entry) => ({
    id: entry.threadId,
    harness: entry.harness ?? triage.name,
    ...(entry.title ? { title: entry.title } : {}),
    createdAt: entry.createdAt,
    lastActivity: entry.updatedAt,
  }))
}
