import { Ollama as OllamaSDK } from 'ollama'
import { BaseAdapter, convertZodToJsonSchema } from '@tanstack/ai'
import type {
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'

export interface OllamaConfig {
  host?: string
}

const OLLAMA_MODELS = [
  'llama2',
  'llama3',
  'codellama',
  'mistral',
  'mixtral',
  'phi',
  'neural-chat',
  'starling-lm',
  'orca-mini',
  'vicuna',
  'nous-hermes',
  'nomic-embed-text',
  'gpt-oss:20b',
] as const

const OLLAMA_IMAGE_MODELS = [] as const
const OLLAMA_EMBEDDING_MODELS = [] as const
const OLLAMA_AUDIO_MODELS = [] as const
const OLLAMA_VIDEO_MODELS = [] as const

/**
 * Type-only map from Ollama model name to its supported input modalities.
 * Ollama models have varying multimodal capabilities:
 * - Vision models (llava, bakllava, etc.) support text + image
 * - Most text models support text only
 *
 * Note: This is a placeholder - Ollama models are dynamically loaded,
 * so we provide a base type that can be extended.
 *
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */
export type OllamaModelInputModalitiesByName = {
  // Vision-capable models (text + image)
  llava: readonly ['text', 'image']
  bakllava: readonly ['text', 'image']
  'llava-llama3': readonly ['text', 'image']
  'llava-phi3': readonly ['text', 'image']
  moondream: readonly ['text', 'image']
  minicpm: readonly ['text', 'image']

  // Text-only models
  llama2: readonly ['text']
  llama3: readonly ['text']
  codellama: readonly ['text']
  mistral: readonly ['text']
  mixtral: readonly ['text']
  phi: readonly ['text']
  'neural-chat': readonly ['text']
  'starling-lm': readonly ['text']
  'orca-mini': readonly ['text']
  vicuna: readonly ['text']
  'nous-hermes': readonly ['text']
  'nomic-embed-text': readonly ['text']
  'gpt-oss:20b': readonly ['text']
}

// type OllamaModel = (typeof OLLAMA_MODELS)[number]

/**
 * Ollama-specific provider options
 * Based on Ollama API options
 * @see https://github.com/ollama/ollama/blob/main/docs/api.md
 */
interface OllamaProviderOptions {
  /** Number of tokens to keep from the prompt */
  num_keep?: number
  /** Number of tokens from context to consider for next token prediction */
  top_k?: number
  /** Minimum probability for nucleus sampling */
  min_p?: number
  /** Tail-free sampling parameter */
  tfs_z?: number
  /** Typical probability sampling parameter */
  typical_p?: number
  /** Number of previous tokens to consider for repetition penalty */
  repeat_last_n?: number
  /** Penalty for repeating tokens */
  repeat_penalty?: number
  /** Enable Mirostat sampling (0=disabled, 1=Mirostat, 2=Mirostat 2.0) */
  mirostat?: number
  /** Target entropy for Mirostat */
  mirostat_tau?: number
  /** Learning rate for Mirostat */
  mirostat_eta?: number
  /** Enable penalize_newline */
  penalize_newline?: boolean
  /** Enable NUMA support */
  numa?: boolean
  /** Context window size */
  num_ctx?: number
  /** Batch size for prompt processing */
  num_batch?: number
  /** Number of GQA groups (for some models) */
  num_gqa?: number
  /** Number of GPU layers to use */
  num_gpu?: number
  /** GPU to use for inference */
  main_gpu?: number
  /** Use memory-mapped model */
  use_mmap?: boolean
  /** Use memory-locked model */
  use_mlock?: boolean
  /** Number of threads to use */
  num_thread?: number
}

interface ChatCompletionChunk {
  id: string
  model: string
  content: string
  role?: 'assistant'
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

async function* convertChatCompletionStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  _model: string,
): AsyncIterable<StreamChunk> {
  let accumulatedContent = ''
  const timestamp = Date.now()
  let nextToolIndex = 0

  for await (const chunk of stream) {
    if (chunk.content) {
      accumulatedContent += chunk.content
      yield {
        type: 'content',
        id: chunk.id,
        model: chunk.model,
        timestamp,
        delta: chunk.content,
        content: accumulatedContent,
        role: chunk.role,
      }
    }

    // Handle tool calls if present
    if (chunk.toolCalls && chunk.toolCalls.length > 0) {
      for (const toolCall of chunk.toolCalls) {
        yield {
          type: 'tool_call',
          id: chunk.id,
          model: chunk.model,
          timestamp,
          toolCall: {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          },
          index: nextToolIndex++,
        }
      }
    }

    if (chunk.finishReason) {
      yield {
        type: 'done',
        id: chunk.id,
        model: chunk.model,
        timestamp,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
      }
    }
  }
}

/**
 * Converts standard Tool format to Ollama-specific tool format
 * Ollama uses OpenAI-compatible tool format
 */
function convertToolsToOllamaFormat(
  tools?: Array<any>,
): Array<any> | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertZodToJsonSchema(tool.inputSchema),
    },
  }))
}

