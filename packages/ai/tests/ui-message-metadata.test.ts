import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import { EventType } from '../src/types'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  convertMessagesToModelMessages,
  modelMessageToUIMessage,
  uiMessageToModelMessages,
} from '../src/activities/chat/messages'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { normalizeStreamChunk } from '../src/utilities/normalize-stream-chunk'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import { aguiSnapshotMessageToUIMessage } from '../src/activities/chat/messages'
import type {
  MessageSource,
  TanStackMessageMetadata,
  TanStackRunMetadata,
  UIMessage,
} from '../src/types'

describe('UIMessage.metadata', () => {
  it.each(['remove', 'clear'] as const)(
    'keeps a removed known call off unrelated unassigned rows after %s',
    (method) => {
      const errors: Array<Error> = []
      const processor = new StreamProcessor({
        events: { onError: (error) => errors.push(error) },
      })
      processor.processChunk({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'old',
        delta: 'Old',
        metadata: { tanstack: { runId: 'old-run' } },
      })
      if (method === 'clear') processor.clearMessages()
      else processor.removeMessagesAfter(-1)
      processor.processChunk({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'current',
        delta: 'Current',
      })
      const current = structuredClone(processor.getMessages())
      processor.processChunk({
        type: EventType.RUN_ERROR,
        message: 'Removed call error',
        metadata: { tanstack: { runId: 'old-run' } },
      })
      expect(processor.getMessages()).toEqual(current)
      expect(errors.map((error) => error.message)).toEqual([
        'Removed call error',
      ])
      processor.processChunk({
        type: EventType.RUN_FINISHED,
        runId: 'current-run',
        threadId: 'thread',
        responseId: 'current-response',
      })
      expect(processor.getMessages()[0]?.metadata?.tanstack?.responseId).toBe(
        'current-response',
      )
    },
  )

  it.each(['remove', 'clear'] as const)(
    'prunes removed call ownership through %s',
    (method) => {
      for (const started of [true, false]) {
        for (const terminal of ['finish', 'error']) {
          const errors: Array<Error> = []
          const processor = new StreamProcessor({
            events: { onError: (error) => errors.push(error) },
          })
          if (started)
            processor.processChunk({
              type: EventType.RUN_STARTED,
              runId: 'old',
              threadId: 'thread',
            })
          processor.processChunk({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'reuse',
            delta: 'Old',
            metadata: {
              tanstack: {
                runId: 'old',
                source: { provider: 'old', api: 'old', model: 'old' },
              },
            },
          })
          if (method === 'clear') processor.clearMessages()
          else processor.removeMessagesAfter(-1)
          processor.processChunk({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'reuse',
            delta: 'New',
            metadata: {
              tanstack: {
                runId: 'new',
                source: { provider: 'new', api: 'new', model: 'new' },
                responseId: 'new-response',
                model: 'new-model',
              },
            },
          })
          const current = structuredClone(processor.getMessages())
          if (terminal === 'finish')
            processor.processChunk({
              type: EventType.RUN_FINISHED,
              runId: 'old',
              threadId: 'thread',
              model: 'old-model',
              responseId: 'old-response',
              metadata: {
                tanstack: {
                  source: { provider: 'old', api: 'old', model: 'old' },
                },
              },
            })
          else
            processor.processChunk({
              type: EventType.RUN_ERROR,
              message: 'Old error',
              metadata: {
                tanstack: {
                  runId: 'old',
                  source: { provider: 'old', api: 'old', model: 'old' },
                },
              },
            })
          expect(processor.getMessages()).toEqual(current)
          expect(errors.map((error) => error.message)).toEqual(
            terminal === 'error' ? ['Old error'] : [],
          )
        }
      }
    },
  )

  it('keeps retained call members and excludes removed members from terminal metadata', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'old',
      threadId: 'thread',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'kept',
      delta: 'Keep',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'removed',
      delta: 'Remove',
    })
    processor.removeMessagesAfter(0)
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'removed',
      delta: 'New',
      metadata: { tanstack: { runId: 'new', responseId: 'new-response' } },
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'old',
      threadId: 'thread',
      responseId: 'old-response',
    })
    expect(
      processor.getMessages().map((message) => ({
        id: message.id,
        responseId: message.metadata?.tanstack?.responseId,
      })),
    ).toEqual([
      { id: 'kept', responseId: 'old-response' },
      { id: 'removed', responseId: 'new-response' },
    ])
  })

  it.each(['remove', 'clear'] as const)(
    'does not recreate discarded rows on %s late error',
    (method) => {
      const processor = new StreamProcessor()
      processor.processChunk({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'removed',
        delta: 'Old',
        metadata: { tanstack: { runId: 'old' } },
      })
      if (method === 'clear') processor.clearMessages()
      else processor.removeMessagesAfter(-1)
      processor.processChunk({
        type: EventType.RUN_ERROR,
        message: 'Old error',
        metadata: { tanstack: { runId: 'old' } },
      })
      expect(processor.getMessages()).toEqual([])
    },
  )

  it('keeps unassigned retained rows and creates an error row for a fresh empty call', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'kept',
      delta: 'Keep',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'removed',
      delta: 'Remove',
    })
    processor.removeMessagesAfter(0)
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'unassigned',
      threadId: 'thread',
      responseId: 'kept-response',
    })
    expect(processor.getMessages()).toHaveLength(1)
    expect(processor.getMessages()[0]?.metadata?.tanstack?.responseId).toBe(
      'kept-response',
    )
    processor.clearMessages()
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'fresh',
      threadId: 'thread',
    })
    processor.processChunk({
      type: EventType.RUN_ERROR,
      message: 'Fresh error',
      metadata: { tanstack: { runId: 'fresh' } },
    })
    expect(processor.getMessages()).toHaveLength(1)
    expect(processor.getMessages()[0]?.metadata?.tanstack).toMatchObject({
      runId: 'fresh',
      stopReason: 'error',
    })
  })

  it('moves structured output routing and queued updates with the provisional row', () => {
    const updates: Array<{ messageId: string; phase: string }> = []
    const processor = new StreamProcessor({
      events: {
        onStructuredOutputChange: (event) =>
          updates.push({ messageId: event.messageId, phase: event.phase }),
      },
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'prior',
      delta: 'Prior',
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'prior-run',
      threadId: 'thread',
      metadata: { tanstack: { responseId: 'prior-response' } },
    })
    const provisionalId = processor.startAssistantMessage()
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'next-run',
      threadId: 'thread',
    })
    processor.processChunk({
      type: EventType.CUSTOM,
      name: 'structured-output.start',
      value: {},
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: provisionalId,
      delta: '{"answer":',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool',
      toolCallName: 'lookup',
      parentMessageId: 'next',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'next',
      delta: '"ok"}',
    })
    processor.processChunk({
      type: EventType.CUSTOM,
      name: 'structured-output.complete',
      value: {
        messageId: 'next',
        object: { answer: 'ok' },
        raw: '{"answer":"ok"}',
      },
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'next-run',
      threadId: 'thread',
      metadata: { tanstack: { responseId: 'next-response' } },
    })
    const messages = processor.getMessages()
    expect(messages.map((message) => message.id)).toEqual(['prior', 'next'])
    expect(messages[0]).toMatchObject({
      parts: [{ type: 'text', content: 'Prior' }],
      metadata: { tanstack: { responseId: 'prior-response' } },
    })
    expect(messages[1]?.metadata?.tanstack?.responseId).toBe('next-response')
    expect(
      messages[1]?.parts.find((part) => part.type === 'structured-output'),
    ).toMatchObject({
      status: 'complete',
      data: { answer: 'ok' },
      raw: '{"answer":"ok"}',
    })
    expect(updates.filter((event) => event.phase === 'update')).toEqual([
      { messageId: 'next', phase: 'update' },
    ])
  })

  it.each([true, false])(
    'keeps thinking, tools, text, and terminal metadata on one row (run started: %s)',
    (runStarted) => {
      const processor = new StreamProcessor()
      if (runStarted)
        processor.processChunk({
          type: EventType.RUN_STARTED,
          runId: 'run',
          threadId: 'thread',
        })
      processor.processChunk({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'reasoning',
        delta: 'Reason',
      })
      processor.processChunk({
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: 'message',
        entityId: 'reasoning',
        encryptedValue: 'signature',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'tool',
        toolCallName: 'lookup',
        parentMessageId: 'answer',
        metadata: { providerExecuted: true },
      })
      processor.processChunk({
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'answer',
        role: 'assistant',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'tool',
        delta: '{"city":"Paris"}',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_END,
        toolCallId: 'tool',
      })
      processor.processChunk({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'answer',
        delta: 'Answer',
      })
      processor.processChunk({
        type: EventType.RUN_FINISHED,
        runId: 'run',
        threadId: 'thread',
        metadata: {
          tanstack: {
            responseId: 'response',
            source: {
              provider: 'anthropic',
              api: 'anthropic-messages',
              model: 'requested',
            },
          },
        },
      })
      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        id: 'answer',
        parts: [
          { type: 'thinking', content: 'Reason', signature: 'signature' },
          {
            type: 'tool-call',
            id: 'tool',
            arguments: '{"city":"Paris"}',
            metadata: { providerExecuted: true },
          },
          { type: 'text', content: 'Answer' },
        ],
        metadata: {
          tanstack: {
            responseId: 'response',
            source: {
              provider: 'anthropic',
              api: 'anthropic-messages',
              model: 'requested',
            },
          },
        },
      })
    },
  )

  it('renames the provisional row before errors without changing a prior successful call', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'prior',
      delta: 'Prior',
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'prior-run',
      threadId: 'thread',
      metadata: { tanstack: { responseId: 'prior-response' } },
    })
    processor.processChunk({
      type: EventType.RUN_STARTED,
      runId: 'next-run',
      threadId: 'thread',
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'reasoning',
      delta: 'Reason',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool',
      toolCallName: 'lookup',
      parentMessageId: 'next',
    })
    processor.processChunk({
      type: EventType.RUN_ERROR,
      message: 'Failed',
      metadata: {
        tanstack: {
          runId: 'next-run',
          source: {
            provider: 'gateway',
            api: 'anthropic-messages',
            model: 'requested',
          },
        },
      },
    })
    const messages = processor.getMessages()
    expect(messages.map((message) => message.id)).toEqual(['prior', 'next'])
    expect(messages[0]).toMatchObject({
      parts: [{ type: 'text', content: 'Prior' }],
      metadata: { tanstack: { responseId: 'prior-response' } },
    })
    expect(messages[0]?.metadata?.tanstack?.stopReason).toBeUndefined()
    expect(messages[1]).toMatchObject({
      metadata: {
        tanstack: {
          stopReason: 'error',
          source: {
            provider: 'gateway',
            api: 'anthropic-messages',
            model: 'requested',
          },
        },
      },
    })
  })

  it('keeps distinct authoritative IDs separate', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'first-tool',
      toolCallName: 'lookup',
      parentMessageId: 'first',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'second-tool',
      toolCallName: 'lookup',
      parentMessageId: 'second',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'third',
      role: 'assistant',
    })
    expect(processor.getMessages().map((message) => message.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('keeps child provisional reconciliation off the parent row', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'parent',
      role: 'assistant',
    })
    processor.processChunk({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'child',
      name: 'Child',
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: 'child-reasoning',
      delta: 'Reason',
      subagentRunId: 'child',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tool',
      toolCallName: 'lookup',
      parentMessageId: 'child-answer',
      subagentRunId: 'child',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tool',
      delta: '{}',
    })
    processor.processChunk({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tool',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'child-answer',
      role: 'assistant',
      subagentRunId: 'child',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'child-answer',
      delta: 'Answer',
      subagentRunId: 'child',
    })
    const messages = processor.getMessages()
    expect(messages.map((message) => message.id)).toEqual(['parent'])
    const card = messages[0]?.parts.find((part) => part.type === 'subagent')
    expect(card?.subagent.messages).toHaveLength(1)
    expect(card?.subagent.messages[0]).toMatchObject({
      id: 'child-answer',
      parts: [
        { type: 'thinking', content: 'Reason' },
        { type: 'tool-call', id: 'tool', arguments: '{}' },
        { type: 'text', content: 'Answer' },
      ],
    })
  })

  it('keeps a failure before any new event off the successful earlier call', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'first',
      delta: 'first',
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      metadata: {
        tanstack: { finishReason: 'tool_calls', responseId: 'response-first' },
      },
    })
    processor.processChunk({ type: EventType.RUN_ERROR, message: 'failed' })
    expect(
      processor.getMessages()[0]?.metadata?.tanstack?.stopReason,
    ).toBeUndefined()
    expect(processor.getMessages()[0]?.metadata?.tanstack?.responseId).toBe(
      'response-first',
    )
    expect(processor.getMessages()[1]?.metadata?.tanstack?.stopReason).toBe(
      'error',
    )
  })
  it('keeps replay and cache metadata through UI conversion', () => {
    const metadata = {
      app: 'value',
      tanstack: {
        source: { provider: 'custom', api: 'custom-chat', model: 'requested' },
        responseId: 'response-1',
        stopReason: 'error',
        run: { id: 'run-1', startedAt: 10, finishedAt: 20 },
        promptCache: { key: 'cache' },
        signature: 'opaque',
      },
    }
    const ui = modelMessageToUIMessage(
      { role: 'assistant', content: 'partial', metadata },
      'message-1',
    )
    const durableMetadata = {
      ...metadata,
      tanstack: { ...metadata.tanstack, run: { id: 'run-1' } },
    }
    expect(uiMessageToModelMessages(ui)[0]?.metadata).toEqual(durableMetadata)
    expect(metadata.tanstack.run).toEqual({
      id: 'run-1',
      startedAt: 10,
      finishedAt: 20,
    })
    const wire = uiMessagesToWire([ui])
    const hydrated = wire.map((message) =>
      aguiSnapshotMessageToUIMessage(message),
    )
    expect(hydrated[0]?.metadata).toEqual(durableMetadata)
  })

  it('marks a server error on the streamed assistant', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'message-1',
      role: 'assistant',
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'partial',
    })
    processor.processChunk({ type: EventType.RUN_ERROR, message: 'failed' })
    expect(processor.getMessages()[0]?.metadata?.tanstack?.stopReason).toBe(
      'error',
    )
  })

  it('merges response metadata from a continued wire row without changing its input', () => {
    const continued = {
      role: 'assistant' as const,
      id: 'row-2',
      content: 'B',
      metadata: {
        tanstack: {
          continues: 'row-1',
          responseId: 'response-2',
          source: { provider: 'custom', api: 'chat', model: 'requested' },
        },
      },
    }
    const messages = convertMessagesToModelMessages([
      {
        role: 'assistant',
        id: 'row-1',
        content: 'A',
        metadata: { app: 'value' },
      },
      continued,
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      id: 'row-1',
      content: 'AB',
      metadata: {
        app: 'value',
        tanstack: {
          responseId: 'response-2',
          source: { provider: 'custom', api: 'chat', model: 'requested' },
        },
      },
    })
    expect(messages[0]?.metadata?.tanstack?.continues).toBeUndefined()
    expect(continued.metadata.tanstack.continues).toBe('row-1')
  })

  it('keeps each model call response ID on its own assistant messages', () => {
    const processor = new StreamProcessor()
    const chunks: Array<AdapterYieldChunk> = [
      { type: EventType.RUN_STARTED, runId: 'run-1', threadId: 'thread-1' },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'message-1',
        role: 'assistant' as const,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'message-1',
        delta: 'first',
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        threadId: 'thread-1',
        responseId: 'response-1',
        finishReason: 'tool_calls' as const,
      },
      { type: EventType.RUN_STARTED, runId: 'run-1', threadId: 'thread-1' },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'message-2',
        role: 'assistant' as const,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'message-2',
        delta: 'second',
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        threadId: 'thread-1',
        responseId: 'response-2',
        finishReason: 'stop' as const,
      },
    ]
    for (const chunk of chunks)
      for (const wire of normalizeStreamChunk(chunk))
        processor.processChunk(wire)
    expect(
      processor
        .getMessages()
        .map((message) => message.metadata?.tanstack?.responseId),
    ).toEqual(['response-1', 'response-2'])
  })

  it('marks an explicit server abort and leaves local finalization unmarked', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-1',
      delta: 'partial',
    })
    processor.finalizeStream()
    expect(
      processor.getMessages()[0]?.metadata?.tanstack?.stopReason,
    ).toBeUndefined()
    processor.prepareAssistantMessage()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'message-2',
      delta: 'partial',
    })
    const metadata = {
      tanstack: { runId: 'run-aborted', stopReason: 'aborted' as const },
    }
    processor.processChunk({
      type: EventType.RUN_ERROR,
      message: 'cancelled',
      metadata,
    })
    expect(processor.getMessages()[1]?.metadata?.tanstack?.stopReason).toBe(
      'aborted',
    )
    expect(
      processor.getMessages()[0]?.metadata?.tanstack?.stopReason,
    ).toBeUndefined()
  })

  it('keeps a later error without RUN_STARTED off the earlier successful call', () => {
    const processor = new StreamProcessor()
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'first',
      delta: 'first',
    })
    processor.processChunk({
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      metadata: {
        tanstack: { finishReason: 'tool_calls', responseId: 'response-first' },
      },
    })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'second',
      delta: 'partial',
    })
    processor.processChunk({
      type: EventType.RUN_ERROR,
      message: 'failed',
      metadata: { tanstack: { runId: 'run-1' } },
    })
    expect(
      processor
        .getMessages()
        .map((message) => message.metadata?.tanstack?.stopReason),
    ).toEqual([undefined, 'error'])
    expect(processor.getMessages()[0]?.metadata?.tanstack?.responseId).toBe(
      'response-first',
    )
  })

  it('is an optional record', () => {
    expectTypeOf<UIMessage['metadata']>().toEqualTypeOf<
      Record<string, any> | undefined
    >()
  })

  it('exports TanStackMessageMetadata and TanStackRunMetadata', () => {
    expectTypeOf<MessageSource>().toEqualTypeOf<{
      provider: string
      api: string
      model: string
    }>()
    expectTypeOf<TanStackMessageMetadata['source']>().toEqualTypeOf<
      MessageSource | undefined
    >()
    expectTypeOf<TanStackMessageMetadata['stopReason']>().toEqualTypeOf<
      'error' | 'aborted' | undefined
    >()
    expectTypeOf<TanStackRunMetadata['responseId']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<TanStackMessageMetadata>().toHaveProperty('createdAt')
    expectTypeOf<TanStackMessageMetadata['createdAt']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<TanStackRunMetadata>().toHaveProperty('finishReason')
    expectTypeOf<TanStackRunMetadata>().toHaveProperty('interruptErrors')
  })
})

