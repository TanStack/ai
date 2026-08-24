import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  canonicalInterruptJson,
  convertSchemaToJsonSchema,
  digestInterruptJson,
  hashSchemaInput,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import { createUIMessage } from './test-utils'
import type {
  ResumableConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'
import type { ChatClientPersistence, ChatPersistedState } from '../src/types'

function memoryPersistence(initial: ChatPersistedState): ChatClientPersistence {
  let value: ChatPersistedState | undefined = initial
  return {
    getItem: () => value,
    setItem: (_id, state) => {
      value = state
    },
    removeItem: () => {
      value = undefined
    },
  }
}

function mountedChatClient(
  options: ConstructorParameters<typeof ChatClient>[0],
) {
  const client = new ChatClient(options)
  client.attach()
  return client
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Regression for https://github.com/TanStack/ai/issues/1058
 *
 * A joinRun replay that ends on a client tool queues the resume while
 * `isLoading` is true. Live `streamResponse` drains that queue in `finally`.
 * Rejoin used its own teardown and never drained, so the tool result never
 * went back to the server and later sends stayed blocked.
 */
describe('joinRun client-tool continuation (issue #1058)', () => {
  it('posts the client-tool result after joinRun replay ends', async () => {
    const outputSchema = z.object({ answer: z.number() })
    const toolGate = createDeferred()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up',
      inputSchema: z.object({ query: z.string() }),
      outputSchema,
    }).client(async () => {
      await toolGate.promise
      return { answer: 42 }
    })
    const outputSchemaHash = hashSchemaInput(outputSchema)
    const responseSchema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            state: { const: 'output-available' },
            output: convertSchemaToJsonSchema(outputSchema) ?? {},
          },
          required: ['state', 'output'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            state: { const: 'output-error' },
            errorText: { type: 'string' },
          },
          required: ['state', 'errorText'],
          additionalProperties: false,
        },
      ],
    }
    const responseSchemaHash = digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    )

    const joinHold = createDeferred()
    const connectContexts: Array<RunAgentInputContext | undefined> = []
    let connectCount = 0

    const replayChunks: Array<StreamChunk> = [
      {
        type: EventType.RUN_STARTED,
        runId: 'r1',
        threadId: 't1',
        timestamp: 1,
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tool-call-1',
        toolCallName: 'lookup',
        toolName: 'lookup',
        timestamp: 2,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'tool-call-1',
        delta: '{"query":"first"}',
        timestamp: 3,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'r1',
        threadId: 't1',
        timestamp: 4,
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_tool-call-1',
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'tool-call-1',
              responseSchema,
              metadata: {
                kind: 'client_tool',
                toolName: 'lookup',
                input: { query: 'first' },
                'tanstack:interruptBinding': {
                  kind: 'client-tool-execution',
                  interruptId: 'client_tool_tool-call-1',
                  interruptedRunId: 'r1',
                  generation: 0,
                  toolName: 'lookup',
                  toolCallId: 'tool-call-1',
                  outputSchemaHash,
                  responseSchemaHash,
                },
              },
            },
          ],
        },
      },
    ]

    const joinRun = vi.fn(async function* (_runId: string) {
      for (const chunk of replayChunks) {
        yield chunk
      }
      await joinHold.promise
    })

    const connection: ResumableConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, runContext) {
        connectCount++
        connectContexts.push(runContext)
        yield {
          type: EventType.RUN_STARTED,
          runId: runContext?.runId ?? 'r2',
          threadId: runContext?.threadId ?? 't1',
          timestamp: 10,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          timestamp: 11,
          delta: 'done',
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: runContext?.runId ?? 'r2',
          threadId: runContext?.threadId ?? 't1',
          timestamp: 12,
          finishReason: 'stop',
        }
      },
      joinRun,
    }

    const client = mountedChatClient({
      threadId: 't1',
      connection,
      persistence: memoryPersistence({
        messages: [createUIMessage('user-1', 'hi', 'user')],
        resume: {
          resumeState: { threadId: 't1', runId: 'r1' },
        },
      }),
      tools: [lookup],
    })

    await vi.waitFor(() => {
      expect(joinRun).toHaveBeenCalledWith('r1', expect.anything())
    })
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }

    toolGate.resolve()
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }

    joinHold.resolve()

    await vi.waitFor(() => {
      expect(connectCount).toBe(1)
    })

    expect(connectContexts[0]?.parentRunId).toBe('r1')
    expect(connectContexts[0]?.resume).toEqual([
      {
        interruptId: 'client_tool_tool-call-1',
        status: 'resolved',
        payload: { state: 'output-available', output: { answer: 42 } },
      },
    ])
    expect(client.getInterruptState().interruptErrors).toEqual([])

    await vi.waitFor(() => {
      expect(client.getInterrupts()).toEqual([])
      expect(client.getIsLoading()).toBe(false)
    })

    await client.sendMessage('later')
    expect(connectCount).toBe(2)
  })
})