/**
 * Maps common options to Ollama-specific format
 * Handles translation of normalized options to Ollama's API format
 */
function mapCommonOptionsToOllama(
  options: ChatOptions,
  providerOpts?: OllamaProviderOptions,
): any {
  const ollamaOptions = {
    temperature: options.options?.temperature,
    top_p: options.options?.topP,
    num_predict: options.options?.maxTokens,
  }

  // Apply Ollama-specific provider options
  if (providerOpts) {
    Object.assign(ollamaOptions, providerOpts)
  }

  return {
    model: options.model,
    options: ollamaOptions,
    tools: convertToolsToOllamaFormat(options.tools),
  }
}

export class Ollama extends BaseAdapter<
  typeof OLLAMA_MODELS,
  typeof OLLAMA_EMBEDDING_MODELS,
  OllamaProviderOptions,
  Record<string, any>,
  Record<string, any>,
  OllamaModelInputModalitiesByName
> {
  name = 'ollama'
  models = OLLAMA_MODELS
  imageModels = OLLAMA_IMAGE_MODELS
  embeddingModels = OLLAMA_EMBEDDING_MODELS
  audioModels = OLLAMA_AUDIO_MODELS
  videoModels = OLLAMA_VIDEO_MODELS
  declare _modelInputModalitiesByName: OllamaModelInputModalitiesByName
  private client: OllamaSDK

  constructor(config: OllamaConfig = {}) {
    super({})
    this.client = new OllamaSDK({
      host: config.host || 'http://localhost:11434',
    })
  }

  async *chatCompletionStream(
    options: ChatOptions,
  ): AsyncIterable<ChatCompletionChunk> {
    const providerOpts = options.providerOptions as
      | OllamaProviderOptions
      | undefined

    // Map common options to Ollama format
    const mappedOptions = mapCommonOptionsToOllama(options, providerOpts)

    // Format messages for Ollama (handle tool calls, tool results, and multimodal)
    const formattedMessages = options.messages.map((msg) => {
      let textContent = ''
      const images: Array<string> = []

      // Handle multimodal content
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            textContent += part.content
          } else if (part.type === 'image') {
            // Ollama accepts base64 strings for images
            if (part.source.type === 'data') {
              images.push(part.source.value)
            } else {
              // URL-based images not directly supported, but we pass the URL
              // Ollama may need the image to be fetched externally
              images.push(part.source.value)
            }
          }
          // Ollama doesn't support audio/video/document directly, skip them
        }
      } else {
        textContent = msg.content || ''
      }

      const baseMessage: {
        role: 'user' | 'assistant' | 'system' | 'tool'
        content: string
        images?: Array<string>
        tool_calls?: Array<{
          id: string
          type: string
          function: { name: string; arguments: Record<string, unknown> }
        }>
        tool_call_id?: string
      } = {
        role: msg.role as 'user' | 'assistant' | 'system',
        content: textContent,
      }

      // Add images if present
      if (images.length > 0) {
        baseMessage.images = images
      }

      // Handle tool calls (assistant messages)
      // Ollama expects arguments as an object, not a JSON string
      if (
        msg.role === 'assistant' &&
        msg.toolCalls &&
        msg.toolCalls.length > 0
      ) {
        baseMessage.tool_calls = msg.toolCalls.map((toolCall) => {
          // Parse string arguments to object for Ollama
          let parsedArguments: Record<string, unknown> = {}
          if (typeof toolCall.function.arguments === 'string') {
            try {
              parsedArguments = JSON.parse(toolCall.function.arguments)
            } catch {
              parsedArguments = {}
            }
          } else {
            parsedArguments = toolCall.function.arguments as Record<
              string,
              unknown
            >
          }

          return {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: parsedArguments,
            },
          }
        })
      }

      // Handle tool results (tool messages)
      if (msg.role === 'tool' && msg.toolCallId) {
        baseMessage.role = 'tool'
        baseMessage.tool_call_id = msg.toolCallId
        baseMessage.content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content)
      }

      return baseMessage
    })

    const response = await this.client.chat({
      model: mappedOptions.model,
      messages: formattedMessages,
      options: mappedOptions.options,
      tools: mappedOptions.tools,
      stream: true,
    })

    let hasToolCalls = false

    for await (const chunk of response) {
      // Check if tool calls are present in this chunk
      const toolCalls = chunk.message.tool_calls || []
      if (toolCalls.length > 0) {
        hasToolCalls = true
      }

      const result: ChatCompletionChunk = {
        id: this.generateId(),
        model: chunk.model || options.model || 'llama2',
        content: chunk.message.content || '',
        role: 'assistant',
        finishReason: chunk.done
          ? hasToolCalls
            ? 'tool_calls'
            : 'stop'
          : null,
      }

      // Handle tool calls if present
      if (toolCalls.length > 0) {
        result.toolCalls = toolCalls.map((tc: any) => ({
          id: tc.id || this.generateId(),
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments:
              typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {}),
          },
        }))
      }

      yield result
    }
  }

  async *chatStream(options: ChatOptions): AsyncIterable<StreamChunk> {
    // Use stream converter for now
    // TODO: Implement native structured streaming for Ollama
    yield* convertChatCompletionStream(
      this.chatCompletionStream(options),
      options.model || 'llama2',
    )
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options, options.text)

    const response = await this.client.generate({
      model: options.model || 'llama2',
      prompt,
      options: {
        temperature: 0.3,
        num_predict: options.maxLength || 500,
      },
      stream: false,
    })

    const promptTokens = this.estimateTokens(prompt)
    const completionTokens = this.estimateTokens(response.response)

    return {
      id: this.generateId(),
      model: response.model,
      summary: response.response,
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
    const embeddings: Array<Array<number>> = []

    for (const input of inputs) {
      const response = await this.client.embeddings({
        model: options.model || 'nomic-embed-text',
        prompt: input,
      })
      embeddings.push(response.embedding)
    }

    const promptTokens = inputs.reduce(
      (sum, input) => sum + this.estimateTokens(input),
      0,
    )

    return {
      id: this.generateId(),
      model: options.model || 'nomic-embed-text',
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
}

/**
 * Creates an Ollama adapter with simplified configuration
 * @param host - Optional Ollama server host (defaults to http://localhost:11434)
 * @returns A fully configured Ollama adapter instance
 *
 * @example
 * ```typescript
 * const ollama = createOllama();
 * // or with custom host
 * const ollama = createOllama("http://localhost:11434");
 *
 * const ai = new AI({
 *   adapters: {
 *     ollama,
 *   }
 * });
 * ```
 */
export function createOllama(
  host?: string,
  config?: Omit<OllamaConfig, 'host'>,
): Ollama {
  return new Ollama({ host, ...config })
}

/**
 * Create an Ollama adapter with automatic host detection from environment variables.
 *
 * Looks for `OLLAMA_HOST` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * Falls back to default Ollama host if not found.
 *
 * @param config - Optional configuration (excluding host which is auto-detected)
 * @returns Configured Ollama adapter instance
 *
 * @example
 * ```typescript
 * // Automatically uses OLLAMA_HOST from environment or defaults to http://localhost:11434
 * const aiInstance = ai(ollama());
 * ```
 */
export function ollama(config?: Omit<OllamaConfig, 'host'>): Ollama {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const host = env?.OLLAMA_HOST

  return createOllama(host, config)
}
