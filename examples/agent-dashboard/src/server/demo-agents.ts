/**
 * The PR-watcher demo team: two scripted agents that make the design doc's "the
 * pod learns" loop concrete, with no API key.
 *
 *   - `ops/pr-watcher`  — reacts to a PR webhook (prompt mode). Its run calls
 *     `github.check_pr`, opens a per-PR channel (`pod.channel_create`), and posts
 *     a summary there (`pod.message_post`) — all in-band tool calls.
 *   - `security/review` — subscribed to `channel_created` (join + trigger). When
 *     asked to review, it flags the PR's public-internet exposure UNLESS its pod
 *     memory says the deployment is intranet-only. When the human corrects it, it
 *     persists that standing instruction with `pod.memory_write`, so the next PR
 *     is handled better.
 *
 * The models advance by counting the tool results produced *since the last user
 * message*, so they stay deterministic across the many runs each thread handles.
 *
 * Server-only.
 */
import { EventType, toolDefinition } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { z } from 'zod'
import { registerHarness } from './harness'
import { podTools, podVisibility } from './systools'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

let seq = 0
const gid = (prefix: string) => `${prefix}-${(seq += 1)}`

/** Emit one model "turn" as AG-UI chunks: optional text, then optional tool. */
function turn(options: {
  text?: string
  tool?: { name: string; args: Record<string, unknown> }
  inputTokens: number
  outputTokens: number
}): Array<StreamChunk> {
  const now = Date.now()
  const chunks: Array<StreamChunk> = [
    { type: EventType.RUN_STARTED, runId: gid('run'), threadId: 't', timestamp: now },
  ]
  if (options.text) {
    const messageId = gid('msg')
    chunks.push(
      { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: options.text, timestamp: now },
      { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now },
    )
  }
  if (options.tool) {
    const toolCallId = gid('call')
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
    metadata: { tanstack: { finishReason: options.tool ? 'tool_calls' : 'stop' } },
  } as StreamChunk)
  return chunks
}

async function* stream(chunks: Array<StreamChunk>) {
  for (const chunk of chunks) yield chunk
}

const modelTypes = {
  providerOptions: {},
  inputModalities: ['text'] as const,
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
}

/** Tool results produced since the last user message (i.e. within this run). */
function resultsThisRun(messages: Array<any>): Array<any> {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUser = i
      break
    }
  }
  const out: Array<any> = []
  for (const m of messages.slice(lastUser + 1)) {
    if (m.role !== 'tool') continue
    try {
      out.push(typeof m.content === 'string' ? JSON.parse(m.content) : m.content)
    } catch {
      out.push({})
    }
  }
  return out
}

function lastUserText(messages: Array<any>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return typeof messages[i].content === 'string' ? messages[i].content : ''
    }
  }
  return ''
}

function extractChannel(text: string): string {
  return /\[channel:([^\]]+)\]/.exec(text)?.[1] ?? ''
}

/* ---------------------------- PR watcher ---------------------------- */

// Seeded PRs: the check returns the next one each call. Both expose an endpoint
// to the public internet — the difference in handling comes from pod memory.
const seededPrs = [
  { number: 1524, title: 'Add public metrics endpoint', risk: 'exposes /metrics to the public internet without auth' },
  { number: 1530, title: 'Broaden metrics coverage', risk: 'exposes more of /metrics to the public internet' },
]
let prCursor = 0

const checkPr = toolDefinition({
  name: 'github.check_pr',
  description: 'Check for the next open PR to review',
  inputSchema: z.object({}),
}).server(async () => {
  const pr = seededPrs[Math.min(prCursor, seededPrs.length - 1)]
  prCursor += 1
  return { number: pr.number, title: pr.title, risk: pr.risk }
})

