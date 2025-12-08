import { AwsV4Signer } from 'aws4fetch'
import { EventStreamCodec } from '@smithy/eventstream-codec'
import { fromUtf8, toUtf8 } from '@smithy/util-utf8'
import { BaseAdapter } from '@tanstack/ai'
import { BEDROCK_EMBEDDING_MODELS, BEDROCK_MODELS } from './model-meta'
import { convertToolsToProviderFormat } from './tools/tool-converter'
import type {
  ContentBlock,
  ConverseRequest,
  ConverseResponse,
  ConverseStreamOutput,
  ConverseStreamRequest,
  DocumentFormat,
  ImageFormat,
  InferenceConfiguration,
  Message,
  StopReason,
  SystemContentBlock,
  TokenUsage,
  ToolConfiguration,
  VideoFormat,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  AwsCredentialIdentity,
  AwsCredentialIdentityProvider,
  DocumentType,
} from '@smithy/types'
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
  BedrockChatModelProviderOptionsByName,
  BedrockModelInputModalitiesByName,
} from './model-meta'
import type { BedrockProviderOptions } from './text/text-provider-options'
import type {
  BedrockDocumentMetadata,
  BedrockImageMetadata,
  BedrockMessageMetadataByModality,
  BedrockVideoMetadata,
} from './message-types'

type BedrockMessage = Message
type BedrockContentBlock = ContentBlock
type BedrockConversePayload = Omit<ConverseRequest, 'modelId'>
type BedrockConverseStreamPayload = Omit<ConverseStreamRequest, 'modelId'>
type BedrockStreamEvent = ConverseStreamOutput

function mapTokenUsage(usage: TokenUsage | undefined) {
  if (!usage) return undefined
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  }
}

function toUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'))
  }

  if (typeof atob !== 'undefined') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  throw new Error('Inline data sources require base64 decoding, which is not available in this environment')
}

/**
 * AWS credentials returned by a credential provider
 */
export type BedrockCredentials = AwsCredentialIdentity

/**
 * Configuration options for the Bedrock adapter.
 *
 * Supports two authentication methods:
 * 1. **API Key (Bearer Token)** - Recommended for simplicity
 * 2. **AWS SigV4** - Traditional AWS authentication with access keys
 *
 * Authentication priority:
 * 1. `apiKey` (or `AWS_BEARER_TOKEN_BEDROCK` env var)
 * 2. `credentialProvider` function
 * 3. `accessKeyId`/`secretAccessKey` (or env vars)
 *
 * @example API Key Authentication
 * ```typescript
 * const bedrock = createBedrock({
 *   apiKey: 'your-bedrock-api-key',
 *   region: 'us-east-1'
 * });
 * ```
 *
 * @example SigV4 Authentication
 * ```typescript
 * const bedrock = createBedrock({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   region: 'us-east-1'
 * });
 * ```
 *
 * @example Credential Provider (for IAM roles, STS)
 * ```typescript
 * const bedrock = createBedrock({
 *   credentialProvider: async () => ({
 *     accessKeyId: 'temp-access-key',
 *     secretAccessKey: 'temp-secret-key',
 *     sessionToken: 'session-token'
 *   }),
 *   region: 'us-east-1'
 * });
 * ```
 */
export interface BedrockConfig {
  /**
   * AWS region for Bedrock service.
   * Used to construct the endpoint URL.
   *
   * If not provided, defaults to:
   * 1. `AWS_REGION` environment variable
   * 2. `AWS_DEFAULT_REGION` environment variable
   * 3. `'us-east-1'` as final fallback
   */
  region?: string

  /**
   * Amazon Bedrock API key for Bearer token authentication.
   * This is the recommended authentication method for simplicity.
   *
   * If not provided, checks `AWS_BEARER_TOKEN_BEDROCK` environment variable.
   *
   * Note: API keys cannot be used with:
   * - Agents for Amazon Bedrock APIs
   * - Data Automation APIs
   * - Bidirectional streaming (Nova Sonic)
   *
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
   */
  apiKey?: string

