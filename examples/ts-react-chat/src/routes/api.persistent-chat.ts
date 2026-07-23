import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { reconstructChat, withPersistence } from '@tanstack/ai-persistence'
import { persistentChatPersistence } from '../lib/persistent-chat-store'

const persistence = persistentChatPersistence()

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
}).server(({ sides, count }) => {
  const rolls = Array.from(
    { length: count },
    () => Math.floor(Math.random() * sides) + 1,
  )
  return { rolls, total: rolls.reduce((sum, roll) => sum + roll, 0) }
})

const SYSTEM_PROMPT =
  'You are a concise, friendly assistant. When the user asks about the ' +
  'weather or to roll dice, use the getWeather / rollDice tools rather than ' +
  'guessing, then summarize the result in a sentence.'

/**
 * Persistent-chat demo endpoint.
 *
 * Two kinds of durability stack here:
 *
 * 1. STATE (this file) — `withPersistence` middleware writes the thread
 *    transcript, run records, and interrupt state to SQLite. The store survives
 *    a full server restart, so a reload can continue the same conversation from
 *    the server's own copy even if the client sent no history.
 *
 * 2. DELIVERY — `memoryStream(request)` records each chunk to an ordered log and
 *    tags each SSE event with an `id:` offset, so a dropped connection reconnects
 *    (`Last-Event-ID`) and resumes without re-running the model. Swap it for
 *    `durableStream(request, { server })` from `@tanstack/ai-durable-stream` in
 *    production (memoryStream is process-local).
 *
 * The store is shared with the page's history server function (see
 * `../lib/persistent-chat-store`), which the loader calls to hydrate the
 * transcript on load — the client runs server-authoritative
 * (`persistence: { store, messages: false }`) and keeps no messages of its own.
 */

export const Route = createFileRoute('/api/persistent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const abortController = new AbortController()
        const params = await chatParamsFromRequestBody(await request.json())

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          // `withPersistence` loads the stored transcript when `messages` is
          // empty and overwrites it (authoritative-history contract) on finish.
          middleware: [withPersistence(persistence)],
          agentLoopStrategy: maxIterations(10),
          systemPrompts: [SYSTEM_PROMPT],
          tools: [getWeather, rollDice],
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          abortController,
        })

        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
          abortController,
        })
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
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        return reconstructChat(persistence, request)
      },
    },
  },
})
