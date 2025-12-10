import OpenAI_SDK from 'openai'
import { BaseAdapter } from '@tanstack/ai'
import {
  OPENAI_CHAT_MODELS,
  OPENAI_EMBEDDING_MODELS,
  OPENAI_TRANSCRIPTION_MODELS,
} from './model-meta'
import { validateTextProviderOptions } from './text/text-provider-options'
import { convertToolsToProviderFormat } from './tools'
import type { Responses } from 'openai/resources'
import type {
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
  TranscriptionSegment,
  TranscriptionUsage,
} from '@tanstack/ai'
import type {
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
} from './model-meta'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from './text/text-provider-options'
import type { OpenAITranscriptionProviderOptions } from './audio/transcribe-provider-options'
import type {
  OpenAIAudioMetadata,
  OpenAIImageMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'

export interface OpenAIConfig {
  apiKey: string
  organization?: string
  baseURL?: string
}

/**
 * Alias for TextProviderOptions
 */
export type OpenAIProviderOptions = ExternalTextProviderOptions

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
interface OpenAIEmbeddingProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: 'float' | 'base64'
  /** Unique identifier for end-user (for abuse monitoring) */
  user?: string
}

export class OpenAI extends BaseAdapter<
  typeof OPENAI_CHAT_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  typeof OPENAI_TRANSCRIPTION_MODELS,
  OpenAIProviderOptions,
  OpenAIEmbeddingProviderOptions,
  OpenAITranscriptionProviderOptions,
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
  OpenAIMessageMetadataByModality
