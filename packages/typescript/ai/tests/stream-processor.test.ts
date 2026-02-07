import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import type { StreamChunk } from '../src/types'

describe('StreamProcessor', () => {
  describe('handleTextMessageContentEvent', () => {
    it('should handle TEXT_MESSAGE_CONTENT with delta', () => {
      const processor = new StreamProcessor()
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: 'Hello',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: ' world',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts).toHaveLength(1)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })

    it('should handle TEXT_MESSAGE_CONTENT with undefined delta (issue #257)', () => {
      const processor = new StreamProcessor()
      processor.startAssistantMessage()

      // Simulate a chunk where delta is undefined (which can happen in practice)
      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: undefined,
        content: 'Hello',
        model: 'test',
        timestamp: Date.now(),
      } as unknown as StreamChunk)

      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: undefined,
        content: 'Hello world',
        model: 'test',
        timestamp: Date.now(),
      } as unknown as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts).toHaveLength(1)
      // Should NOT contain "undefined" string
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })

    it('should handle TEXT_MESSAGE_CONTENT with empty delta', () => {
      const processor = new StreamProcessor()
      processor.startAssistantMessage()

      // Empty delta should fall back to content
      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: '',
        content: 'Hello',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts).toHaveLength(1)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello',
      })
    })

    it('should handle TEXT_MESSAGE_CONTENT with only content (no delta)', () => {
      const processor = new StreamProcessor()
      processor.startAssistantMessage()

      // Some servers may only send content without delta
      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'Hello',
        model: 'test',
        timestamp: Date.now(),
      } as unknown as StreamChunk)

      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        content: 'Hello world',
        model: 'test',
        timestamp: Date.now(),
      } as unknown as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts).toHaveLength(1)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })

    it('should have empty parts when no TEXT_MESSAGE_CONTENT is received', () => {
      const processor = new StreamProcessor()
      processor.startAssistantMessage()

      // Only RUN_FINISHED without any text content
      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      // Parts should be empty when no content was received
      expect(messages[0]?.parts).toHaveLength(0)
    })
  })
})
