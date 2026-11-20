import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EventType,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  convertSchemaToJsonSchema,
  digestInterruptJson,
  hashSchemaInput,
  toolDefinition,
} from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import { registerWebMCPTools } from '../src/web-mcp-tools'
import { createTextChunks, createToolCallChunks } from './test-utils'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const SERVER_ONLY_MESSAGE =
  'setResultMetadata works only in server tools. A client tool can return the data in its output or keep it in app state.'

const metadataTool = toolDefinition({
  name: 'metadata_tool',
  description: 'Sets result metadata',
}).client((_input, context) => {
  // @ts-expect-error A client tool cannot set result metadata. The test checks the runtime throw for untyped callers.
  context?.setResultMetadata?.({})
  return 'ok'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client tool setResultMetadata', () => {
  it('gives the client tool call an error result', async () => {
    const turns = [
      createToolCallChunks([
        { id: 'tc-metadata', name: 'metadata_tool', arguments: '{}' },
      ]),
      createTextChunks('done', 'msg-done'),
    ]
    let turn = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect() {
        yield* turns[turn++] ?? []
      },
    }
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: adapter,
      tools: [metadataTool],
    })

    await client.sendMessage('go')

    const parts = client.getMessages().flatMap((message) => message.parts)
    expect(
      parts.find(
        (part) => part.type === 'tool-call' && part.id === 'tc-metadata',
      ),
    ).toMatchObject({
      state: 'error',
      output: { error: SERVER_ONLY_MESSAGE },
    })
  })

  it('rejects the WebMCP tool call', async () => {
    const tools = new Map<
      string,
      { execute: (input: object) => Promise<unknown> }
    >()
    vi.stubGlobal('document', {
      modelContext: {
        async registerTool(tool: {
          name: string
          execute: (input: object) => Promise<unknown>
        }) {
          tools.set(tool.name, tool)
        },
      },
    })

    await registerWebMCPTools([metadataTool], {
      signal: new AbortController().signal,
    })

    await expect(tools.get('metadata_tool')?.execute({})).rejects.toThrow(
      SERVER_ONLY_MESSAGE,
    )
  })

  it('sends a child request with the interrupt output-error resolution', async () => {
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up',
      inputSchema: z.object({ query: z.string() }),
    }).client((_input, context) => {
      // @ts-expect-error A client tool cannot set result metadata.
      context?.setResultMetadata?.({})
      return 'ok'
    })
    const outputSchemaHash = hashSchemaInput(lookup.outputSchema)
    const responseSchema = convertSchemaToJsonSchema(lookup.outputSchema) ?? {}
    const responseSchemaHash = digestInterruptJson(
      canonicalInterruptJson(responseSchema),
    )
    const contexts: Array<RunAgentInputContext | undefined> = []
    let connectCount = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, _signal, runContext) {
        contexts.push(runContext)
        connectCount++
        if (connectCount === 1) {
          const runId = runContext?.runId ?? 'run-1'
          const threadId = runContext?.threadId ?? 'thread-1'
          yield {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            timestamp: Date.now(),
          } satisfies StreamChunk
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'tool-call-1',
            toolCallName: 'lookup',
            timestamp: Date.now(),
          } satisfies StreamChunk
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'tool-call-1',
            delta: '{"query":"first"}',
            timestamp: Date.now(),
          } satisfies StreamChunk
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            timestamp: Date.now(),
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
                      v: INTERRUPT_BINDING_VERSION,
                      kind: 'client-tool-execution',
                      interruptId: 'client_tool_tool-call-1',
                      interruptedRunId: runId,
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
          } satisfies StreamChunk
          return
        }
        yield {
          type: EventType.RUN_STARTED,
          runId: runContext?.runId ?? 'run-2',
          threadId: runContext?.threadId ?? 'thread-1',
          timestamp: Date.now(),
        } satisfies StreamChunk
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          timestamp: Date.now(),
          delta: 'done',
        } satisfies StreamChunk
        yield {
          type: EventType.RUN_FINISHED,
          runId: runContext?.runId ?? 'run-2',
          threadId: runContext?.threadId ?? 'thread-1',
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        } satisfies StreamChunk
      },
    }

    const client = new ChatClient({
      connection: adapter,
      threadId: 'thread-1',
      tools: [lookup],
    })

    await client.sendMessage('hi')
    await vi.waitFor(() => {
      expect(connectCount).toBe(2)
    })

    expect(contexts[1]?.parentRunId).toBe(contexts[0]?.runId)
    expect(contexts[1]?.resume).toEqual([
      {
        interruptId: 'client_tool_tool-call-1',
        status: 'resolved',
        payload: { error: SERVER_ONLY_MESSAGE },
        metadata: { tanstack: { state: 'output-error' } },
      },
    ])
  })
})
