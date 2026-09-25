import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat'
import {
  convertMessagesToModelMessages,
  modelMessagesToUIMessages,
} from '../src/activities/chat/messages'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import {
  chunk,
  clientTool,
  collectChunks,
  createMockAdapter,
  ev,
  serverTool,
} from './test-utils'
import { EventType } from '../src/types'
import type { StreamChunk, UIMessage } from '../src/types'

/**
 * Anthropic runs web_search / web_fetch inside one provider response and
 * signs every thinking block against the blocks before it, e.g.
 *
 *   thinking → server_tool_use → result → thinking → text → server_tool_use → …
 *
 * Replaying that turn as "thinking, thinking, text, tool, tool" makes the
 * provider reject the next request:
 *   `thinking` blocks in the latest assistant message cannot be modified.
 *
 * #931 taught buildAssistantMessages (UIMessage → ModelMessage) to keep that
 * order. These tests cover the two other paths that still collapsed it (the
 * AG-UI wire serializer and the run loop's own message recording) and the
 * live-run interrupt classification that turned the provider calls into
 * client work when a real client tool shared the iteration.
 */

const providerToolMetadata = (query: string) => ({
  providerExecuted: true,
  anthropic: {
    serverToolType: 'web_search',
    resultBlockType: 'web_search_tool_result',
    result: [
      {
        type: 'web_search_result',
        title: `Result for ${query}`,
        url: 'https://example.com',
        encrypted_content: 'opaque-provider-payload',
      },
    ],
  },
})

function providerToolStart(toolCallId: string, query: string) {
  return {
    ...ev.toolStart(toolCallId, 'web_search'),
    metadata: providerToolMetadata(query),
  }
}

function reasoning(stepName: string, content: string, signature: string) {
  return [
    ev.stepStarted(stepName),
    chunk(EventType.REASONING_MESSAGE_CONTENT, {
      messageId: `${stepName}-reasoning`,
      delta: content,
    }),
    { ...ev.stepFinished('', stepName), signature },
  ]
}

