import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ModelMessage, StreamChunk, UIMessage } from '../src/types'

/** A server tool that sets app result metadata, then returns `{ temp: 20 }`. */
const weatherTool = toolDefinition({
  name: 'weather',
  description: 'Get the weather',
  inputSchema: z.object({}),
}).server((_input, ctx) => {
  ctx?.setResultMetadata?.({ source: 'cache', secret: 's3cr3t' })
  return { temp: 20 }
})

const finalTurn = [
  ev.runStarted(),
  ev.textStart('msg-2'),
  ev.textContent('Done.', 'msg-2'),
  ev.textEnd('msg-2'),
  ev.runFinished('stop'),
]

/** A model turn that calls `name` once with id `call_1`. */
function toolCallTurn(name: string) {
  return [
    ev.runStarted(),
    ev.toolStart('call_1', name),
    ev.toolArgs('call_1', '{}'),
    ev.toolEnd('call_1'),
    ev.runFinished('tool_calls'),
  ]
}

/** Run `chat()` and keep the stream chunks and the final transcript. */
async function runChat(options: {
  iterations: Array<Array<StreamChunk>>
  messages: Array<ModelMessage> | Array<UIMessage>
  tools: Parameters<typeof chat>[0]['tools']
  onAfterToolCall?: ChatMiddleware['onAfterToolCall']
}) {
  const { adapter, calls } = createMockAdapter({
    iterations: options.iterations,
  })
  let transcript: Array<ModelMessage> = []
  const chunks = await collectChunks(
    chat({
      threadId: 'thread-1',
      adapter,
      messages: options.messages,
      tools: options.tools,
      middleware: [
        defineChatMiddleware({
          onAfterToolCall: options.onAfterToolCall,
          onFinish(ctx) {
            transcript = [...ctx.messages]
          },
        }),
      ],
    }) as AsyncIterable<StreamChunk>,
  )
  const resultChunk = chunks.find(
    (c) => c.type === EventType.TOOL_CALL_RESULT && c.toolCallId === 'call_1',
  )
  return { calls, resultChunk, transcript }
}

function toolMessage(messages: Array<ModelMessage>) {
  return messages.find((m) => m.role === 'tool' && m.toolCallId === 'call_1')
}

describe('chat() tool result metadata', () => {
  it('sends the metadata on the chunk and the tool message, not to the model', async () => {
    const { calls, resultChunk, transcript } = await runChat({
      iterations: [toolCallTurn('weather'), finalTurn],
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool],
    })

    expect(resultChunk).toMatchObject({
      content: '{"temp":20}',
      metadata: { source: 'cache', secret: 's3cr3t' },
    })
    expect(toolMessage(transcript)?.metadata).toEqual({
      source: 'cache',
      secret: 's3cr3t',
    })

    // The app keys stay in `metadata`. The engine does not copy them into a
    // field that an adapter sends (content, tool calls). Each adapter must
    // ignore `metadata`; the E2E spec checks this for a real adapter.
    const nextRequest: Array<ModelMessage> = calls[1]!.messages
    expect(toolMessage(nextRequest)?.content).toBe('{"temp":20}')
    expect(toolMessage(nextRequest)?.metadata).toMatchObject({
      secret: 's3cr3t',
    })
    const withoutMetadata = nextRequest.map(
      ({ metadata: _app, ...rest }) => rest,
    )
    expect(JSON.stringify(withoutMetadata)).not.toContain('s3cr3t')
  })

  it('keeps the app keys and the error state on an error result', async () => {
    const failingTool = toolDefinition({
      name: 'failing',
      description: 'Set metadata, then throw',
      inputSchema: z.object({}),
    }).server((_input, ctx) => {
      ctx?.setResultMetadata?.({ attempt: 2 })
      throw new Error('disk full')
    })

    const { resultChunk, transcript } = await runChat({
      iterations: [toolCallTurn('failing'), finalTurn],
      messages: [{ role: 'user', content: 'Try it' }],
      tools: [failingTool],
    })

    expect(resultChunk?.metadata).toEqual({
      attempt: 2,
      tanstack: { state: 'output-error' },
    })
    expect(toolMessage(transcript)).toMatchObject({
      error: 'disk full',
      metadata: { attempt: 2 },
    })
  })

  it('puts replaceResult metadata on a call that the output limit cut', async () => {
    const { resultChunk } = await runChat({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call_1', 'weather'),
          ev.toolArgs('call_1', '{"q":'),
          ev.runFinished('length'),
        ],
      ],
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool],
      onAfterToolCall: () => ({
        type: 'replaceResult',
        result: 'Cut off. Send it again.',
        metadata: { retry: true, tanstack: { state: 'x' } },
      }),
    })

    expect(resultChunk).toMatchObject({ content: 'Cut off. Send it again.' })
    expect(resultChunk?.metadata).toEqual({
      retry: true,
      tanstack: { state: 'output-error' },
    })
  })

  it('emits the metadata for an approved tool on the continuation path', async () => {
    const { calls, resultChunk } = await runChat({
      iterations: [finalTurn],
      messages: [
        {
          id: 'm-user',
          role: 'user',
          parts: [{ type: 'text', content: 'Weather?' }],
        },
        {
          id: 'm-assistant',
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              id: 'call_1',
              name: 'weather',
              arguments: '{}',
              state: 'approval-responded',
              approval: {
                id: 'approval_call_1',
                needsApproval: true,
                approved: true,
              },
            },
          ],
        },
      ],
      tools: [{ ...weatherTool, needsApproval: true }],
    })

    expect(resultChunk?.metadata).toEqual({
      source: 'cache',
      secret: 's3cr3t',
    })
    expect(toolMessage(calls[0]!.messages)).toMatchObject({
      content: '{"temp":20}',
      metadata: { source: 'cache', secret: 's3cr3t' },
    })
  })
})
