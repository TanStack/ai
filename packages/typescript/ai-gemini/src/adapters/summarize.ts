import { FinishReason } from '@google/genai'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'

import type { GoogleGenAI } from '@google/genai'
import type { SummarizeAdapter } from '@tanstack/ai/adapters'
import type {
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'

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
  // Additional adapter options can be added here
}

/**
 * Gemini Summarize Adapter
 * A tree-shakeable summarization adapter for Google Gemini
 */
export class GeminiSummarizeAdapter<
  TModel extends GeminiSummarizeModel,
> implements SummarizeAdapter<TModel, GeminiSummarizeProviderOptions> {
  readonly kind = 'summarize' as const
  readonly name = 'gemini' as const
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: GeminiSummarizeProviderOptions
  }

  private client: GoogleGenAI

  constructor(
    apiKeyOrClient: string | GoogleGenAI,
    model: TModel,
    _options: GeminiSummarizeAdapterOptions = {},
  ) {
    this.client =
      typeof apiKeyOrClient === 'string'
        ? createGeminiClient({ apiKey: apiKeyOrClient })
        : apiKeyOrClient
    this.model = model
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const model = options.model

    // Build the system prompt based on format
    const formatInstructions = this.getFormatInstructions(options.style)
    const lengthInstructions = options.maxLength
      ? ` Keep the summary under ${options.maxLength} tokens.`
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

  async *summarizeStream(
    options: SummarizationOptions,
  ): AsyncIterable<StreamChunk> {
    const model = options.model
    const id = generateId('sum')
    let accumulatedContent = ''
    let inputTokens = 0
    let outputTokens = 0

    // Build the system prompt based on format
    const formatInstructions = this.getFormatInstructions(options.style)
    const lengthInstructions = options.maxLength
      ? ` Keep the summary under ${options.maxLength} words.`
      : ''

    const systemPrompt = `You are a helpful assistant that summarizes text. ${formatInstructions}${lengthInstructions}`

    const result = await this.client.models.generateContentStream({
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

    for await (const chunk of result) {
      // Track usage metadata
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
      }

      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
            accumulatedContent += part.text
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: id,
              model,
              timestamp: Date.now(),
              delta: part.text,
              content: accumulatedContent,
            }
          }
        }
      }

      // Check for finish reason
      const finishReason = chunk.candidates?.[0]?.finishReason
      if (
        finishReason === FinishReason.STOP ||
        finishReason === FinishReason.MAX_TOKENS ||
        finishReason === FinishReason.SAFETY
      ) {
        yield {
          type: 'RUN_FINISHED',
          runId: id,
          model,
          timestamp: Date.now(),
          finishReason:
            finishReason === FinishReason.STOP
              ? 'stop'
              : finishReason === FinishReason.MAX_TOKENS
                ? 'length'
                : 'content_filter',
          usage: {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
          },
        }
      }
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
 * Creates a Gemini summarize adapter with explicit API key and model
 */
export function createGeminiSummarize<TModel extends GeminiSummarizeModel>(
  apiKey: string,
  model: TModel,
  options?: GeminiSummarizeAdapterOptions,
): GeminiSummarizeAdapter<TModel> {
  return new GeminiSummarizeAdapter(apiKey, model, options)
}

/**
 * Creates a Gemini summarize adapter with API key from environment and required model
 */
export function geminiSummarize<TModel extends GeminiSummarizeModel>(
  model: TModel,
  options?: GeminiSummarizeAdapterOptions,
): GeminiSummarizeAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return new GeminiSummarizeAdapter(apiKey, model, options)
}
