import { describe, expect, it } from 'vitest'
import {
  convertMessagesToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages,
  normalizeToUIMessage,
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
          {
            type: 'text',
            content: 'I found a great guitar! Let me recommend it.',
          },
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
      expect(result[2]?.content).toBe(
        'I found a great guitar! Let me recommend it.',
      )
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

    it('should preserve multimodal content parts', () => {
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

      expect(result.parts).toEqual([
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/img.jpg' },
        },
      ])
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

    it('should convert assistant message with toolCalls and text', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: 'Let me check the weather.',
        toolCalls: [
          {
            id: 'tc-1',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city": "NYC"}',
            },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('assistant')
      expect(result.parts).toEqual([
        { type: 'text', content: 'Let me check the weather.' },
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'getWeather',
          arguments: '{"city": "NYC"}',
          state: 'input-complete',
        },
      ])
    })

    it('should convert assistant message with toolCalls and null content', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'tc-1',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city": "NYC"}',
            },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('assistant')
      // Should have only tool-call part, no text part
      expect(result.parts).toEqual([
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'getWeather',
          arguments: '{"city": "NYC"}',
          state: 'input-complete',
        },
      ])
    })

    it('should preserve multimodal content parts (image, audio, video, document)', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'What is this?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img.jpg' },
          },
          {
            type: 'audio',
            source: {
              type: 'data',
              value: 'base64audio',
              mimeType: 'audio/mp3',
            },
          },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/video.mp4' },
          },
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

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.parts.length).toBe(5)
      expect(result.parts[0]).toEqual({
        type: 'text',
        content: 'What is this?',
      })
      expect(result.parts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/img.jpg' },
      })
      expect(result.parts[2]).toEqual({
        type: 'audio',
        source: {
          type: 'data',
          value: 'base64audio',
          mimeType: 'audio/mp3',
        },
      })
      expect(result.parts[3]).toEqual({
        type: 'video',
        source: { type: 'url', value: 'https://example.com/video.mp4' },
      })
      expect(result.parts[4]).toEqual({
        type: 'document',
        source: {
          type: 'data',
          value: 'base64pdf',
          mimeType: 'application/pdf',
        },
      })
    })

    it('should handle null content', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: null,
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('assistant')
      expect(result.parts).toEqual([])
    })

    it('should handle empty string content', () => {
      const modelMessage: ModelMessage = {
        role: 'assistant',
        content: '',
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.role).toBe('assistant')
      // Empty string has no text content, so no text part
      expect(result.parts).toEqual([])
    })

    it('should not produce redundant text part for tool messages', () => {
      const modelMessage: ModelMessage = {
        role: 'tool',
        content: '{"temp": 72}',
        toolCallId: 'tool-1',
      }

      const result = modelMessageToUIMessage(modelMessage)

      // Should have only the tool-result part, NOT a text part + tool-result
      const textParts = result.parts.filter((p) => p.type === 'text')
      const toolResultParts = result.parts.filter(
        (p) => p.type === 'tool-result',
      )
      expect(textParts).toHaveLength(0)
      expect(toolResultParts).toHaveLength(1)
      expect(toolResultParts[0]).toEqual({
        type: 'tool-result',
        toolCallId: 'tool-1',
        content: '{"temp": 72}',
        state: 'complete',
      })
    })

    it('should preserve multimodal content with metadata', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'Analyze' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/cat.jpg' },
            metadata: { detail: 'high' },
          },
        ],
      }

      const result = modelMessageToUIMessage(modelMessage)

      expect(result.parts.length).toBe(2)
      expect(result.parts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/cat.jpg' },
        metadata: { detail: 'high' },
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

  describe('modelMessagesToUIMessages', () => {
    it('should convert simple user + assistant conversation', () => {
      const modelMessages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      expect(result.length).toBe(2)
      expect(result[0]?.role).toBe('user')
      expect(result[0]?.parts).toEqual([{ type: 'text', content: 'Hello' }])
      expect(result[1]?.role).toBe('assistant')
      expect(result[1]?.parts).toEqual([{ type: 'text', content: 'Hi there!' }])
    })

    it('should merge tool result into preceding assistant message', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"temp": 72}',
          toolCallId: 'tc-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      // Tool result should be merged into the assistant message
      expect(result.length).toBe(1)
      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.parts).toEqual([
        { type: 'text', content: 'Let me check.' },
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'getWeather',
          arguments: '{"city":"NYC"}',
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          content: '{"temp": 72}',
          state: 'complete',
        },
      ])
    })

    it('should handle multi-round tool flow with proper merging', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'Checking inventory.',
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getGuitars', arguments: '' },
            },
          ],
        },
        {
          role: 'tool',
          content: '[{"id":7}]',
          toolCallId: 'tc-1',
        },
        {
          role: 'assistant',
          content: 'Found one! Recommending.',
          toolCalls: [
            {
              id: 'tc-2',
              type: 'function',
              function: { name: 'recommend', arguments: '{"id":7}' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"recommended":true}',
          toolCallId: 'tc-2',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      // Each assistant message should have its tool result merged in
      expect(result.length).toBe(2)

      expect(result[0]?.parts).toEqual([
        { type: 'text', content: 'Checking inventory.' },
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'getGuitars',
          arguments: '',
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          content: '[{"id":7}]',
          state: 'complete',
        },
      ])

      expect(result[1]?.parts).toEqual([
        { type: 'text', content: 'Found one! Recommending.' },
        {
          type: 'tool-call',
          id: 'tc-2',
          name: 'recommend',
          arguments: '{"id":7}',
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-2',
          content: '{"recommended":true}',
          state: 'complete',
        },
      ])
    })

    it('should create standalone message for orphan tool result', () => {
      const modelMessages: Array<ModelMessage> = [
        {
          role: 'tool',
          content: '{"result": "orphan"}',
          toolCallId: 'tc-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      expect(result.length).toBe(1)
      expect(result[0]?.role).toBe('assistant')
      expect(result[0]?.parts).toContainEqual({
        type: 'tool-result',
        toolCallId: 'tc-1',
        content: '{"result": "orphan"}',
        state: 'complete',
      })
    })

    it('should not merge tool result across user messages', () => {
      const modelMessages: Array<ModelMessage> = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Another question' },
        {
          role: 'tool',
          content: '{"result": "orphan"}',
          toolCallId: 'tc-1',
        },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      // Tool result should NOT merge into the assistant message (user message in between)
      expect(result.length).toBe(4)
      expect(result[3]?.role).toBe('assistant')
      expect(result[3]?.parts).toContainEqual({
        type: 'tool-result',
        toolCallId: 'tc-1',
        content: '{"result": "orphan"}',
        state: 'complete',
      })
    })

    it('should handle complex interleaved conversation', () => {
      const modelMessages: Array<ModelMessage> = [
        { role: 'user', content: 'Check the weather' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
            },
          ],
        },
        { role: 'tool', content: '{"temp":72}', toolCallId: 'tc-1' },
        { role: 'assistant', content: 'The temperature is 72F.' },
      ]

      const result = modelMessagesToUIMessages(modelMessages)

      expect(result.length).toBe(3)
      expect(result[0]?.role).toBe('user')

      // Assistant with tool call + merged tool result
      expect(result[1]?.role).toBe('assistant')
      const assistantParts = result[1]?.parts || []
      expect(assistantParts).toContainEqual({
        type: 'tool-call',
        id: 'tc-1',
        name: 'getWeather',
        arguments: '{"city":"NYC"}',
        state: 'input-complete',
      })
      expect(assistantParts).toContainEqual({
        type: 'tool-result',
        toolCallId: 'tc-1',
        content: '{"temp":72}',
        state: 'complete',
      })

      // Final assistant text
      expect(result[2]?.role).toBe('assistant')
      expect(result[2]?.parts).toEqual([
        { type: 'text', content: 'The temperature is 72F.' },
      ])
    })
  })

  describe('convertMessagesToModelMessages', () => {
    it('should pass through ModelMessages unchanged', () => {
      const messages: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]

      const result = convertMessagesToModelMessages(messages)

      expect(result).toEqual(messages)
    })

    it('should convert UIMessages to ModelMessages', () => {
      const messages: Array<UIMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
      ]

      const result = convertMessagesToModelMessages(messages)

      expect(result).toEqual([{ role: 'user', content: 'Hello' }])
    })

    it('should handle mixed UIMessage and ModelMessage array', () => {
      const messages: Array<UIMessage | ModelMessage> = [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
        { role: 'assistant', content: 'Hi there!' },
      ]

      const result = convertMessagesToModelMessages(messages)

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ])
    })

    it('should handle empty array', () => {
      const result = convertMessagesToModelMessages([])
      expect(result).toEqual([])
    })
  })

  describe('normalizeToUIMessage', () => {
    it('should pass through UIMessage with existing id and createdAt', () => {
      const date = new Date('2025-01-01')
      const message: UIMessage = {
        id: 'existing-id',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello' }],
        createdAt: date,
      }

      const result = normalizeToUIMessage(message, () => 'generated-id')

      expect(result.id).toBe('existing-id')
      expect(result.createdAt).toBe(date)
      expect(result.parts).toEqual([{ type: 'text', content: 'Hello' }])
    })

    it('should generate id for UIMessage without id', () => {
      const message = {
        id: '',
        role: 'user' as const,
        parts: [{ type: 'text' as const, content: 'Hello' }],
      }

      const result = normalizeToUIMessage(message, () => 'generated-id')

      expect(result.id).toBe('generated-id')
      expect(result.createdAt).toBeTruthy()
    })

    it('should convert ModelMessage to UIMessage', () => {
      const message: ModelMessage = {
        role: 'user',
        content: 'Hello',
      }

      const result = normalizeToUIMessage(message, () => 'generated-id')

      expect(result.id).toBe('generated-id')
      expect(result.role).toBe('user')
      expect(result.parts).toEqual([{ type: 'text', content: 'Hello' }])
      expect(result.createdAt).toBeTruthy()
    })
  })

  describe('Round-trip symmetry: UI -> Model -> UI', () => {
    it('should round-trip simple text user message', () => {
      const original: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello world' }],
      }

      const modelMessages = uiMessageToModelMessages(original)
      const uiMessages = modelMessagesToUIMessages(modelMessages)

      expect(uiMessages.length).toBe(1)
      expect(uiMessages[0]?.role).toBe(original.role)
      expect(uiMessages[0]?.parts).toEqual(original.parts)
    })

    it('should round-trip assistant with tool-call + tool-result', () => {
      const original: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me check.' },
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'getWeather',
            arguments: '{"city":"NYC"}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            content: '{"temp": 72}',
            state: 'complete',
          },
        ],
      }

      const modelMessages = uiMessageToModelMessages(original)
      const uiMessages = modelMessagesToUIMessages(modelMessages)

      // Should produce a single assistant UIMessage with all parts merged back
      expect(uiMessages.length).toBe(1)
      expect(uiMessages[0]?.role).toBe('assistant')
      expect(uiMessages[0]?.parts).toEqual(original.parts)
    })

    it('should round-trip multimodal user message with image', () => {
      const original: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'What is this?' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/img.jpg' },
          },
        ],
      }

      const modelMessages = uiMessageToModelMessages(original)
      const uiMessages = modelMessagesToUIMessages(modelMessages)

      expect(uiMessages.length).toBe(1)
      expect(uiMessages[0]?.role).toBe('user')
      expect(uiMessages[0]?.parts).toEqual(original.parts)
    })

    it('should round-trip multi-round tool flow', () => {
      const original: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Checking inventory.' },
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'getGuitars',
            arguments: '',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-1',
            content: '[{"id":7}]',
            state: 'complete',
          },
          { type: 'text', content: 'Found one!' },
          {
            type: 'tool-call',
            id: 'tc-2',
            name: 'recommend',
            arguments: '{"id":7}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc-2',
            content: '{"recommended":true}',
            state: 'complete',
          },
        ],
      }

      const modelMessages = uiMessageToModelMessages(original)
      const uiMessages = modelMessagesToUIMessages(modelMessages)

      // Multi-round should produce multiple UIMessages (one per segment)
      // but when recombined, the structure should match segments
      expect(uiMessages.length).toBe(2)

      // First segment: text + tool-call + tool-result
      expect(uiMessages[0]?.parts).toEqual([
        { type: 'text', content: 'Checking inventory.' },
        {
          type: 'tool-call',
          id: 'tc-1',
          name: 'getGuitars',
          arguments: '',
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          content: '[{"id":7}]',
          state: 'complete',
        },
      ])

      // Second segment: text + tool-call + tool-result
      expect(uiMessages[1]?.parts).toEqual([
        { type: 'text', content: 'Found one!' },
        {
          type: 'tool-call',
          id: 'tc-2',
          name: 'recommend',
          arguments: '{"id":7}',
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'tc-2',
          content: '{"recommended":true}',
          state: 'complete',
        },
      ])
    })
  })

  describe('Round-trip symmetry: Model -> UI -> Model', () => {
    it('should round-trip simple text messages', () => {
      const original: Array<ModelMessage> = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]

      const uiMessages = modelMessagesToUIMessages(original)
      const modelMessages = convertMessagesToModelMessages(uiMessages)

      expect(modelMessages).toEqual(original)
    })

    it('should round-trip assistant with toolCalls + tool result', () => {
      const original: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"temp": 72}',
          toolCallId: 'tc-1',
        },
      ]

      const uiMessages = modelMessagesToUIMessages(original)
      const modelMessages = convertMessagesToModelMessages(uiMessages)

      expect(modelMessages).toEqual(original)
    })

    it('should round-trip multimodal content array', () => {
      const original: Array<ModelMessage> = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What is this?' },
            {
              type: 'image',
              source: { type: 'url', value: 'https://example.com/img.jpg' },
            },
          ],
        },
      ]

      const uiMessages = modelMessagesToUIMessages(original)
      const modelMessages = convertMessagesToModelMessages(uiMessages)

      expect(modelMessages).toEqual(original)
    })

    it('should round-trip multi-round tool conversation', () => {
      const original: Array<ModelMessage> = [
        { role: 'user', content: 'Check guitars' },
        {
          role: 'assistant',
          content: 'Checking.',
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getGuitars', arguments: '' },
            },
          ],
        },
        { role: 'tool', content: '[{"id":7}]', toolCallId: 'tc-1' },
        {
          role: 'assistant',
          content: 'Found one!',
          toolCalls: [
            {
              id: 'tc-2',
              type: 'function',
              function: { name: 'recommend', arguments: '{"id":7}' },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"recommended":true}',
          toolCallId: 'tc-2',
        },
        { role: 'assistant', content: 'Here is my recommendation.' },
      ]

      const uiMessages = modelMessagesToUIMessages(original)
      const modelMessages = convertMessagesToModelMessages(uiMessages)

      expect(modelMessages).toEqual(original)
    })

    it('should round-trip assistant with null content and toolCalls', () => {
      const original: Array<ModelMessage> = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: { name: 'getWeather', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: '{"temp":72}', toolCallId: 'tc-1' },
      ]

      const uiMessages = modelMessagesToUIMessages(original)
      const modelMessages = convertMessagesToModelMessages(uiMessages)

      expect(modelMessages).toEqual(original)
    })
  })

  describe('uiMessageToModelMessages - approval response handling', () => {
    it('should emit pendingExecution marker for approved client tool', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Let me delete that for you.' },
          {
            type: 'tool-call',
            id: 'call_123',
            name: 'delete_local_data',
            arguments: '{"key":"myKey"}',
            state: 'approval-responded',
            approval: {
              id: 'approval_call_123',
              needsApproval: true,
              approved: true,
            },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      // Should produce: assistant message with text + toolCall, then a tool result
      expect(result.length).toBeGreaterThanOrEqual(2)

      // The assistant message should include the tool call
      const assistantMsg = result.find(
        (m) => m.role === 'assistant' && m.toolCalls,
      )
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg!.toolCalls).toHaveLength(1)
      expect(assistantMsg!.toolCalls![0]!.id).toBe('call_123')

      // The tool result message should have pendingExecution marker
      const toolMsg = result.find(
        (m) => m.role === 'tool' && m.toolCallId === 'call_123',
      )
      expect(toolMsg).toBeDefined()
      const content = JSON.parse(toolMsg!.content as string)
      expect(content.approved).toBe(true)
      expect(content.pendingExecution).toBe(true)
    })

    it('should emit declined message for denied client tool without pendingExecution', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call_456',
            name: 'delete_local_data',
            arguments: '{"key":"myKey"}',
            state: 'approval-responded',
            approval: {
              id: 'approval_call_456',
              needsApproval: true,
              approved: false,
            },
          },
        ],
      }

      const result = uiMessageToModelMessages(uiMessage)

      const toolMsg = result.find(
        (m) => m.role === 'tool' && m.toolCallId === 'call_456',
      )
      expect(toolMsg).toBeDefined()
      const content = JSON.parse(toolMsg!.content as string)
      expect(content.approved).toBe(false)
      expect(content.pendingExecution).toBeUndefined()
      expect(content.message).toBe('User denied this action')
    })
  })
})
