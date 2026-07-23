import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const cartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add to cart',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  needsApproval: true,
}).client((args) => ({ success: true, ...args }))

function adapter(scripts: Array<(ctx: unknown) => Array<StreamChunk>>) {
  let i = 0
  const contexts: Array<unknown> = []
  const a: ConnectConnectionAdapter = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async *connect(_messages, _d, _s, runContext) {
      contexts.push(runContext)
      const script = scripts[i++]
      for (const c of script?.(runContext) ?? []) yield c
    },
  }
  return { adapter: a, contexts }
}

describe('tool-approval follow-up after resolve', () => {
  it('clears interrupts and allows a second user turn', async () => {
    const approval = normalizeApprovalSchema(undefined, cartTool.inputSchema)
    const input = { guitarId: '1', quantity: 1 }
    type Ctx = { runId?: string; threadId?: string } | undefined
    const { adapter: a, contexts } = adapter([
      // 1) interrupt
      (ctx) => {
        const c = ctx as Ctx
        const runId = c?.runId ?? 'r1'
        const threadId = c?.threadId ?? 't1'
        return [
          {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          },
          {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: {
              type: 'interrupt',
              interrupts: [
                {
                  id: 'approval_tc1',
                  reason: 'tool_call',
                  toolCallId: 'tc1',
                  message: 'Approval required',
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
      },
      // 2) resume continuation
      (ctx) => {
        const c = ctx as Ctx
        const runId = c?.runId ?? 'r2'
        const threadId = c?.threadId ?? 't1'
        return [
          {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'm1',
            role: 'assistant',
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'm1',
            delta: "I've added the Fender Stratocaster to your cart.",
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'm1',
            timestamp: Date.now(),
          },
          {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: { type: 'success' },
          },
        ]
      },
      // 3) follow-up
      (ctx) => {
        const c = ctx as Ctx
        const runId = c?.runId ?? 'r3'
        const threadId = c?.threadId ?? 't1'
        return [
          {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'm2',
            role: 'assistant',
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'm2',
            delta: 'Here is the follow-up reply: nothing else needed.',
            timestamp: Date.now(),
          },
          {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'm2',
            timestamp: Date.now(),
          },
          {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
            outcome: { type: 'success' },
          },
        ]
      },
    ])

    const client = new ChatClient({
      connection: a,
      threadId: 't1',
      tools: [cartTool],
    })

    await client.sendMessage('[approval] add the stratocaster to my cart')
    expect(client.getInterrupts()).toHaveLength(1)
    const interrupt = client.getInterrupts()[0]
    expect(interrupt?.kind).toBe('tool-approval')
    if (interrupt?.kind !== 'tool-approval') {
      throw new Error('expected tool-approval')
    }
    interrupt.resolveInterrupt(true)

    await vi.waitFor(() => {
      expect(client.getInterrupts()).toEqual([])
      expect(client.getResumeState()).toBeNull()
    })

    await client.sendMessage('[approval] follow-up: anything else?')
    expect(contexts).toHaveLength(3)
    const followUpText = client
      .getMessages()
      .flatMap((m) => m.parts)
      .filter((p) => p.type === 'text')
      .map((p) => ('content' in p ? String(p.content) : ''))
      .join('\n')
    expect(followUpText).toContain('follow-up')
  })
})