describe('canonical late tool completion', () => {
  it.each(['complete', 'approval-requested'] as const)(
    'refreshes null and malformed args while preserving %s state',
    (state) => {
      const processor = new StreamProcessor()
      processor.processChunk({
        type: EventType.RUN_STARTED,
        runId: 'raw-run',
        threadId: 'thread',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'raw',
        toolCallName: 'check',
        parentMessageId: 'row',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'raw',
        delta: '{"x":1}',
      })
      processor.processChunk({
        type: EventType.TOOL_CALL_END,
        toolCallId: 'raw',
      })
      if (state === 'complete')
        processor.processChunk({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: 'raw',
          content: '"ok"',
          messageId: 'row',
        })
      else
        processor.processChunk({
          type: EventType.RUN_FINISHED,
          runId: 'raw-run',
          threadId: 'thread',
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'approval_raw',
                reason: 'tool_call',
                message: 'Approve',
                toolCallId: 'raw',
                metadata: { kind: 'approval' },
              },
            ],
          },
        })
      const part = () =>
        processor
          .getMessages()
          .flatMap((message) => message.parts)
          .find((part) => part.type === 'tool-call')
      expect(part()?.state).toBe(state)
      processor.processChunk({
        type: EventType.TOOL_CALL_END,
        toolCallId: 'raw',
        metadata: { tanstack: { args: 'null' } },
      })
      expect(part()).toMatchObject({ state, arguments: 'null', input: null })
      const reloaded = JSON.parse(JSON.stringify(processor.getMessages()))
      const calls = reloaded.flatMap((message: UIMessage) =>
        uiMessageToModelMessages(message).flatMap(
          (model) => model.toolCalls ?? [],
        ),
      )
      expect(calls[0]?.function.arguments).toBe('null')
      processor.processChunk({
        type: EventType.TOOL_CALL_END,
        toolCallId: 'raw',
        metadata: { tanstack: { args: '{"broken":' } },
      })
      expect(part()).toMatchObject({ state, arguments: '{"broken":' })
      expect(part()).not.toHaveProperty('input')
      expect(
        processor
          .getMessages()
          .flatMap((message) => uiMessageToModelMessages(message))
          .flatMap((model) => model.toolCalls ?? [])[0]?.function.arguments,
      ).toBe('{"broken":')
    },
  )
})