  /**
   * AWS Access Key ID for SigV4 authentication.
   * Must be provided together with `secretAccessKey`.
   *
   * If not provided, checks `AWS_ACCESS_KEY_ID` environment variable.
   */
  accessKeyId?: string

  /**
   * AWS Secret Access Key for SigV4 authentication.
   * Must be provided together with `accessKeyId`.
   *
   * If not provided, checks `AWS_SECRET_ACCESS_KEY` environment variable.
   */
  secretAccessKey?: string

  /**
   * AWS Session Token for temporary credentials (SigV4).
   * Optional, used with temporary credentials from STS.
   *
   * If not provided, checks `AWS_SESSION_TOKEN` environment variable.
   */
  sessionToken?: string

  /**
   * Async function that returns AWS credentials dynamically.
   * Useful for IAM roles, EC2 instance profiles, or STS assume role.
   *
   * Takes precedence over static `accessKeyId`/`secretAccessKey` if provided.
   *
   * @example
   * ```typescript
   * credentialProvider: async () => {
   *   const sts = new STSClient({});
   *   const { Credentials } = await sts.send(new AssumeRoleCommand({...}));
   *   return {
   *     accessKeyId: Credentials.AccessKeyId,
   *     secretAccessKey: Credentials.SecretAccessKey,
   *     sessionToken: Credentials.SessionToken
   *   };
   * }
   * ```
   */
  credentialProvider?: AwsCredentialIdentityProvider

  /**
   * Custom base URL for Bedrock API.
   * If not provided, constructed from region: `https://bedrock-runtime.{region}.amazonaws.com`
   *
   * Useful for:
   * - Custom endpoints
   * - VPC endpoints
   * - Local development/testing
   */
  baseURL?: string
}

export class Bedrock extends BaseAdapter<
  typeof BEDROCK_MODELS,
  typeof BEDROCK_EMBEDDING_MODELS,
  BedrockProviderOptions,
  Record<string, any>,
  BedrockChatModelProviderOptionsByName,
  BedrockModelInputModalitiesByName,
  BedrockMessageMetadataByModality
