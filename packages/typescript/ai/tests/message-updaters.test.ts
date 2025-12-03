import { describe, expect, it } from 'vitest'
import {
  updateTextPart,
  updateThinkingPart,
  updateToolCallApproval,
  updateToolCallApprovalResponse,
  updateToolCallPart,
  updateToolCallState,
  updateToolCallWithOutput,
  updateToolResultPart,
} from '../src/stream/message-updaters'
import type { ToolCallPart, UIMessage } from '../src/types'

// Helper to create a test message
function createMessage(
  id: string,
  role: 'user' | 'assistant' | 'system' = 'assistant',
  parts: UIMessage['parts'] = [],
): UIMessage {
  return { id, role, parts }
}

describe('message-updaters', () => {
  describe('updateTextPart', () => {
    it('should add a new text part when message has no parts', () => {
      const messages = [createMessage('msg-1')]
      const result = updateTextPart(messages, 'msg-1', 'Hello')

      expect(result).toHaveLength(1)
      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({ type: 'text', content: 'Hello' })
    })

    it('should update the last text part when it exists', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'text', content: 'Hello' },
        ]),
      ]
      const result = updateTextPart(messages, 'msg-1', 'Hello world')

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })

    it('should add a new text part after tool calls', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateTextPart(messages, 'msg-1', 'The weather is sunny')

      expect(result[0]?.parts).toHaveLength(2)
      expect(result[0]?.parts[1]).toEqual({
        type: 'text',
        content: 'The weather is sunny',
      })
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'text', content: 'Hello' },
        ]),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateTextPart(messages, 'msg-1', 'Hello world')

      expect(result[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
      expect(result[1]?.parts[0]).toEqual({ type: 'text', content: 'Hi' })
    })

    it('should not modify messages with different IDs', () => {
      const messages = [createMessage('msg-1'), createMessage('msg-2')]
      const result = updateTextPart(messages, 'msg-1', 'Hello')

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[1]?.parts).toHaveLength(0)
    })

    it('should handle multiple text segments correctly', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'text', content: 'First segment' },
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateTextPart(messages, 'msg-1', 'Second segment')

      expect(result[0]?.parts).toHaveLength(3)
      expect(result[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'First segment',
      })
      expect(result[0]?.parts[2]).toEqual({
        type: 'text',
        content: 'Second segment',
      })
    })
  })

  describe('updateToolCallPart', () => {
    it('should add a new tool call part', () => {
      const messages = [createMessage('msg-1')]
      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })
    })

    it('should update an existing tool call by ID', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{"location":"Par',
            state: 'input-streaming',
          },
        ]),
      ]
      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })
    })

    it('should add multiple tool calls', () => {
      const messages = [createMessage('msg-1')]
      let result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-complete',
      })
      result = updateToolCallPart(result, 'msg-1', {
        id: 'call-2',
        name: 'getTime',
        arguments: '{}',
        state: 'input-complete',
      })

      expect(result[0]?.parts).toHaveLength(2)
      expect(result[0]?.parts[0]?.type).toBe('tool-call')
      expect(result[0]?.parts[1]?.type).toBe('tool-call')
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1'),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-complete',
      })

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[1]?.parts).toHaveLength(1)
      expect(result[1]?.parts[0]).toEqual({ type: 'text', content: 'Hi' })
    })

    it('should find tool call by ID, not index', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'getTime',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })
      expect(result[0]?.parts[1]).toEqual({
        type: 'tool-call',
        id: 'call-2',
        name: 'getTime',
        arguments: '{}',
        state: 'input-complete',
      })
    })
  })

  describe('updateToolResultPart', () => {
    it('should add a new tool result part', () => {
      const messages = [createMessage('msg-1')]
      const result = updateToolResultPart(
        messages,
        'msg-1',
        'call-1',
        '{"temperature":20}',
        'complete',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: '{"temperature":20}',
        state: 'complete',
      })
    })

    it('should update an existing tool result by toolCallId', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: '{"temperature":',
            state: 'streaming',
          },
        ]),
      ]
      const result = updateToolResultPart(
        messages,
        'msg-1',
        'call-1',
        '{"temperature":20}',
        'complete',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: '{"temperature":20}',
        state: 'complete',
      })
    })

    it('should include error when provided', () => {
      const messages = [createMessage('msg-1')]
      const result = updateToolResultPart(
        messages,
        'msg-1',
        'call-1',
        'Error occurred',
        'error',
        'Tool execution failed',
      )

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Error occurred',
        state: 'error',
        error: 'Tool execution failed',
      })
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1'),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateToolResultPart(
        messages,
        'msg-1',
        'call-1',
        '{}',
        'complete',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[1]?.parts).toHaveLength(1)
    })
  })

  describe('updateToolCallApproval', () => {
    it('should update tool call with approval metadata', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{"path":"/tmp/file"}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateToolCallApproval(
        messages,
        'msg-1',
        'call-1',
        'approval-123',
      )

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'deleteFile',
        arguments: '{"path":"/tmp/file"}',
        state: 'approval-requested',
        approval: {
          id: 'approval-123',
          needsApproval: true,
        },
      })
    })

    it('should not modify tool calls that do not exist', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateToolCallApproval(
        messages,
        'msg-1',
        'call-2',
        'approval-123',
      )

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-complete',
      })
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateToolCallApproval(
        messages,
        'msg-1',
        'call-1',
        'approval-123',
      )

      expect(result[1]?.parts[0]).toEqual({ type: 'text', content: 'Hi' })
    })
  })

  describe('updateToolCallState', () => {
    it('should update tool call state', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{"location":"Par',
            state: 'input-streaming',
          },
        ]),
      ]
      const result = updateToolCallState(
        messages,
        'msg-1',
        'call-1',
        'input-complete',
      )

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Par',
        state: 'input-complete',
      })
    })

    it('should not modify tool calls that do not exist', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateToolCallState(
        messages,
        'msg-1',
        'call-2',
        'approval-requested',
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.state).toBe('input-complete')
    })
  })

  describe('updateToolCallWithOutput', () => {
    it('should update tool call with output', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const output = { temperature: 20, conditions: 'sunny' }
      const result = updateToolCallWithOutput(messages, 'call-1', output)

      expect(result[0]?.parts[0]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-complete',
        output,
      })
    })

    it('should update state when provided', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const output = { temperature: 20 }
      const result = updateToolCallWithOutput(
        messages,
        'call-1',
        output,
        'approval-requested',
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.state).toBe('approval-requested')
      expect(part?.output).toEqual(output)
    })

    it('should default to input-complete state when not provided', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-streaming',
          },
        ]),
      ]
      const output = { temperature: 20 }
      const result = updateToolCallWithOutput(messages, 'call-1', output)

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.state).toBe('input-complete')
    })

    it('should handle error output', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const result = updateToolCallWithOutput(
        messages,
        'call-1',
        null,
        undefined,
        'Tool execution failed',
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.output).toEqual({ error: 'Tool execution failed' })
    })

    it('should search across all messages', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
        createMessage('msg-2', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'getTime',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
      ]
      const output = { temperature: 20 }
      const result = updateToolCallWithOutput(messages, 'call-2', output)

      const part0 = result[0]?.parts[0] as ToolCallPart | undefined
      const part1 = result[1]?.parts[0] as ToolCallPart | undefined
      expect(part0?.output).toBeUndefined()
      expect(part1?.output).toEqual(output)
    })
  })

  describe('updateToolCallApprovalResponse', () => {
    it('should update approval response', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{}',
            state: 'approval-requested',
            approval: {
              id: 'approval-123',
              needsApproval: true,
            },
          },
        ]),
      ]
      const result = updateToolCallApprovalResponse(
        messages,
        'approval-123',
        true,
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.approval?.approved).toBe(true)
      expect(part?.state).toBe('approval-responded')
    })

    it('should handle rejection', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{}',
            state: 'approval-requested',
            approval: {
              id: 'approval-123',
              needsApproval: true,
            },
          },
        ]),
      ]
      const result = updateToolCallApprovalResponse(
        messages,
        'approval-123',
        false,
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.approval?.approved).toBe(false)
      expect(part?.state).toBe('approval-responded')
    })

    it('should search across all messages', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
        ]),
        createMessage('msg-2', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'deleteFile',
            arguments: '{}',
            state: 'approval-requested',
            approval: {
              id: 'approval-123',
              needsApproval: true,
            },
          },
        ]),
      ]
      const result = updateToolCallApprovalResponse(
        messages,
        'approval-123',
        true,
      )

      const part0 = result[0]?.parts[0] as ToolCallPart | undefined
      const part1 = result[1]?.parts[0] as ToolCallPart | undefined
      expect(part0?.approval).toBeUndefined()
      expect(part1?.approval?.approved).toBe(true)
    })

    it('should not modify tool calls without matching approval ID', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{}',
            state: 'approval-requested',
            approval: {
              id: 'approval-123',
              needsApproval: true,
            },
          },
        ]),
      ]
      const result = updateToolCallApprovalResponse(
        messages,
        'approval-456',
        true,
      )

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.approval?.approved).toBeUndefined()
    })
  })

  describe('updateThinkingPart', () => {
    it('should add a new thinking part', () => {
      const messages = [createMessage('msg-1')]
      const result = updateThinkingPart(messages, 'msg-1', 'Let me think...')

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'Let me think...',
      })
    })

    it('should update existing thinking part', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'thinking', content: 'Let me think' },
        ]),
      ]
      const result = updateThinkingPart(
        messages,
        'msg-1',
        'Let me think about this',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'Let me think about this',
      })
    })

    it('should only update the first thinking part if multiple exist', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'thinking', content: 'First' },
          { type: 'text', content: 'Some text' },
          { type: 'thinking', content: 'Second' },
        ]),
      ]
      const result = updateThinkingPart(messages, 'msg-1', 'Updated first')

      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'Updated first',
      })
      expect(result[0]?.parts[2]).toEqual({
        type: 'thinking',
        content: 'Second',
      })
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1'),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateThinkingPart(messages, 'msg-1', 'Thinking...')

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[1]?.parts).toHaveLength(1)
      expect(result[1]?.parts[0]).toEqual({ type: 'text', content: 'Hi' })
    })
  })

  describe('Immutability', () => {
    it('should not mutate original messages array', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'text', content: 'Hello' },
        ]),
      ]
      const originalParts = messages[0]!.parts
      updateTextPart(messages, 'msg-1', 'Hello world')

      expect(messages[0]?.parts).toBe(originalParts)
      expect(messages[0]?.parts[0]).toEqual({ type: 'text', content: 'Hello' })
    })

    it('should not mutate original message parts array', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'text', content: 'Hello' },
        ]),
      ]
      const originalParts = messages[0]!.parts
      const result = updateTextPart(messages, 'msg-1', 'Hello world')

      expect(result[0]?.parts).not.toBe(originalParts)
      expect(messages[0]?.parts).toBe(originalParts)
    })
  })
})