describe('provider-executed tools interleaved with signed thinking', () => {
  describe('uiMessagesToWire', () => {
    it('splits the assistant message into ordered segments at thinking that follows a provider tool', () => {
      const uiMessage: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'plan', signature: 'sig-a' },
          { type: 'text', content: 'Searching first.' },
          {
            type: 'tool-call',
            id: 'srvtoolu_1',
            name: 'web_search',
            arguments: '{"query":"one"}',
            state: 'input-complete',
            metadata: providerToolMetadata('one'),
          },
          { type: 'thinking', content: 'refine', signature: 'sig-b' },
          { type: 'text', content: 'Searching again.' },
          {
            type: 'tool-call',
            id: 'srvtoolu_2',
            name: 'web_search',
            arguments: '{"query":"two"}',
            state: 'input-complete',
            metadata: providerToolMetadata('two'),
          },
          { type: 'text', content: 'Done.' },
        ],
      }

      const wire = uiMessagesToWire([uiMessage])

      expect(
        wire.map((message) => ({
          role: message.role,
          id: message.id,
          ...('content' in message && { content: message.content }),
          ...('toolCalls' in message && {
            toolCalls: message.toolCalls?.map((toolCall) => toolCall.id),
          }),
        })),
      ).toEqual([
        { role: 'reasoning', id: expect.any(String), content: 'plan' },
        {
          role: 'assistant',
          id: 'm1',
          content: 'Searching first.',
          toolCalls: ['srvtoolu_1'],
        },
        { role: 'reasoning', id: expect.any(String), content: 'refine' },
        {
          role: 'assistant',
          id: 'm1-segment-1',
          content: 'Searching again.Done.',
          toolCalls: ['srvtoolu_2'],
        },
      ])

      // Every anchor carries the metadata for its own tool calls.
      const anchors = wire.filter((message) => message.role === 'assistant')
      expect(
        anchors.map((anchor) =>
          Object.keys(
            (anchor.metadata as any)?.tanstack?.toolCallMetadata ?? {},
          ),
        ),
      ).toEqual([['srvtoolu_1'], ['srvtoolu_2']])

      // The server-side converter attaches each reasoning message to the
      // anchor that follows it, so the model history keeps the signed order.
      const modelMessages = convertMessagesToModelMessages(wire as Array<any>)
      expect(
        modelMessages.map((message) => ({
          thinking: message.role === 'assistant' ? message.thinking : undefined,
          toolCalls:
            message.role === 'assistant'
              ? message.toolCalls?.map((toolCall) => toolCall.id)
              : undefined,
        })),
      ).toEqual([
        {
          thinking: [{ content: 'plan', signature: 'sig-a' }],
          toolCalls: ['srvtoolu_1'],
        },
        {
          thinking: [{ content: 'refine', signature: 'sig-b' }],
          toolCalls: ['srvtoolu_2'],
        },
      ])
    })

    it('keeps a single anchor when thinking never follows a provider tool', () => {
      const uiMessage: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'plan', signature: 'sig-a' },
          { type: 'text', content: 'Hello' },
          {
            type: 'tool-call',
            id: 'call_1',
            name: 'localTool',
            arguments: '{}',
            state: 'input-complete',
          },
          { type: 'thinking', content: 'after local tool', signature: 'sig-b' },
        ],
      }

      const wire = uiMessagesToWire([uiMessage])

      expect(wire.map((message) => message.role)).toEqual([
        'reasoning',
        'reasoning',
        'assistant',
      ])
      expect(wire.filter((message) => message.role === 'assistant')).toEqual([
        expect.objectContaining({ id: 'm1', content: 'Hello' }),
      ])
    })
  })

  describe('reading segments back', () => {
    it('folds segment anchors into one message on a MESSAGES_SNAPSHOT', () => {
      const uiMessage: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'plan', signature: 'sig-a' },
          {
            type: 'tool-call',
            id: 'srvtoolu_1',
            name: 'web_search',
            arguments: '{"query":"one"}',
            state: 'input-complete',
            metadata: providerToolMetadata('one'),
          },
          { type: 'thinking', content: 'refine', signature: 'sig-b' },
          { type: 'text', content: 'Done.' },
        ],
      }
      const processor = new StreamProcessor({})
      processor.processChunk(
        chunk(EventType.MESSAGES_SNAPSHOT, {
          messages: uiMessagesToWire([uiMessage]),
        }),
      )

      const messages = processor.getMessages()
      expect(messages.map((message) => message.id)).toEqual(['m1'])
      expect(messages[0]!.parts.map((part) => part.type)).toEqual([
        'thinking',
        'tool-call',
        'thinking',
        'text',
      ])
    })

    it('folds segment messages into one message in modelMessagesToUIMessages', () => {
      const messages = modelMessagesToUIMessages([
        { role: 'user', content: 'research' },
        {
          role: 'assistant',
          id: 'm1',
          content: null,
          thinking: [{ content: 'plan', signature: 'sig-a' }],
          toolCalls: [
            {
              id: 'srvtoolu_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{}' },
              metadata: providerToolMetadata('one'),
            },
          ],
        },
        {
          role: 'assistant',
          id: 'm1-segment-1',
          content: 'Done.',
          thinking: [{ content: 'refine', signature: 'sig-b' }],
        },
      ])

      expect(messages.map((message) => message.id)).toEqual([
        expect.any(String),
        'm1',
      ])
      expect(messages[1]!.parts.map((part) => part.type)).toEqual([
        'thinking',
        'tool-call',
        'thinking',
        'text',
      ])
    })
  })

  describe('chat run loop', () => {
    it('does not surface provider-executed calls as client tool interrupts', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ...reasoning('step-1', 'plan', 'sig-a'),
            providerToolStart('srvtoolu_1', 'one'),
            ev.toolEnd('srvtoolu_1'),
            ...reasoning('step-2', 'now the client tool', 'sig-b'),
            ev.toolStart('call_1', 'saveDraft'),
            ev.toolArgs('call_1', '{"title":"x"}'),
            ev.toolEnd('call_1'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Research and save' }],
          tools: [clientTool('saveDraft')],
        }) as AsyncIterable<StreamChunk>,
      )

      const finished = chunks.find(
        (c) => c.type === EventType.RUN_FINISHED,
      ) as any
      expect(finished?.outcome?.type).toBe('interrupt')
      const interrupts: Array<any> = finished?.outcome?.interrupts ?? []
      expect(
        interrupts.map((interrupt) => (interrupt as any).toolCallId),
      ).toEqual(['call_1'])
    })

    it('records the interrupt snapshot in the provider block order', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ...reasoning('step-1', 'plan', 'sig-a'),
            providerToolStart('srvtoolu_1', 'one'),
            ev.toolEnd('srvtoolu_1'),
            ...reasoning('step-2', 'refine', 'sig-b'),
            ev.textStart(),
            ev.textContent('Now saving.'),
            ev.textEnd(),
            ev.toolStart('call_1', 'saveDraft'),
            ev.toolArgs('call_1', '{"title":"x"}'),
            ev.toolEnd('call_1'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Research and save' }],
          tools: [clientTool('saveDraft')],
        }) as AsyncIterable<StreamChunk>,
      )

      const snapshot = chunks.find(
        (c) => c.type === EventType.MESSAGES_SNAPSHOT,
      ) as { messages: Array<any> } | undefined
      expect(snapshot).toBeDefined()
      const turn = snapshot!.messages.filter((m) => m.role !== 'user')
      expect(
        turn.map((message) => ({
          role: message.role,
          ...(message.role === 'reasoning' && { content: message.content }),
          ...(message.role === 'assistant' && {
            content: message.content,
            toolCalls: message.toolCalls?.map((toolCall: any) => toolCall.id),
          }),
        })),
      ).toEqual([
        { role: 'reasoning', content: 'plan' },
        { role: 'assistant', content: undefined, toolCalls: ['srvtoolu_1'] },
        { role: 'reasoning', content: 'refine' },
        {
          role: 'assistant',
          content: 'Now saving.',
          toolCalls: ['call_1'],
        },
      ])
    })

    it('keeps the provider block order in history for the server-tool continuation', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ...reasoning('step-1', 'plan', 'sig-a'),
            ev.textStart(),
            ev.textContent('Searching.'),
            ev.textEnd(),
            providerToolStart('srvtoolu_1', 'one'),
            ev.toolEnd('srvtoolu_1'),
            ...reasoning('step-2', 'refine', 'sig-b'),
            ev.toolStart('call_1', 'lookup'),
            ev.toolArgs('call_1', '{"id":"42"}'),
            ev.toolEnd('call_1'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Final answer.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Research' }],
          tools: [serverTool('lookup', () => ({ found: true }))],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(calls).toHaveLength(2)
      const history = calls[1]!.messages as Array<any>
      expect(
        history.map((message) => ({
          role: message.role,
          ...(message.role === 'assistant' && {
            content: message.content,
            thinking: message.thinking?.map((t: any) => t.signature),
            toolCalls: message.toolCalls?.map((toolCall: any) => toolCall.id),
          }),
        })),
      ).toEqual([
        { role: 'user' },
        {
          role: 'assistant',
          content: 'Searching.',
          thinking: ['sig-a'],
          toolCalls: ['srvtoolu_1'],
        },
        {
          role: 'assistant',
          content: null,
          thinking: ['sig-b'],
          toolCalls: ['call_1'],
        },
        { role: 'tool' },
      ])
      // The provider-executed call is never executed by the loop.
      expect(history.filter((message) => message.role === 'tool')).toHaveLength(
        1,
      )
    })
  })
})
