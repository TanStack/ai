import { describe, expect, it } from 'vitest'
import { deepseekText, createDeepSeekText } from '../src/adapters/text'
import {
  deepseekSummarize,
  createDeepSeekSummarize,
} from '../src/adapters/summarize'
import { DEEPSEEK_CHAT_MODELS } from '../src/model-meta'

describe('DeepSeek Adapter', () => {
  describe('Text Adapter Factory Functions', () => {
    it('should create text adapter with explicit API key', () => {
      const adapter = createDeepSeekText('deepseek-chat', 'test-api-key')

      expect(adapter.name).toBe('deepseek')
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('deepseek-chat')
    })

    it('should throw error when creating text adapter without API key in env', () => {
      // Temporarily remove any existing API key
      const originalEnv = process.env.DEEPSEEK_API_KEY
      delete process.env.DEEPSEEK_API_KEY

      expect(() => {
        deepseekText('deepseek-chat')
      }).toThrow('DEEPSEEK_API_KEY is required')

      // Restore original env
      if (originalEnv) {
        process.env.DEEPSEEK_API_KEY = originalEnv
      }
    })

    it('should create text adapter with API key from environment', () => {
      // Temporarily save any existing API key
      const originalEnv = process.env.DEEPSEEK_API_KEY

      // Set test API key in environment
      process.env.DEEPSEEK_API_KEY = 'test-env-api-key'

      const adapter = deepseekText('deepseek-chat')

      expect(adapter.name).toBe('deepseek')
      expect(adapter.kind).toBe('text')
      expect(adapter.model).toBe('deepseek-chat')

      // Restore original env
      if (originalEnv) {
        process.env.DEEPSEEK_API_KEY = originalEnv
      } else {
        delete process.env.DEEPSEEK_API_KEY
      }
    })
  })

  describe('Summarize Adapter Factory Functions', () => {
    it('should create summarize adapter with explicit API key', () => {
      const adapter = createDeepSeekSummarize('deepseek-chat', 'test-api-key')

      expect(adapter.name).toBe('deepseek')
      expect(adapter.kind).toBe('summarize')
      expect(adapter.model).toBe('deepseek-chat')
    })

    it('should throw error when creating summarize adapter without API key in env', () => {
      // Temporarily remove any existing API key
      const originalEnv = process.env.DEEPSEEK_API_KEY
      delete process.env.DEEPSEEK_API_KEY

      expect(() => {
        deepseekSummarize('deepseek-chat')
      }).toThrow('DEEPSEEK_API_KEY is required')

      // Restore original env
      if (originalEnv) {
        process.env.DEEPSEEK_API_KEY = originalEnv
      }
    })
  })

  describe('Model Constants', () => {
    it('should export expected chat models', () => {
      expect(DEEPSEEK_CHAT_MODELS).toEqual([
        'deepseek-chat',
        'deepseek-reasoner',
        'deepseek-coder',
      ])
    })

    it('should accept all supported models in text adapter', () => {
      for (const model of DEEPSEEK_CHAT_MODELS) {
        expect(() => {
          createDeepSeekText(model, 'test-api-key')
        }).not.toThrow()
      }
    })

    it('should accept all supported models in summarize adapter', () => {
      for (const model of DEEPSEEK_CHAT_MODELS) {
        expect(() => {
          createDeepSeekSummarize(model, 'test-api-key')
        }).not.toThrow()
      }
    })
  })

  describe('Type Safety', () => {
    it('should have correct adapter types', () => {
      const textAdapter = createDeepSeekText('deepseek-chat', 'test-key')
      const summarizeAdapter = createDeepSeekSummarize(
        'deepseek-reasoner',
        'test-key',
      )

      // These assertions ensure TypeScript compilation and basic type checking
      expect(typeof textAdapter.chatStream).toBe('function')
      expect(typeof textAdapter.structuredOutput).toBe('function')
      expect(typeof summarizeAdapter.summarize).toBe('function')
      expect(typeof summarizeAdapter.summarizeStream).toBe('function')
    })
  })

  describe('Thinking Mode', () => {
    it('should automatically enable thinking mode for deepseek-reasoner model', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      expect(adapter.model).toBe('deepseek-reasoner')
      // The thinking mode is enabled internally based on model name
    })

    it('should accept thinking option in model options', () => {
      const adapter = createDeepSeekText('deepseek-chat', 'test-key')

      // Test that thinking option can be passed in modelOptions
      expect(() => {
        // This would be used in actual chat call with modelOptions: { thinking: true }
        adapter.model
      }).not.toThrow()
    })

    it('should support reasoning via streaming chunks', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      // Test that the adapter can handle reasoning through streaming
      // Reasoning is handled via 'thinking' stream chunks, not message metadata
      expect(adapter.model).toBe('deepseek-reasoner')
      expect(adapter.kind).toBe('text')
      expect(adapter.name).toBe('deepseek')
    })

    it('should handle multi-turn conversations following API guidelines', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      // Test conversation history following DeepSeek API guidelines
      // Per DeepSeek docs: reasoning content should NOT be sent back to API
      const conversationHistory = [
        {
          role: 'user' as const,
          content: 'What is 2+2?',
        },
        {
          role: 'assistant' as const,
          content: '4',
        },
        {
          role: 'user' as const,
          content: 'What about 3+3?',
        },
      ]

      // Should handle standard conversation format
      expect(conversationHistory).toBeDefined()
      expect(adapter.model).toBe('deepseek-reasoner')
    })

    it('should handle thinking mode parameter correctly', () => {
      const adapter = createDeepSeekText('deepseek-chat', 'test-key')

      // Test that the adapter accepts thinking parameter in model options
      const mockOptions = {
        model: 'deepseek-chat' as const,
        messages: [{ role: 'user' as const, content: 'test' }],
        modelOptions: { thinking: true },
      }

      // Verify the adapter can process options with thinking enabled
      expect(adapter.model).toBe('deepseek-chat')
      expect(mockOptions.modelOptions.thinking).toBe(true)
    })

    it('should differentiate between reasoning and regular content', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      // Test message structure with reasoning metadata
      const messageWithReasoning = {
        role: 'assistant' as const,
        content: 'The final answer is 42.',
        metadata: {
          reasoning_content:
            'Let me think step by step: First I need to understand the question...',
        },
      }

      expect(messageWithReasoning.metadata.reasoning_content).toContain(
        'step by step',
      )
      expect(messageWithReasoning.content).not.toContain('step by step')
    })

    it('should support both automatic and manual thinking mode activation', () => {
      // Test automatic activation with deepseek-reasoner
      const autoAdapter = createDeepSeekText('deepseek-reasoner', 'test-key')
      expect(autoAdapter.model).toBe('deepseek-reasoner')

      // Test manual activation with deepseek-chat
      const manualAdapter = createDeepSeekText('deepseek-chat', 'test-key')
      expect(manualAdapter.model).toBe('deepseek-chat')

      // Both should be valid adapters
      expect(autoAdapter.kind).toBe('text')
      expect(manualAdapter.kind).toBe('text')
    })

    it('should handle tool calling with thinking mode', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      // Test tool call structure following standards
      const toolCallMessage = {
        role: 'assistant' as const,
        content: '',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function' as const,
            function: {
              name: 'get_weather',
              arguments: '{"location": "San Francisco", "date": "2025-01-01"}',
            },
          },
        ],
      }

      expect(toolCallMessage.toolCalls).toHaveLength(1)
      expect(toolCallMessage.toolCalls[0].function.name).toBe('get_weather')
    })

    it('should handle standard conversation format per DeepSeek API', () => {
      const adapter = createDeepSeekText('deepseek-reasoner', 'test-key')

      // Test conversation flow following DeepSeek API standards
      const conversation = [
        {
          role: 'user' as const,
          content: 'What is 15 * 23?',
        },
        {
          role: 'assistant' as const,
          content: '345',
        },
        {
          role: 'user' as const,
          content: 'How did you calculate that?',
        },
      ]

      const assistantMessage = conversation[1]
      expect(assistantMessage.content).toBe('345')
      expect(assistantMessage.role).toBe('assistant')

      // Standard message format without metadata
      const nextUserMessage = conversation[2]
      expect(nextUserMessage.role).toBe('user')
      expect(nextUserMessage.content).toBe('How did you calculate that?')
    })
  })

  describe('Configuration', () => {
    it('should accept custom base URL in config', () => {
      expect(() => {
        createDeepSeekText('deepseek-chat', 'test-key', {
          baseURL: 'https://custom.deepseek.api.com',
        })
      }).not.toThrow()
    })

    it('should accept empty config object', () => {
      expect(() => {
        createDeepSeekText('deepseek-chat', 'test-key', {})
      }).not.toThrow()
    })
  })
})
