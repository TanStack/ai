import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  memoryStream,
  resumeServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import type { StreamChunk } from '@tanstack/ai'
import { persistentChatPersistence } from '../lib/persistent-chat-store'
import { sendEmailTool } from '../lib/persistent-chat-tools'

const persistence = persistentChatPersistence()

// Delivery-layer producer dedup: run ids whose detached producer is currently
// pumping the memoryStream log. Prevents a duplicate POST (client retry, React
// strict-mode double render) from starting a second model call / double-writing
// the same log. Process-local, like the `memoryStream` log it guards — NOT the
// source of truth for "is this thread active" (that is the persistence runs
// store, resolved by `reconstructChat` via `findActiveRun(threadId)`).
const activeProducers = new Set<string>()

// Two server-executed tools so the demo exercises the agent loop AND tool-call
// persistence: the assistant's tool calls and their results are written to the
// stored transcript, so a reload rehydrates them too — not just plain text.

const WEATHER = {
  sunny: { emoji: '☀️', tempC: 24 },
  cloudy: { emoji: '☁️', tempC: 17 },
  rainy: { emoji: '🌧️', tempC: 12 },
} as const
const CONDITIONS = Object.keys(WEATHER) as Array<keyof typeof WEATHER>

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the current weather for a city.',
  inputSchema: z.object({ city: z.string().describe('City name') }),
  outputSchema: z.object({
    city: z.string(),
    condition: z.string(),
    emoji: z.string(),
    tempC: z.number(),
  }),
}).server(({ city }) => {
  // Deterministic mock: pick a condition from the city name so a given city
  // always reports the same weather (no external API needed for the demo).
  const seed = [...city].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const condition = CONDITIONS[seed % CONDITIONS.length]!
  return { city, condition, ...WEATHER[condition] }
})

const rollDice = toolDefinition({
  name: 'rollDice',
  description: 'Roll one or more dice and return the results.',
  inputSchema: z.object({
    sides: z.number().int().min(2).max(100).default(6),
    count: z.number().int().min(1).max(10).default(1),
  }),
  outputSchema: z.object({
    rolls: z.array(z.number()),
    total: z.number(),
  }),
}).server(({ sides = 6, count = 1 }) => {
  const rolls = Array.from(
    { length: count },
    () => Math.floor(Math.random() * sides) + 1,
  )
  return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) }
})

// A human-in-the-loop tool. The DEFINITION is shared with the client (see
// `../lib/persistent-chat-tools`); here we attach the server implementation.
// `needsApproval` pauses the run on an interrupt before the tool runs; the
// interrupt is persisted by `withPersistence` and survives a reload — approve or
// reject after refreshing and the run resumes from exactly where it paused.
const sendEmail = sendEmailTool.server(({ to }) => {
  // Demo: no real email is sent — the approval pause is the point.
  return {
    messageId: `msg-${Math.random().toString(36).slice(2, 10)}`,
    to,
  }
})

const SYSTEM_PROMPT =
  'You are a concise, friendly assistant. When the user asks about the ' +
  'weather or to roll dice, use the getWeather / rollDice tools. When the user ' +
  'asks to send an email, use the sendEmail tool (it pauses for their ' +
  'approval). Use tools rather than guessing, then summarize the result in a ' +
  'sentence.'

/**
 * Start the model run **detached from the HTTP connection** and let it run to
 * completion into the delivery log, regardless of whether the requesting client
 * stays connected. This is the "don't abort on disconnect, because it's
 * persisted" policy: because `withPersistence` writes the transcript on finish,
 * it's safe to keep generating after a reload — the result is captured either
 * way (the loader rehydrates it, and a rejoining client tails the same log).
 *
 * Contrast the plain resumable route (`/api/resumable`), which ties the run to
 * the request's `abortController`: with no persistence, continuing after a
 * disconnect would just burn tokens no one reads, so it aborts.
 */
type ChatParams = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

