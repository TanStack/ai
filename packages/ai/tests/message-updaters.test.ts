import { describe, expect, it } from 'vitest'
import {
  appendStructuredOutputDelta,
  completeStructuredOutputPart,
  errorStructuredOutputPart,
  updateTextPart,
  updateThinkingPart,
  updateToolCallApproval,
  updateToolCallApprovalResponse,
  updateToolCallPart,
  updateToolCallState,
  updateToolCallWithOutput,
  updateToolResultPart,
} from '../src/activities/chat/stream/message-updaters'
import type {
  StructuredOutputPart,
  ToolCallPart,
  UIMessage,
} from '../src/types'

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

    it('should preserve existing approval metadata when updating a tool call', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'deleteFile',
            arguments: '{"path":"/tmp/file"}',
            state: 'approval-requested',
            approval: {
              id: 'approval-123',
              needsApproval: true,
              approved: true,
            },
          },
        ]),
      ]

      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'deleteFile',
        arguments: '{"path":"/tmp/file"}',
        state: 'approval-responded',
      })

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.approval).toEqual({
        id: 'approval-123',
        needsApproval: true,
        approved: true,
      })
    })

    it('should preserve existing output when updating a tool call', () => {
      const toolOutput = { temperature: 20, conditions: 'sunny' }
      const messages = [
        createMessage('msg-1', 'assistant', [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'getWeather',
            arguments: '{"location":"Paris"}',
            state: 'input-complete',
            output: toolOutput,
          },
        ]),
      ]

      const result = updateToolCallPart(messages, 'msg-1', {
        id: 'call-1',
        name: 'getWeather',
        arguments: '{"location":"Paris"}',
        state: 'input-complete',
      })

      const part = result[0]?.parts[0] as ToolCallPart | undefined
      expect(part?.output).toEqual(toolOutput)
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
    it('should update tool call with output and complete state', () => {
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
        state: 'complete',
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

    it('should default to complete state when not provided', () => {
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
      expect(part?.state).toBe('complete')
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
      expect(part?.state).toBe('input-complete')
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
      const result = updateThinkingPart(
        messages,
        'msg-1',
        'step-1',
        'Let me think...',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'Let me think...',
        stepId: 'step-1',
      })
    })

    it('should update existing thinking part by stepId', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'thinking', content: 'Let me think', stepId: 'step-1' },
        ]),
      ]
      const result = updateThinkingPart(
        messages,
        'msg-1',
        'step-1',
        'Let me think about this',
      )

      expect(result[0]?.parts).toHaveLength(1)
      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'Let me think about this',
        stepId: 'step-1',
      })
    })

    it('should create separate parts for different stepIds', () => {
      const messages = [
        createMessage('msg-1', 'assistant', [
          { type: 'thinking', content: 'First', stepId: 'step-1' },
          { type: 'text', content: 'Some text' },
        ]),
      ]
      const result = updateThinkingPart(messages, 'msg-1', 'step-2', 'Second')

      expect(result[0]?.parts).toHaveLength(3)
      expect(result[0]?.parts[0]).toEqual({
        type: 'thinking',
        content: 'First',
        stepId: 'step-1',
      })
      expect(result[0]?.parts[2]).toEqual({
        type: 'thinking',
        content: 'Second',
        stepId: 'step-2',
      })
    })

    it('should not modify other messages', () => {
      const messages = [
        createMessage('msg-1'),
        createMessage('msg-2', 'user', [{ type: 'text', content: 'Hi' }]),
      ]
      const result = updateThinkingPart(
        messages,
        'msg-1',
        'step-1',
        'Thinking...',
      )

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

    it('updateToolCallApproval should not mutate the original tool-call part', () => {
      const originalPart: ToolCallPart = {
        type: 'tool-call',
        id: 'call-1',
        name: 'deleteFile',
        arguments: '{"path":"/tmp/file"}',
        state: 'input-complete',
      }
      const messages = [createMessage('msg-1', 'assistant', [originalPart])]

      const result = updateToolCallApproval(
        messages,
        'msg-1',
        'call-1',
        'approval-1',
      )

      // Original part must be unchanged
      expect(originalPart.state).toBe('input-complete')
      expect(originalPart.approval).toBeUndefined()

      // Result must have new values
      const resultPart = result[0]?.parts[0] as ToolCallPart
      expect(resultPart).not.toBe(originalPart)
      expect(resultPart.state).toBe('approval-requested')
      expect(resultPart.approval).toEqual({
        id: 'approval-1',
        needsApproval: true,
      })
    })

    it('updateToolCallState should not mutate the original tool-call part', () => {
      const originalPart: ToolCallPart = {
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-streaming',
      }
      const messages = [createMessage('msg-1', 'assistant', [originalPart])]

      const result = updateToolCallState(
        messages,
        'msg-1',
        'call-1',
        'input-complete',
      )

      expect(originalPart.state).toBe('input-streaming')

      const resultPart = result[0]?.parts[0] as ToolCallPart
      expect(resultPart).not.toBe(originalPart)
      expect(resultPart.state).toBe('input-complete')
    })

    it('updateToolCallWithOutput should not mutate the original tool-call part', () => {
      const originalPart: ToolCallPart = {
        type: 'tool-call',
        id: 'call-1',
        name: 'getWeather',
        arguments: '{}',
        state: 'input-complete',
      }
      const messages = [createMessage('msg-1', 'assistant', [originalPart])]
      const output = { temperature: 20 }

      const result = updateToolCallWithOutput(messages, 'call-1', output)

      expect(originalPart.output).toBeUndefined()
      expect(originalPart.state).toBe('input-complete')

      const resultPart = result[0]?.parts[0] as ToolCallPart
      expect(resultPart).not.toBe(originalPart)
      expect(resultPart.output).toEqual(output)
    })

    it('updateToolCallApprovalResponse should not mutate the original tool-call part', () => {
      const originalApproval: NonNullable<ToolCallPart['approval']> = {
        id: 'approval-1',
        needsApproval: true,
      }
      const originalPart: ToolCallPart = {
        type: 'tool-call',
        id: 'call-1',
        name: 'deleteFile',
        arguments: '{}',
        state: 'approval-requested',
        approval: originalApproval,
      }
      const messages = [createMessage('msg-1', 'assistant', [originalPart])]

      const result = updateToolCallApprovalResponse(
        messages,
        'approval-1',
        true,
      )

      // Original part and approval must be unchanged
      expect(originalPart.state).toBe('approval-requested')
      expect(originalApproval.approved).toBeUndefined()

      const resultPart = result[0]?.parts[0] as ToolCallPart
      expect(resultPart).not.toBe(originalPart)
      expect(resultPart.approval).not.toBe(originalApproval)
      expect(resultPart.state).toBe('approval-responded')
      expect(resultPart.approval?.approved).toBe(true)
    })
  })

  describe('appendStructuredOutputDelta', () => {
    it('preserves the last-good partial when a delta makes the buffer unparseable', () => {
      // Existing part holds a valid `partial` from earlier deltas. A new
      // delta lands that, appended to the existing raw, can no longer be
      // partial-parsed (buffer starts with non-JSON garbage). The helper
      // must preserve the last-good `partial` rather than dropping it,
      // otherwise the UI would flicker back to empty for one render.
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'streaming',
              raw: 'xxx',
              partial: { rememberMe: 'last good' },
            } as StructuredOutputPart,
          ],
          createdAt: new Date(),
        },
      ]

      const result = appendStructuredOutputDelta(messages, 'msg-1', '{"a":1}')

      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('streaming')
      expect(sop.raw).toBe('xxx{"a":1}')
      // parsePartialJSON('xxx{"a":1}') throws → returns undefined.
      // Fix: fall back to the previously-good partial instead of dropping it.
      expect(sop.partial).toEqual({ rememberMe: 'last good' })
    })

    it('updates partial when the buffer becomes parseable again', () => {
      // Sanity check: if the next delta IS parseable, use the fresh result,
      // not the stale existing one.
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'streaming',
              raw: '{"a":1',
              partial: { a: 1 },
            } as StructuredOutputPart,
          ],
          createdAt: new Date(),
        },
      ]

      const result = appendStructuredOutputDelta(messages, 'msg-1', ',"b":2}')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.raw).toBe('{"a":1,"b":2}')
      expect(sop.partial).toEqual({ a: 1, b: 2 })
    })
  })

  describe('completeStructuredOutputPart', () => {
    it('falls back to JSON.stringify(data) when no raw is available (terminal-only complete)', () => {
      // Models / adapters that send only the terminal `structured-output.complete`
      // (no streamed JSON deltas) leave the part with empty raw. The helper must
      // synthesize raw from `data` so the wire converter still has something
      // to ship on the next turn. Verified end-to-end in the round-trip path.
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: new Date(),
        },
      ]

      const data = { ok: true, n: 42 }
      const result = completeStructuredOutputPart(messages, 'msg-1', data, '')

      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('complete')
      expect(sop.data).toEqual(data)
      expect(sop.raw).toBe(JSON.stringify(data))
    })

    it('leaves raw empty when data is unserializable (BigInt) without throwing', () => {
      // Documents the catch-and-leave-empty contract: downstream filters
      // (ag-ui-wire `collectText`, messages.ts `uiMessageToModelMessages`)
      // refuse to round-trip complete parts with empty raw AND unserializable
      // data, so the stream doesn't crash and the offending turn is silently
      // dropped from history. A regression that removed the try/catch would
      // crash the entire stream processor; this test pins that down.
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: new Date(),
        },
      ]

      const data = { value: 1n }
      expect(() =>
        completeStructuredOutputPart(messages, 'msg-1', data, ''),
      ).not.toThrow()

      const result = completeStructuredOutputPart(messages, 'msg-1', data, '')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('complete')
      expect(sop.raw).toBe('')
    })

    it('leaves raw empty when data has a circular reference without throwing', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: new Date(),
        },
      ]

      const data: Record<string, unknown> = { name: 'circ' }
      data['self'] = data

      expect(() =>
        completeStructuredOutputPart(messages, 'msg-1', data, ''),
      ).not.toThrow()
      const result = completeStructuredOutputPart(messages, 'msg-1', data, '')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.raw).toBe('')
    })

    it('prefers caller-supplied raw over existing buffer and over data fallback', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'streaming',
              raw: '{"partial":1',
            } as StructuredOutputPart,
          ],
          createdAt: new Date(),
        },
      ]
      const result = completeStructuredOutputPart(
        messages,
        'msg-1',
        { a: 1 },
        '{"a":1}',
      )
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.raw).toBe('{"a":1}')
    })
  })

  describe('errorStructuredOutputPart', () => {
    it('creates an empty errored placeholder when no part exists yet', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [],
          createdAt: new Date(),
        },
      ]
      const result = errorStructuredOutputPart(messages, 'msg-1', 'boom')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('error')
      expect(sop.errorMessage).toBe('boom')
      expect(sop.raw).toBe('')
    })

    it('does not downgrade a complete part to error', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'complete',
              raw: '{"a":1}',
              data: { a: 1 },
              partial: { a: 1 },
            } as StructuredOutputPart,
          ],
          createdAt: new Date(),
        },
      ]
      const result = errorStructuredOutputPart(messages, 'msg-1', 'late error')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('complete')
      expect((sop as { errorMessage?: string }).errorMessage).toBeUndefined()
    })

    it('snaps a streaming part to error preserving raw', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'streaming',
              raw: '{"a":',
              partial: { a: undefined },
            } as StructuredOutputPart,
          ],
          createdAt: new Date(),
        },
      ]
      const result = errorStructuredOutputPart(messages, 'msg-1', 'truncated')
      const sop = result[0]!.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )!
      expect(sop.status).toBe('error')
      expect(sop.errorMessage).toBe('truncated')
      expect(sop.raw).toBe('{"a":')
    })
  })
})
