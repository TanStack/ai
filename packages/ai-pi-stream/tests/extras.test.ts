import { describe, expect, it } from 'vitest'
import { EventSchemas } from '@ag-ui/core/schemas'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { fauxAssistantMessage } from '@earendil-works/pi-ai'
import { z } from 'zod'
import {
  chatParamsFromPiRequestBody,
  fromPiAgentEvents,
  fromPiMessages,
  toPiAgentEvents,
  toPiMessages,
} from '../src'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { PiBridgeEvent } from '../src'

async function collect<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const item of stream) out.push(item)
  return out
}

async function* list<T>(items: Array<T>): AsyncGenerator<T> {
  yield* items
}

const image = { type: 'image' as const, data: 'aGk=', mimeType: 'image/png' }

describe('pi agent to TanStack', () => {
  it('sends progress, mid-run messages, cost, images and redacted reasoning', async () => {
    const assistant: AssistantMessage = {
      ...fauxAssistantMessage(
        [
          {
            type: 'thinking',
            thinking: '',
            thinkingSignature: 'opaque',
            redacted: true,
          },
          { type: 'toolCall', id: 'c1', name: 'screenshot', arguments: {} },
        ],
        { stopReason: 'toolUse' },
      ),
    }
    assistant.usage.cost.total = 0.25
    const result: ToolResultMessage = {
      role: 'toolResult',
      toolCallId: 'c1',
      toolName: 'screenshot',
      content: [{ type: 'text', text: 'Here.' }, image],
      isError: false,
      timestamp: 1,
    }
    const steer = { role: 'user' as const, content: 'Faster.', timestamp: 2 }
    const secret = {
      role: 'system' as const,
      content: 'Secret rules.',
      timestamp: 3,
    }
    const events: Array<AgentEvent> = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'message_start',
        message: { role: 'user', content: 'Go', timestamp: 0 },
      },
      {
        type: 'message_end',
        message: { role: 'user', content: 'Go', timestamp: 0 },
      },
      { type: 'message_start', message: assistant },
      {
        type: 'message_update',
        message: assistant,
        assistantMessageEvent: {
          type: 'thinking_start',
          contentIndex: 0,
          partial: assistant,
        },
      },
      {
        type: 'message_update',
        message: assistant,
        assistantMessageEvent: {
          type: 'thinking_end',
          contentIndex: 0,
          content: '',
          partial: assistant,
        },
      },
      { type: 'message_end', message: assistant },
      {
        type: 'tool_execution_update',
        toolCallId: 'c1',
        toolName: 'screenshot',
        args: {},
        partialResult: { percent: 50 },
      },
      { type: 'message_start', message: result },
      { type: 'message_end', message: result },
      { type: 'message_start', message: steer },
      { type: 'message_end', message: steer },
      { type: 'message_end', message: secret },
      { type: 'turn_end', message: assistant, toolResults: [result] },
      { type: 'agent_end', messages: [assistant, result, steer] },
    ]

    const out = await collect(
      fromPiAgentEvents(list(events), { threadId: 't', runId: 'r' }),
    )
    for (const event of out) EventSchemas.parse(event)

    expect(
      out.find((e) => e.type === EventType.REASONING_MESSAGE_START),
    ).toMatchObject({
      messageId: expect.stringMatching(/^redacted_thinking-/),
    })
    expect(out.filter((e) => e.type === EventType.CUSTOM)).toMatchObject([
      {
        name: 'pi.tool-progress',
        value: { toolCallId: 'c1', partialResult: { percent: 50 } },
      },
      { name: 'pi.message', value: { role: 'user', content: 'Faster.' } },
    ])
    expect(
      out.find((e) => e.type === EventType.TOOL_CALL_RESULT),
    ).toMatchObject({
      content: JSON.stringify([
        { type: 'text', content: 'Here.' },
        {
          type: 'image',
          source: { type: 'data', value: 'aGk=', mimeType: 'image/png' },
        },
      ]),
    })
    expect(out.find((e) => e.type === EventType.RUN_FINISHED)).toMatchObject({
      finishReason: 'tool_calls',
      metadata: { tanstack: { usage: { cost: 0.25 } } },
    })
    // The prompt is not sent back, and pi system messages stay on the server.
    expect(JSON.stringify(out)).not.toContain('"Go"')
    expect(JSON.stringify(out)).not.toContain('Secret rules.')
  })
})

/** A text adapter that plays one list of events per model call. */
function scriptedAdapter(steps: Array<Array<StreamChunk>>): AnyTextAdapter {
  let calls = 0
  return {
    kind: 'text',
    name: 'scripted',
    model: 'scripted-1',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options) {
      const step = steps[calls++]
      if (!step) throw new Error('No more steps')
      yield {
        type: EventType.RUN_STARTED,
        runId: options.runId ?? 'run',
        threadId: options.threadId ?? 't',
      }
      yield* step
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  }
}