function startDetachedRun(
  runId: string,
  threadId: string,
  messages: ChatParams['messages'],
  // Present on the follow-up request after the user answers an interrupt: the
  // parent (interrupted) run and the approval/rejection batch. Forwarded to
  // chat() so it rebuilds the paused tool call and continues.
  resume?: ChatParams['resume'],
  parentRunId?: string,
): void {
  if (activeProducers.has(runId)) return
  activeProducers.add(runId)

  // Producer-mode durability handle, keyed by runId via the X-Run-Id header.
  const sink = memoryStream(
    new Request('http://persistent-chat.internal/', {
      headers: { 'X-Run-Id': runId },
    }),
  )

  const stream = chat({
    adapter: openaiText('gpt-5.5'),
    // Reasoning on, effort "low" so it stays fast. `summary: 'auto'` asks OpenAI
    // for a readable reasoning summary; when returned it streams as REASONING
    // events, is persisted, and reconstructs like text/tool calls (the pane
    // renders it as a "reasoning" block). NOTE: OpenAI only returns reasoning
    // summary text to organizations verified for it — unverified keys still
    // reason (you see reasoning tokens in usage) but get no summary to display.
    modelOptions: { reasoning: { effort: 'low', summary: 'auto' } },
    // Snapshot streaming on: even the partial reply is persisted, so a reload
    // mid-generation (or a crash) still shows the story-so-far, and the detached
    // run below finishes and persists the rest.
    middleware: [withPersistence(persistence, { snapshotStreaming: true })],
    agentLoopStrategy: maxIterations(10),
    systemPrompts: [SYSTEM_PROMPT],
    tools: [getWeather, rollDice, sendEmail],
    messages,
    threadId,
    runId,
    ...(parentRunId ? { parentRunId } : {}),
    ...(resume ? { resume } : {}),
    // No client abortController: the run owns its own lifetime.
  })

  void (async () => {
    try {
      for await (const chunk of stream) {
        await sink.append([chunk])
      }
    } catch (error) {
      // The run threw before emitting a terminal chunk (withPersistence.onError
      // already recorded the failure). Append a RUN_ERROR so log readers unblock
      // instead of waiting on a stream that will never finish.
      await sink.append([
        {
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        } as StreamChunk,
      ])
    } finally {
      await sink.close()
      activeProducers.delete(runId)
    }
  })()
}

/**
 * Persistent-chat demo endpoint.
 *
 * Three kinds of durability stack here:
 *
 * 1. STATE — `withPersistence` writes the thread transcript (including the
 *    pending user turn at start and throttled streaming snapshots), run records,
 *    and interrupt state to SQLite. Survives a server restart.
 *
 * 2. DELIVERY — the `memoryStream` log records each chunk so a reconnecting or
 *    rejoining client replays without re-running the model. Swap it for
 *    `durableStream(request, { server })` from `@tanstack/ai-durable-stream` in
 *    production (memoryStream is process-local).
 *
 * 3. RUN LIFETIME — the run is detached from the HTTP request (see
 *    `startDetachedRun`), so a mid-stream reload does not abort it. It finishes,
 *    persists, and the reload rehydrates the full conversation.
 *
 * The client runs server-authoritative (`persistence: { store, messages: false }`)
 * and keeps no messages — and no run pointer — of its own. On mount `useChat`
 * hits this GET itself (keyed by threadId) and `reconstructChat` returns the
 * transcript plus a cursor to any in-flight run, which the client then tails via
 * the delivery replay branch below. No loader, no client hydration code.
 */

export const Route = createFileRoute('/api/persistent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequestBody(await request.json())

        // Kick off (or attach to) the detached run, then stream it to THIS
        // client by tailing the delivery log from the start. Cancelling this
        // response (a reload) cancels only the reader — never the producer.
        // `resume`/`parentRunId` are set on the follow-up after an interrupt is
        // answered, so the paused tool call continues.
        startDetachedRun(
          params.runId,
          params.threadId,
          params.messages,
          params.resume,
          params.parentRunId,
        )

        // This reader genuinely races the producer it just started, so give it a
        // generous first-chunk deadline (the default is tuned short for reload
        // rejoins, where the producer ran in a prior request and an empty log
        // means "gone").
        const reader = memoryStream(
          new Request(
            `http://persistent-chat.internal/?offset=-1&runId=${encodeURIComponent(params.runId)}`,
          ),
          { firstChunkDeadlineMs: 10_000 },
        )
        return resumeServerSentEventsResponse({ adapter: reader })
      },

      // GET serves two independent jobs off one route:
      //
      // 1. Delivery replay — re-attach to an in-flight run off the ephemeral,
      //    per-run durability log. The run id rides the `X-Run-Id` header (or
      //    `?runId`) and the resume offset the `Last-Event-ID` header (or
      //    `?offset`), so ask the adapter via `resumeFrom()` rather than
      //    sniffing query params.
      // 2. History hydration — read the DURABLE thread transcript from the
      //    persistence store. This is what a server-authoritative client
      //    (persistence `{ messages: false }`) fetches on reload, since the
      //    delivery log only holds one run, never prior turns.
      GET: ({ request }) => {
        // `memoryStream` fails a from-start join to a gone/empty run fast (its
        // ~100ms default first-chunk deadline), so an unresumable reload frees
        // the input near-instantly instead of hanging. Raise
        // `firstChunkDeadlineMs` here if your producer can start well after a
        // joiner attaches.
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        // Demo only: single shared thread, no multi-user auth. Production routes
        // must authorize ownership (session → allowed thread ids) before load —
        // without `authorize`, any caller who knows `?threadId=` gets the full
        // transcript.
        return reconstructChat(persistence, request, {
          authorize: async (threadId) => {
            // e.g. return (await getSessionUser())?.canAccess(threadId) ?? false
            return threadId.length > 0
          },
        })
      },
    },
  },
})
