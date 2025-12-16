import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeAgentSdk, claudeAgentSdk } from '../src/claude-agent-sdk-adapter'
import type { StreamChunk, ContentPart, ModelMessage } from '@tanstack/ai'

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'

const mockQuery = vi.mocked(query)

describe('Message Converter - Multimodal Support', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // T033: Unit test for image ContentPart conversion (base64)
  describe('image ContentPart conversion - base64', () => {
    it('should convert base64 image to SDK format', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('I see an image of a cat.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const imageContent: ContentPart = {
        type: 'image',
        source: {
          type: 'data',
          value: 'base64encodeddata',
        },
        metadata: {
          mediaType: 'image/png',
        },
      }

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What is in this image?' },
            imageContent,
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Verify the query was called with image content
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('What is in this image?'),
        }),
      )

      // Should get content response
      const contentChunk = chunks.find((c) => c.type === 'content')
      expect(contentChunk).toBeDefined()
    })

    it('should handle image with jpeg media type', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('I see a photo.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Describe this photo' },
            {
              type: 'image',
              source: { type: 'data', value: 'jpegdata' },
              metadata: { mediaType: 'image/jpeg' },
            },
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      expect(mockQuery).toHaveBeenCalled()
      expect(chunks.some((c) => c.type === 'content')).toBe(true)
    })
  })

  // T034: Unit test for image ContentPart conversion (URL)
  describe('image ContentPart conversion - URL', () => {
    it('should convert URL image to SDK format', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('The image shows a landscape.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What does this show?' },
            {
              type: 'image',
              source: {
                type: 'url',
                value: 'https://example.com/image.jpg',
              },
            },
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Should include the URL in the prompt
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('https://example.com/image.jpg'),
        }),
      )
    })
  })

  // T035: Unit test for document ContentPart conversion (PDF)
  describe('document ContentPart conversion - PDF', () => {
    it('should convert base64 PDF to SDK format', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('The document discusses quarterly results.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Summarize this document' },
            {
              type: 'document',
              source: {
                type: 'data',
                value: 'base64pdfdata',
              },
              metadata: {
                title: 'Q4 Report',
                mediaType: 'application/pdf',
              },
            },
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Should include document reference in prompt
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Q4 Report'),
        }),
      )
    })

    it('should convert URL PDF to SDK format', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('The document contains research findings.'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'What are the key findings?' },
            {
              type: 'document',
              source: {
                type: 'url',
                value: 'https://example.com/research.pdf',
              },
              metadata: {
                title: 'Research Paper',
              },
            },
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('https://example.com/research.pdf'),
        }),
      )
    })
  })

  // T036: Unit test for mixed content (text + image + document)
  describe('mixed content handling', () => {
    it('should handle text, image, and document in same message', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Based on the image and document...'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Compare the chart in the image with the data in the document' },
            {
              type: 'image',
              source: { type: 'data', value: 'chartimagedata' },
              metadata: { mediaType: 'image/png' },
            },
            {
              type: 'document',
              source: { type: 'data', value: 'documentdata' },
              metadata: { title: 'Sales Data', mediaType: 'application/pdf' },
            },
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Verify prompt contains all content types
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringMatching(/Compare.*chart.*image.*document/s),
        }),
      )
    })

    it('should preserve content order in mixed messages', async () => {
      const mockStream = createMockStream([
        createSystemMessage(),
        createAssistantMessage('Response'),
        createResultMessage('success'),
      ])
      mockQuery.mockReturnValue(mockStream)

      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'First text' },
            { type: 'image', source: { type: 'url', value: 'http://img.com/1.jpg' } },
            { type: 'text', content: 'Second text' },
          ],
        },
      ]

      for await (const _ of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        // consume
      }

      // Verify the order is preserved in the prompt
      const call = mockQuery.mock.calls[0][0]
      const prompt = call.prompt as string
      const firstTextIndex = prompt.indexOf('First text')
      const secondTextIndex = prompt.indexOf('Second text')
      expect(firstTextIndex).toBeLessThan(secondTextIndex)
    })
  })

  // T037: Unit test for unsupported modalities (audio, video) error
  describe('unsupported modalities', () => {
    it('should throw error for audio content', async () => {
      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Transcribe this audio' },
            {
              type: 'audio',
              source: { type: 'data', value: 'audiodata' },
            } as ContentPart,
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Should emit error chunk
      const errorChunk = chunks.find((c) => c.type === 'error')
      expect(errorChunk).toBeDefined()
      if (errorChunk?.type === 'error') {
        expect(errorChunk.error.message).toContain('audio')
      }
    })

    it('should throw error for video content', async () => {
      const adapter = claudeAgentSdk()

      const messages: ModelMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Describe this video' },
            {
              type: 'video',
              source: { type: 'url', value: 'http://example.com/video.mp4' },
            } as ContentPart,
          ],
        },
      ]

      const chunks: StreamChunk[] = []
      for await (const chunk of adapter.chatStream({
        model: 'sonnet',
        messages,
      })) {
        chunks.push(chunk)
      }

      // Should emit error chunk
      const errorChunk = chunks.find((c) => c.type === 'error')
      expect(errorChunk).toBeDefined()
      if (errorChunk?.type === 'error') {
        expect(errorChunk.error.message).toContain('video')
      }
    })
  })
})

// Helper functions
function createMockStream(messages: any[]): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const msg of messages) {
        yield msg
      }
    },
  }
}

function createSystemMessage() {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'test-session',
    model: 'sonnet',
    tools: [],
    permissionMode: 'default',
  }
}

function createAssistantMessage(text: string) {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID?.() || 'test-uuid',
    session_id: 'test-session',
    message: {
      content: [{ type: 'text', text }],
    },
  }
}

function createResultMessage(
  subtype: 'success' | 'error_max_turns',
  usage?: { input_tokens?: number; output_tokens?: number },
) {
  return {
    type: 'result',
    subtype,
    session_id: 'test-session',
    duration_ms: 1000,
    num_turns: 1,
    result: 'completed',
    total_cost_usd: 0.001,
    usage: usage || { input_tokens: 10, output_tokens: 20 },
  }
}
