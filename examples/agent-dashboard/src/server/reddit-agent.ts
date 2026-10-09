/**
 * The Reddit pod: the first *real* team — no seeded fixtures.
 *
 *   - `reddit/fetcher`  — a procedural harness (no LLM) carrying one real tool,
 *     `reddit.search_react_news`. It's the injection target: the dashboard runs
 *     it on a timer / run-now / webhook, and it reads Reddit's public RSS feed.
 *   - `sentiment/react` — a *real* LLM agent (Anthropic). It's triggered by a
 *     `tool_result` subscription when a news batch lands, and posts a sentiment
 *     digest, persisting standout signals to pod memory.
 *
 * Unlike the other demo agents, `sentiment/react` needs a real provider:
 * set `ANTHROPIC_API_KEY`. That is the one manual setup step. Without a key the
 * agent posts a clear "set the key" message instead of a digest (no silent
 * mocking). Under `VITE_E2E` it uses a deterministic double so the e2e loop is
 * hermetic and offline.
 *
 * Server-only.
 */
import { EventType, toolDefinition } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { anthropicText } from '@tanstack/ai-anthropic'
import { z } from 'zod'
import { registerHarness } from './harness'
import { podToolNames, podTools } from './systools'
import { writeMemory } from './memory'
import { fetchReactNews } from './reddit'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

let seq = 0
const gid = (prefix: string) => `${prefix}-${(seq += 1)}`

/** Emit one model "turn" as AG-UI chunks (text only — these agents don't tool-call). */
function textTurn(
  text: string,
  inputTokens: number,
  outputTokens: number,
): Array<StreamChunk> {
  const now = Date.now()
  const messageId = gid('msg')
  return [
    {
      type: EventType.RUN_STARTED,
      runId: gid('run'),
      threadId: 't',
      timestamp: now,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: now,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: text,
      timestamp: now,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now },
    {
      type: EventType.RUN_FINISHED,
      runId: 'run',
      threadId: 't',
      timestamp: now,
      usage: [
        { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      ],
      metadata: { tanstack: { finishReason: 'stop' } },
    } as StreamChunk,
  ]
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

function scriptedModel(
  name: string,
  reply: (text: string) => string,
): AnyTextAdapter {
  return {
    kind: 'text',
    name,
    model: name,
    '~types': modelTypes,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      const messages = options.messages as Array<{
        role: string
        content: unknown
      }>
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      const userText =
        typeof lastUser?.content === 'string' ? lastUser.content : ''
      return stream(textTurn(reply(userText), 120, 40))
    },
  }
}

/* ------------------------------ Reddit fetcher ------------------------------ */

const searchReactNews = toolDefinition({
  name: 'reddit.search_react_news',
  description:
    "Fetch recent React news from Reddit's public RSS feed. Read-only.",
  inputSchema: z.object({
    subreddits: z.array(z.string()).optional(),
    query: z.string().optional(),
    sort: z.enum(['new', 'hot', 'top', 'relevance']).optional(),
    time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
}).server(async (args) => {
  const items = await fetchReactNews(args)
  return {
    items,
    count: items.length,
    subreddits: args.subreddits ?? ['reactjs'],
  }
})

export const redditFetcher = defineHarness({
  name: 'reddit/fetcher',
  description:
    'Fetches recent React news from Reddit on a schedule (real service, no LLM)',
  // Never prompted — only tool-injected — but a harness needs an adapter.
  adapter: scriptedModel(
    'demo-reddit-fetcher',
    () => 'Reddit fetcher is ready.',
  ),
  systemPrompts: ['You fetch React news from Reddit. You do not chat.'],
  tools: [searchReactNews, ...podTools],
  expose: { tools: ['reddit.search_react_news', ...podToolNames] },
})

/* ------------------------------ Sentiment agent ----------------------------- */

const SENTIMENT_SYSTEM =
  'You gauge the sentiment of a batch of React news. For each item give ' +
  'positive/neutral/negative and a one-line why, then a short digest: overall ' +
  'vibe, the hottest thread, and anything surprising. Link back to the ' +
  'permalinks. If a signal is worth remembering across runs (a trend, a ' +
  'recurring topic), persist it with the `remember` tool.'

/**
 * Resolve the calling thread from either context shape (out-of-band `{ threadId }`
 * or in-band `{ context: { threadId } }`).
 */
function callerThread(ctx: unknown): string {
  const c = ctx as
    | { threadId?: string; context?: { threadId?: string } }
    | undefined
  return c?.threadId ?? c?.context?.threadId ?? 'unknown'
}

/**
 * A memory-write tool the real LLM can call. Named `remember` (not the dotted
 * `pod.memory_write`) because Anthropic/OpenAI require tool names to match
 * `^[a-zA-Z0-9_-]{1,128}$` — a dot 400s. It writes the same server-side memory
 * store as `pod.memory_write`, so the Memory panel shows its entries.
 */
const remember = toolDefinition({
  name: 'remember',
  description:
    'Persist a standout signal to pod memory. It is attached to every future run.',
  inputSchema: z.object({ key: z.string(), value: z.string() }),
}).server(async ({ key, value }, ctx) => {
  writeMemory(callerThread(ctx), key, value)
  return { written: true, key }
})

/** The deterministic e2e double: a fixed digest so the loop is assertable offline. */
function sentimentMock(): AnyTextAdapter {
  return scriptedModel(
    'demo-sentiment',
    () =>
      'Sentiment digest — overall the React news batch skews positive. ' +
      'Hottest thread: the React Compiler going stable. Nothing alarming this cycle.',
  )
}

/** Emitted (instead of a digest) when no key is configured — no silent mocking. */
function missingKeyModel(): AnyTextAdapter {
  return scriptedModel(
    'sentiment-missing-key',
    () =>
      '⚠️ sentiment/react needs a real LLM. Set ANTHROPIC_API_KEY and restart to ' +
      'get a live sentiment digest (see the example README).',
  )
}

function sentimentAdapter(model = 'claude-haiku-4-5'): AnyTextAdapter {
  if (process.env.VITE_E2E === '1') return sentimentMock()
  if (!process.env.ANTHROPIC_API_KEY) return missingKeyModel()
  return anthropicText(model as 'claude-haiku-4-5') as unknown as AnyTextAdapter
}

export const sentimentReact = defineHarness({
  name: 'sentiment/react',
  description:
    'Reacts to a React-news batch with a sentiment digest (real LLM)',
  // haiku: fast + cheap, the right tier for a per-batch sentiment digest.
  adapter: sentimentAdapter(),
  // The session view's model picker sets `settings.model` to one of these.
  models: {
    haiku: sentimentAdapter('claude-haiku-5-5'),
    sonnet: sentimentAdapter('claude-sonnet-5-5'),
  },
  expose: { settings: ['model'] },
  systemPrompts: [SENTIMENT_SYSTEM],
  // Only `remember` — provider-safe name (dotted `pod.*` names 400 on Anthropic).
  // The digest itself is plain text projected into the channel, not a tool call.
  tools: [remember],
})

registerHarness(redditFetcher)
registerHarness(sentimentReact)
