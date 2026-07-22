import { createFileRoute } from '@tanstack/react-router'
import {
  INTERRUPT_BINDING_METADATA_KEY,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  digestInterruptJson,
  memoryStream,
  resumeServerSentEventsResponse,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

/**
 * Provider-free harness route for the browser-refresh persistence story. It
 * mirrors the production wiring of `examples/.../api.persistent-chat.ts` — a
 * `memoryStream(request)` delivery sink plus a GET resume handler that makes the
 * connection resumable — but streams a FIXED AG-UI sequence instead of calling
 * an LLM, so the e2e is deterministic with nothing to mock.
 *
 * Two scenarios (`?scenario=`):
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
 *
 * Exempt from the aimock policy: this route streams a fixed AG-UI sequence and
 * never reaches an LLM provider's HTTP layer, so there is nothing to mock.
 */

const REPLY_TEXT = 'PERSIST_OK the lighthouse still turns.'

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

function scenarioOf(request: Request): 'text' | 'interrupt' {
  try {
    return new URL(request.url).searchParams.get('scenario') === 'interrupt'
      ? 'interrupt'
      : 'text'
  } catch {
    return 'text'
  }
}

export const Route = createFileRoute('/api/persistence-durability')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'persistence-thread'
        const runId = stringField(body, 'runId') ?? crypto.randomUUID()
        const stream =
          scenarioOf(request) === 'interrupt'
            ? interruptRun(threadId, runId)
            : textRun(threadId, runId)
        return toServerSentEventsResponse(stream, {
          durability: { adapter: memoryStream(request) },
        })
      },

      // Replay a run from the log so a full reload can re-attach to an in-flight
      // run by id (`?offset=-1&runId=…`). Read-only: no producer stream is built.
      GET: ({ request }) => {
        return resumeServerSentEventsResponse({
          adapter: memoryStream(request),
        })
      },
    },
  },
})
