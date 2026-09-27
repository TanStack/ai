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
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { podTools, podVisibility } from './systools'
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
    { type: EventType.RUN_STARTED, runId: id('run'), threadId: 't', timestamp: now },
  ]
  if (options.text) {
    const messageId = id('msg')
    chunks.push(
      { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: options.text, timestamp: now },
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
      { type: EventType.TOOL_CALL_END, toolCallId, timestamp: now } as StreamChunk,
    )
  }
  chunks.push({
    type: EventType.RUN_FINISHED,
    runId: 'run',
    threadId: 't',
    timestamp: now,
    usage: [{ inputTokens: options.inputTokens, outputTokens: options.outputTokens }],
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
  plugins: () => [permissions(), usage(), triageSettings],
  tools: [lookupTicket, sendReply, fetchStats, ...podTools],
  // Only `fetch_stats` may be invoked out-of-band from the automations UI (the
  // reply tools stay private to the agent's own model turns). The `pod.*` system
  // tools are public too, but they're excluded from the run-now registry (see
  // `api.tools.ts`) — they're plumbing, not scheduled automations.
  toolVisibility: { fetch_stats: 'public', ...podVisibility },
})

let persistence: ReturnType<typeof memoryPersistence> | undefined
export function getPersistence() {
  persistence ??= memoryPersistence()
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

/** A live view of the threads the dashboard has touched, for the session list. */
export interface ThreadInfo {
  id: string
  harness: string
  createdAt: number
  lastActivity: number
}
const threads = new Map<string, ThreadInfo>()

export function noteThread(threadId: string, harness?: string): void {
  const now = Date.now()
  const existing = threads.get(threadId)
  if (existing) {
    existing.lastActivity = now
    // A thread can be created (default triage) before the client tells us which
    // harness it runs; adopt the specific harness whenever we're told it.
    if (harness && harnessRegistry[harness]) existing.harness = harness
  } else {
    threads.set(threadId, {
      id: threadId,
      harness: harness && harnessRegistry[harness] ? harness : triage.name,
      createdAt: now,
      lastActivity: now,
    })
  }
}

export function listThreads(): Array<ThreadInfo> {
  return [...threads.values()].sort((a, b) => b.lastActivity - a.lastActivity)
}

/** The harness a thread runs on (default: triage). */
export function getHarnessForThread(threadId: string) {
  const name = threads.get(threadId)?.harness ?? triage.name
  return harnessRegistry[name] ?? triage
}

/** Local single-user demo: every request is the same owner. */
export const authorize = (): Principal => ({ id: 'local', name: 'You' })

/** Record the thread on every session open, and allow it. */
export const canAccess = (_principal: Principal, threadId: string): boolean => {
  noteThread(threadId)
  return true
}

/** canAccess that records a thread under a specific harness (for meta-chat). */
export const canAccessFor =
  (harness: string) =>
  (_principal: Principal, threadId: string): boolean => {
    noteThread(threadId, harness)
    return true
  }
