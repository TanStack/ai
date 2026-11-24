import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import type { ResumableConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const cartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add to cart',
  inputSchema: z.object({ guitarId: z.string() }),
  needsApproval: true,
}).client((args) => ({ success: true, ...args }))

type RunContext = { runId?: string; threadId?: string } | undefined

function approvalRun(context: RunContext): Array<StreamChunk> {
  const approval = normalizeApprovalSchema(undefined, cartTool.inputSchema)
  const input = { guitarId: '1' }
  const runId = context?.runId ?? 'r1'
  const threadId = context?.threadId ?? 't1'
  return [
    { type: EventType.RUN_STARTED, runId, threadId, timestamp: 1 },
    {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      timestamp: 2,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'approval_tc1',
            reason: 'tool_call',
            toolCallId: 'tc1',
            responseSchema: approval.responseSchema,
            metadata: {
              kind: 'approval',
              toolName: 'addToCart',
              input,
              'tanstack:interruptBinding': {
                kind: 'tool-approval',
                interruptId: 'approval_tc1',
                interruptedRunId: runId,
                generation: 0,
                toolName: 'addToCart',
                toolCallId: 'tc1',
                originalArgs: input,
                inputSchemaHash: hashSchemaInput(cartTool.inputSchema),
                approvalSchemaHash: approval.approvalSchemaHash,
                responseSchemaHash: approval.responseSchemaHash,
              },
            },
          },
        ],
      },
    },
  ]
}

/** The resumed run: the server may commit the answer, then the model fails. */
function failedContinuation(
  context: RunContext,
  committed: boolean,
): Array<StreamChunk> {
  const runId = context?.runId ?? 'r2'
  const threadId = context?.threadId ?? 't1'
  return [
    { type: EventType.RUN_STARTED, runId, threadId, timestamp: 3 },
    ...(committed
      ? [
          {
            type: EventType.CUSTOM,
            name: 'interrupts:committed',
            value: { interruptIds: ['approval_tc1'] },
            timestamp: 4,
          } as StreamChunk,
        ]
      : []),
    {
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      message: 'provider 500',
      timestamp: 5,
    } as StreamChunk,
  ]
}

function connectionFor(committed: boolean) {
  let call = 0
  const connection: ResumableConnectConnectionAdapter = {
    async *connect(_messages, _data, _signal, context) {
      const chunks =
        call++ === 0
          ? approvalRun(context)
          : failedContinuation(context, committed)
      for (const chunk of chunks) yield chunk
    },
    joinRun: async function* () {},
  }
  return connection
}

async function approveAndSettle(client: ChatClient) {
  await client.sendMessage('add the guitar')
  const interrupt = client.getInterrupts()[0]
  if (interrupt?.kind !== 'tool-approval') throw new Error('no approval')
  interrupt.resolveInterrupt(true)
  await vi.waitFor(() => {
    expect(client.getInterruptState().resuming).toBe(false)
    expect(client.getIsLoading()).toBe(false)
  })
}

describe('an approval that the server committed before the model failed', () => {
  it('does not show the approval again', async () => {
    const client = new ChatClient({
      connection: connectionFor(true),
      threadId: 't1',
      tools: [cartTool],
    })

    await approveAndSettle(client)

    expect(client.getInterrupts()).toEqual([])
    expect(client.getResumeState()).toBeNull()
  })

  it('shows the approval again when the server did not commit it', async () => {
    const client = new ChatClient({
      connection: connectionFor(false),
      threadId: 't1',
      tools: [cartTool],
    })

    await approveAndSettle(client)

    expect(client.getInterrupts().map((item) => item.id)).toEqual([
      'approval_tc1',
    ])
  })

  it('asks the server for the state when persistence is on and no signal came', async () => {
    const connection = connectionFor(false)
    const hydrate = vi.fn(async () => ({
      messages: [],
      activeRun: null,
      // The server did use the answer: nothing is pending.
      interrupts: null,
    }))
    const client = new ChatClient({
      connection: { ...connection, hydrate },
      threadId: 't1',
      tools: [cartTool],
      persistence: true,
    })
    client.attach()
    await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1))

    await approveAndSettle(client)

    await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(client.getInterrupts()).toEqual([]))
    client.dispose()
  })
})