> {
  name = 'bedrock' as const
  models = BEDROCK_MODELS
  embeddingModels = BEDROCK_EMBEDDING_MODELS

  declare _modelProviderOptionsByName: BedrockChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: BedrockModelInputModalitiesByName
  declare _messageMetadataByModality: BedrockMessageMetadataByModality

  private bedrockConfig: BedrockConfig
  private _resolvedRegion: string
  private _resolvedBaseURL: string

  constructor(config: BedrockConfig = {}) {
    super({})
    this.bedrockConfig = config
    this._resolvedRegion = this.resolveRegion()
    this._resolvedBaseURL = this.resolveBaseURL()
    this.validateAuthConfig()
  }

  async *chatStream(
    options: ChatOptions<string, BedrockProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const converseInput = this.mapCommonOptionsToBedrock(options)
    const modelId = encodeURIComponent(options.model)
    const url = `${this._resolvedBaseURL}/model/${modelId}/converse-stream`

    try {
      const response = await this.fetchWithAuth(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.request?.headers,
        },
        body: JSON.stringify(converseInput),
        signal: options.request?.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Bedrock Adapter] API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        yield {
          type: 'error',
          id: this.generateId(),
          model: options.model,
          timestamp: Date.now(),
          error: {
            message: `Bedrock API error (${response.status}): ${errorText}`,
            code: String(response.status),
          },
        }
        return
      }

      yield* this.processBedrockStream(response, options.model)
    } catch (error) {
      console.error('[Bedrock Adapter] Error in chatStream:', {
        message: error instanceof Error ? error.message : String(error),
        error,
      })
      yield {
        type: 'error',
        id: this.generateId(),
        model: options.model,
        timestamp: Date.now(),
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during chat stream',
        },
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options)
    const modelId = encodeURIComponent(options.model)
    const url = `${this._resolvedBaseURL}/model/${modelId}/converse`

    const converseInput: BedrockConversePayload = {
      messages: [
        {
          role: 'user',
          content: [{ text: options.text }],
        },
      ],
      system: [{ text: prompt }],
      inferenceConfig: {
        maxTokens: options.maxLength || 500,
      },
    }

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(converseInput),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Bedrock API error (${response.status}): ${errorText}`)
    }

    const result = (await response.json()) as ConverseResponse
    const outputMessage = result.output?.message
    const summary = outputMessage?.content?.map((block) => block.text || '').join('') ?? ''
    const usage = mapTokenUsage(result.usage)

    return {
      id: this.generateId(),
      model: options.model,
      summary,
      usage: usage ?? {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    }
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input]
    const embeddings: Array<Array<number>> = []
    let totalInputTokens = 0

    for (const inputText of inputs) {
      const modelId = encodeURIComponent(options.model)
      const url = `${this._resolvedBaseURL}/model/${modelId}/invoke`

      const body = {
        inputText,
        dimensions: options.dimensions,
        normalize: true,
      }

      const response = await this.fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Bedrock embedding error (${response.status}): ${errorText}`)
      }

      const result = (await response.json()) as {
        embedding: Array<number>
        inputTextTokenCount: number
      }

      embeddings.push(result.embedding)
      totalInputTokens += result.inputTextTokenCount
    }

    return {
      id: this.generateId(),
      model: options.model,
      embeddings,
      usage: {
        promptTokens: totalInputTokens,
        totalTokens: totalInputTokens,
      },
    }
  }

  private getEnv(): Record<string, string | undefined> | undefined {
    if (typeof globalThis !== 'undefined') {
      const win = (globalThis as Record<string, unknown>).window as
        | { env?: Record<string, string | undefined> }
        | undefined
      if (win?.env) {
        return win.env
      }
    }
    if (typeof process !== 'undefined') {
      return process.env
    }
    return undefined
  }

  private resolveRegion(): string {
    if (this.bedrockConfig.region) {
      return this.bedrockConfig.region
    }
    const env = this.getEnv()
    return env?.AWS_REGION || env?.AWS_DEFAULT_REGION || 'us-east-1'
  }

  private resolveBaseURL(): string {
    if (this.bedrockConfig.baseURL) {
      return this.bedrockConfig.baseURL
    }
    return `https://bedrock-runtime.${this._resolvedRegion}.amazonaws.com`
  }

  private validateAuthConfig(): void {
    const env = this.getEnv()

    const hasApiKey =
      this.bedrockConfig.apiKey || env?.AWS_BEARER_TOKEN_BEDROCK
    const hasCredentialProvider = !!this.bedrockConfig.credentialProvider
    const hasAccessKey =
      this.bedrockConfig.accessKeyId ?? env?.AWS_ACCESS_KEY_ID
    const hasSecretKey =
      this.bedrockConfig.secretAccessKey ?? env?.AWS_SECRET_ACCESS_KEY
    const hasSigV4Credentials = hasAccessKey && hasSecretKey

    if (hasApiKey) {
      const apiKey = this.bedrockConfig.apiKey ?? env?.AWS_BEARER_TOKEN_BEDROCK
      if (apiKey && apiKey.trim() === '') {
        throw new Error(
          'Bedrock: Invalid API key. API key cannot be empty or whitespace.\n' +
            'Provide a valid API key via:\n' +
            '  - config.apiKey\n' +
            '  - AWS_BEARER_TOKEN_BEDROCK environment variable'
        )
      }
      return
    }

    if (!hasCredentialProvider && !hasSigV4Credentials) {
      throw new Error(
        'Bedrock: No authentication credentials provided.\n' +
          'Provide authentication via one of:\n' +
          '  1. config.apiKey or AWS_BEARER_TOKEN_BEDROCK (API key)\n' +
          '  2. config.credentialProvider (dynamic credentials)\n' +
          '  3. config.accessKeyId + config.secretAccessKey (static credentials)\n' +
          '  4. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (environment variables)\n' +
          '  5. Mix of config and environment variables (e.g., config.accessKeyId + AWS_SECRET_ACCESS_KEY)'
      )
    }
  }

  private async fetchWithAuth(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const env = this.getEnv()
    const apiKey = this.bedrockConfig.apiKey ?? env?.AWS_BEARER_TOKEN_BEDROCK

    if (apiKey) {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${apiKey}`)
      return fetch(url, { ...init, headers })
    }

    const credentials = this.bedrockConfig.credentialProvider
      ? await this.bedrockConfig.credentialProvider()
      : {
          accessKeyId:
            this.bedrockConfig.accessKeyId ?? env?.AWS_ACCESS_KEY_ID ?? '',
          secretAccessKey:
            this.bedrockConfig.secretAccessKey ??
            env?.AWS_SECRET_ACCESS_KEY ??
            '',
          sessionToken:
            this.bedrockConfig.sessionToken ?? env?.AWS_SESSION_TOKEN,
        }

    const signedRequest = await this.signRequest(url, init, credentials)
    return fetch(url, signedRequest)
  }

  private async signRequest(
    url: string,
    init: RequestInit,
    credentials: BedrockCredentials,
  ): Promise<RequestInit> {
    const headers = new Headers(init.headers)
    headers.set('host', new URL(url).host)

    const body =
      typeof init.body === 'string' ? init.body : JSON.stringify(init.body)

    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(Object.fromEntries(headers.entries())),
      body,
      region: this._resolvedRegion,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: 'bedrock',
    })

    const signed = await signer.sign()
    return { ...init, headers: signed.headers, body }
  }

  private mapCommonOptionsToBedrock(
    options: ChatOptions<string, BedrockProviderOptions>,
  ): BedrockConverseStreamPayload {
    const { messages } = this.formatMessages(options.messages)
    const providerOptions = options.providerOptions

    const inferenceConfig: Partial<InferenceConfiguration> = {}
    const additionalModelRequestFields: Record<string, DocumentType> = {
      ...(providerOptions?.additionalModelRequestFields ?? {}),
    }
    if (options.options?.maxTokens != null) {
      inferenceConfig.maxTokens = options.options.maxTokens
    }
    if (options.options?.temperature != null) {
      inferenceConfig.temperature = Math.min(
        1,
        Math.max(0, options.options.temperature),
      )
    }
    if (options.options?.topP != null) {
      inferenceConfig.topP = options.options.topP
    }
    if (providerOptions?.topK != null) {
      additionalModelRequestFields.topK = providerOptions.topK
    }
    if (providerOptions?.stopSequences != null) {
      inferenceConfig.stopSequences = providerOptions.stopSequences
    }

    const systemMessages: Array<SystemContentBlock> = []
    if (options.systemPrompts?.length) {
      systemMessages.push({ text: options.systemPrompts.join('\n') })
    }

    const converseInput: BedrockConverseStreamPayload = {
      messages,
      ...(systemMessages.length > 0 && { system: systemMessages }),
      ...(Object.keys(inferenceConfig).length > 0 && { inferenceConfig }),
    }

    if (options.tools?.length) {
      const bedrockTools = convertToolsToProviderFormat(
        options.tools,
        options.model,
      )

      const toolConfig: ToolConfiguration = {
        tools: bedrockTools,
      }

      if (providerOptions?.toolChoice) {
        toolConfig.toolChoice = providerOptions.toolChoice
      }

      converseInput.toolConfig = toolConfig
    }

    if (providerOptions?.reasoningConfig) {
      const reasoningConfig = providerOptions.reasoningConfig
      additionalModelRequestFields.thinking = {
        type: reasoningConfig.type,
        ...(reasoningConfig.budgetTokens != null && {
          budget_tokens: reasoningConfig.budgetTokens,
        }),
      }
    }

    if (Object.keys(additionalModelRequestFields).length > 0) {
      converseInput.additionalModelRequestFields = additionalModelRequestFields
    }

    if (providerOptions?.performanceConfig) {
      converseInput.performanceConfig = providerOptions.performanceConfig
    }

    if (providerOptions?.serviceTier) {
      converseInput.serviceTier = providerOptions.serviceTier
    }

    if (providerOptions?.requestMetadata) {
      converseInput.requestMetadata = providerOptions.requestMetadata
    }

    return converseInput
  }

  private formatMessages(messages: Array<ModelMessage>): {
    messages: Array<BedrockMessage>
  } {
    const bedrockMessages: Array<BedrockMessage> = []

    for (const message of messages) {
      if (message.role === 'tool' && message.toolCallId) {
        const lastMessage = bedrockMessages[bedrockMessages.length - 1]
        const toolResultBlock: BedrockContentBlock = {
          toolResult: {
            toolUseId: message.toolCallId,
            content: [
              {
                text:
                  typeof message.content === 'string'
                    ? message.content
                    : JSON.stringify(message.content),
              },
            ],
          },
        }

        if (lastMessage?.role === 'user' && lastMessage.content) {
          lastMessage.content.push(toolResultBlock)
        } else {
          bedrockMessages.push({
            role: 'user',
            content: [toolResultBlock],
          })
        }
        continue
      }

      const bedrockContent: Array<BedrockContentBlock> = []

      if (Array.isArray(message.content)) {
        for (const part of message.content) {
          bedrockContent.push(this.convertContentPartToBedrock(part))
        }
      } else if (message.content) {
        bedrockContent.push({ text: message.content })
      }

      if (message.role === 'assistant' && message.toolCalls?.length) {
        for (const toolCall of message.toolCalls) {
          const parsedInput = this.parseToolArguments(
            toolCall.function.arguments,
          )
          bedrockContent.push({
            toolUse: {
              toolUseId: toolCall.id,
              name: toolCall.function.name,
              input: parsedInput,
            },
          })
        }
      }

      if (bedrockContent.length > 0) {
        bedrockMessages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: bedrockContent,
        })
      }
    }

    return { messages: bedrockMessages }
  }

  private convertContentPartToBedrock(part: ContentPart): BedrockContentBlock {
    const DEFAULT_IMAGE_FORMAT: ImageFormat = 'jpeg'
    const DEFAULT_VIDEO_FORMAT: VideoFormat = 'mp4'
    const DEFAULT_DOCUMENT_FORMAT: DocumentFormat = 'pdf'

    switch (part.type) {
      case 'text':
        return { text: part.content }
      case 'image': {
        const metadata = part.metadata as BedrockImageMetadata | undefined
        const format = metadata?.format ?? DEFAULT_IMAGE_FORMAT

        if (metadata?.s3Location) {
          return {
            image: {
              format,
              source: { s3Location: metadata.s3Location },
            },
          }
        }

        if (part.source.type === 'data') {
          return {
            image: {
              format,
              source: { bytes: toUint8Array(part.source.value) },
            },
          }
        }

        throw new Error('Bedrock only supports image sources as inline base64 data or S3 locations')
      }
      case 'video': {
        const metadata = part.metadata as BedrockVideoMetadata | undefined
        const format = metadata?.format ?? DEFAULT_VIDEO_FORMAT

        if (metadata?.s3Location) {
          return {
            video: {
              format,
              source: { s3Location: metadata.s3Location },
            },
          }
        }

        if (part.source.type === 'data') {
          return {
            video: {
              format,
              source: { bytes: toUint8Array(part.source.value) },
            },
          }
        }

        throw new Error('Bedrock only supports video sources as inline base64 data or S3 locations')
      }
      case 'document': {
        const metadata = part.metadata as BedrockDocumentMetadata | undefined
        const format = metadata?.format ?? DEFAULT_DOCUMENT_FORMAT
        const name = metadata?.name ?? `document-${Date.now()}`

        if (metadata?.s3Location) {
          return {
            document: {
              format,
              name,
              source: { s3Location: metadata.s3Location },
            },
          }
        }

        if (part.source.type === 'data') {
          return {
            document: {
              format,
              name,
              source: { bytes: toUint8Array(part.source.value) },
            },
          }
        }

        return {
          document: {
            format,
            name,
            source: { text: part.source.value },
          },
        }
      }
      case 'audio':
        throw new Error(
          'Bedrock Converse API does not support audio input. Use Bedrock Data Automation for audio processing.',
        )
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private parseToolArguments(args?: string): DocumentType {
    if (!args) return {} as DocumentType

    try {
      return JSON.parse(args) as DocumentType
    } catch {
      return {} as DocumentType
    }
  }

  private async *processBedrockStream(
    response: Response,
    model: string,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    let accumulatedContent = ''
    let accumulatedThinking = ''
    const toolCallMap = new Map<
      number,
      { id: string; name: string; input: string }
    >()
    let currentBlockIndex = -1
    let pendingFinishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null = null

    const reader = response.body?.getReader()
    if (!reader) {
      yield {
        type: 'error',
        id: this.generateId(),
        model,
        timestamp,
        error: { message: 'No response body' },
      }
      return
    }

    const codec = new EventStreamCodec(toUtf8, fromUtf8)
    let buffer = new Uint8Array(0)
    const textDecoder = new TextDecoder()

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        const newBuffer = new Uint8Array(buffer.length + value.length)
        newBuffer.set(buffer)
        newBuffer.set(value, buffer.length)
        buffer = newBuffer

        while (buffer.length >= 4) {
          const totalLength = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
          ).getUint32(0, false)

          if (buffer.length < totalLength) break

          try {
            const subView = buffer.subarray(0, totalLength)
            const decoded = codec.decode(subView)
            buffer = buffer.slice(totalLength)

            if (decoded.headers[':message-type']?.value === 'event') {
              const eventType = decoded.headers[':event-type']?.value as string
              const data = JSON.parse(textDecoder.decode(decoded.body))
              delete data.p

              const event = { [eventType]: data } as BedrockStreamEvent

              if (event.messageStart) {
                continue
              }

              if (event.contentBlockStart) {
                currentBlockIndex = event.contentBlockStart.contentBlockIndex ?? 0

                const toolUseStart = event.contentBlockStart.start?.toolUse
                if (toolUseStart) {
                  toolCallMap.set(currentBlockIndex, {
                    id: toolUseStart.toolUseId || this.generateId(),
                    name: toolUseStart.name || '',
                    input: '',
                  })
                }
              }

              if (event.contentBlockDelta?.delta) {
                const delta = event.contentBlockDelta.delta

                if (delta.text) {
                  accumulatedContent += delta.text
                  yield {
                    type: 'content',
                    id: this.generateId(),
                    model,
                    timestamp,
                    delta: delta.text,
                    content: accumulatedContent,
                    role: 'assistant',
                  }
                }

                if (delta.reasoningContent?.text) {
                  accumulatedThinking += delta.reasoningContent.text
                  yield {
                    type: 'thinking',
                    id: this.generateId(),
                    model,
                    timestamp,
                    delta: delta.reasoningContent.text,
                    content: accumulatedThinking,
                  }
                }

                if (delta.toolUse?.input) {
                  const existing = toolCallMap.get(currentBlockIndex)
                  if (existing) {
                    existing.input += delta.toolUse.input
                  }
                }
              }

              if (event.contentBlockStop) {
                const blockIndex = event.contentBlockStop.contentBlockIndex ?? currentBlockIndex
                const toolData = toolCallMap.get(blockIndex)
                if (toolData) {
                  yield {
                    type: 'tool_call',
                    id: this.generateId(),
                    model,
                    timestamp,
                    toolCall: {
                      id: toolData.id,
                      type: 'function',
                      function: {
                        name: toolData.name,
                        arguments: toolData.input || '{}',
                      },
                    },
                    index: blockIndex,
                  }
                }
              }

              if (event.messageStop) {
                const stopReason: StopReason | undefined = event.messageStop.stopReason
                const hasToolCalls = toolCallMap.size > 0
                if (hasToolCalls || stopReason === 'tool_use') {
                  pendingFinishReason = 'tool_calls'
                } else if (stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded') {
                  pendingFinishReason = 'length'
                } else if (stopReason === 'content_filtered' || stopReason === 'guardrail_intervened') {
                  pendingFinishReason = 'content_filter'
                } else {
                  pendingFinishReason = 'stop'
                }
              }

              if (event.metadata) {
                const finishReason = pendingFinishReason ?? 'stop'
                const usage = mapTokenUsage(event.metadata.usage)

                yield {
                  type: 'done',
                  id: this.generateId(),
                  model,
                  timestamp,
                  finishReason,
                  usage,
                }
                pendingFinishReason = null
              }

              if (
                event.internalServerException ||
                event.modelStreamErrorException ||
                event.throttlingException ||
                event.validationException
              ) {
                const errorObj =
                  event.internalServerException ||
                  event.modelStreamErrorException ||
                  event.throttlingException ||
                  event.validationException
                yield {
                  type: 'error',
                  id: this.generateId(),
                  model,
                  timestamp,
                  error: {
                    message: errorObj.message || 'Bedrock stream error',
                  },
                }
              }
            }
          } catch {
            break
          }
        }
      }

      if (pendingFinishReason !== null) {
        yield {
          type: 'done',
          id: this.generateId(),
          model,
          timestamp,
          finishReason: pendingFinishReason,
        }
      }
    } finally {
      reader.releaseLock()
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
}

/**
 * Creates a Bedrock adapter with the provided configuration.
 *
 * Supports two calling patterns for flexibility:
 * 1. `createBedrock(apiKey)` or `createBedrock(apiKey, config)` - Simple API key auth
 * 2. `createBedrock(config)` - Full config object for SigV4 or advanced options
 *
 * @param apiKeyOrConfig - API key string or full configuration object
 * @param config - Optional additional configuration when first arg is API key
 * @returns A configured Bedrock adapter instance
 *
 * @example Simple API Key (like OpenAI/Anthropic)
 * ```typescript
 * const bedrock = createBedrock('your-bedrock-api-key');
 * ```
 *
 * @example API Key with Region
 * ```typescript
 * const bedrock = createBedrock('your-bedrock-api-key', {
 *   region: 'us-east-1'
 * });
 * ```
 *
 * @example SigV4 with Static Credentials
 * ```typescript
 * const bedrockAdapter = createBedrock({
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   region: 'us-west-2'
 * });
 * ```
 *
 * @example SigV4 with Credential Provider
 * ```typescript
 * const bedrockAdapter = createBedrock({
 *   credentialProvider: async () => ({
 *     accessKeyId: await getAccessKey(),
 *     secretAccessKey: await getSecretKey(),
 *     sessionToken: await getSessionToken()
 *   }),
 *   region: 'eu-west-1'
 * });
 * ```
 */
export function createBedrock(
  apiKey: string,
  config?: Omit<BedrockConfig, 'apiKey'>,
): Bedrock
export function createBedrock(config?: BedrockConfig): Bedrock
export function createBedrock(
  apiKeyOrConfig?: string | BedrockConfig,
  maybeConfig?: Omit<BedrockConfig, 'apiKey'>,
): Bedrock {
  if (typeof apiKeyOrConfig === 'string') {
    return new Bedrock({ apiKey: apiKeyOrConfig, ...(maybeConfig ?? {}) })
  }
  return new Bedrock(apiKeyOrConfig ?? {})
}

/**
 * Create a Bedrock adapter with automatic environment variable detection.
 *
 * Authentication is automatically detected from environment variables.
 * Throws an error if no valid authentication is configured.
 *
 * **Authentication (checked in order):**
 * 1. `AWS_BEARER_TOKEN_BEDROCK` - API key for Bearer token auth
 * 2. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` - SigV4 auth
 * 3. `AWS_SESSION_TOKEN` - Optional session token for temporary credentials
 *
 * **Region:**
 * - `AWS_REGION` or `AWS_DEFAULT_REGION`
 * - Falls back to `'us-east-1'` if not set
 *
 * Environment variables are checked in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration to override environment defaults
 * @returns Configured Bedrock adapter instance
 * @throws Error if no authentication credentials are found
 *
 * @example Basic Usage (relies on environment variables)
 * ```typescript
 * // Set AWS_BEARER_TOKEN_BEDROCK or AWS credentials in environment
 * const ai = new AI({
 *   adapters: { bedrock: bedrock() }
 * });
 * ```
 *
 * @example With Config Overrides
 * ```typescript
 * const ai = new AI({
 *   adapters: {
 *     bedrock: bedrock({
 *       region: 'eu-central-1'
 *     })
 *   }
 * });
 * ```
 */
export function bedrock(config?: BedrockConfig): Bedrock {
  return createBedrock(config)
}
