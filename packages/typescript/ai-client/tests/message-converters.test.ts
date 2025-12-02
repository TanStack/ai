import { describe, expect, it } from 'vitest'
import {
  convertMessagesToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
  uiMessageToModelMessages,
} from '../src/message-converters'
import type { UIMessage } from '../src/types'
import type { ContentPart, ModelMessage } from '@tanstack/ai'

describe('message-converters', () => {
  describe('convertMessagesToModelMessages', () => {
    it('should convert UIMessages to ModelMessages', () => {
      const uiMessages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
          createdAt: new Date(),
        },
      ]

      const result = convertMessagesToModelMessages(uiMessages)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Hello',
      })
    })

    it('should pass through ModelMessages', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'user',
          content: 'Hello',
        },
      ]

      const result = convertMessagesToModelMessages(modelMessages)
      expect(result).toEqual(modelMessages)
    })

    it('should handle mixed UIMessages and ModelMessages', () => {
      const messages: Array<UIMessage | ModelMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
          createdAt: new Date(),
        },
        {
          role: 'assistant',
          content: 'Hi there',
        },
      ]

      const result = convertMessagesToModelMessages(messages)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' })
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' })
    })

    it('should handle empty array', () => {
      const result = convertMessagesToModelMessages([])
      expect(result).toEqual([])
    })
  })

  describe('uiMessageToModelMessages', () => {
    it('should convert text-only message', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Hello',
      })
    })

    it('should convert message with multiple text parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Hello ' },
          { type: 'text', content: 'World' },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result[0]?.content).toBe('Hello World')
    })

    it('should convert message with tool calls', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'get_weather',
            arguments: '{"city": "NYC"}',
            state: 'input-complete',
          },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result).toHaveLength(1)
      expect(result[0]?.toolCalls).toBeDefined()
      expect(result[0]?.toolCalls?.[0]).toEqual({
        id: 'call-1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city": "NYC"}',
        },
      })
    })

    it('should filter tool calls by state', () => {
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
          {
            type: 'tool-call',
            id: 'call-2',
            name: 'tool2',
            arguments: '{}',
            state: 'input-streaming', // Not complete
          },
          {
            type: 'tool-call',
            id: 'call-3',
            name: 'tool3',
            arguments: '{}',
            state: 'approval-responded',
          },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result[0]?.toolCalls).toHaveLength(2) // call-1 and call-3
      expect(result[0]?.toolCalls?.map((tc) => tc.id)).toEqual([
        'call-1',
        'call-3',
      ])
    })

    it('should include tool calls with output', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call-1',
            name: 'tool1',
            arguments: '{}',
            state: 'awaiting-input',
            output: { result: 'success' },
          },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result[0]?.toolCalls).toHaveLength(1)
    })

    it('should convert tool result parts to separate messages', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: 'Result content',
            state: 'complete',
          },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result).toHaveLength(2) // Main message + tool result
      expect(result[1]).toEqual({
        role: 'tool',
        content: 'Result content',
        toolCallId: 'call-1',
      })
    })

    it('should filter tool results by state', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            content: 'Complete',
            state: 'complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-2',
            content: 'Error',
            state: 'error',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-3',
            content: 'Streaming',
            state: 'streaming', // Not included
          },
        ],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result).toHaveLength(3) // Main message + 2 tool results
      expect(result.filter((m) => m.role === 'tool')).toHaveLength(2)
    })

    it('should handle assistant message with only tool calls', () => {
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

      const result = uiMessageToModelMessages(uiMessage)
      expect(result).toHaveLength(1)
      expect(result[0]?.toolCalls).toBeDefined()
      expect(result[0]?.content).toBeNull()
    })

    it('should handle message with text and tool calls', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me check' },
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

      const result = uiMessageToModelMessages(uiMessage)
      expect(result[0]?.content).toBe('Let me check')
      expect(result[0]?.toolCalls).toBeDefined()
    })

    it('should handle empty content', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [],
        createdAt: new Date(),
      }

      const result = uiMessageToModelMessages(uiMessage)
      expect(result[0]?.content).toBeNull()
    })
  })

  describe('modelMessageToUIMessage', () => {
    it('should convert text message', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      expect(result.id).toBe('msg-1')
      expect(result.role).toBe('user')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'Hello',
      })
    })

    it('should generate ID if not provided', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const result = modelMessageToUIMessage(modelMessage)
      expect(result.id).toBeTruthy()
      expect(result.id).toMatch(/^msg-/)
    })

    it('should convert message with tool calls', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: 'Here is the info',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"city": "NYC"}',
            },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)
      // Should have both text and tool-call parts
      expect(result.parts).toHaveLength(2)
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'Here is the info',
      })
      expect(result.parts[1]).toEqual({
        type: 'tool-call',
        id: 'call-1',
        name: 'get_weather',
        arguments: '{"city": "NYC"}',
        state: 'input-complete',
      })
    })

    it('should convert tool role message', () => {
      const modelMessage: ModelMessage = {
        role: 'tool',
        content: 'Tool result',
        toolCallId: 'call-1',
      }

      const result = modelMessageToUIMessage(modelMessage)
      expect(result.role).toBe('assistant') // Tool messages converted to assistant
      // Tool messages with content create both text and tool-result parts
      expect(result.parts.length).toBeGreaterThanOrEqual(1)
      const toolResultPart = result.parts.find((p) => p.type === 'tool-result')
      expect(toolResultPart).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Tool result',
        state: 'complete',
      })
    })

    it('should handle message without content', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'tool1',
              arguments: '{}',
            },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]?.type).toBe('tool-call')
    })

    it('should handle empty tool result content', () => {
      const modelMessage: ModelMessage = {
        role: 'tool',
        content: null,
        toolCallId: 'call-1',
      }

      const result = modelMessageToUIMessage(modelMessage)
      expect(result.parts[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: '',
        state: 'complete',
      })
    })
  })

  describe('modelMessagesToUIMessages', () => {
    it('should convert simple messages', () => {
      const modelMessages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(2)
      expect(result[0]?.role).toBe('user')
      expect(result[1]?.role).toBe('assistant')
    })

    it('should merge tool results into assistant messages', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          content: 'Result',
          toolCallId: 'call-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(1)
      expect(result[0]?.parts).toHaveLength(2) // tool-call + tool-result
      expect(result[0]?.parts[1]).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Result',
        state: 'complete',
      })
    })

    it('should create standalone tool result if no assistant message', () => {
      const modelMessages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        {
          role: 'tool',
          content: 'Result',
          toolCallId: 'call-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(2)
      expect(result[1]?.role).toBe('assistant')
      // Tool messages with content create both text and tool-result parts
      const toolResultPart = result[1]?.parts.find(
        (p) => p.type === 'tool-result',
      )
      expect(toolResultPart).toBeDefined()
      expect(toolResultPart).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Result',
        state: 'complete',
      })
    })

    it('should reset assistant tracking on non-assistant message', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'First',
        },
        { role: 'user', content: 'Second' },
        {
          role: 'tool',
          content: 'Result',
          toolCallId: 'call-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(3)
      // Tool result should be standalone since user message reset tracking
      // Tool messages with content create both text and tool-result parts
      const toolResultPart = result[2]?.parts.find(
        (p) => p.type === 'tool-result',
      )
      expect(toolResultPart).toBeDefined()
      expect(toolResultPart).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Result',
        state: 'complete',
      })
    })

    it('should handle multiple tool results for same assistant', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'tool1', arguments: '{}' },
            },
            {
              id: 'call-2',
              type: 'function',
              function: { name: 'tool2', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          content: 'Result 1',
          toolCallId: 'call-1',
        },
        {
          role: 'tool',
          content: 'Result 2',
          toolCallId: 'call-2',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(1)
      expect(result[0]?.parts).toHaveLength(4) // 2 tool-calls + 2 tool-results
    })
  })

  describe('normalizeToUIMessage', () => {
    it('should normalize UIMessage with missing id', () => {
      const uiMessage: UIMessage = {
        id: '',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
      }

      const generateId = () => 'generated-id'
      const result = normalizeToUIMessage(uiMessage, generateId)

      expect(result.id).toBe('generated-id')
      expect(result.createdAt).toBeInstanceOf(Date)
    })

    it('should normalize UIMessage with missing createdAt', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
      }

      const generateId = () => 'id'
      const result = normalizeToUIMessage(uiMessage, generateId)

      expect(result.id).toBe('msg-1')
      expect(result.createdAt).toBeInstanceOf(Date)
    })

    it('should preserve existing id and createdAt', () => {
      const createdAt = new Date('2024-01-01')
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt,
      }

      const generateId = () => 'new-id'
      const result = normalizeToUIMessage(uiMessage, generateId)

      expect(result.id).toBe('msg-1')
      expect(result.createdAt).toBe(createdAt)
    })

    it('should convert ModelMessage to UIMessage', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const generateId = () => 'msg-1'
      const result = normalizeToUIMessage(modelMessage, generateId)

      expect(result.id).toBe('msg-1')
      expect(result.role).toBe('user')
      expect(result.parts).toHaveLength(1)
      expect(result.createdAt).toBeInstanceOf(Date)
    })

    it('should convert ModelMessage with tool calls', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'tool1', arguments: '{}' },
          },
        ],
      }

      const generateId = () => 'msg-1'
      const result = normalizeToUIMessage(modelMessage, generateId)

      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]?.type).toBe('tool-call')
    })
  })

  describe('multimodal content handling', () => {
    it('should extract text from multimodal ContentPart array', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello ' },
          {
            type: 'image',
            source: { type: 'data', value: 'base64data' },
          },
          { type: 'text', text: 'world' },
        ] as Array<ContentPart>,
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })

    it('should handle multimodal content with only image parts', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/image.jpg' },
          },
        ] as Array<ContentPart>,
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      // No text parts, so no text part in output
      expect(result.parts).toHaveLength(0)
    })

    it('should handle multimodal content in tool results', () => {
      const modelMessage: ModelMessage = {
        role: 'tool',
        toolCallId: 'call-1',
        content: [
          { type: 'text', text: 'Tool result with ' },
          { type: 'text', text: 'multiple parts' },
        ] as Array<ContentPart>,
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      const toolResultPart = result.parts.find((p) => p.type === 'tool-result')
      expect(toolResultPart).toEqual({
        type: 'tool-result',
        toolCallId: 'call-1',
        content: 'Tool result with multiple parts',
        state: 'complete',
      })
    })

    it('should pass through string content unchanged', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Simple string content',
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'Simple string content',
      })
    })

    it('should handle mixed multimodal content in modelMessagesToUIMessages', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Check this image: ' },
            {
              type: 'image',
              source: { type: 'data', value: 'base64...' },
            },
          ] as Array<ContentPart>,
        },
        {
          role: 'assistant',
          content: 'I can see the image',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)
      expect(result).toHaveLength(2)
      expect(result[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Check this image: ',
      })
      expect(result[1]?.parts[0]).toEqual({
        type: 'text',
        content: 'I can see the image',
      })
    })

    it('should handle document parts by extracting only text', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is the document: ' },
          {
            type: 'document',
            source: { type: 'data', value: 'pdf-base64' },
            metadata: { media_type: 'application/pdf' },
          },
          { type: 'text', text: ' Please analyze it.' },
        ] as Array<ContentPart>,
      }

      const result = modelMessageToUIMessage(modelMessage, 'msg-1')
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'Here is the document:  Please analyze it.',
      })
    })
  })
})