function watcherModel(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'demo-pr-watcher',
    model: 'demo-pr-watcher',
    '~types': modelTypes,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      const results = resultsThisRun(options.messages as Array<any>)
      const n = results.length
      if (n === 0) {
        return stream(
          turn({
            text: 'A PR webhook arrived — checking for a new PR.',
            tool: { name: 'github.check_pr', args: {} },
            inputTokens: 120,
            outputTokens: 16,
          }),
        )
      }
      if (n === 1) {
        const pr = results[0]
        return stream(
          turn({
            text: `Found PR #${pr.number}. Opening a review channel.`,
            tool: {
              name: 'pod.channel_create',
              args: {
                name: `pr-${pr.number}`,
                topic: `PR #${pr.number}: ${pr.title}`,
              },
            },
            inputTokens: 160,
            outputTokens: 24,
          }),
        )
      }
      if (n === 2) {
        const pr = results[0]
        const created = results[1]
        return stream(
          turn({
            tool: {
              name: 'pod.message_post',
              args: {
                channelId: created.channelId,
                content: `PR #${pr.number}: ${pr.title}. Potential risk: ${pr.risk}. Requesting a security review.`,
              },
            },
            inputTokens: 180,
            outputTokens: 28,
          }),
        )
      }
      return stream(
        turn({ text: 'Review channel is set up.', inputTokens: 80, outputTokens: 8 }),
      )
    },
  }
}

/* --------------------------- Security review ------------------------ */

function securityModel(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'demo-security',
    model: 'demo-security',
    '~types': modelTypes,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      const messages = options.messages as Array<any>
      // Mid-run: our tool has executed, close out with a short line.
      if (messages.at(-1)?.role === 'tool') {
        return stream(
          turn({ text: 'Done.', inputTokens: 60, outputTokens: 6 }),
        )
      }
      const userText = lastUserText(messages)
      const channelId = extractChannel(userText)
      const memory = (options.systemPrompts ?? [])
        .map((p: any) => (typeof p === 'string' ? p : p.content))
        .join('\n')
      const intranet = /intranet/i.test(memory)

      // A human correction: persist the standing instruction to pod memory.
      if (/intranet|not a security problem|no.?t a security/i.test(userText)) {
        return stream(
          turn({
            text: 'Understood — noting that for next time.',
            tool: {
              name: 'pod.memory_write',
              args: {
                key: 'intranet-policy',
                value:
                  'This deployment is intranet-only; do not flag public-internet exposure of internal endpoints.',
              },
            },
            inputTokens: 140,
            outputTokens: 20,
          }),
        )
      }

      // A review request: flag the exposure unless memory says intranet-only.
      const content = intranet
        ? 'Reviewed. No blocking security issues — this deployment is intranet-only per policy.'
        : '⚠️ Security finding: this PR exposes an endpoint to the public internet without authentication. Recommend gating it before merge.'
      return stream(
        turn({
          tool: { name: 'pod.message_post', args: { channelId, content } },
          inputTokens: 200,
          outputTokens: 30,
        }),
      )
    },
  }
}

export const prWatcher = defineHarness({
  name: 'ops/pr-watcher',
  description: 'Watches for PRs and opens a per-PR review channel',
  adapter: watcherModel(),
  systemPrompts: [
    'You are a PR watcher. When a webhook arrives, check for a new PR, open a channel for it, and post a summary requesting review.',
  ],
  tools: [checkPr, ...podTools],
  toolVisibility: { 'github.check_pr': 'public', ...podVisibility },
})

export const securityReview = defineHarness({
  name: 'security/review',
  description: 'Reviews PRs for security issues and learns from human corrections',
  adapter: securityModel(),
  systemPrompts: [
    'You are a security reviewer. Review the PR and post your findings. When a human gives you a standing instruction about what not to flag, persist it with pod.memory_write.',
  ],
  tools: [...podTools],
  toolVisibility: { ...podVisibility },
})

registerHarness(prWatcher)
registerHarness(securityReview)

/** Reset seeded PR state — for deterministic tests. */
export function resetDemoState(): void {
  prCursor = 0
}