describe('restored reasoning routes', () => {
  it.each([false, true])(
    'updates exact copied reasoning ownership after text start=%s',
    (startText) => {
      for (const redacted of [false, true]) {
        const messages: Array<UIMessage> = [
          {
            id: 'first',
            role: 'assistant',
            parts: [
              {
                type: 'thinking',
                stepId: 's0',
                content: redacted ? '' : 'First',
                signature: redacted ? 'AAH/' : 'opaque-first',
                ...(redacted ? { redacted: true } : {}),
              },
              {
                type: 'thinking',
                stepId: 's2',
                content: 'Second',
                signature: 'opaque-second',
              },
            ],
          },
          {
            id: 'latest',
            role: 'assistant',
            parts: [{ type: 'text', content: 'Answer' }],
          },
        ]
        const processor = new StreamProcessor({
          initialMessages: JSON.parse(JSON.stringify(messages)),
        })
        if (startText)
          processor.processChunk({
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'first',
            role: 'assistant',
          })
        processor.processChunk({
          type: EventType.REASONING_ENCRYPTED_VALUE,
          subtype: 'message',
          entityId: 's0',
          encryptedValue: 'late-signature',
        })
        expect(processor.getMessages()[0]?.parts).toEqual([
          {
            type: 'thinking',
            stepId: 's0',
            content: redacted ? '' : 'First',
            signature: redacted ? 'AAH/' : 'late-signature',
            ...(redacted ? { redacted: true } : {}),
          },
          {
            type: 'thinking',
            stepId: 's2',
            content: 'Second',
            signature: 'opaque-second',
          },
        ])
        expect(processor.getMessages()[1]).toEqual(messages[1])
        expect(processor.toModelMessages()[0]?.thinking).toEqual([
          {
            content: redacted ? '' : 'First',
            signature: redacted ? 'AAH/' : 'late-signature',
            ...(redacted ? { redacted: true } : {}),
          },
          { content: 'Second', signature: 'opaque-second' },
        ])
      }
    },
  )
})

