import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'

import type { GoogleGenAI } from '@google/genai'
import type { SummarizeAdapter } from '@tanstack/ai/adapters'
import type { SummarizationOptions, SummarizationResult } from '@tanstack/ai'

/**
 * Available Gemini models for summarization
 */
export const GeminiSummarizeModels = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-lite',
] as const

export type GeminiSummarizeModel = (typeof GeminiSummarizeModels)[number]

/**
 * Provider-specific options for Gemini summarization
 */
export interface GeminiSummarizeProviderOptions {
  /** Generation configuration */
  generationConfig?: {
    temperature?: number
    topP?: number
    topK?: number
    maxOutputTokens?: number
    stopSequences?: Array<string>
  }
  /** Safety settings */
  safetySettings?: Array<{
    category: string
    threshold: string
  }>
}

export interface GeminiSummarizeAdapterOptions {
  model?: GeminiSummarizeModel
}

/**
 * Gemini Summarize Adapter
 * A tree-shakeable summarization adapter for Google Gemini
 */
export class GeminiSummarizeAdapter
  implements
    SummarizeAdapter<
      typeof GeminiSummarizeModels,
      GeminiSummarizeProviderOptions
    >
{
  readonly kind = 'summarize' as const
  readonly name = 'gemini' as const
  readonly models = GeminiSummarizeModels

  /** Type-only property for provider options inference */
  declare _providerOptions?: GeminiSummarizeProviderOptions

  private client: GoogleGenAI
  private defaultModel: GeminiSummarizeModel

  constructor(
    apiKeyOrClient: string | GoogleGenAI,
    options: GeminiSummarizeAdapterOptions = {},
  ) {
    this.client =
      typeof apiKeyOrClient === 'string'
        ? createGeminiClient({ apiKey: apiKeyOrClient })
        : apiKeyOrClient
    this.defaultModel = options.model ?? 'gemini-2.0-flash'
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const model = options.model || this.defaultModel

    // Build the system prompt based on format
    const formatInstructions = this.getFormatInstructions(options.style)
    const lengthInstructions = options.maxLength
      ? ` Keep the summary under ${options.maxLength} words.`
      : ''

    const systemPrompt = `You are a helpful assistant that summarizes text. ${formatInstructions}${lengthInstructions}`

    const response = await this.client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Please summarize the following:\n\n${options.text}` },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
      },
    })

    const summary = response.text ?? ''
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0

    return {
      id: generateId('sum'),
      model,
      summary,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    }
  }

  private getFormatInstructions(
    style?: 'paragraph' | 'bullet-points' | 'concise',
  ): string {
    switch (style) {
      case 'bullet-points':
        return 'Provide the summary as bullet points.'
      case 'concise':
        return 'Provide a very brief one or two sentence summary.'
      case 'paragraph':
      default:
        return 'Provide the summary in paragraph form.'
    }
  }
}

/**
 * Creates a Gemini summarize adapter with explicit API key
 */
export function createGeminiSummarize(
  apiKey: string,
  options?: GeminiSummarizeAdapterOptions,
): GeminiSummarizeAdapter {
  return new GeminiSummarizeAdapter(apiKey, options)
}

/**
 * Creates a Gemini summarize adapter with API key from environment
 */
export function geminiSummarize(
  options?: GeminiSummarizeAdapterOptions,
): GeminiSummarizeAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return new GeminiSummarizeAdapter(apiKey, options)
}
