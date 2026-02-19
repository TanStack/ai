import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiEventClient } from '@tanstack/ai/event-client'
import { DefaultChatClientEventEmitter } from '../src/events'
import type { UIMessage } from '../src/types'

// Mock the event client
vi.mock('@tanstack/ai/event-client', () => ({
  aiEventClient: {
    emit: vi.fn(),
  },
}))

describe('events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DefaultChatClientEventEmitter', () => {
    let emitter: DefaultChatClientEventEmitter

    beforeEach(() => {
      emitter = new DefaultChatClientEventEmitter('test-client-id')
    })

    it('should emit client:created event with clientId and timestamp', () => {
      emitter.clientCreated(5)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:created', {
        initialMessageCount: 5,
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit client:loading:changed event', () => {
      emitter.loadingChanged(true)

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'client:loading:changed',
        {
          isLoading: true,
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
    })

    it('should emit client:error:changed event with null', () => {
      emitter.errorChanged(null)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:error:changed', {
        error: null,
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit client:error:changed event with error string', () => {
      emitter.errorChanged('Something went wrong')

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:error:changed', {
        error: 'Something went wrong',
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit text:chunk:content event for text updates', () => {
      emitter.textUpdated('stream-1', 'msg-1', 'Hello world')

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:chunk:content', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        content: 'Hello world',
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit tools:call:updated event', () => {
      emitter.toolCallStateChanged(
        'stream-1',
        'msg-1',
        'call-1',
        'get_weather',
        'input-complete',
        '{"city": "NYC"}',
      )

      expect(aiEventClient.emit).toHaveBeenCalledWith('tools:call:updated', {
        streamId: 'stream-1',
        messageId: 'msg-1',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        state: 'input-complete',
        arguments: '{"city": "NYC"}',
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit tools:approval:requested event', () => {
      emitter.approvalRequested(
        'stream-1',
        'msg-1',
        'call-1',
        'get_weather',
        { city: 'NYC' },
        'approval-1',
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
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
    })

    it('should emit text:message:created with full content', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Hello' },
          { type: 'text', content: 'World' },
        ],
        createdAt: new Date(),
      }

      emitter.messageAppended(uiMessage)

      expect(aiEventClient.emit).toHaveBeenCalledWith('text:message:created', {
        streamId: undefined,
        messageId: 'msg-1',
        role: 'user',
        content: 'Hello World',
        parts: uiMessage.parts,
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should handle message with no text parts', () => {
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
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit text:message:created and text:message:user for sent messages', () => {
      emitter.messageSent('msg-1', 'Hello world')

      expect(aiEventClient.emit).toHaveBeenCalledTimes(2)
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        1,
        'text:message:created',
        {
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello world',
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
      expect(aiEventClient.emit).toHaveBeenNthCalledWith(
        2,
        'text:message:user',
        {
          messageId: 'msg-1',
          role: 'user',
          content: 'Hello world',
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
    })

    it('should emit client:reloaded event', () => {
      emitter.reloaded(3)

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:reloaded', {
        fromMessageIndex: 3,
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit client:stopped event', () => {
      emitter.stopped()

      expect(aiEventClient.emit).toHaveBeenCalledWith('client:stopped', {
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit client:messages:cleared event', () => {
      emitter.messagesCleared()

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'client:messages:cleared',
        {
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
    })

    it('should emit tools:result:added event', () => {
      emitter.toolResultAdded(
        'call-1',
        'get_weather',
        { temp: 72 },
        'output-available',
      )

      expect(aiEventClient.emit).toHaveBeenCalledWith('tools:result:added', {
        toolCallId: 'call-1',
        toolName: 'get_weather',
        output: { temp: 72 },
        state: 'output-available',
        clientId: 'test-client-id',
        source: 'client',
        timestamp: expect.any(Number),
      })
    })

    it('should emit tools:approval:responded event', () => {
      emitter.toolApprovalResponded('approval-1', 'call-1', true)

      expect(aiEventClient.emit).toHaveBeenCalledWith(
        'tools:approval:responded',
        {
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          approved: true,
          clientId: 'test-client-id',
          source: 'client',
          timestamp: expect.any(Number),
        },
      )
    })
  })
})
