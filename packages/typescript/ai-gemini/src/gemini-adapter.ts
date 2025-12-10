import { FinishReason, GoogleGenAI } from '@google/genai'
import { BaseAdapter, normalizeAudioInput, toFile } from '@tanstack/ai'
import {
  GEMINI_EMBEDDING_MODELS,
  GEMINI_MODELS,
  GEMINI_TRANSCRIPTION_MODELS,
} from './model-meta'
import { convertToolsToProviderFormat } from './tools/tool-converter'
import type {
  AIAdapterConfig,
  AudioInput,
  ChatOptions,
  ContentPart,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionStreamChunk,
} from '@tanstack/ai'
import type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from './model-meta'
import type { GeminiTranscriptionProviderOptions } from './audio/transcribe-provider-options'
import type { ExternalTextProviderOptions } from './text/text-provider-options'
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
} from '@google/genai'
import type {
  GeminiAudioMetadata,
  GeminiDocumentMetadata,
  GeminiImageMetadata,
  GeminiMessageMetadataByModality,
  GeminiVideoMetadata,
} from './message-types'

export interface GeminiAdapterConfig extends AIAdapterConfig {
  apiKey: string
}

/**
 * Gemini-specific provider options
 * Based on Google Generative AI SDK
 * @see https://ai.google.dev/api/rest/v1/GenerationConfig
 */
export type GeminiProviderOptions = ExternalTextProviderOptions

export class GeminiAdapter extends BaseAdapter<
  typeof GEMINI_MODELS,
  typeof GEMINI_EMBEDDING_MODELS,
  typeof GEMINI_TRANSCRIPTION_MODELS,
  GeminiProviderOptions,
  Record<string, any>,
  GeminiTranscriptionProviderOptions,
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
  GeminiMessageMetadataByModality
