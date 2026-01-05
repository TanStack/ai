import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools'
import {
    buildHeaders,
    getOpenRouterApiKeyFromEnv,
    generateId as utilGenerateId,
} from '../utils'
import type { OpenRouterClientConfig } from '../utils'
import type {
    OpenRouterChatModelProviderOptionsByName,
    OpenRouterModelInputModalitiesByName,
} from '../model-meta'
import type {
    StructuredOutputOptions,
    StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
    ContentPart,
    ModelMessage,
    StreamChunk,
    TextOptions,
} from '@tanstack/ai'
import type {
    ExternalTextProviderOptions,
    InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
    OpenRouterImageMetadata,
    OpenRouterMessageMetadataByModality,
} from '../message-types'

export interface OpenRouterConfig extends OpenRouterClientConfig {}

export type OpenRouterTextProviderOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenRouterChatModelProviderOptionsByName
    ? OpenRouterChatModelProviderOptionsByName[TModel]
    : OpenRouterTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenRouterModelInputModalitiesByName
    ? OpenRouterModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio', 'video', 'document']

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
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters: Record<string, unknown>
    }
  }>
  tool_choice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function: { name: string } }
  response_format?: { type: 'json_object' }
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

export class OpenRouterTextAdapter<
  TModel extends string,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'openrouter' as const

  private openRouterConfig: OpenRouterConfig
  private baseURL: string

  constructor(config: OpenRouterConfig, model: TModel) {
    super({}, model)
    this.openRouterConfig = config
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1'
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
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
            model: model || options.model,
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

  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const requestParams = this.mapTextOptionsToOpenRouter(chatOptions)

    const structuredOutputTool = {
      type: 'function' as const,
      function: {
        name: 'structured_output',
        description:
          'Use this tool to provide your response in the required structured format.',
        parameters: outputSchema,
      },
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          tool_choice: {
            type: 'function',
            function: { name: 'structured_output' },
          },
        }),
        signal: chatOptions.request?.signal,
      })

      if (!response.ok) {
        const errorMessage = await this.parseErrorResponse(response)
        throw new Error(`Structured output generation failed: ${errorMessage}`)
      }

      const data = await response.json()
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]

      if (toolCall && toolCall.function?.name === 'structured_output') {
        const parsed = JSON.parse(toolCall.function.arguments || '{}')
        return {
          data: parsed,
          rawText: toolCall.function.arguments || '',
        }
      }

      const content = data.choices?.[0]?.message?.content || ''
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`,
        )
      }

      return {
        data: parsed,
        rawText: content,
      }
    } catch (error: unknown) {
      const err = error as Error
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  private buildHeaders(): Record<string, string> {
    return buildHeaders(this.openRouterConfig)
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private async createRequest(
    options: TextOptions<ResolveProviderOptions<TModel>>,
    stream: boolean,
  ): Promise<Response> {
    const requestParams = this.mapTextOptionsToOpenRouter(options)
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
      for (;;) {
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

  private mapTextOptionsToOpenRouter(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): OpenRouterRequest {
    const modelOptions = options.modelOptions as
      | Omit<InternalTextProviderOptions, 'model' | 'messages' | 'tools'>
      | undefined

    const request: OpenRouterRequest = {
      model: options.model,
      messages: this.convertMessages(options.messages),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      ...modelOptions,
      tools: options.tools
        ? convertToolsToProviderFormat(options.tools)
        : undefined,
    }

    if (modelOptions?.stop !== undefined) {
      request.stop = modelOptions.stop
    }

    if (options.tools?.length && modelOptions?.tool_choice !== undefined) {
      request.tool_choice = modelOptions.tool_choice
    }

    if (options.systemPrompts?.length) {
      request.messages.unshift({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    if (modelOptions?.response_format !== undefined) {
      request.response_format = modelOptions.response_format
    }

    return request
  }

  private convertMessages(
    messages: Array<ModelMessage>,
  ): Array<OpenRouterMessage> {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          tool_call_id: msg.toolCallId,
          name: msg.name,
        }
      }

      const parts = this.convertContentParts(msg.content)
      const role = msg.role === 'user' ? 'user' : 'assistant'
      return {
        role,
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

export function createOpenRouterText<TModel extends string>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterConfig, 'apiKey'>,
): OpenRouterTextAdapter<TModel> {
  return new OpenRouterTextAdapter({ apiKey, ...config }, model)
}

export function openrouterText<TModel extends string>(
  model: TModel,
  config?: Omit<OpenRouterConfig, 'apiKey'>,
): OpenRouterTextAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterText(model, apiKey, config)
}
