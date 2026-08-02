import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '@tanstack/ai-event-client'
import { DefaultChatClientEventEmitter } from '../src/events'
import type { UIMessage } from '../src/types'

vi.mock('@tanstack/ai-event-client', () => ({
  aiEventClient: {
    emit: vi.fn(),
  },
  createAIDevtoolsEventEnvelope: (input: {
    eventType: string
    timestamp: number
  }) => ({
    ...input,
    eventId: `event:${input.eventType}:${input.timestamp}`,
  }),
}))

describe('events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function expectedEnvelope(
    eventType: string,
    visibility: 'client-state' | 'user-visible' = 'client-state',
  ) {
    return {
      clientId: 'test-client-id',
      hookId: 'test-client-id',
      eventId: expect.any(String),
      eventType,
      source: 'client',
      visibility,
      timestamp: expect.any(Number),
    }
  }

  describe('DefaultChatClientEventEmitter', () => {
    let emitter: DefaultChatClientEventEmitter

    beforeEach(() => {
      emitter = new DefaultChatClientEventEmitter('test-client-id')
    })

    it('emits client:created with client-state envelope fields', () => {
      emitter.clientCreated(5)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:created', {
        initialMessageCount: 5,
        ...expectedEnvelope('client:created'),
      })
    })

    it('emits client:loading:changed with client-state envelope fields', () => {
      emitter.loadingChanged(true)

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'client:loading:changed',
        {
          isLoading: true,
          ...expectedEnvelope('client:loading:changed'),
        },
      )
    })

    it('emits client:error:changed with null', () => {
      emitter.errorChanged(null)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:error:changed', {
        error: null,
        ...expectedEnvelope('client:error:changed'),
      })
    })

    it('emits client:error:changed with an error string', () => {
      emitter.errorChanged('Something went wrong')

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:error:changed', {
        error: 'Something went wrong',
        ...expectedEnvelope('client:error:changed'),
      })
    })

    it('emits text:chunk:content with user-visible envelope and run context', () => {
      emitter.textUpdated('stream-1', 'msg-1', 'Hello world', {
        threadId: 'thread-1',
        runId: 'run-1',
      })

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:chunk:content', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        content: 'Hello world',
        threadId: 'thread-1',
        runId: 'run-1',
        ...expectedEnvelope('text:chunk:content', 'user-visible'),
      })
    })

    it('emits text:chunk:thinking with user-visible envelope and run context', () => {
      emitter.thinkingUpdated('stream-1', 'msg-1', 'reasoning', 'ing', {
        threadId: 'thread-1',
        runId: 'run-1',
      })

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:chunk:thinking', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        content: 'reasoning',
        delta: 'ing',
        threadId: 'thread-1',
        runId: 'run-1',
        ...expectedEnvelope('text:chunk:thinking', 'user-visible'),
      })
    })

    it('emits tools:call:updated with user-visible envelope and run context', () => {
      emitter.toolCallStateChanged(
        'stream-1',
        'msg-1',
        'call-1',
        'get_weather',
        'input-complete',
        '{"city": "NYC"}',
        { threadId: 'thread-1', runId: 'run-1' },
      )

      expect(aiEventClient.emit).toHaveBeenCalledWith('tools:call:updated', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        state: 'input-complete',
        arguments: '{"city": "NYC"}',
        threadId: 'thread-1',
        runId: 'run-1',
        ...expectedEnvelope('tools:call:updated', 'user-visible'),
      })
    })

    it('emits tools:approval:requested with user-visible envelope and run context', () => {
      emitter.approvalRequested(
        'stream-1',
        'msg-1',
        'call-1',
        'get_weather',
        { city: 'NYC' },
        'approval-1',
        { threadId: 'thread-1', runId: 'run-1' },
      )

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'tools:approval:requested',
        {
          streamId: 'stream-1',
          messageId: 'msg-1',
          toolCallId: 'call-1',
          toolName: 'get_weather',
          input: { city: 'NYC' },
          approvalId: 'approval-1',
          threadId: 'thread-1',
          runId: 'run-1',
          ...expectedEnvelope('tools:approval:requested', 'user-visible'),
        },
      )
    })

    it('emits text:message:created with full content and run context', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Hello' },
          { type: 'text', content: 'World' },
        ],
        createdAt: new Date(),
      }

      emitter.messageAppended(uiMessage, 'stream-1', {
        threadId: 'thread-1',
        runId: 'run-1',
      })

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:message:created', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        role: 'user',
        content: 'Hello World',
        parts: uiMessage.parts,
        threadId: 'thread-1',
        runId: 'run-1',
        ...expectedEnvelope('text:message:created', 'user-visible'),
      })
    })

    it('handles a message with no text parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'tool1',
            arguments: '{}',
            state: 'input-complete',
          },
        ],
        createdAt: new Date(),
      }

      emitter.messageAppended(uiMessage)

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:message:created', {
        streamId: undefined,
        messageId: 'msg-1',
        role: 'assistant',
        content: '',
        parts: uiMessage.parts,
        ...expectedEnvelope('text:message:created', 'user-visible'),
      })
    })

    it('emits text:message:created and text:message:user for sent messages', () => {
      emitter.messageSent('msg-1', 'Hello world')

      expect(aiEventClient.emit).toHaveBeenCalledTimes(2)
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        1,
        'text:message:created',
        {
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello world',
          ...expectedEnvelope('text:message:created', 'user-visible'),
        },
      )
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        2,
        'text:message:user',
        {
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello world',
          ...expectedEnvelope('text:message:user', 'user-visible'),
        },
      )
    })

    it('emits client:reloaded with client-state envelope fields', () => {
      emitter.reloaded(3)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:reloaded', {
        fromMessageIndex: 3,
        ...expectedEnvelope('client:reloaded'),
      })
    })

    it('emits client:stopped with client-state envelope fields', () => {
      emitter.stopped()

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:stopped', {
        ...expectedEnvelope('client:stopped'),
      })
    })

    it('emits client:messages:cleared with client-state envelope fields', () => {
      emitter.messagesCleared()

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'client:messages:cleared',
        {
          ...expectedEnvelope('client:messages:cleared'),
        },
      )
    })

    it('emits tools:result:added with user-visible envelope and run context', () => {
      emitter.toolResultAdded(
        'call-1',
        'get_weather',
        { temp: 72 },
        'output-available',
        { threadId: 'thread-1', runId: 'run-1' },
      )

      expect(aiEventClient.emit).toHaveBeenCalledWith('tools:result:added', {
        toolCallId: 'call-1',
        toolName: 'get_weather',
        output: { temp: 72 },
        state: 'output-available',
        threadId: 'thread-1',
        runId: 'run-1',
        ...expectedEnvelope('tools:result:added', 'user-visible'),
      })
    })

    it('emits tools:approval:responded with user-visible envelope and run context', () => {
      emitter.toolApprovalResponded('approval-1', 'call-1', true, {
        threadId: 'thread-1',
        runId: 'run-1',
      })

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'tools:approval:responded',
        {
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          approved: true,
          threadId: 'thread-1',
          runId: 'run-1',
          ...expectedEnvelope('tools:approval:responded', 'user-visible'),
        },
      )
    })

    it('emits devtools:tool-fixture:applied with a user-visible envelope', () => {
      emitter.toolFixtureApplied({
        hookId: 'test-client-id',
        threadId: 'thread-1',
        runId: 'run-1',
        toolName: 'get_weather',
        input: { city: 'NYC' },
        output: { temp: 72 },
        messageId: 'msg-fixture',
        toolCallId: 'call-fixture',
      })

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'devtools:tool-fixture:applied',
        {
          threadId: 'thread-1',
          runId: 'run-1',
          toolName: 'get_weather',
          input: { city: 'NYC' },
          output: { temp: 72 },
          messageId: 'msg-fixture',
          toolCallId: 'call-fixture',
          ...expectedEnvelope('devtools:tool-fixture:applied', 'user-visible'),
        },
      )
    })
  })
})