it('binds distinct reasoning IDs after an equal-ID call without stale pending steps', () => {
  const processor = new StreamProcessor()
  processor.processChunk({
    type: EventType.RUN_STARTED,
    runId: 'first-run',
    threadId: 'thread',
  })
  processor.processChunk({
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'first',
    role: 'assistant',
  })
  processor.processChunk({ type: EventType.STEP_STARTED, stepName: 'same' })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'same',
    role: 'reasoning',
  })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'same',
    delta: 'First',
  })
  processor.processChunk({
    type: EventType.RUN_FINISHED,
    runId: 'first-run',
    threadId: 'thread',
  })
  processor.processChunk({
    type: EventType.RUN_STARTED,
    runId: 'second-run',
    threadId: 'thread',
  })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'response-message',
    role: 'reasoning',
  })
  processor.processChunk({
    type: EventType.STEP_STARTED,
    stepName: 'response-step',
  })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'response-message',
    delta: 'Second',
  })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_END,
    messageId: 'response-message',
  })
  for (const chunk of normalizeStreamChunk({
    type: EventType.STEP_FINISHED,
    stepName: 'response-step',
    signature: 'packed-openai-signature',
  }))
    processor.processChunk(chunk)
  expect(
    processor
      .getMessages()
      .map((message) =>
        message.parts.filter((part) => part.type === 'thinking'),
      ),
  ).toEqual([
    [{ type: 'thinking', stepId: 'same', content: 'First' }],
    [
      {
        type: 'thinking',
        stepId: 'response-step',
        content: 'Second',
        signature: 'packed-openai-signature',
      },
    ],
  ])
})

