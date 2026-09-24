import { describe, expect, it, vi } from 'vitest'
import {
  chat,
  defineAgent,
  toolDefinition,
  uiMessagesToWire,
} from '@tanstack/ai'
import { z } from 'zod'
import { EventType } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

/** A model that plays one script per call. */
function scriptedAdapter(scripts: Array<Array<StreamChunk>>): AnyTextAdapter {
  let call = 0
  return {
    kind: 'text',
    name: 'scripted',
    model: 'test-model',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: () => {
      const script = scripts[call++] ?? []
      return (async function* () {
        await Promise.resolve()
        yield* script
      })()
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
}

const t = 1

// The app shares one definition. The server runs it. The client renders the
// approval for it.
const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  needsApproval: true,
  inputSchema: z.object({ path: z.string() }),
})

describe('ChatClient subagent interrupts', () => {
  it('approves a child tool call and finishes the child', async () => {
    const execute = vi.fn().mockReturnValue({ deleted: true })
    const childModel = scriptedAdapter([
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'c1',
          threadId: 'c',
          timestamp: t,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call_c',
          toolCallName: 'deleteFile',
          toolName: 'deleteFile',
          timestamp: t,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call_c',
          delta: '{"path":"a"}',
          timestamp: t,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'c1',
          threadId: 'c',
          finishReason: 'tool_calls',
          timestamp: t,
        },
      ],
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'c2',
          threadId: 'c',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'done',
          role: 'assistant',
          timestamp: t,
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'done',
          delta: 'Deleted a',
          timestamp: t,
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'done', timestamp: t },
        {
          type: EventType.RUN_FINISHED,
          runId: 'c2',
          threadId: 'c',
          finishReason: 'stop',
          timestamp: t,
        },
      ],
    ] as Array<Array<StreamChunk>>)
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Deletes files',
      run: (ctx) =>
        chat({
          adapter: childModel,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
          parentRunId: ctx.parentRunId,
          subagentRunId: ctx.subagentRunId,
          resume: ctx.resume,
          tools: [deleteFile.server(execute)],
        }),
    })

    // The connection plays the server: the body is the wire JSON.
    const connection: ConnectConnectionAdapter = {
      connect: (messages, _data, _signal, runContext) =>
        chat({
          adapter: scriptedAdapter([]),
          messages: JSON.parse(
            JSON.stringify(uiMessagesToWire(messages)),
          ) as Array<ModelMessage>,
          threadId: runContext?.threadId ?? 't',
          runId: runContext?.runId ?? 'run',
          ...(runContext?.parentRunId !== undefined && {
            parentRunId: runContext.parentRunId,
          }),
          ...(runContext?.resume !== undefined && {
            resume: runContext.resume,
          }),
          subagents: { agents: [cleaner], router: () => 'cleaner' },
        }),
    }

    const client = new ChatClient({
      connection,
      threadId: 't',
      tools: [deleteFile.client()],
    })
    await client.sendMessage('Clean up')

    const interrupts = client.getInterrupts()
    expect(interrupts).toHaveLength(1)
    const interrupt = interrupts[0]
    if (interrupt?.kind !== 'tool-approval') {
      throw new Error(`expected tool-approval, got ${interrupt?.kind}`)
    }
    expect(client.getSubagents()[0]).toMatchObject({
      name: 'cleaner',
      status: 'suspended',
      interruptIds: ['approval_call_c'],
    })

    interrupt.resolveInterrupt(true)
    await vi.waitFor(() => {
      expect(client.getIsLoading()).toBe(false)
      expect(client.getInterrupts()).toEqual([])
      expect(client.getSubagents()[0]?.status).toBe('finished')
    })

    expect(execute).toHaveBeenCalledWith({ path: 'a' }, expect.anything())
    const card = client.getSubagents()[0]
    const parts = card?.messages.flatMap((message) => message.parts) ?? []
    expect(parts).toContainEqual(
      expect.objectContaining({ type: 'tool-call', id: 'call_c' }),
    )
    expect(parts).toContainEqual({ type: 'text', content: 'Deleted a' })
  })
})
