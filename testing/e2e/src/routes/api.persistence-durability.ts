import { createFileRoute } from '@tanstack/react-router'
import {
  INTERRUPT_BINDING_METADATA_KEY,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  chat,
  digestInterruptJson,
  memoryStream,
  resumeServerSentEventsResponse,
  toolDefinition,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import { z } from 'zod'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness route for the browser-refresh persistence story. It
 * mirrors the production wiring of `examples/.../api.persistent-chat.ts` — a
 * `memoryStream(request)` delivery sink plus a GET resume handler that makes the
 * connection resumable — but uses fixed AG-UI sequences and a fixed adapter
 * instead of calling an LLM, so the e2e is deterministic with nothing to mock.
 *
 * Four scenarios (`?scenario=`):
 *
 * - `text` (default) — a run that streams one assistant text message and
 *   finishes cleanly (`outcome: success`). The client persists the transcript
 *   to its `localStoragePersistence` combined record; the resume half is
 *   cleared on the successful terminal. A reload restores the messages.
 * - `interrupt` — a run that ends on a single BOUND generic interrupt
 *   (carrying a resume binding, exactly like `api.foreign-interrupt`). The
 *   client folds the pending-interrupt resume snapshot into the SAME combined
 *   record, so a reload rehydrates the interrupt from `localStorage` alone
 *   (no server round-trip).
 * - `server-interrupt` — the SERVER-authoritative counterpart. The client runs
 *   `persistence: true` (caches nothing), so on mount it hydrates from the
 *   GET below, which returns a `reconstructChat`-shaped JSON carrying a pending
 *   interrupt. Proves a fresh client (empty `localStorage`) re-prompts the
 *   approval from the server alone — the path that was previously broken.
 * - `structured-output` — runs separate structured-output finalization through
 *   `withPersistence`, then hydrates the completed structured-output part from
 *   the server through `reconstructChat`.
 *
 * Exempt from the aimock policy: this route never reaches an LLM provider's HTTP
 * layer, so there is nothing to mock.
 */

const REPLY_TEXT = 'PERSIST_OK the lighthouse still turns.'

const structuredOutputPersistence = memoryPersistence()
const structuredOutputSchema = z.object({ name: z.string() })
const structuredOutputTool = toolDefinition({
  name: 'lookup_programmer',
  description: 'Look up a programmer',
  inputSchema: z.object({}),
}).server(() => ({ found: true }))
const structuredOutputAdapter: AnyTextAdapter = {
  kind: 'text',
  name: 'fixed',
  model: 'test-model',
  '~types': {},
  chatStream: ({ threadId, runId }: { threadId: string; runId: string }) =>
    textRun(threadId, runId),
  structuredOutput: () =>
    Promise.resolve({
      data: { name: 'Ada Lovelace' },
      rawText: '{"name":"Ada Lovelace"}',
    }),
} as unknown as AnyTextAdapter

const confirmSchema = {
  type: 'object',
  properties: { confirmed: { type: 'boolean' } },
  required: ['confirmed'],
}

function textRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: 'assistant-1',
      role: 'assistant',
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'assistant-1',
      delta: REPLY_TEXT,
      content: REPLY_TEXT,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_END',
      messageId: 'assistant-1',
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
      outcome: { type: 'success' },
    } as StreamChunk
  })()
}

function interruptRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'RUN_FINISHED',
      threadId,
      runId,
      timestamp: Date.now(),
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'confirm-shipment',
            reason: 'confirmation',
            message: 'Confirm the shipment?',
            responseSchema: confirmSchema,
            metadata: {
              [INTERRUPT_BINDING_METADATA_KEY]: {
                v: INTERRUPT_BINDING_VERSION,
                kind: 'generic',
                interruptId: 'confirm-shipment',
                interruptedRunId: runId,
                generation: 0,
                responseSchemaHash: digestInterruptJson(
                  canonicalInterruptJson(confirmSchema),
                ),
              },
            },
          },
        ],
      },
    } as StreamChunk
  })()
}

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function scenarioOf(
  request: Request,
): 'text' | 'interrupt' | 'server-interrupt' | 'structured-output' {
  try {
    const value = new URL(request.url).searchParams.get('scenario')
    if (value === 'interrupt') return 'interrupt'
    if (value === 'server-interrupt') return 'server-interrupt'
    if (value === 'structured-output') return 'structured-output'
    return 'text'
  } catch {
    return 'text'
  }
}

// The pending interrupt a server-authoritative client rehydrates from the GET
// below. It is the same BOUND generic interrupt shape the `interrupt` run ends
// on, but delivered as `reconstructChat`'s `interrupts.pending[]` payload rather
// than a live terminal — so the client restores it from the server on mount.
const SERVER_INTERRUPT_RUN_ID = 'server-interrupt-run'

function serverInterruptReconstruction(): {
  messages: []
  activeRun: null
  interrupts: { runId: string; pending: Array<Record<string, unknown>> }
} {
  return {
    messages: [],
    activeRun: null,
    interrupts: {
      runId: SERVER_INTERRUPT_RUN_ID,
      pending: [
        {
          id: 'confirm-shipment',
          reason: 'confirmation',
          message: 'Confirm the shipment?',
          responseSchema: confirmSchema,
          metadata: {
            [INTERRUPT_BINDING_METADATA_KEY]: {
              v: INTERRUPT_BINDING_VERSION,
              kind: 'generic',
              interruptId: 'confirm-shipment',
              interruptedRunId: SERVER_INTERRUPT_RUN_ID,
              generation: 0,
              responseSchemaHash: digestInterruptJson(
                canonicalInterruptJson(confirmSchema),
              ),
            },
          },
        },
      ],
    },
  }
}

export const Route = createFileRoute('/api/persistence-durability')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'persistence-thread'
        const runId = stringField(body, 'runId') ?? crypto.randomUUID()
        if (scenarioOf(request) === 'structured-output') {
          const stream = chat({
            adapter: structuredOutputAdapter,
            messages: [{ role: 'user', content: 'Name the programmer' }],
            tools: [structuredOutputTool],
            outputSchema: structuredOutputSchema,
            stream: true,
            threadId,
            runId,
            middleware: [withPersistence(structuredOutputPersistence)],
          })
          for await (const _ of stream) void _
          return Response.json({ runId, threadId })
        }
        const stream =
          scenarioOf(request) === 'interrupt'
            ? interruptRun(threadId, runId)
            : textRun(threadId, runId)
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // GET serves two jobs off one route, mirroring the production wiring:
      //
      // 1. Delivery replay — re-attach to an in-flight run by id
      //    (`?offset=-1&runId=…`). Detected via the durability adapter's
      //    `resumeFrom()`. Read-only: no producer stream is built.
      // 2. Server-authoritative hydration — the `persistence: true` client's mount
      //    probe (a plain `?threadId=` GET, no resume cursor). Returns a
      //    `reconstructChat`-shaped JSON; the `server-interrupt` scenario carries
      //    a pending approval so a fresh client re-prompts it from the server.
      GET: ({ request }) => {
        if (scenarioOf(request) === 'structured-output') {
          return reconstructChat(structuredOutputPersistence, request, {
            authorize: (threadId) => threadId.length > 0,
          })
        }
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }
        const body =
          scenarioOf(request) === 'server-interrupt'
            ? serverInterruptReconstruction()
            : { messages: [], activeRun: null, interrupts: null }
        return new Response(JSON.stringify(body), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