it('keeps adopted thinking in place and preserves copied redacted bytes', () => {
  for (const redacted of [false, true]) {
    const initial: Array<UIMessage> = [
      {
        id: 'owner',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Before' },
          {
            type: 'thinking',
            content: redacted ? '' : 'Stored',
            signature: redacted ? 'AAH/' : 'opaque',
            ...(redacted ? { redacted: true } : {}),
          },
          { type: 'text', content: 'After' },
        ],
      },
    ]
    const saved = structuredClone(initial)
    const processor = new StreamProcessor({ initialMessages: initial })
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'owner',
      role: 'assistant',
    })
    processor.processChunk({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      entityId: 'step',
      subtype: 'message',
      encryptedValue: 'late',
    })
    expect(processor.getMessages()[0]?.parts).toEqual([
      { type: 'text', content: 'Before' },
      {
        type: 'thinking',
        content: redacted ? '' : 'Stored',
        signature: redacted ? 'AAH/' : 'late',
        ...(redacted ? { redacted: true } : { stepId: 'step' }),
      },
      { type: 'text', content: 'After' },
    ])
    expect(initial).toEqual(saved)
  }
})

it('uses an exact assistant owner for late reasoning while another row is active', () => {
  const processor = new StreamProcessor()
  for (const id of ['first', 'second']) {
    processor.processChunk({
      type: EventType.TEXT_MESSAGE_START,
      messageId: id,
      role: 'assistant',
    })
    processor.processChunk({
      type: EventType.STEP_STARTED,
      stepName: id + '-step',
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_START,
      messageId: id + '-reasoning',
      role: 'reasoning',
    })
    processor.processChunk({
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: id + '-reasoning',
      delta: id,
    })
  }
  processor.processChunk({
    type: EventType.REASONING_ENCRYPTED_VALUE,
    entityId: 'first',
    subtype: 'message',
    encryptedValue: 'first-signature',
  })
  expect(processor.getMessages().map((message) => message.parts)).toEqual([
    [
      {
        type: 'thinking',
        stepId: 'first-step',
        content: 'first',
        signature: 'first-signature',
      },
    ],
    [{ type: 'thinking', stepId: 'second-step', content: 'second' }],
  ])
})

