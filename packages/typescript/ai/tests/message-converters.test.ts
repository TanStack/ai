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
            type: 'tool-result',
            toolCallId: 'tool-1',
            content: '{"temp": 72}',
            state: 'complete',
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should have assistant message + tool message
      expect(result.length).toBe(2)
      expect(result[1]?.role).toBe('tool')
      expect(result[1]?.toolCallId).toBe('tool-1')
      expect(result[1]?.content).toBe('{"temp": 72}')
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
})
