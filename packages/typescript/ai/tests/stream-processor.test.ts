import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import type { StreamChunk } from '../src/types'

describe('StreamProcessor', () => {
  describe('handleTextMessageContentEvent', () => {
    it('should handle TEXT_MESSAGE_CONTENT with delta', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

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
      processor.prepareAssistantMessage()

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
      processor.prepareAssistantMessage()

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
      processor.prepareAssistantMessage()

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
  })

  describe('lazy assistant message creation', () => {
    it('should not create assistant message when no content arrives', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // Only RUN_FINISHED without any content-bearing chunks
      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      processor.finalizeStream()

      const messages = processor.getMessages()
      // No message should have been created
      expect(messages).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()
    })

    it('should create assistant message lazily on first text content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // No message yet
      expect(processor.getMessages()).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()

      // First text chunk triggers creation
      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: 'Hello!',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      // Now the message exists
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getCurrentAssistantMessageId()).not.toBeNull()
      expect(processor.getMessages()[0]?.role).toBe('assistant')
    })

    it('should create assistant message lazily on first tool call', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // No message yet
      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'getGuitars',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      // Now the message exists with a tool call part
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.parts.some((p) => p.type === 'tool-call')).toBe(true)
    })

    it('should create assistant message lazily on error', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // No message yet
      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk({
        type: 'RUN_ERROR',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        error: { message: 'Something went wrong' },
      } as StreamChunk)

      processor.finalizeStream()

      // Error creates a message so UI can display error state
      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.role).toBe('assistant')
      expect(messages[0]?.parts).toHaveLength(0)
    })

    it('should create assistant message lazily on thinking content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // No message yet
      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk({
        type: 'STEP_FINISHED',
        stepId: 'step-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'thinking...',
        content: 'thinking...',
      } as StreamChunk)

      // Now the message exists with thinking content
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.parts.some((p) => p.type === 'thinking')).toBe(true)
    })

    it('should not create assistant message during empty multi-turn continuation', () => {
      const processor = new StreamProcessor()

      // Simulate first turn: user message + assistant with tool calls
      processor.addUserMessage('recommend a guitar')
      processor.prepareAssistantMessage()

      processor.processChunk({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'getGuitars',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      processor.processChunk({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'getGuitars',
        model: 'test',
        timestamp: Date.now(),
        input: {},
      } as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      } as StreamChunk)

      processor.finalizeStream()

      // Should have: user + assistant with tool call
      expect(processor.getMessages()).toHaveLength(2)

      // Simulate auto-continuation: prepare but no content arrives
      processor.prepareAssistantMessage()

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      processor.finalizeStream()

      // No new message was created - still just user + assistant with tool call
      const messages = processor.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[1]?.role).toBe('assistant')
      expect(messages[1]?.parts.some((p) => p.type === 'tool-call')).toBe(true)
    })

    it('should keep assistant message with meaningful text content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        delta: 'Hello!',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      processor.processChunk({
        type: 'RUN_FINISHED',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk)

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello!',
      })
    })

    it('should support deprecated startAssistantMessage for backwards compatibility', () => {
      const processor = new StreamProcessor()
      const messageId = processor.startAssistantMessage()

      // startAssistantMessage eagerly creates the message
      expect(messageId).toBeTruthy()
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.id).toBe(messageId)
    })
  })

  describe('TOOL_CALL_END updates tool-call output (issue #176)', () => {
    it('should update tool-call part output field when TOOL_CALL_END has a result', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // Start a tool call
      processor.processChunk({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      // Provide args
      processor.processChunk({
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '{"city":"NYC"}',
      } as StreamChunk)

      // End with a result (server tool execution)
      processor.processChunk({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
        input: { city: 'NYC' },
        result: '{"temp":72}',
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)

      const toolCallPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-call',
      )
      expect(toolCallPart).toBeDefined()
      expect(toolCallPart!.type).toBe('tool-call')
      // The output field should be populated (issue #176 fix)
      expect((toolCallPart as any).output).toEqual({ temp: 72 })

      // A tool-result part should also exist
      const toolResultPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-result',
      )
      expect(toolResultPart).toBeDefined()
      expect(toolResultPart!.type).toBe('tool-result')
    })

    it('should not update tool-call output when TOOL_CALL_END has no result', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      // End WITHOUT a result (client tool — server doesn't execute it)
      processor.processChunk({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
        input: { city: 'NYC' },
      } as StreamChunk)

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)

      const toolCallPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-call',
      )
      expect(toolCallPart).toBeDefined()
      // No output should be set since there was no result
      expect((toolCallPart as any).output).toBeUndefined()

      // No tool-result part should be created either
      const toolResultPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-result',
      )
      expect(toolResultPart).toBeUndefined()
    })

    it('should handle non-JSON result string gracefully', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk({
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'getText',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk)

      // End with a plain string result (not valid JSON)
      processor.processChunk({
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'getText',
        model: 'test',
        timestamp: Date.now(),
        input: {},
        result: 'plain text result',
      } as StreamChunk)

      const messages = processor.getMessages()
      const toolCallPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-call',
      )
      // Non-JSON result should be stored as-is
      expect((toolCallPart as any).output).toBe('plain text result')
    })
  })
})