> {
  name = 'gemini'
  models = GEMINI_MODELS
  embeddingModels = GEMINI_EMBEDDING_MODELS
  transcriptionModels = GEMINI_TRANSCRIPTION_MODELS
  declare _modelProviderOptionsByName: GeminiChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: GeminiModelInputModalitiesByName
  declare _messageMetadataByModality: GeminiMessageMetadataByModality
  declare _transcriptionProviderOptions: GeminiTranscriptionProviderOptions
  private client: GoogleGenAI

  constructor(config: GeminiAdapterConfig) {
    super(config)
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
    })
  }

  async *chatStream(
    options: ChatOptions<string, GeminiProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // Map common options to Gemini format
    const mappedOptions = this.mapCommonOptionsToGemini(options)

    try {
      const result =
        await this.client.models.generateContentStream(mappedOptions)

      yield* this.processStreamChunks(result, options.model)
    } catch (error) {
      const timestamp = Date.now()
      yield {
        type: 'error',
        id: this.generateId(),
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

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options, options.text)

    // Use models API like chatCompletion
    const result = await this.client.models.generateContent({
      model: options.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: options.maxLength || 500,
      },
    })

    // Extract text from candidates or use .text() method
    let summary = ''
    if (result.candidates?.[0]?.content?.parts) {
      const parts = result.candidates[0].content.parts
      for (const part of parts) {
        if (part.text) {
          summary += part.text
        }
      }
    }

    if (!summary && typeof result.text === 'string') {
      summary = result.text
    }

    const promptTokens = this.estimateTokens(prompt)
    const completionTokens = this.estimateTokens(summary)

    return {
      id: this.generateId(),
      model: options.model,
      summary,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input]

    // According to docs: contents can be a string or array of strings
    // Response has embeddings (plural) array with values property
    const result = await this.client.models.embedContent({
      model: options.model,
      contents: inputs,
    })

    // Extract embeddings from result.embeddings array
    const embeddings: Array<Array<number>> = []
    if (result.embeddings && Array.isArray(result.embeddings)) {
      for (const embedding of result.embeddings) {
        if (embedding.values && Array.isArray(embedding.values)) {
          embeddings.push(embedding.values)
        } else if (Array.isArray(embedding)) {
          embeddings.push(embedding)
        }
      }
    }

    const promptTokens = inputs.reduce(
      (sum, input) => sum + this.estimateTokens(input),
      0,
    )

    return {
      id: this.generateId(),
      model: options.model || 'gemini-embedding-001',
      embeddings,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
      },
    }
  }

  private buildSummarizationPrompt(
    options: SummarizationOptions,
    text: string,
  ): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    prompt += `\n\nText to summarize:\n${text}\n\nSummary:`

    return prompt
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4)
  }

  private async *processStreamChunks(
    result: AsyncGenerator<GenerateContentResponse, any, any>,
    model: string,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    let accumulatedContent = ''
    const toolCallMap = new Map<
      string,
      { name: string; args: string; index: number }
    >()
    let nextToolIndex = 0
    // Iterate over the stream result (it's already an AsyncGenerator)
    for await (const chunk of result) {
      // Extract content from candidates[0].content.parts
      // Parts can contain text or functionCall
      if (chunk.candidates?.[0]?.content?.parts) {
        const parts = chunk.candidates[0].content.parts

        for (const part of parts) {
          // Handle text content
          if (part.text) {
            accumulatedContent += part.text
            yield {
              type: 'content',
              id: this.generateId(),
              model,
              timestamp,
              delta: part.text,
              content: accumulatedContent,
              role: 'assistant',
            }
          }

          // Handle function calls (tool calls)
          // Check both camelCase (SDK) and snake_case (direct API) formats
          const functionCall = part.functionCall
          if (functionCall) {
            const toolCallId =
              functionCall.name || `call_${Date.now()}_${nextToolIndex}`
            const functionArgs = functionCall.args || {}

            // Check if we've seen this tool call before (for streaming args)
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
              // Merge arguments if streaming

              try {
                const existingArgs = JSON.parse(toolCallData.args)
                const newArgs =
                  typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs
                const mergedArgs = { ...existingArgs, ...newArgs }
                toolCallData.args = JSON.stringify(mergedArgs)
              } catch {
                // If parsing fails, use new args
                toolCallData.args =
                  typeof functionArgs === 'string'
                    ? functionArgs
                    : JSON.stringify(functionArgs)
              }
            }

            yield {
              type: 'tool_call',
              id: this.generateId(),
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
        // Fallback to chunk.data if available
        accumulatedContent += chunk.data
        yield {
          type: 'content',
          id: this.generateId(),
          model,
          timestamp,
          delta: chunk.data,
          content: accumulatedContent,
          role: 'assistant',
        }
      }

      // Check for finish reason
      if (chunk.candidates?.[0]?.finishReason) {
        const finishReason = chunk.candidates[0].finishReason

        // UNEXPECTED_TOOL_CALL means Gemini tried to call a function but it wasn't properly declared
        // This typically means there's an issue with the tool declaration format
        // We should map it to tool_calls to try to process it anyway
        if (finishReason === FinishReason.UNEXPECTED_TOOL_CALL) {
          // Try to extract function call from content.parts if available
          if (chunk.candidates[0].content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              const functionCall = part.functionCall
              if (functionCall) {
                // We found a function call - process it
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
                  id: this.generateId(),
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
            id: this.generateId(),
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
          id: this.generateId(),
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
        // Gemini uses inlineData for base64 and fileData for URLs
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
        // Exhaustive check - this should never happen with known types
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

      // Handle multimodal content (array of ContentPart)
      if (Array.isArray(msg.content)) {
        for (const contentPart of msg.content) {
          parts.push(this.convertContentPartToGemini(contentPart))
        }
      } else if (msg.content) {
        // Handle string content (backward compatibility)
        parts.push({ text: msg.content })
      }

      // Handle tool calls (from assistant)
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {}
          } catch {
            parsedArgs = toolCall.function.arguments as any
          }

          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: parsedArgs,
            },
          })
        }
      }

      // Handle tool results (from tool role)
      if (msg.role === 'tool' && msg.toolCallId) {
        parts.push({
          functionResponse: {
            name: msg.toolCallId, // Gemini uses function name here
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
  /**
   * Maps common options to Gemini-specific format
   * Handles translation of normalized options to Gemini's API format
   */
  private mapCommonOptionsToGemini(options: ChatOptions) {
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
        ...providerOpts?.generationConfig,
        tools: convertToolsToProviderFormat(options.tools),
      },
    }

    return requestOptions
  }

  /**
   * Transcribe audio to text using Gemini's chat API with audio input.
   *
   * Since Gemini doesn't have a dedicated transcription API, this method
   * sends the audio to the chat API with a transcription prompt.
   *
   * @param options - Transcription options including file and model
   * @returns Promise resolving to transcription result
   */
  async transcribe(
    options: TranscriptionOptions<string, GeminiTranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    const audioPart = await this.prepareAudioPart(options.file)
    const prompt = this.buildTranscriptionPrompt(options.providerOptions)

    const result = await this.client.models.generateContent({
      model: options.model,
      contents: [
        {
          role: 'user',
          parts: [audioPart, { text: prompt }],
        },
      ],
      config: {
        temperature: options.providerOptions?.temperature ?? 0.1,
        maxOutputTokens: options.providerOptions?.maxOutputTokens ?? 8192,
      },
    })

    let text = ''
    if (result.candidates?.[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.text) {
          text += part.text
        }
      }
    }

    if (!text && typeof result.text === 'string') {
      text = result.text
    }

    const inputTokens = result.usageMetadata?.promptTokenCount ?? 0
    const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0

    return {
      id: this.generateId(),
      model: options.model,
      text,
      usage: {
        type: 'tokens',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    }
  }

  /**
   * Transcribe audio to text with streaming output using Gemini's chat API.
   *
   * Since Gemini doesn't have a dedicated transcription streaming API, this method
   * streams the chat response and yields transcription chunks.
   *
   * @param options - Transcription options including file and model
   * @yields TranscriptionStreamChunk for each piece of transcription
   */
  async *transcribeStream(
    options: TranscriptionOptions<string, GeminiTranscriptionProviderOptions>,
  ): AsyncIterable<TranscriptionStreamChunk> {
    const audioPart = await this.prepareAudioPart(options.file)
    const prompt = this.buildTranscriptionPrompt(options.providerOptions)
    const timestamp = Date.now()

    try {
      const result = await this.client.models.generateContentStream({
        model: options.model,
        contents: [
          {
            role: 'user',
            parts: [audioPart, { text: prompt }],
          },
        ],
        config: {
          temperature: options.providerOptions?.temperature ?? 0.1,
          maxOutputTokens: options.providerOptions?.maxOutputTokens ?? 8192,
        },
      })

      let accumulatedText = ''

      for await (const chunk of result) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.text) {
              accumulatedText += part.text
              yield {
                type: 'transcript-delta',
                id: this.generateId(),
                model: options.model,
                timestamp,
                delta: part.text,
                text: accumulatedText,
              }
            }
          }
        }

        // Check for completion
        if (chunk.candidates?.[0]?.finishReason) {
          const inputTokens = chunk.usageMetadata?.promptTokenCount ?? 0
          const outputTokens = chunk.usageMetadata?.candidatesTokenCount ?? 0

          yield {
            type: 'transcript-done',
            id: this.generateId(),
            model: options.model,
            timestamp,
            text: accumulatedText,
            usage: {
              type: 'tokens',
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        id: this.generateId(),
        model: options.model,
        timestamp,
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during transcription.',
        },
      }
    }
  }

  /**
   * Prepares an audio input for the Gemini API.
   * Converts various audio input formats to the Gemini inlineData format.
   */
  private async prepareAudioPart(
    input: AudioInput,
  ): Promise<Part> {
    const normalized = await normalizeAudioInput(input)

    // Convert to base64 if we have a Blob
    if (normalized instanceof Blob) {
      const arrayBuffer = await normalized.arrayBuffer()
      const base64 = this.arrayBufferToBase64(arrayBuffer)
      const mimeType = normalized.type || 'audio/wav'
      return {
        inlineData: {
          data: base64,
          mimeType,
        },
      }
    }

    // It's already a File (which extends Blob)
    const file = await toFile(normalized)
    const arrayBuffer = await file.arrayBuffer()
    const base64 = this.arrayBufferToBase64(arrayBuffer)
    return {
      inlineData: {
        data: base64,
        mimeType: file.type || 'audio/wav',
      },
    }
  }

  /**
   * Converts an ArrayBuffer to a base64 string.
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!)
    }
    // Use btoa in browser, or Buffer in Node.js
    if (typeof btoa === 'function') {
      return btoa(binary)
    }
    return Buffer.from(buffer).toString('base64')
  }

  /**
   * Builds the transcription prompt based on provider options.
   */
  private buildTranscriptionPrompt(
    options?: GeminiTranscriptionProviderOptions,
  ): string {
    // Use custom prompt if provided
    if (options?.transcriptionPrompt) {
      return options.transcriptionPrompt
    }

    let prompt =
      'Transcribe the following audio accurately. Output only the transcription text, nothing else.'

    if (options?.languageHint) {
      prompt += ` The audio is in ${options.languageHint}.`
    }

    if (options?.includeTimestamps) {
      prompt =
        'Transcribe the following audio accurately with timestamps. Format each segment as [HH:MM:SS] followed by the text. Output only the timestamped transcription, nothing else.'
    }

    if (options?.speakerDiarization?.enabled) {
      prompt =
        'Transcribe the following audio accurately and identify different speakers. Format each segment as "Speaker X: [text]" where X is the speaker number. '
      if (options.speakerDiarization.expectedSpeakerCount) {
        prompt += `There are approximately ${options.speakerDiarization.expectedSpeakerCount} speakers. `
      }
      prompt += 'Output only the transcription with speaker labels, nothing else.'

      if (options?.includeTimestamps) {
        prompt =
          'Transcribe the following audio accurately with timestamps and identify different speakers. Format each segment as "[HH:MM:SS] Speaker X: [text]". '
        if (options.speakerDiarization.expectedSpeakerCount) {
          prompt += `There are approximately ${options.speakerDiarization.expectedSpeakerCount} speakers. `
        }
        prompt +=
          'Output only the timestamped transcription with speaker labels, nothing else.'
      }
    }

    return prompt
  }
}

/**
 * Creates a Gemini adapter with simplified configuration
 * @param apiKey - Your Google API key
 * @returns A fully configured Gemini adapter instance
 *
 * @example
 * ```typescript
 * const gemini = createGemini("AIza...");
 *
 * const ai = new AI({
 *   adapters: {
 *     gemini,
 *   }
 * });
 * ```
 */
export function createGemini(
  apiKey: string,
  config?: Omit<GeminiAdapterConfig, 'apiKey'>,
): GeminiAdapter {
  return new GeminiAdapter({ apiKey, ...config })
}

/**
 * Create a Gemini adapter with automatic API key detection from environment variables.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini adapter instance
 * @throws Error if API key is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY or GEMINI_API_KEY from environment
 * const aiInstance = ai(gemini());
 * ```
 */
export function gemini(
  config?: Omit<GeminiAdapterConfig, 'apiKey'>,
): GeminiAdapter {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.GOOGLE_API_KEY || env?.GEMINI_API_KEY

  if (!key) {
    throw new Error(
      'GOOGLE_API_KEY or GEMINI_API_KEY is required. Please set it in your environment variables or use createGemini(apiKey, config) instead.',
    )
  }

  return createGemini(key, config)
}
