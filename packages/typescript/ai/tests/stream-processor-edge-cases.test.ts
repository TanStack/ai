import { describe, expect, it, vi } from 'vitest'
import { StreamProcessor } from '../src/stream'
import type {
  StreamProcessorEvents,
  StreamProcessorHandlers,
} from '../src/stream'

describe('StreamProcessor Edge Cases and Real-World Scenarios', () => {
  describe('Content Chunk Delta/Content Fallback Logic', () => {
    it('should handle content-only chunks when delta is empty', () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onTextUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // First chunk with delta
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      })

      // Second chunk with only content (no delta) - should use content fallback
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '', // Empty delta
        content: 'Hello world', // Full content
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const textPart = assistantMsg?.parts.find((p) => p.type === 'text')

      expect(textPart?.type).toBe('text')
      if (textPart?.type === 'text') {
        expect(textPart.content).toBe('Hello world')
      }
    })

    it('should handle content that starts with current text', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      })

      // Content starts with current text - should use content
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Hello world', // Starts with "Hello"
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const textPart = assistantMsg?.parts.find((p) => p.type === 'text')

      expect(textPart?.type).toBe('text')
      if (textPart?.type === 'text') {
        expect(textPart.content).toBe('Hello world')
      }
    })

    it('should handle content that current text starts with', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello world',
        content: 'Hello world',
        role: 'assistant',
      })

      // Current text starts with content - should keep current text
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Hello', // Shorter than current "Hello world"
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const textPart = assistantMsg?.parts.find((p) => p.type === 'text')

      expect(textPart?.type).toBe('text')
      if (textPart?.type === 'text') {
        expect(textPart.content).toBe('Hello world') // Should keep longer text
      }
    })

    it('should concatenate content when neither starts with the other', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      })

      // Content doesn't start with current, current doesn't start with content
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'world', // Different from "Hello"
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const textPart = assistantMsg?.parts.find((p) => p.type === 'text')

      expect(textPart?.type).toBe('text')
      if (textPart?.type === 'text') {
        expect(textPart.content).toBe('Helloworld') // Concatenated
      }
    })
  })

  describe('Tool Result Chunk Handling', () => {
    it('should handle tool result chunks and update UIMessage', () => {
      const handlers: StreamProcessorHandlers = {
        onToolResultStateChange: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // First, add a tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{"location":"Paris"}' },
        },
        index: 0,
      })

      // Then process tool result
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"temperature":20,"conditions":"sunny"}',
      })

      expect(handlers.onToolResultStateChange).toHaveBeenCalledWith(
        'call-1',
        '{"temperature":20,"conditions":"sunny"}',
        'complete',
      )

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const toolResultPart = assistantMsg?.parts.find(
        (p) => p.type === 'tool-result' && p.toolCallId === 'call-1',
      )

      expect(toolResultPart?.type).toBe('tool-result')
      if (toolResultPart?.type === 'tool-result') {
        expect(toolResultPart.content).toBe(
          '{"temperature":20,"conditions":"sunny"}',
        )
        expect(toolResultPart.state).toBe('complete')
      }

      expect(events.onMessagesChange).toHaveBeenCalled()
    })

    it('should handle tool result without current assistant message', () => {
      const handlers: StreamProcessorHandlers = {
        onToolResultStateChange: vi.fn(),
      }

      const processor = new StreamProcessor({ handlers })

      // Process tool result without starting assistant message
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"result":"test"}',
      })

      // Handler should still be called
      expect(handlers.onToolResultStateChange).toHaveBeenCalled()
      // But message shouldn't be updated
      expect(processor.getMessages()).toHaveLength(0)
    })
  })

  describe('Thinking Chunk Delta/Content Fallback Logic', () => {
    it('should handle thinking chunks with delta', () => {
      const handlers: StreamProcessorHandlers = {
        onThinkingUpdate: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onThinkingUpdate: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me think',
        content: 'Let me think',
      })

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: ' about this',
        content: 'Let me think about this',
      })

      expect(handlers.onThinkingUpdate).toHaveBeenCalledWith(
        'Let me think about this',
      )
      expect(events.onThinkingUpdate).toHaveBeenCalledWith(
        expect.any(String),
        'Let me think about this',
      )

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const thinkingPart = assistantMsg?.parts.find(
        (p) => p.type === 'thinking',
      )

      expect(thinkingPart?.type).toBe('thinking')
      if (thinkingPart?.type === 'thinking') {
        expect(thinkingPart.content).toBe('Let me think about this')
      }
    })

    it('should handle thinking chunks with content-only fallback', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me think',
        content: 'Let me think',
      })

      // Content-only chunk
      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '', // Empty delta
        content: 'Let me think about this', // Full content
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const thinkingPart = assistantMsg?.parts.find(
        (p) => p.type === 'thinking',
      )

      expect(thinkingPart?.type).toBe('thinking')
      if (thinkingPart?.type === 'thinking') {
        expect(thinkingPart.content).toBe('Let me think about this')
      }
    })

    it('should handle thinking content that starts with previous', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me',
        content: 'Let me',
      })

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Let me think', // Starts with "Let me"
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const thinkingPart = assistantMsg?.parts.find(
        (p) => p.type === 'thinking',
      )

      expect(thinkingPart?.type).toBe('thinking')
      if (thinkingPart?.type === 'thinking') {
        expect(thinkingPart.content).toBe('Let me think')
      }
    })

    it('should handle thinking when previous starts with content', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me think about this',
        content: 'Let me think about this',
      })

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Let me', // Shorter than previous
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const thinkingPart = assistantMsg?.parts.find(
        (p) => p.type === 'thinking',
      )

      expect(thinkingPart?.type).toBe('thinking')
      if (thinkingPart?.type === 'thinking') {
        expect(thinkingPart.content).toBe('Let me think about this') // Keep longer
      }
    })

    it('should concatenate thinking when neither starts with the other', () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'First',
        content: 'First',
      })

      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Second', // Different from "First"
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const thinkingPart = assistantMsg?.parts.find(
        (p) => p.type === 'thinking',
      )

      expect(thinkingPart?.type).toBe('thinking')
      if (thinkingPart?.type === 'thinking') {
        expect(thinkingPart.content).toBe('FirstSecond') // Concatenated
      }
    })
  })

  describe('Approval Requested Chunk Handling', () => {
    it('should handle approval requested chunks and update UIMessage', () => {
      const handlers: StreamProcessorHandlers = {
        onApprovalRequested: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onApprovalRequest: vi.fn(),
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // First add tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'deleteFile', arguments: '{"path":"/tmp/file"}' },
        },
        index: 0,
      })

      // Then request approval
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
        approval: {
          id: 'approval-123',
          needsApproval: true,
        },
      })

      expect(handlers.onApprovalRequested).toHaveBeenCalledWith(
        'call-1',
        'deleteFile',
        { path: '/tmp/file' },
        'approval-123',
      )

      expect(events.onApprovalRequest).toHaveBeenCalledWith({
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
        approvalId: 'approval-123',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const toolCallPart = assistantMsg?.parts.find(
        (p) => p.type === 'tool-call' && p.id === 'call-1',
      ) as any

      expect(toolCallPart?.state).toBe('approval-requested')
      expect(toolCallPart?.approval?.id).toBe('approval-123')
      expect(toolCallPart?.approval?.needsApproval).toBe(true)

      expect(events.onMessagesChange).toHaveBeenCalled()
    })

    it('should handle approval requested without current assistant message', () => {
      const handlers: StreamProcessorHandlers = {
        onApprovalRequested: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onApprovalRequest: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      // Request approval without starting assistant message
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
        approval: {
          id: 'approval-123',
          needsApproval: true,
        },
      })

      // Handlers should still be called
      expect(handlers.onApprovalRequested).toHaveBeenCalled()
      expect(events.onApprovalRequest).toHaveBeenCalled()
      // But message shouldn't be updated
      expect(processor.getMessages()).toHaveLength(0)
    })
  })

  describe('Tool Input Available Chunk Handling', () => {
    it('should handle tool input available chunks', () => {
      const handlers: StreamProcessorHandlers = {
        onToolInputAvailable: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onToolCall: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.processChunk({
        type: 'tool-input-available',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'getWeather',
        input: { location: 'Paris' },
      })

      expect(handlers.onToolInputAvailable).toHaveBeenCalledWith(
        'call-1',
        'getWeather',
        { location: 'Paris' },
      )

      expect(events.onToolCall).toHaveBeenCalledWith({
        toolCallId: 'call-1',
        toolName: 'getWeather',
        input: { location: 'Paris' },
      })
    })
  })

  describe('Complex Real-World Scenarios', () => {
    it('should handle delta vs content field correctly in new segments', async () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      // First content segment with delta
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      })

      // Tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getData', arguments: '{}' },
        },
        index: 0,
      })

      // New text segment after tool call - when content field includes full accumulated text
      // and we're in a new segment, the content field represents the full text including previous segment
      // The processor correctly handles this by detecting it's a new segment
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Done!',
        content: 'HelloDone!', // Content includes full accumulated text
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')
      const textParts = assistantMsg?.parts.filter((p) => p.type === 'text')

      // Should have 2 text parts (before and after tool call)
      expect(textParts).toHaveLength(2)
      if (textParts?.[0]?.type === 'text') {
        expect(textParts[0].content).toBe('Hello')
      }
      // When content field includes full accumulated text in a new segment,
      // the processor uses the content field which includes both segments
      if (textParts?.[1]?.type === 'text') {
        expect(textParts[1].content).toBe('HelloDone!')
      }
    })

    it('should handle content fallback + tool results in same stream', async () => {
      const handlers: StreamProcessorHandlers = {
        onTextUpdate: vi.fn(),
        onToolResultStateChange: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onTextUpdate: vi.fn(),
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // Content with delta
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me check',
        content: 'Let me check',
        role: 'assistant',
      })

      // Content with only content field (no delta)
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Let me check the weather',
        role: 'assistant',
      })

      // Tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{"location":"Paris"}' },
        },
        index: 0,
      })

      // Tool result
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"temperature":20}',
      })

      // More content - this starts a new text segment after tool calls
      // The content field includes full accumulated text, but we're in a new segment
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'The temperature is 20°C',
        content: 'Let me check the weatherThe temperature is 20°C',
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      // Should have text, tool call, tool result, and more text
      expect(assistantMsg?.parts).toHaveLength(4)
      expect(assistantMsg?.parts[0]?.type).toBe('text')
      expect(assistantMsg?.parts[1]?.type).toBe('tool-call')
      expect(assistantMsg?.parts[2]?.type).toBe('tool-result')
      expect(assistantMsg?.parts[3]?.type).toBe('text')

      if (assistantMsg?.parts[0]?.type === 'text') {
        expect(assistantMsg.parts[0].content).toBe('Let me check the weather')
      }
      // When content-only chunk comes after tool calls, content field includes full text
      // but since it's a new segment starting empty, it uses the full content
      if (assistantMsg?.parts[3]?.type === 'text') {
        expect(assistantMsg.parts[3].content).toBe(
          'Let me check the weatherThe temperature is 20°C',
        )
      }
    })

    it('should handle thinking + approval flow', async () => {
      const handlers: StreamProcessorHandlers = {
        onThinkingUpdate: vi.fn(),
        onApprovalRequested: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onThinkingUpdate: vi.fn(),
        onApprovalRequest: vi.fn(),
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // Thinking with delta
      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'I need to',
        content: 'I need to',
      })

      // Thinking with content-only
      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'I need to delete this file',
      })

      // Tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'deleteFile', arguments: '{"path":"/tmp/file"}' },
        },
        index: 0,
      })

      // Approval request
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
        approval: {
          id: 'approval-123',
          needsApproval: true,
        },
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      // Should have thinking, tool call with approval
      expect(assistantMsg?.parts).toHaveLength(2)
      expect(assistantMsg?.parts[0]?.type).toBe('thinking')
      expect(assistantMsg?.parts[1]?.type).toBe('tool-call')

      if (assistantMsg?.parts[0]?.type === 'thinking') {
        expect(assistantMsg.parts[0].content).toBe('I need to delete this file')
      }

      const toolCallPart = assistantMsg?.parts[1] as any
      expect(toolCallPart?.state).toBe('approval-requested')
      expect(toolCallPart?.approval?.id).toBe('approval-123')
    })

    it('should handle tool input available + approval + tool result flow', async () => {
      const handlers: StreamProcessorHandlers = {
        onToolInputAvailable: vi.fn(),
        onApprovalRequested: vi.fn(),
        onToolResultStateChange: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onToolCall: vi.fn(),
        onApprovalRequest: vi.fn(),
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // Tool input available
      processor.processChunk({
        type: 'tool-input-available',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
      })

      expect(handlers.onToolInputAvailable).toHaveBeenCalled()
      expect(events.onToolCall).toHaveBeenCalled()

      // Tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'deleteFile', arguments: '{"path":"/tmp/file"}' },
        },
        index: 0,
      })

      // Approval request
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file' },
        approval: {
          id: 'approval-123',
          needsApproval: true,
        },
      })

      expect(handlers.onApprovalRequested).toHaveBeenCalled()
      expect(events.onApprovalRequest).toHaveBeenCalled()

      // Tool result (after approval)
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"success":true}',
      })

      expect(handlers.onToolResultStateChange).toHaveBeenCalledWith(
        'call-1',
        '{"success":true}',
        'complete',
      )

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      // Should have tool call and tool result
      const toolCallPart = assistantMsg?.parts.find(
        (p) => p.type === 'tool-call' && (p as any).id === 'call-1',
      ) as any
      const toolResultPart = assistantMsg?.parts.find(
        (p) => p.type === 'tool-result' && (p as any).toolCallId === 'call-1',
      ) as any

      expect(toolCallPart?.state).toBe('approval-requested')
      expect(toolResultPart?.content).toBe('{"success":true}')
      expect(toolResultPart?.state).toBe('complete')
    })

    it('should handle mixed content (delta and content) + thinking + tool results', async () => {
      const processor = new StreamProcessor({})
      processor.startAssistantMessage()

      // Content with delta
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      })

      // Content with only content field
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Hello world',
        role: 'assistant',
      })

      // Thinking with delta
      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me think',
        content: 'Let me think',
      })

      // Thinking with only content
      processor.processChunk({
        type: 'thinking',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '',
        content: 'Let me think about this',
      })

      // Tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getData', arguments: '{}' },
        },
        index: 0,
      })

      // Tool result
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"result":"data"}',
      })

      // More content - this starts a new text segment after tool calls
      processor.processChunk({
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Done!',
        content: 'Hello worldDone!',
        role: 'assistant',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      expect(assistantMsg?.parts).toHaveLength(5)
      expect(assistantMsg?.parts[0]?.type).toBe('text')
      expect(assistantMsg?.parts[1]?.type).toBe('thinking')
      expect(assistantMsg?.parts[2]?.type).toBe('tool-call')
      expect(assistantMsg?.parts[3]?.type).toBe('tool-result')
      expect(assistantMsg?.parts[4]?.type).toBe('text')

      if (assistantMsg?.parts[0]?.type === 'text') {
        expect(assistantMsg.parts[0].content).toBe('Hello world')
      }
      if (assistantMsg?.parts[1]?.type === 'thinking') {
        expect(assistantMsg.parts[1].content).toBe('Let me think about this')
      }
      // When content chunk comes after tool calls, content field includes full accumulated text
      // Since it's a new segment starting empty, it uses the full content
      if (assistantMsg?.parts[4]?.type === 'text') {
        expect(assistantMsg.parts[4].content).toBe('Hello worldDone!')
      }
    })

    it('should handle complex approval flow with multiple tool calls', async () => {
      const handlers: StreamProcessorHandlers = {
        onToolInputAvailable: vi.fn(),
        onApprovalRequested: vi.fn(),
        onToolResultStateChange: vi.fn(),
      }
      const events: StreamProcessorEvents = {
        onToolCall: vi.fn(),
        onApprovalRequest: vi.fn(),
        onMessagesChange: vi.fn(),
      }

      const processor = new StreamProcessor({
        handlers,
        events,
      })

      processor.startAssistantMessage()

      // First tool input available
      processor.processChunk({
        type: 'tool-input-available',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file1' },
      })

      // First tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'deleteFile', arguments: '{"path":"/tmp/file1"}' },
        },
        index: 0,
      })

      // First approval request
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'deleteFile',
        input: { path: '/tmp/file1' },
        approval: {
          id: 'approval-1',
          needsApproval: true,
        },
      })

      // Second tool input available
      processor.processChunk({
        type: 'tool-input-available',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-2',
        toolName: 'deleteFile',
        input: { path: '/tmp/file2' },
      })

      // Second tool call
      processor.processChunk({
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-2',
          type: 'function',
          function: { name: 'deleteFile', arguments: '{"path":"/tmp/file2"}' },
        },
        index: 1,
      })

      // Second approval request
      processor.processChunk({
        type: 'approval-requested',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-2',
        toolName: 'deleteFile',
        input: { path: '/tmp/file2' },
        approval: {
          id: 'approval-2',
          needsApproval: true,
        },
      })

      // First tool result
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        content: '{"success":true}',
      })

      // Second tool result
      processor.processChunk({
        type: 'tool_result',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCallId: 'call-2',
        content: '{"success":true}',
      })

      const messages = processor.getMessages()
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      // Should have 2 tool calls and 2 tool results
      const toolCallParts = assistantMsg?.parts.filter(
        (p) => p.type === 'tool-call',
      )
      const toolResultParts = assistantMsg?.parts.filter(
        (p) => p.type === 'tool-result',
      )

      expect(toolCallParts).toHaveLength(2)
      expect(toolResultParts).toHaveLength(2)

      expect((toolCallParts?.[0] as any)?.id).toBe('call-1')
      expect((toolCallParts?.[1] as any)?.id).toBe('call-2')
      expect((toolResultParts?.[0] as any)?.toolCallId).toBe('call-1')
      expect((toolResultParts?.[1] as any)?.toolCallId).toBe('call-2')

      expect(handlers.onToolInputAvailable).toHaveBeenCalledTimes(2)
      expect(handlers.onApprovalRequested).toHaveBeenCalledTimes(2)
      expect(handlers.onToolResultStateChange).toHaveBeenCalledTimes(2)
    })
  })
})