it('refreshes reasoning state when copied messages replace the same owner ID', () => {
  const processor = new StreamProcessor()
  processor.processChunk({
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'owner',
    role: 'assistant',
  })
  processor.processChunk({ type: EventType.STEP_STARTED, stepName: 'step' })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'message',
    delta: 'Old',
  })
  const replacement: Array<UIMessage> = [
    {
      id: 'owner',
      role: 'assistant',
      parts: [
        {
          type: 'thinking',
          stepId: 'step',
          content: 'Replacement',
          signature: 'replacement-signature',
        },
      ],
    },
  ]
  const saved = structuredClone(replacement)
  processor.setMessages(replacement)
  processor.processChunk({
    type: EventType.REASONING_ENCRYPTED_VALUE,
    entityId: 'step',
    subtype: 'message',
    encryptedValue: 'late',
  })
  expect(processor.getMessages()[0]?.parts).toEqual([
    {
      type: 'thinking',
      stepId: 'step',
      content: 'Replacement',
      signature: 'late',
    },
  ])
  expect(replacement).toEqual(saved)
})

it('keeps declared reasoning aliases across a copied same-owner replacement', () => {
  const processor = new StreamProcessor()
  processor.processChunk({
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'owner',
    role: 'assistant',
  })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_START,
    messageId: 'provider-message',
    role: 'reasoning',
  })
  processor.processChunk({ type: EventType.STEP_STARTED, stepName: 'step' })
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'provider-message',
    delta: 'First',
  })
  const copied: Array<UIMessage> = JSON.parse(
    JSON.stringify(processor.getMessages()),
  )
  const saved = structuredClone(copied)
  processor.setMessages(copied)
  processor.processChunk({
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: 'provider-message',
    delta: ' More',
  })
  processor.processChunk({
    type: EventType.REASONING_ENCRYPTED_VALUE,
    entityId: 'provider-message',
    subtype: 'message',
    encryptedValue: 'late',
  })
  expect(processor.getMessages()[0]?.parts).toEqual([
    {
      type: 'thinking',
      stepId: 'step',
      content: 'First More',
      signature: 'late',
    },
  ])
  expect(copied).toEqual(saved)
})
