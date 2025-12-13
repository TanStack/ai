import { FinishReason } from '@google/genai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { GEMINI_MODELS } from '../model-meta'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from '../model-meta'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type {
  GeminiAudioMetadata,
  GeminiDocumentMetadata,
  GeminiImageMetadata,
  GeminiMessageMetadataByModality,
  GeminiVideoMetadata,
} from '../message-types'
import type { GeminiClientConfig } from '../utils'

/**
 * Configuration for Gemini text adapter
 */
export interface GeminiTextConfig extends GeminiClientConfig {}

/**
 * Gemini-specific provider options for text/chat
 */
export type GeminiTextProviderOptions = ExternalTextProviderOptions

/**
 * Gemini Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Gemini chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class GeminiTextAdapter extends BaseTextAdapter<
  typeof GEMINI_MODELS,
  GeminiTextProviderOptions,
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
  GeminiMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'gemini' as const
  readonly models = GEMINI_MODELS

  declare _modelProviderOptionsByName: GeminiChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: GeminiModelInputModalitiesByName
  declare _messageMetadataByModality: GeminiMessageMetadataByModality

  private client: GoogleGenAI

  constructor(config: GeminiTextConfig) {
    super({})
    this.client = createGeminiClient(config)
  }

  async *chatStream(
    options: TextOptions<string, GeminiTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const mappedOptions = this.mapCommonOptionsToGemini(options)

    try {
      const result =
        await this.client.models.generateContentStream(mappedOptions)

      yield* this.processStreamChunks(result, options.model)
    } catch (error) {
      const timestamp = Date.now()
      yield {
        type: 'error',
        id: generateId(this.name),
        model: options.model,
        timestamp,
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during the chat stream.',
        },
      }
    }
  }

  /**
   * Generate structured output using Gemini's native JSON response format.
   * Uses responseMimeType: 'application/json' and responseSchema for structured output.
   * The outputSchema is already JSON Schema (converted in the ai layer).
   */
  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const mappedOptions = this.mapCommonOptionsToGemini(chatOptions)

    try {
      // Add structured output configuration
      const result = await this.client.models.generateContent({
        ...mappedOptions,
        config: {
          ...mappedOptions.config,
          responseMimeType: 'application/json',
          responseSchema: outputSchema,
        },
      })

      // Extract text content from the response
      const rawText = this.extractTextFromResponse(result)

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      return {
        data: parsed,
        rawText,
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
      )
    }
  }

  /**
   * Extract text content from a non-streaming response
   */
  private extractTextFromResponse(response: GenerateContentResponse): string {
    let textContent = ''

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textContent += part.text
        }
      }
    }

    return textContent
  }

  private async *processStreamChunks(
    result: AsyncGenerator<GenerateContentResponse, unknown, unknown>,
    model: string,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    let accumulatedContent = ''
    const toolCallMap = new Map<
      string,
      { name: string; args: string; index: number }
    >()
    let nextToolIndex = 0

    for await (const chunk of result) {
      if (chunk.candidates?.[0]?.content?.parts) {
        const parts = chunk.candidates[0].content.parts

        for (const part of parts) {
          if (part.text) {
            accumulatedContent += part.text
            yield {
              type: 'content',
              id: generateId(this.name),
              model,
              timestamp,
              delta: part.text,
              content: accumulatedContent,
              role: 'assistant',
            }
          }

          const functionCall = part.functionCall
          if (functionCall) {
            const toolCallId =
              functionCall.name || `call_${Date.now()}_${nextToolIndex}`
            const functionArgs = functionCall.args || {}

            let toolCallData = toolCallMap.get(toolCallId)
            if (!toolCallData) {
              toolCallData = {
                name: functionCall.name || '',
                args:
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs),
                index: nextToolIndex++,
              }
              toolCallMap.set(toolCallId, toolCallData)
            } else {
              try {
                const existingArgs = JSON.parse(toolCallData.args)
                const newArgs =
                  typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs
                const mergedArgs = { ...existingArgs, ...newArgs }
                toolCallData.args = JSON.stringify(mergedArgs)
              } catch {
                toolCallData.args =
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs)
              }
            }

            yield {
              type: 'tool_call',
              id: generateId(this.name),
              model,
              timestamp,
              toolCall: {
                id: toolCallId,
                type: 'function',
                function: {
                  name: toolCallData.name,
                  arguments: toolCallData.args,
                },
              },
              index: toolCallData.index,
            }
          }
        }
      } else if (chunk.data) {
        accumulatedContent += chunk.data
        yield {
          type: 'content',
          id: generateId(this.name),
          model,
          timestamp,
          delta: chunk.data,
          content: accumulatedContent,
          role: 'assistant',
        }
      }

      if (chunk.candidates?.[0]?.finishReason) {
        const finishReason = chunk.candidates[0].finishReason

        if (finishReason === FinishReason.UNEXPECTED_TOOL_CALL) {
          if (chunk.candidates[0].content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              const functionCall = part.functionCall
              if (functionCall) {
                const toolCallId =
                  functionCall.name || `call_${Date.now()}_${nextToolIndex}`
                const functionArgs = functionCall.args || {}

                toolCallMap.set(toolCallId, {
                  name: functionCall.name || '',
                  args:
                    typeof functionArgs === 'string'
                      ? functionArgs
                      : JSON.stringify(functionArgs),
                  index: nextToolIndex++,
                })

                yield {
                  type: 'tool_call',
                  id: generateId(this.name),
                  model,
                  timestamp,
                  toolCall: {
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: functionCall.name || '',
                      arguments:
                        typeof functionArgs === 'string'
                          ? functionArgs
                          : JSON.stringify(functionArgs),
                    },
                  },
                  index: nextToolIndex - 1,
                }
              }
            }
          }
        }
        if (finishReason === FinishReason.MAX_TOKENS) {
          yield {
            type: 'error',
            id: generateId(this.name),
            model,
            timestamp,
            error: {
              message:
                'The response was cut off because the maximum token limit was reached.',
            },
          }
        }

        yield {
          type: 'done',
          id: generateId(this.name),
          model,
          timestamp,
          finishReason: toolCallMap.size > 0 ? 'tool_calls' : 'stop',
          usage: chunk.usageMetadata
            ? {
                promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunk.usageMetadata.thoughtsTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
              }
            : undefined,
        }
      }
    }
  }

  private convertContentPartToGemini(part: ContentPart): Part {
    switch (part.type) {
      case 'text':
        return { text: part.content }
      case 'image':
      case 'audio':
      case 'video':
      case 'document': {
        const metadata = part.metadata as
          | GeminiDocumentMetadata
          | GeminiImageMetadata
          | GeminiVideoMetadata
          | GeminiAudioMetadata
          | undefined
        if (part.source.type === 'data') {
          return {
            inlineData: {
              data: part.source.value,
              mimeType: metadata?.mimeType ?? 'image/jpeg',
            },
          }
        } else {
          return {
            fileData: {
              fileUri: part.source.value,
              mimeType: metadata?.mimeType ?? 'image/jpeg',
            },
          }
        }
      }
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private formatMessages(
    messages: Array<ModelMessage>,
  ): GenerateContentParameters['contents'] {
    return messages.map((msg) => {
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
      const parts: Array<Part> = []

      if (Array.isArray(msg.content)) {
        for (const contentPart of msg.content) {
          parts.push(this.convertContentPartToGemini(contentPart))
        }
      } else if (msg.content) {
        parts.push({ text: msg.content })
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = toolCall.function.arguments
              ? (JSON.parse(toolCall.function.arguments) as Record<
                  string,
                  unknown
                >)
              : {}
          } catch {
            parsedArgs = toolCall.function.arguments as unknown as Record<
              string,
              unknown
            >
          }

          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: parsedArgs,
            },
          })
        }
      }

      if (msg.role === 'tool' && msg.toolCallId) {
        parts.push({
          functionResponse: {
            name: msg.toolCallId,
            response: {
              content: msg.content || '',
            },
          },
        })
      }

      return {
        role,
        parts: parts.length > 0 ? parts : [{ text: '' }],
      }
    })
  }

  private mapCommonOptionsToGemini(options: TextOptions) {
    const providerOpts = options.providerOptions
    const requestOptions: GenerateContentParameters = {
      model: options.model,
      contents: this.formatMessages(options.messages),
      config: {
        ...providerOpts,
        temperature: options.options?.temperature,
        topP: options.options?.topP,
        maxOutputTokens: options.options?.maxTokens,
        systemInstruction: options.systemPrompts?.join('\n'),
        ...((providerOpts as Record<string, unknown> | undefined)
          ?.generationConfig as Record<string, unknown> | undefined),
        tools: convertToolsToProviderFormat(options.tools),
      },
    }

    return requestOptions
  }
}

/**
 * Creates a Gemini text adapter with explicit API key
 */
export function createGeminiText(
  apiKey: string,
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter {
  return new GeminiTextAdapter({ apiKey, ...config })
}

/**
 * Creates a Gemini text adapter with automatic API key detection
 */
export function geminiText(
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiText(apiKey, config)
}
