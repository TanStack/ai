import { createFileRoute } from '@tanstack/react-router'
import {
  INTERRUPT_BINDING_METADATA_KEY,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  digestInterruptJson,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'

const oursResponseSchema = {
  type: 'object',
  properties: { confirmed: { type: 'boolean' } },
  required: ['confirmed'],
}

/**
 * A provider-free harness route that ends a run with TWO interrupts:
 *
 * - `ours`, carrying a resume binding — resumable through the chat resume
 *   path.
 * - `theirs`, carrying no binding at all — the shape another producer on the
 *   same AG-UI stream emits (a workflow engine's durable approval, another
 *   agent framework's pause).
 *
 * The client must surface `theirs` as `kind: 'unbound'` with no resolver
 * instead of inventing a binding for it, and must still let `ours` be
 * resolved and submitted.
 */
function foreignRun(
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
            id: 'ours',
            reason: 'confirmation',
            message: 'Confirm the shipment?',
            responseSchema: oursResponseSchema,
            metadata: {
              [INTERRUPT_BINDING_METADATA_KEY]: {
                v: INTERRUPT_BINDING_VERSION,
                kind: 'generic',
                interruptId: 'ours',
                interruptedRunId: runId,
                generation: 0,
                responseSchemaHash: digestInterruptJson(
                  canonicalInterruptJson(oursResponseSchema),
                ),
              },
            },
          },
          {
            id: 'theirs',
            reason: 'approval_requested',
            message: 'Approve the deployment?',
            metadata: { 'acme:workflowApproval': { stepId: 'deploy' } },
          },
        ],
      },
    } as StreamChunk
  })()
}

/**
 * The continuation run. Reaching this at all is the assertion: it only happens
 * if the client submitted a resume batch, which it can only do if the unbound
 * interrupt was excluded from the batch-completeness gate.
 */
function resumedRun(
  threadId: string,
  runId: string,
  resumedIds: Array<string>,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield {
      type: 'RUN_STARTED',
      threadId,
      runId,
      timestamp: Date.now(),
    } as StreamChunk
    const text = `resumed:${resumedIds.join(',')}`
    yield {
      type: 'TEXT_MESSAGE_START',
      messageId: 'resumed',
      role: 'assistant',
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'resumed',
      delta: text,
      content: text,
      timestamp: Date.now(),
    } as StreamChunk
    yield {
      type: 'TEXT_MESSAGE_END',
      messageId: 'resumed',
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

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function resumedInterruptIds(body: unknown): Array<string> {
  if (typeof body !== 'object' || body === null || !('resume' in body)) {
    return []
  }
  const resume: unknown = (body as Record<string, unknown>)['resume']
  if (!Array.isArray(resume)) return []
  return resume.flatMap((entry: unknown) => {
    const id = stringField(entry, 'interruptId')
    return id === undefined ? [] : [id]
  })
}

export const Route = createFileRoute('/api/foreign-interrupt')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'thread-1'
        const resumed = resumedInterruptIds(body)
        if (resumed.length > 0) {
          return toServerSentEventsResponse(
            resumedRun(threadId, `run-${threadId}-continuation`, resumed),
          )
        }
        return toServerSentEventsResponse(
          foreignRun(threadId, `run-${threadId}`),
        )
      },
    },
  },
})