> {
  name = 'openai' as const
  models = OPENAI_CHAT_MODELS
  embeddingModels = OPENAI_EMBEDDING_MODELS
  transcriptionModels = OPENAI_TRANSCRIPTION_MODELS

  private client: OpenAI_SDK

  // Type-only map used by core AI to infer per-model provider options.
  // This is never set at runtime; it exists purely for TypeScript.
  // Using definite assignment assertion (!) since this is type-only.
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelProviderOptionsByName: OpenAIChatModelProviderOptionsByName
  // Type-only map for model input modalities; used for multimodal content type constraints
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelInputModalitiesByName?: OpenAIModelInputModalitiesByName
  // Type-only map for message metadata types; used for type-safe metadata autocomplete
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _messageMetadataByModality?: OpenAIMessageMetadataByModality

  constructor(config: OpenAIConfig) {
    super({})
    this.client = new OpenAI_SDK({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    })
  }

  /**
   * Maps unified transcription options to OpenAI-specific format.
   */
  private mapTranscriptionOptionsToOpenAI(
    options: TranscriptionOptions<string, OpenAITranscriptionProviderOptions>,
    file: File,
  ): OpenAI_SDK.Audio.Transcriptions.TranscriptionCreateParams {
    const providerOptions = options.providerOptions || {}

    return {
      file,
      model: options.model,
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature,
      ...providerOptions,
    }
  }

  /**
   * Transcribe audio to text.
   * Supports whisper-1 and gpt-4o-transcribe models.
   */
  async transcribe(
    options: TranscriptionOptions<string, OpenAITranscriptionProviderOptions>,
  ): Promise<TranscriptionResult> {
    // Normalize the audio input to a File object
    const file = await this.normalizeAudioInputToFile(options.file)
    const requestOptions = this.mapTranscriptionOptionsToOpenAI(options, file)

    // Get response format for proper parsing
    const responseFormat = options.providerOptions?.response_format || 'json'

    // Use verbose_json to get segments if supported
    const effectiveFormat =
      responseFormat === 'json' || responseFormat === 'verbose_json'
        ? responseFormat
        : responseFormat

    const response = await this.client.audio.transcriptions.create({
      ...requestOptions,
      response_format: effectiveFormat,
      stream: false,
    })

    return this.parseTranscriptionResponse(response, options.model)
  }

  /**
   * Transcribe audio to text with streaming output.
   * Note: Streaming is not supported for whisper-1 model.
   */
  async *transcribeStream(
    options: TranscriptionOptions<string, OpenAITranscriptionProviderOptions>,
  ): AsyncIterable<TranscriptionStreamChunk> {
    // Validate streaming support
    if (options.model === 'whisper-1') {
      throw new Error(
        'Streaming transcription is not supported for the whisper-1 model. ' +
          'Use gpt-4o-transcribe, gpt-4o-mini-transcribe, or gpt-4o-transcribe-diarize instead.',
      )
    }

    const file = await this.normalizeAudioInputToFile(options.file)
    const requestOptions = this.mapTranscriptionOptionsToOpenAI(options, file)
    const timestamp = Date.now()
    const id = this.generateId()
    let accumulatedText = ''

    try {
      const stream = await this.client.audio.transcriptions.create({
        ...requestOptions,
        stream: true,
      })

      for await (const event of stream as AsyncIterable<
        OpenAI_SDK.Audio.Transcriptions.TranscriptionStreamEvent
      >) {
        if (event.type === 'transcript.text.delta') {
          accumulatedText += event.delta
          yield {
            type: 'transcript-delta',
            id,
            model: options.model,
            timestamp,
            delta: event.delta,
            text: accumulatedText,
            segmentId: (event as { segment_id?: string }).segment_id,
          }
        } else if (event.type === 'transcript.text.segment') {
          const segmentEvent = event as {
            id: string
            start: number
            end: number
            text: string
            speaker?: string
          }
          yield {
            type: 'transcript-segment',
            id: this.generateId(),
            model: options.model,
            timestamp: Date.now(),
            segment: {
              id: segmentEvent.id,
              start: segmentEvent.start,
              end: segmentEvent.end,
              text: segmentEvent.text,
              speaker: segmentEvent.speaker,
            },
          }
        } else if (event.type === 'transcript.text.done') {
          const doneEvent = event as {
            text: string
            usage?: {
              type: 'tokens' | 'duration'
              input_tokens?: number
              output_tokens?: number
              total_tokens?: number
              seconds?: number
            }
          }
          yield {
            type: 'transcript-done',
            id,
            model: options.model,
            timestamp: Date.now(),
            text: doneEvent.text,
            usage: doneEvent.usage
              ? this.mapUsage(doneEvent.usage)
              : undefined,
          }
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        id,
        model: options.model,
        timestamp: Date.now(),
        error: {
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
          code: (error as { code?: string }).code,
        },
      }
    }
  }

  /**
   * Normalizes AudioInput to a File object for the OpenAI SDK.
   */
  private async normalizeAudioInputToFile(
    input: TranscriptionOptions['file'],
  ): Promise<File> {
    // If it's already a File, return it
    if (typeof File !== 'undefined' && input instanceof File) {
      return input
    }

    // If it's a Blob, convert to File
    if (input instanceof Blob) {
      return new File([input], 'audio.mp3', { type: input.type || 'audio/mpeg' })
    }

    // If it's an ArrayBuffer, convert to File
    if (input instanceof ArrayBuffer) {
      const blob = new Blob([input], { type: 'audio/mpeg' })
      return new File([blob], 'audio.mp3', { type: 'audio/mpeg' })
    }

    // If it's a Node.js Buffer
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
      const blob = new Blob([new Uint8Array(input).buffer], {
        type: 'audio/mpeg',
      })
      return new File([blob], 'audio.mp3', { type: 'audio/mpeg' })
    }

    // If it's a string (base64 data URL or file path)
    if (typeof input === 'string') {
      // Check if it's a data URL
      const dataUrlMatch = input.match(/^data:([^;]+);base64,(.+)$/)
      if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
        const mimeType = dataUrlMatch[1]
        const base64Data = dataUrlMatch[2]
        const bytes = this.base64ToUint8Array(base64Data)
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType })
        const ext = mimeType.split('/')[1] || 'mp3'
        return new File([blob], `audio.${ext}`, { type: mimeType })
      }

      // Assume it's a file path (Node.js only)
      try {
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const data = await fs.readFile(input)
        const filename = path.basename(input)
        const ext = path.extname(input).slice(1).toLowerCase()
        const mimeType = this.getMimeTypeFromExtension(ext)
        return new File([data], filename, { type: mimeType })
      } catch {
        throw new Error(
          `Failed to read audio file from path "${input}". ` +
            'Ensure the file exists and is accessible.',
        )
      }
    }

    throw new Error(
      `Unsupported audio input type: ${typeof input}. ` +
        'Expected File, Blob, ArrayBuffer, Buffer, or string (base64 data URL or file path).',
    )
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    if (typeof atob === 'function') {
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return bytes
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'))
    }
    throw new Error('Unable to decode base64: neither atob nor Buffer available')
  }

  private getMimeTypeFromExtension(ext: string): string {
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      mpeg: 'audio/mpeg',
      mpga: 'audio/mpeg',
      mp4: 'audio/mp4',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      aac: 'audio/aac',
      aiff: 'audio/aiff',
    }
    return mimeTypes[ext] || 'audio/mpeg'
  }

  /**
   * Parse transcription response into unified format.
   */
  private parseTranscriptionResponse(
    response:
      | OpenAI_SDK.Audio.Transcription
      | OpenAI_SDK.Audio.Transcriptions.TranscriptionVerbose
      | string,
    model: string,
  ): TranscriptionResult {
    // Handle string response (text format)
    if (typeof response === 'string') {
      return {
        id: this.generateId(),
        model,
        text: response,
      }
    }

    // Handle object response (json/verbose_json formats)
    const result: TranscriptionResult = {
      id: this.generateId(),
      model,
      text: response.text,
    }

    // Add verbose fields if available
    const verboseResponse =
      response as OpenAI_SDK.Audio.Transcriptions.TranscriptionVerbose
    if (verboseResponse.duration !== undefined) {
      result.duration = verboseResponse.duration
    }
    if (verboseResponse.language) {
      result.language = verboseResponse.language
    }
    if (verboseResponse.segments) {
      result.segments = verboseResponse.segments.map(
        (seg: OpenAI_SDK.Audio.Transcriptions.TranscriptionSegment): TranscriptionSegment => ({
          id: String(seg.id),
          start: seg.start,
          end: seg.end,
          text: seg.text,
        }),
      )
    }

    // Handle usage if present (newer models)
    const usageResponse = response as {
      usage?: {
        type: 'tokens' | 'duration'
        input_tokens?: number
        output_tokens?: number
        total_tokens?: number
        seconds?: number
      }
    }
    if (usageResponse.usage) {
      result.usage = this.mapUsage(usageResponse.usage)
    }

    return result
  }

  private mapUsage(usage: {
    type: 'tokens' | 'duration'
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    seconds?: number
  }): TranscriptionUsage {
    return {
      type: usage.type,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
      seconds: usage.seconds,
    }
  }

  async *chatStream(
    options: ChatOptions<string, OpenAIProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<string, { index: number; name: string }>()
    const requestArguments = this.mapChatOptionsToOpenAI(options)

    try {
      const response = await this.client.responses.create(
        {
          ...requestArguments,
          stream: true,
        },
        {
          headers: options.request?.headers,
          signal: options.request?.signal,
        },
      )

      // Chat Completions API uses SSE format - iterate directly
      yield* this.processOpenAIStreamChunks(
        response,
        toolCallMetadata,
        options,
        () => this.generateId(),
      )
    } catch (error: any) {
      console.error('>>> chatStream: Fatal error during response creation <<<')
      console.error('>>> Error message:', error?.message)
      console.error('>>> Error stack:', error?.stack)
      console.error('>>> Full error:', error)
      throw error
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const response = await this.client.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: false,
    })

    return {
      id: response.id,
      model: response.model,
      summary: response.choices[0]?.message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: options.model || 'text-embedding-ada-002',
      input: options.input,
      dimensions: options.dimensions,
    })

    return {
      id: this.generateId(),
      model: response.model,
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    }
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
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

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }

  private async *processOpenAIStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Responses.ResponseStreamEvent>,
    toolCallMetadata: Map<string, { index: number; name: string }>,
    options: ChatOptions,
    generateId: () => string,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const timestamp = Date.now()
    let chunkCount = 0

    // Track if we've been streaming deltas to avoid duplicating content from done events
    let hasStreamedContentDeltas = false
    let hasStreamedReasoningDeltas = false

    // Preserve response metadata across events
    let responseId: string | null = null
    let model: string = options.model

    const eventTypeCounts = new Map<string, number>()

    try {
      for await (const chunk of stream) {
        chunkCount++
        const handleContentPart = (
          contentPart:
            | OpenAI_SDK.Responses.ResponseOutputText
            | OpenAI_SDK.Responses.ResponseOutputRefusal
            | OpenAI_SDK.Responses.ResponseContentPartAddedEvent.ReasoningText,
        ): StreamChunk => {
          if (contentPart.type === 'output_text') {
            accumulatedContent += contentPart.text
            return {
              type: 'content',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedContent,
              role: 'assistant',
            }
          }

          if (contentPart.type === 'reasoning_text') {
            accumulatedReasoning += contentPart.text
            return {
              type: 'thinking',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: contentPart.text,
              content: accumulatedReasoning,
            }
          }
          return {
            type: 'error',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            error: {
              message: contentPart.refusal,
            },
          }
        }
        // handle general response events
        if (
          chunk.type === 'response.created' ||
          chunk.type === 'response.incomplete' ||
          chunk.type === 'response.failed'
        ) {
          responseId = chunk.response.id
          model = chunk.response.model
          // Reset streaming flags for new response
          hasStreamedContentDeltas = false
          hasStreamedReasoningDeltas = false
          accumulatedContent = ''
          accumulatedReasoning = ''
          if (chunk.response.error) {
            yield {
              type: 'error',
              id: chunk.response.id,
              model: chunk.response.model,
              timestamp,
              error: chunk.response.error,
            }
          }
          if (chunk.response.incomplete_details) {
            yield {
              type: 'error',
              id: chunk.response.id,
              model: chunk.response.model,
              timestamp,
              error: {
                message: chunk.response.incomplete_details.reason ?? '',
              },
            }
          }
        }
        // Handle output text deltas (token-by-token streaming)
        // response.output_text.delta provides incremental text updates
        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const textDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (textDelta) {
            accumulatedContent += textDelta
            hasStreamedContentDeltas = true
            yield {
              type: 'content',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
              role: 'assistant',
            }
          }
        }

        // Handle reasoning deltas (token-by-token thinking/reasoning streaming)
        // response.reasoning_text.delta provides incremental reasoning updates
        if (chunk.type === 'response.reasoning_text.delta' && chunk.delta) {
          // Delta can be an array of strings or a single string
          const reasoningDelta = Array.isArray(chunk.delta)
            ? chunk.delta.join('')
            : typeof chunk.delta === 'string'
              ? chunk.delta
              : ''

          if (reasoningDelta) {
            accumulatedReasoning += reasoningDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'thinking',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // Handle reasoning summary deltas (when using reasoning.summary option)
        // response.reasoning_summary_text.delta provides incremental summary updates
        if (
          chunk.type === 'response.reasoning_summary_text.delta' &&
          chunk.delta
        ) {
          const summaryDelta =
            typeof chunk.delta === 'string' ? chunk.delta : ''

          if (summaryDelta) {
            accumulatedReasoning += summaryDelta
            hasStreamedReasoningDeltas = true
            yield {
              type: 'thinking',
              id: responseId || generateId(),
              model: model || options.model,
              timestamp,
              delta: summaryDelta,
              content: accumulatedReasoning,
            }
          }
        }

        // handle content_part added events for text, reasoning and refusals
        if (chunk.type === 'response.content_part.added') {
          const contentPart = chunk.part
          yield handleContentPart(contentPart)
        }

        if (chunk.type === 'response.content_part.done') {
          const contentPart = chunk.part

          // Skip emitting chunks for content parts that we've already streamed via deltas
          // The done event is just a completion marker, not new content
          if (contentPart.type === 'output_text' && hasStreamedContentDeltas) {
            // Content already accumulated from deltas, skip
            continue
          }
          if (
            contentPart.type === 'reasoning_text' &&
            hasStreamedReasoningDeltas
          ) {
            // Reasoning already accumulated from deltas, skip
            continue
          }

          // Only emit if we haven't been streaming deltas (e.g., for non-streaming responses)
          yield handleContentPart(contentPart)
        }

        // handle output_item.added to capture function call metadata (name)
        if (chunk.type === 'response.output_item.added') {
          const item = chunk.item
          if (item.type === 'function_call' && item.id) {
            // Store the function name for later use
            if (!toolCallMetadata.has(item.id)) {
              toolCallMetadata.set(item.id, {
                index: chunk.output_index,
                name: item.name || '',
              })
            }
          }
        }

        if (chunk.type === 'response.function_call_arguments.done') {
          const { item_id, output_index } = chunk

          // Get the function name from metadata (captured in output_item.added)
          const metadata = toolCallMetadata.get(item_id)
          const name = metadata?.name || ''

          yield {
            type: 'tool_call',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            index: output_index,
            toolCall: {
              id: item_id,
              type: 'function',
              function: {
                name,
                arguments: chunk.arguments,
              },
            },
          }
        }

        if (chunk.type === 'response.completed') {
          // Determine finish reason based on output
          // If there are function_call items in the output, it's a tool_calls finish
          const hasFunctionCalls = chunk.response.output.some(
            (item: any) => item.type === 'function_call',
          )

          yield {
            type: 'done',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            usage: {
              promptTokens: chunk.response.usage?.input_tokens || 0,
              completionTokens: chunk.response.usage?.output_tokens || 0,
              totalTokens: chunk.response.usage?.total_tokens || 0,
            },
            finishReason: hasFunctionCalls ? 'tool_calls' : 'stop',
          }
        }

        if (chunk.type === 'error') {
          yield {
            type: 'error',
            id: responseId || generateId(),
            model: model || options.model,
            timestamp,
            error: {
              message: chunk.message,
              code: chunk.code ?? undefined,
            },
          }
        }
      }
    } catch (error: any) {
      console.log(
        '[OpenAI Adapter] Stream ended with error. Event type summary:',
        {
          totalChunks: chunkCount,
          eventTypes: Object.fromEntries(eventTypeCounts),
          error: error.message,
        },
      )
      yield {
        type: 'error',
        id: generateId(),
        model: options.model,
        timestamp,
        error: {
          message: error.message || 'Unknown error occurred',
          code: error.code,
        },
      }
    }
  }

  /**
   * Maps common options to OpenAI-specific format
   * Handles translation of normalized options to OpenAI's API format
   */
  private mapChatOptionsToOpenAI(options: ChatOptions) {
    const providerOptions = options.providerOptions as
      | Omit<
        InternalTextProviderOptions,
        | 'max_output_tokens'
        | 'tools'
        | 'metadata'
        | 'temperature'
        | 'input'
        | 'top_p'
      >
      | undefined
    const input = this.convertMessagesToInput(options.messages)
    if (providerOptions) {
      validateTextProviderOptions({ ...providerOptions, input })
    }

    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const requestParams: Omit<
      OpenAI_SDK.Responses.ResponseCreateParams,
      'stream'
    > = {
      model: options.model,
      temperature: options.options?.temperature,
      max_output_tokens: options.options?.maxTokens,
      top_p: options.options?.topP,
      metadata: options.options?.metadata,
      instructions: options.systemPrompts?.join('\n'),
      ...providerOptions,
      input,
      tools,
    }

    return requestParams
  }

  private convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): Responses.ResponseInput {
    const result: Responses.ResponseInput = []

    for (const message of messages) {
      // Handle tool messages - convert to FunctionToolCallOutput
      if (message.role === 'tool') {
        result.push({
          type: 'function_call_output',
          call_id: message.toolCallId || '',
          output:
            typeof message.content === 'string'
              ? message.content
              : JSON.stringify(message.content),
        })
        continue
      }

      // Handle assistant messages
      if (message.role === 'assistant') {
        // If the assistant message has tool calls, add them as FunctionToolCall objects
        // OpenAI Responses API expects arguments as a string (JSON string)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Keep arguments as string for Responses API
            // Our internal format stores arguments as a JSON string, which is what API expects
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)

            result.push({
              type: 'function_call',
              call_id: toolCall.id,
              name: toolCall.function.name,
              arguments: argumentsString,
            })
          }
        }

        // Add the assistant's text message if there is content
        if (message.content) {
          // Assistant messages are typically text-only
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            })
          }
        }

        continue
      }

      // Handle user messages (default case) - support multimodal content
      const contentParts = this.normalizeContent(message.content)
      const openAIContent: Array<Responses.ResponseInputContent> = []

      for (const part of contentParts) {
        openAIContent.push(
          this.convertContentPartToOpenAI(
            part as ContentPart<
              OpenAIImageMetadata,
              OpenAIAudioMetadata,
              unknown,
              unknown
            >,
          ),
        )
      }

      // If no content parts, add empty text
      if (openAIContent.length === 0) {
        openAIContent.push({ type: 'input_text', text: '' })
      }

      result.push({
        type: 'message',
        role: 'user',
        content: openAIContent,
      })
    }

    return result
  }

  /**
   * Converts a ContentPart to OpenAI input content item.
   * Handles text, image, and audio content parts.
   */
  private convertContentPartToOpenAI(
    part: ContentPart<
      OpenAIImageMetadata,
      OpenAIAudioMetadata,
      unknown,
      unknown
    >,
  ): Responses.ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image': {
        const imageMetadata = part.metadata
        if (part.source.type === 'url') {
          return {
            type: 'input_image',
            image_url: part.source.value,
            detail: imageMetadata?.detail || 'auto',
          }
        }
        // For base64 data, construct a data URI
        return {
          type: 'input_image',
          image_url: part.source.value,
          detail: imageMetadata?.detail || 'auto',
        }
      }
      case 'audio': {
        if (part.source.type === 'url') {
          // OpenAI may support audio URLs in the future
          // For now, treat as data URI
          return {
            type: 'input_file',
            file_url: part.source.value,
          }
        }
        return {
          type: 'input_file',
          file_data: part.source.value,
        }
      }

      default:
        throw new Error(`Unsupported content part type: ${part.type}`)
    }
  }

  /**
   * Normalizes message content to an array of ContentPart.
   * Handles backward compatibility with string content.
   */
  private normalizeContent(
    content: string | null | Array<ContentPart>,
  ): Array<ContentPart> {
    if (content === null) {
      return []
    }
    if (typeof content === 'string') {
      return [{ type: 'text', content: content }]
    }
    return content
  }

  /**
   * Extracts text content from a content value that may be string, null, or ContentPart array.
   */
  private extractTextContent(
    content: string | null | Array<ContentPart>,
  ): string {
    if (content === null) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    // It's an array of ContentPart
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}

/**
 * Creates an OpenAI adapter with simplified configuration
 * @param apiKey - Your OpenAI API key
 * @returns A fully configured OpenAI adapter instance
 *
 * @example
 * ```typescript
 * const openai = createOpenAI("sk-...");
 *
 * const ai = new AI({
 *   adapters: {
 *     openai,
 *   }
 * });
 * ```
 */
export function createOpenAI(
  apiKey: string,
  config?: Omit<OpenAIConfig, 'apiKey'>,
): OpenAI {
  return new OpenAI({ apiKey, ...config })
}

/**
 * Create an OpenAI adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const aiInstance = ai(openai());
 * ```
 */
export function openai(config?: Omit<OpenAIConfig, 'apiKey'>): OpenAI {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.OPENAI_API_KEY

  if (!key) {
    throw new Error(
      'OPENAI_API_KEY is required. Please set it in your environment variables or use createOpenAI(apiKey, config) instead.',
    )
  }

  return createOpenAI(key, config)
}
