import { describe, expect, it } from 'vitest'
import {
  modelMessageToUIMessage,
  uiMessageToModelMessages,
} from '../src/activities/chat/messages'
import type { ContentPart, ModelMessage, UIMessage } from '../src/types'

describe('Message Converters', () => {
  describe('uiMessageToModelMessages', () => {
    it('should convert simple text message', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
      ])
    })

    it('should convert multiple text parts to single string', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Hello ' },
          { type: 'text', content: 'world!' },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result).toEqual([
        {
          role: 'user',
          content: 'Hello world!',
        },
      ])
    })

    it('should convert multimodal message with image to ContentPart array', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'What is in this image?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/cat.jpg' },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result.length).toBe(1)
      expect(result[0]?.role).toBe('user')
      expect(Array.isArray(result[0]?.content)).toBe(true)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts.length).toBe(2)
      expect(contentParts[0]).toEqual({
        type: 'text',
        content: 'What is in this image?',
      })
      expect(contentParts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/cat.jpg' },
      })
    })

    it('should convert multimodal message with audio', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Transcribe this' },
          {
            type: 'audio',
            source: {
              type: 'data',
              value: 'base64audio',
              mimeType: 'audio/mp3',
            },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts[1]).toEqual({
        type: 'audio',
        source: { type: 'data', value: 'base64audio', mimeType: 'audio/mp3' },
      })
    })

    it('should convert multimodal message with video', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Describe this video' },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/video.mp4' },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts[1]).toEqual({
        type: 'video',
        source: { type: 'url', value: 'https://example.com/video.mp4' },
      })
    })

    it('should convert multimodal message with document', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Summarize this document' },
          {
            type: 'document',
            source: {
              type: 'data',
              value: 'base64pdf',
              mimeType: 'application/pdf',
            },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts[1]).toEqual({
        type: 'document',
        source: {
          type: 'data',
          value: 'base64pdf',
          mimeType: 'application/pdf',
        },
      })
    })

    it('should preserve order of text and multimodal parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img1.jpg' },
          },
          { type: 'text', content: 'First image above' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img2.jpg' },
          },
          { type: 'text', content: 'Second image above' },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts.length).toBe(4)
      expect(contentParts[0]?.type).toBe('image')
      expect(contentParts[1]?.type).toBe('text')
      expect(contentParts[2]?.type).toBe('image')
      expect(contentParts[3]?.type).toBe('text')
    })

    it('should skip thinking parts in conversion', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'thinking', content: 'Let me think...' },
          { type: 'text', content: 'Here is my answer' },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result.length).toBe(1)
      expect(result[0]?.content).toBe('Here is my answer')
    })

    it('should skip system messages', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'system',
        parts: [{ type: 'text', content: 'You are a helpful assistant' }],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result).toEqual([])
    })

    it('should handle text-only message without multimodal parts as string content', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Just text' }],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should be string, not array
      expect(typeof result[0]?.content).toBe('string')
      expect(result[0]?.content).toBe('Just text')
    })

    it('should handle empty parts array', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result.length).toBe(1)
      expect(result[0]?.content).toBe(null)
    })

    it('should handle multimodal message with only image (no text)', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/cat.jpg' },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(Array.isArray(result[0]?.content)).toBe(true)
      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts.length).toBe(1)
      expect(contentParts[0]?.type).toBe('image')
    })

    it('should include metadata in multimodal parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'Analyze' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/cat.jpg' },
            metadata: { detail: 'high' },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const contentParts = result[0]?.content as Array<ContentPart>
      expect(contentParts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/cat.jpg' },
        metadata: { detail: 'high' },
      })
    })

    it('should handle tool call parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tool-1',
            name: 'getWeather',
            arguments: '{"city": "NYC"}',
            state: 'input-complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result[0]?.toolCalls).toBeDefined()
      expect(result[0]?.toolCalls?.length).toBe(1)
      expect(result[0]?.toolCalls?.[0]).toEqual({
        id: 'tool-1',
        type: 'function',
        function: {
          name: 'getWeather',
          arguments: '{"city": "NYC"}',
        },
      })
    })

    it('should handle tool result parts', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tool-1',
            name: 'getWeather',
            arguments: '{"city": "NYC"}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tool-1',
            content: '{"temp": 72}',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should have assistant message (with tool call) + tool result message
      expect(result.length).toBe(2)
      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.toolCalls?.[0]?.id).toBe('tool-1')
      expect(result[1]?.role).toBe('tool')
      expect(result[1]?.toolCallId).toBe('tool-1')
      expect(result[1]?.content).toBe('{"temp": 72}')
    })

    it('should preserve interleaving of text, tool calls, and tool results', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me check the weather.' },
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'getWeather',
            arguments: '{"city": "NYC"}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            content: '{"temp": 72}',
            state: 'complete',
          },
          { type: 'text', content: 'The temperature is 72F.' },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should produce: assistant(text1 + toolCall) → tool(result) → assistant(text2)
      expect(result.length).toBe(3)

      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.content).toBe('Let me check the weather.')
      expect(result[0]?.toolCalls).toHaveLength(1)
      expect(result[0]?.toolCalls?.[0]?.id).toBe('tc-1')

      expect(result[1]?.role).toBe('tool')
      expect(result[1]?.toolCallId).toBe('tc-1')
      expect(result[1]?.content).toBe('{"temp": 72}')

      expect(result[2]?.role).toBe('assistant')
      expect(result[2]?.content).toBe('The temperature is 72F.')
      expect(result[2]?.toolCalls).toBeUndefined()
    })

    it('should handle multi-round tool flow (text1 -> tool1 -> result1 -> text2 -> tool2 -> result2)', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me check our inventory.' },
          {
            type: 'tool-call',
            id: 'tc-get',
            name: 'getGuitars',
            arguments: '',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-get',
            content: '[{"id":7,"name":"Travelin Man"}]',
            state: 'complete',
          },
          { type: 'text', content: 'I found a great guitar! Let me recommend it.' },
          {
            type: 'tool-call',
            id: 'tc-rec',
            name: 'recommendGuitar',
            arguments: '{"id": 7}',
            state: 'input-complete',
            output: { id: 7 },
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-rec',
            content: '{"id":7}',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should produce:
      // 1. assistant(text1 + getGuitars)
      // 2. tool(getGuitars result)
      // 3. assistant(text2 + recommendGuitar)
      // 4. tool(recommendGuitar result) -- only once, no duplicate
      expect(result.length).toBe(4)

      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.content).toBe('Let me check our inventory.')
      expect(result[0]?.toolCalls?.[0]?.function.name).toBe('getGuitars')

      expect(result[1]?.role).toBe('tool')
      expect(result[1]?.toolCallId).toBe('tc-get')

      expect(result[2]?.role).toBe('assistant')
      expect(result[2]?.content).toBe('I found a great guitar! Let me recommend it.')
      expect(result[2]?.toolCalls?.[0]?.function.name).toBe('recommendGuitar')

      expect(result[3]?.role).toBe('tool')
      expect(result[3]?.toolCallId).toBe('tc-rec')

      // No duplicate tool result for recommendGuitar (has both output and tool-result)
      const toolMessages = result.filter((m) => m.role === 'tool')
      expect(toolMessages).toHaveLength(2)
    })

    it('should handle tool-call-only segment (no text before tool call)', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'getGuitars',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            content: '[]',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      expect(result.length).toBe(2)
      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.content).toBeNull()
      expect(result[0]?.toolCalls).toHaveLength(1)
      expect(result[1]?.role).toBe('tool')
    })
  })

  describe('modelMessageToUIMessage', () => {
    it('should convert simple text ModelMessage', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('user')
      expect(result.parts).toEqual([{ type: 'text', content: 'Hello' }])
      expect(result.id).toBeTruthy()
    })

    it('should use provided id', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const result = modelMessageToUIMessage(modelMessage, 'custom-id')

      expect(result.id).toBe('custom-id')
    })

    it('should convert multimodal content to text', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'What is this?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img.jpg' },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)

      // Currently, modelMessageToUIMessage only extracts text content
      expect(result.parts).toEqual([{ type: 'text', content: 'What is this?' }])
    })

    it('should handle tool message', () => {
      const modelMessage: ModelMessage = {
        role: 'tool',
        content: '{"result": "success"}',
        toolCallId: 'tool-1',
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('assistant') // Tool messages become assistant
      expect(result.parts).toContainEqual({
        type: 'tool-result',
        toolCallId: 'tool-1',
        content: '{"result": "success"}',
        state: 'complete',
      })
    })
  })

  describe('uiMessageToModelMessages - duplicate tool result prevention', () => {
    it('should not create duplicate tool results when tool-call has output AND tool-result exists', () => {
      // This scenario happens when a client tool executes: the UIMessage has both
      // a tool-call part with output AND a tool-result part for the same toolCallId
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            content: 'Let me recommend a guitar.',
          },
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'recommendGuitar',
            arguments: '{"id": 7}',
            state: 'input-complete',
            output: { id: 7 },
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            content: '{"id":7}',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should have: 1 assistant message + 1 tool result (NOT 2)
      const toolMessages = result.filter((m) => m.role === 'tool')
      expect(toolMessages).toHaveLength(1)
      expect(toolMessages[0]?.toolCallId).toBe('tc-1')
    })

    it('should handle multi-round tool calls without duplicating results', () => {
      // This scenario simulates the full multi-round message:
      // text1 + getGuitars tool call + getGuitars result + text2 + recommendGuitar tool call + recommendGuitar result
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me check our inventory.' },
          {
            type: 'tool-call',
            id: 'tc-get',
            name: 'getGuitars',
            arguments: '',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-get',
            content: '[{"id":7,"name":"Travelin Man Guitar"}]',
            state: 'complete',
          },
          { type: 'text', content: 'I found a great guitar!' },
          {
            type: 'tool-call',
            id: 'tc-rec',
            name: 'recommendGuitar',
            arguments: '{"id": 7}',
            state: 'input-complete',
            output: { id: 7 },
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-rec',
            content: '{"id":7}',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should have exactly 2 tool result messages (one per tool call, no duplicates)
      const toolMessages = result.filter((m) => m.role === 'tool')
      expect(toolMessages).toHaveLength(2)
      expect(toolMessages[0]?.toolCallId).toBe('tc-get')
      expect(toolMessages[1]?.toolCallId).toBe('tc-rec')
    })
  })
})
