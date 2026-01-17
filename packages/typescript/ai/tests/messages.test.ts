import { describe, expect, it } from 'vitest'
import {
  modelMessageToUIMessage,
  uiMessageToModelMessages,
} from '../src/activities/chat/messages'
import type { ModelMessage, UIMessage } from '../src/types'

describe('message converters', () => {
  describe('modelMessageToUIMessage', () => {
    it('should preserve text content', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: 'Hello world',
      }

      const uiMessage = modelMessageToUIMessage(modelMessage)

      expect(uiMessage.parts).toHaveLength(1)
      expect(uiMessage.parts[0]).toEqual({ type: 'text', content: 'Hello world' })
    })

    it('should preserve multimodal content', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'What is in this image?' },
          { type: 'image', source: { type: 'url', value: 'https://example.com/image.jpg' } },
        ],
      }

      const uiMessage = modelMessageToUIMessage(modelMessage)

      expect(uiMessage.parts).toHaveLength(2)
      expect(uiMessage.parts[0]).toEqual({ type: 'text', content: 'What is in this image?' })
      expect(uiMessage.parts[1]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/image.jpg' },
      })
    })

    it('should preserve all multimodal types', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'Check these:' },
          { type: 'image', source: { type: 'data', value: 'base64img' } },
          { type: 'audio', source: { type: 'url', value: 'https://example.com/audio.mp3' } },
          { type: 'video', source: { type: 'url', value: 'https://example.com/video.mp4' } },
          { type: 'document', source: { type: 'data', value: 'base64pdf' } },
        ],
      }

      const uiMessage = modelMessageToUIMessage(modelMessage)

      expect(uiMessage.parts).toHaveLength(5)
      expect(uiMessage.parts[0]?.type).toBe('text')
      expect(uiMessage.parts[1]?.type).toBe('image')
      expect(uiMessage.parts[2]?.type).toBe('audio')
      expect(uiMessage.parts[3]?.type).toBe('video')
      expect(uiMessage.parts[4]?.type).toBe('document')
    })

    it('should preserve metadata', () => {
      const modelMessage: ModelMessage = {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', value: 'https://example.com/img.jpg' }, metadata: { detail: 'high' } },
        ],
      }

      const uiMessage = modelMessageToUIMessage(modelMessage)

      expect(uiMessage.parts[0]).toEqual({
        type: 'image',
        source: { type: 'url', value: 'https://example.com/img.jpg' },
        metadata: { detail: 'high' },
      })
    })
  })

  describe('uiMessageToModelMessages', () => {
    it('should convert text-only UIMessage to string content', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', content: 'Hello world' }],
      }

      const modelMessages = uiMessageToModelMessages(uiMessage)

      expect(modelMessages).toHaveLength(1)
      expect(modelMessages[0]?.content).toBe('Hello world')
    })

    it('should convert multimodal UIMessage to ContentPart array', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', content: 'What is this?' },
          { type: 'image', source: { type: 'url', value: 'https://example.com/img.jpg' } },
        ],
      }

      const modelMessages = uiMessageToModelMessages(uiMessage)

      expect(modelMessages).toHaveLength(1)
      expect(Array.isArray(modelMessages[0]?.content)).toBe(true)
      expect(modelMessages[0]?.content).toHaveLength(2)
    })

    it('should preserve part order during conversion', () => {
      const uiMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'image', source: { type: 'url', value: 'https://example.com/1.jpg' } },
          { type: 'text', content: 'Middle text' },
          { type: 'image', source: { type: 'url', value: 'https://example.com/2.jpg' } },
        ],
      }

      const modelMessages = uiMessageToModelMessages(uiMessage)
      const content = modelMessages[0]?.content as Array<any>

      expect(content[0]?.type).toBe('image')
      expect(content[1]?.type).toBe('text')
      expect(content[2]?.type).toBe('image')
    })
  })

  describe('round-trip conversion', () => {
    it('should preserve multimodal content through round-trip', () => {
      const original: ModelMessage = {
        role: 'user',
        content: [
          { type: 'text', content: 'Describe this image' },
          { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } },
        ],
      }

      const uiMessage = modelMessageToUIMessage(original)
      const [converted] = uiMessageToModelMessages(uiMessage)

      expect(converted?.role).toBe('user')
      expect(Array.isArray(converted?.content)).toBe(true)
      const content = converted?.content as Array<any>
      expect(content).toHaveLength(2)
      expect(content[0]).toEqual({ type: 'text', content: 'Describe this image' })
      expect(content[1]).toEqual({ type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } })
    })
  })
})