describe('TanStack to pi client', () => {
  it('sends state, activity and custom events as tanstack-event messages, with cost and redacted reasoning', async () => {
    const events: Array<StreamChunk> = [
      { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' },
      { type: EventType.STATE_SNAPSHOT, snapshot: { step: 1 } },
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'a1',
        activityType: 'search',
        content: { hits: 3 },
      },
      { type: EventType.CUSTOM, name: 'progress', value: { step: 1 } },
      {
        type: EventType.REASONING_MESSAGE_START,
        messageId: 'redacted_thinking-1',
        role: 'reasoning',
      },
      {
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'message',
        entityId: 'redacted_thinking-1',
        encryptedValue: 'opaque',
      },
      {
        type: EventType.REASONING_MESSAGE_END,
        messageId: 'redacted_thinking-1',
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 't',
        runId: 'r',
        finishReason: 'stop',
        usage: {
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          cost: 0.5,
        },
      },
    ]
    const out = await collect(toPiAgentEvents(list(events)))

    const custom = out.flatMap((e) =>
      e.type === 'message_end' &&
      'role' in e.message &&
      e.message.role === 'tanstack-event'
        ? [e.message.event.type]
        : [],
    )
    expect(custom).toEqual([
      EventType.STATE_SNAPSHOT,
      EventType.ACTIVITY_SNAPSHOT,
      EventType.CUSTOM,
    ])
    const end = out.at(-1)
    if (end?.type !== 'agent_end') throw new Error('No agent_end')
    expect(end.messages).toMatchObject([
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinkingSignature: 'opaque', redacted: true },
        ],
        usage: { totalTokens: 3, cost: { total: 0.5 } },
      },
    ])
  })

  it('sends a multimodal tool result to pi as text and image content', async () => {
    const shot = toolDefinition({
      name: 'screenshot',
      description: 'Take a screenshot',
      inputSchema: z.object({}),
    }).server(() => [
      { type: 'text' as const, content: 'Here.' },
      {
        type: 'image' as const,
        source: { type: 'data' as const, value: 'aGk=', mimeType: 'image/png' },
      },
    ])
    const adapter = scriptedAdapter([
      [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'c1',
          toolCallName: 'screenshot',
          parentMessageId: 'm1',
        },
        { type: EventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{}' },
        { type: EventType.TOOL_CALL_END, toolCallId: 'c1', input: {} },
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r',
          finishReason: 'tool_calls',
        },
      ],
      [
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r',
          finishReason: 'stop',
        },
      ],
    ])
    const out: Array<PiBridgeEvent> = await collect(
      toPiAgentEvents(
        chat({
          adapter,
          threadId: 't',
          messages: [{ role: 'user', content: 'Show me' }],
          tools: [shot],
        }),
      ),
    )
    const execution = out.find((e) => e.type === 'tool_execution_end')
    expect(execution).toMatchObject({
      result: { content: [{ type: 'text', text: 'Here.' }, image] },
    })
  })

  it('runs a client tool of the pi client, and chat() reads its result from the history', async () => {
    const adapter = scriptedAdapter([
      [
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'loc-1',
          toolCallName: 'getLocation',
          parentMessageId: 'm1',
        },
        { type: EventType.TOOL_CALL_ARGS, toolCallId: 'loc-1', delta: '{}' },
        { type: EventType.TOOL_CALL_END, toolCallId: 'loc-1', input: {} },
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r',
          finishReason: 'tool_calls',
        },
      ],
      [
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm2',
          role: 'assistant',
        },
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm2',
          delta: 'Sydney it is.',
        },
        { type: EventType.TEXT_MESSAGE_END, messageId: 'm2' },
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r',
          finishReason: 'stop',
        },
      ],
    ])
    const tools = [
      {
        name: 'getLocation',
        description: 'Get the location of the user',
        parameters: { type: 'object', properties: {} },
      },
    ]
    const user = { role: 'user' as const, content: 'Where am I?', timestamp: 1 }

    const first = await collect(
      toPiAgentEvents(
        chat({
          adapter,
          ...chatParamsFromPiRequestBody({
            threadId: 't',
            messages: [user],
            tools,
          }),
        }),
      ),
    )
    const end = first.at(-1)
    if (end?.type !== 'agent_end') throw new Error('No agent_end')
    expect(end.messages).toMatchObject([
      {
        role: 'assistant',
        stopReason: 'toolUse',
        content: [{ type: 'toolCall', id: 'loc-1', name: 'getLocation' }],
      },
    ])

    // The pi client runs the tool and posts the result in the history.
    const result: ToolResultMessage = {
      role: 'toolResult',
      toolCallId: 'loc-1',
      toolName: 'getLocation',
      content: [{ type: 'text', text: 'Sydney' }],
      isError: false,
      timestamp: 2,
    }
    const second = await collect(
      toPiAgentEvents(
        chat({
          adapter,
          ...chatParamsFromPiRequestBody({
            threadId: 't',
            messages: [user, ...end.messages, result],
            tools,
          }),
        }),
      ),
    )
    const text = second.flatMap((e) =>
      e.type === 'message_update' &&
      e.assistantMessageEvent.type === 'text_delta'
        ? [e.assistantMessageEvent.delta]
        : [],
    )
    expect(text.join('')).toBe('Sydney it is.')
  })

  it('round-trips images in tool results through the history', () => {
    const history = fromPiMessages([
      {
        role: 'toolResult',
        toolCallId: 'c1',
        toolName: 'screenshot',
        content: [{ type: 'text', text: 'Here.' }, image],
        isError: false,
        timestamp: 1,
      },
    ])
    expect(history.messages[0]).toMatchObject({
      role: 'tool',
      content: [{ type: 'text', content: 'Here.' }, { type: 'image' }],
    })
    expect(toPiMessages(history.messages)[0]).toMatchObject({
      role: 'toolResult',
      content: [{ type: 'text', text: 'Here.' }, image],
    })
  })
})
