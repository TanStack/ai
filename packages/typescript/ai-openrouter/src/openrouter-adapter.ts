import { BaseAdapter } from '@tanstack/ai'
import { convertToolsToProviderFormat } from './tools'
import type {
  ChatOptions,
  ContentPart,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type {
  OpenRouterChatModelProviderOptionsByName,
  OpenRouterModelInputModalitiesByName,
} from './model-meta'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from './text/text-provider-options'
import type {
  OpenRouterImageMetadata,
  OpenRouterMessageMetadataByModality,
} from './message-types'
import type { OpenRouterTool } from './tools'

export interface OpenRouterConfig {
  apiKey: string
  baseURL?: string
  httpReferer?: string
  xTitle?: string
}

export type OpenRouterProviderOptions = ExternalTextProviderOptions

type ContentPartType =
  | 'text'
  | 'image_url'
  | 'audio_url'
  | 'video_url'
  | 'document_url'

interface OpenRouterContentPart {
  type: ContentPartType
  text?: string
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' }
  audio_url?: { url: string }
  video_url?: { url: string }
  document_url?: { url: string }
}

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | Array<OpenRouterContentPart>
  tool_call_id?: string
  name?: string
}

interface OpenRouterRequest {
  model: string
  messages: Array<OpenRouterMessage>
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string | Array<string>
  tools?: Array<OpenRouterTool>
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } }
  [key: string]: unknown
}

interface ToolCallBuffer {
  id: string
  name: string
  arguments: string
}

interface OpenRouterError {
  message: string
  code?: string
}

interface OpenRouterToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenRouterReasoningDetail {
  thinking?: string
  text?: string
}

interface OpenRouterImage {
  image_url: {
    url: string
  }
}

interface OpenRouterChoiceDelta {
  content?: string
  reasoning_details?: Array<OpenRouterReasoningDetail>
  images?: Array<OpenRouterImage>
  tool_calls?: Array<OpenRouterToolCallDelta>
}

interface OpenRouterChoiceMessage {
  refusal?: string
  images?: Array<OpenRouterImage>
  tool_calls?: Array<OpenRouterToolCall>
}

interface OpenRouterChoice {
  delta?: OpenRouterChoiceDelta
  message?: OpenRouterChoiceMessage
  finish_reason?: 'stop' | 'length' | 'tool_calls' | null
}

interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

interface OpenRouterSSEChunk {
  id?: string
  model?: string
  error?: OpenRouterError
  choices?: Array<OpenRouterChoice>
  usage?: OpenRouterUsage
}

export class OpenRouter extends BaseAdapter<
  ReadonlyArray<string>,
  [],
  OpenRouterProviderOptions,
  Record<string, unknown>,
  OpenRouterChatModelProviderOptionsByName,
  OpenRouterModelInputModalitiesByName,
  OpenRouterMessageMetadataByModality
> {
  name = 'openrouter' as const
  models: ReadonlyArray<string> = []

  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelProviderOptionsByName: OpenRouterChatModelProviderOptionsByName
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _modelInputModalitiesByName?: OpenRouterModelInputModalitiesByName
  // @ts-ignore - We never assign this at runtime and it's only used for types
  _messageMetadataByModality?: OpenRouterMessageMetadataByModality

  private openRouterConfig: OpenRouterConfig
  private baseURL: string

  constructor(config: OpenRouterConfig) {
    super({})
    this.openRouterConfig = config
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1'
  }

  async *chatStream(
    options: ChatOptions<string, OpenRouterProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const toolCallBuffers = new Map<number, ToolCallBuffer>()
    let accumulatedReasoning = ''
    let accumulatedContent = ''
    let responseId: string | null = null
    let model = options.model

    try {
      const response = await this.createRequest(options, true)

      if (!response.ok) {
        yield this.createErrorChunk(
          await this.parseErrorResponse(response),
          options.model,
          timestamp,
          response.status.toString(),
        )
        return
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      for await (const event of this.parseSSE(response.body)) {
        if (event.done) {
          yield {
            type: 'done',
            id: responseId || this.generateId(),
            model,
            timestamp,
            finishReason: 'stop',
          }
          continue
        }

        const chunk = event.data
        if (chunk.id) responseId = chunk.id
        if (chunk.model) model = chunk.model

        if (chunk.error) {
          yield this.createErrorChunk(
            chunk.error.message || 'Unknown error',
            model || options.model,
            timestamp,
            chunk.error.code,
          )
          continue
        }

        if (!chunk.choices) continue

        for (const choice of chunk.choices) {
          yield* this.processChoice(
            choice,
            toolCallBuffers,
            { id: responseId || this.generateId(), model, timestamp },
            { reasoning: accumulatedReasoning, content: accumulatedContent },
            (r, c) => {
              accumulatedReasoning = r
              accumulatedContent = c
            },
            chunk.usage,
          )
        }
      }
    } catch (error) {
      yield this.createErrorChunk(
        (error as Error).message || 'Unknown error',
        options.model,
        timestamp,
      )
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: options.model || 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: this.buildSummarizationPrompt(options) },
          { role: 'user', content: options.text },
        ],
        max_tokens: options.maxLength,
        temperature: 0.3,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(await this.parseErrorResponse(response))
    }

    const data = await response.json()
    return {
      id: data.id,
      model: data.model,
      summary: data.choices[0]?.message?.content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    }
  }

  /**
   * Creates embeddings from input text.
   *
   * @throws Error - OpenRouter does not support embeddings endpoint.
   * Use a model-specific adapter (e.g., @tanstack/ai-openai) for embeddings.
   */
  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    throw new Error(
      'OpenRouter does not support embeddings endpoint. Use a model-specific adapter (e.g., @tanstack/ai-openai) instead.',
    )
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.openRouterConfig.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (this.openRouterConfig.httpReferer)
      headers['HTTP-Referer'] = this.openRouterConfig.httpReferer
    if (this.openRouterConfig.xTitle)
      headers['X-Title'] = this.openRouterConfig.xTitle
    return headers
  }

  private async createRequest(
    options: ChatOptions<string, OpenRouterProviderOptions>,
    stream: boolean,
  ): Promise<Response> {
    const requestParams = this.mapOptions(options)
    return fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ ...requestParams, stream }),
      signal: options.request?.signal,
    })
  }

  private async parseErrorResponse(response: Response): Promise<string> {
    try {
      const error = await response.json()
      return (
        error.error?.message ||
        `HTTP ${response.status}: ${response.statusText}`
      )
    } catch {
      return `HTTP ${response.status}: ${response.statusText}`
    }
  }

  private createErrorChunk(
    message: string,
    model: string,
    timestamp: number,
    code?: string,
  ): StreamChunk {
    return {
      type: 'error',
      id: this.generateId(),
      model,
      timestamp,
      error: { message, code },
    }
  }

  private async *parseSSE(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<{ done: true } | { done: false; data: OpenRouterSSEChunk }> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') {
            yield { done: true }
          } else {
            try {
              yield { done: false, data: JSON.parse(data) }
            } catch {
              continue
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private *processChoice(
    choice: OpenRouterChoice,
    toolCallBuffers: Map<number, ToolCallBuffer>,
    meta: { id: string; model: string; timestamp: number },
    accumulated: { reasoning: string; content: string },
    updateAccumulated: (reasoning: string, content: string) => void,
    usage?: OpenRouterUsage,
  ): Iterable<StreamChunk> {
    const { delta, message, finish_reason } = choice

    if (delta?.content) {
      accumulated.content += delta.content
      updateAccumulated(accumulated.reasoning, accumulated.content)
      yield {
        type: 'content',
        ...meta,
        delta: delta.content,
        content: accumulated.content,
        role: 'assistant',
      }
    }

    if (delta?.reasoning_details) {
      for (const detail of delta.reasoning_details) {
        const text = detail.thinking || detail.text || ''
        if (text) {
          accumulated.reasoning += text
          updateAccumulated(accumulated.reasoning, accumulated.content)
          yield {
            type: 'thinking',
            ...meta,
            delta: text,
            content: accumulated.reasoning,
          }
        }
      }
    }

    if (delta?.images) {
      for (const img of delta.images) {
        const imgContent = `![Generated Image](${img.image_url.url})`
        accumulated.content += imgContent
        updateAccumulated(accumulated.reasoning, accumulated.content)
        yield {
          type: 'content',
          ...meta,
          delta: imgContent,
          content: accumulated.content,
          role: 'assistant',
        }
      }
    }

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = toolCallBuffers.get(tc.index)
        if (!existing) {
          if (!tc.id) {
            continue
          }
          toolCallBuffers.set(tc.index, {
            id: tc.id,
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
          })
        } else {
          if (tc.function?.name) existing.name = tc.function.name
          if (tc.function?.arguments)
            existing.arguments += tc.function.arguments
        }
      }
    }

    if (message?.refusal) {
      yield {
        type: 'error',
        ...meta,
        error: { message: message.refusal, code: 'refusal' },
      }
    }

    if (message?.images) {
      for (const img of message.images) {
        const imgContent = `![Generated Image](${img.image_url.url})`
        accumulated.content += imgContent
        updateAccumulated(accumulated.reasoning, accumulated.content)
        yield {
          type: 'content',
          ...meta,
          delta: imgContent,
          content: accumulated.content,
          role: 'assistant',
        }
      }
    }

    if (message?.tool_calls) {
      for (const [index, tc] of message.tool_calls.entries()) {
        yield {
          type: 'tool_call',
          ...meta,
          index,
          toolCall: {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          },
        }
      }
    }

    if (finish_reason) {
      if (finish_reason === 'tool_calls') {
        for (const [index, tc] of toolCallBuffers.entries()) {
          yield {
            type: 'tool_call',
            ...meta,
            index,
            toolCall: {
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            },
          }
        }
        toolCallBuffers.clear()
      }

      if (usage) {
        yield {
          type: 'done',
          ...meta,
          finishReason:
            finish_reason === 'tool_calls'
              ? 'tool_calls'
              : finish_reason === 'length'
                ? 'length'
                : 'stop',
          usage: {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
          },
        }
      }
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
    if (options.focus?.length) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }
    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }
    return prompt
  }

  private mapOptions(options: ChatOptions): OpenRouterRequest {
    const providerOptions = options.providerOptions as
      | Omit<InternalTextProviderOptions, 'model' | 'messages' | 'tools'>
      | undefined

    const request: OpenRouterRequest = {
      model: options.model,
      messages: this.convertMessages(options.messages),
      temperature: options.options?.temperature,
      max_tokens: options.options?.maxTokens,
      top_p: options.options?.topP,
      ...providerOptions,
      tools: options.tools
        ? convertToolsToProviderFormat(options.tools)
        : undefined,
    }

    if (providerOptions?.stop !== undefined) {
      request.stop = providerOptions.stop
    }

    if (options.tools?.length && providerOptions?.tool_choice !== undefined) {
      request.tool_choice = providerOptions.tool_choice
    }

    if (options.systemPrompts?.length) {
      request.messages.unshift({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    return request
  }

  private convertMessages(
    messages: Array<ModelMessage>,
  ): Array<OpenRouterMessage> {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          tool_call_id: msg.toolCallId,
          name: msg.name,
        }
      }

      const parts = this.convertContentParts(msg.content)
      return {
        role: msg.role as 'user' | 'assistant',
        content:
          parts.length === 1 && parts[0]?.type === 'text'
            ? parts[0].text || ''
            : parts,
        name: msg.name,
      }
    })
  }

  private convertContentParts(
    content: string | null | Array<ContentPart>,
  ): Array<OpenRouterContentPart> {
    if (!content) return [{ type: 'text', text: '' }]
    if (typeof content === 'string') return [{ type: 'text', text: content }]

    const parts: Array<OpenRouterContentPart> = []
    for (const part of content) {
      switch (part.type) {
        case 'text':
          parts.push({ type: 'text', text: part.content })
          break
        case 'image': {
          const meta = part.metadata as OpenRouterImageMetadata | undefined
          parts.push({
            type: 'image_url',
            image_url: {
              url: part.source.value,
              detail: meta?.detail || 'auto',
            },
          })
          break
        }
        case 'audio':
          parts.push({
            type: 'audio_url',
            audio_url: { url: part.source.value },
          })
          break
        case 'video':
          parts.push({
            type: 'video_url',
            video_url: { url: part.source.value },
          })
          break
        case 'document':
          parts.push({
            type: 'document_url',
            document_url: { url: part.source.value },
          })
          break
      }
    }
    return parts.length ? parts : [{ type: 'text', text: '' }]
  }
}

export function createOpenRouter(
  apiKey: string,
  config?: Omit<OpenRouterConfig, 'apiKey'>,
): OpenRouter {
  return new OpenRouter({ apiKey, ...config })
}

/**
 * Create an OpenRouter adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENROUTER_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenRouter adapter instance
 * @throws Error if OPENROUTER_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENROUTER_API_KEY from environment
 * const adapter = openrouter();
 * ```
 */
interface EnvObject {
  OPENROUTER_API_KEY?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
}

export function openrouter(
  config?: Omit<OpenRouterConfig, 'apiKey'>,
): OpenRouter {
  const env = getEnvironment()
  const key = env?.OPENROUTER_API_KEY

  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Please set it in your environment variables or use createOpenRouter(apiKey, config) instead.',
    )
  }

  return createOpenRouter(key, config)
}
