import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { getAnthropicProviderToolKind } from '../tools/anthropic-provider-tool'
import {
  readCodeExecutionConfig,
  readCodeExecutionSkills,
} from '../tools/code-execution-tool'
import { validateTextProviderOptions } from '../text/text-provider-options'
import { processAnthropicStream } from './text-stream'
import { buildAnthropicUsage } from '../usage'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils/client'
import {
  ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS,
  getAnthropicDefaultMaxTokens,
} from '../model-meta'
import type {
  ANTHROPIC_MODELS,
  AnthropicChatModelProviderOptionsByName,
  AnthropicChatModelToolCapabilitiesByName,
  AnthropicModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  Base64ImageSource,
  Base64PDFSource,
  ContentBlockParam,
  DocumentBlockParam,
  ImageBlockParam,
  ServerToolUseBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  ToolUseBlockParam,
  URLImageSource,
  URLPDFSource,
  WebFetchToolResultBlockParam,
  WebSearchToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages'
import type Anthropic_SDK from '@anthropic-ai/sdk'
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta'
import type {
  AnyTool,
  ContentPart,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type {
  AnthropicSystemPromptMetadata,
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  AnthropicDocumentMetadata,
  AnthropicImageMetadata,
  AnthropicMessageMetadataByModality,
  AnthropicTextMetadata,
} from '../message-types'
import type {
  AnthropicClientConfig,
  AnthropicMessagesClient,
} from '../utils/client'

/**
 * The block type carried by an Anthropic provider-executed (server) tool's
 * stored result. Mirrors the `*_tool_result` block emitted by the streaming
 * API so it can be replayed verbatim into a later turn.
 */
type AnthropicServerToolResultBlockType =
  | 'web_search_tool_result'
  | 'web_fetch_tool_result'

/**
 * Anthropic payload stashed on a provider-executed tool call's `metadata`
 * (under the `anthropic` key, alongside `providerExecuted: true`). Holds enough
 * to reconstruct the original `server_tool_use` + `*_tool_result` blocks so the
 * model still sees prior `web_search` / `web_fetch` evidence on the next turn.
 */
interface AnthropicServerToolMetadata {
  serverToolType: ServerToolUseBlockParam['name']
  resultBlockType: AnthropicServerToolResultBlockType
  /** Raw result block content, preserved verbatim from the stream. */
  result: unknown
}

/**
 * Narrow an opaque tool-call `metadata` to {@link AnthropicServerToolMetadata}
 * when it follows the provider-executed convention, else `null`.
 */
function readAnthropicServerToolMetadata(
  metadata: unknown,
): AnthropicServerToolMetadata | null {
  if (typeof metadata !== 'object') return null
  if (metadata === null) return null
  const outer = metadata as { providerExecuted?: unknown; anthropic?: unknown }
  if (outer.providerExecuted !== true) return null
  const inner = outer.anthropic
  if (typeof inner !== 'object') return null
  if (inner === null) return null
  const { serverToolType, resultBlockType, result } = inner as {
    serverToolType?: unknown
    resultBlockType?: unknown
    /** Raw result block content, preserved verbatim from the stream. */
    result?: unknown
  }
  const isServerToolResult =
    resultBlockType === 'web_search_tool_result' ||
    resultBlockType === 'web_fetch_tool_result'
  if (typeof serverToolType !== 'string') {
    return null
  }
  if (!isServerToolResult) {
    return null
  }
  return {
    // Validated as a string above; widen back to the SDK's tool-name union.
    serverToolType: serverToolType as ServerToolUseBlockParam['name'],
    resultBlockType,
    result,
  }
}

/**
 * Reconstruct the `*_tool_result` block param from stored server-tool metadata.
 * The `result` content is opaque round-trip data, asserted to the SDK's param
 * content type at this single boundary.
 */
function buildServerToolResultBlock(
  toolUseId: string,
  meta: AnthropicServerToolMetadata,
): WebSearchToolResultBlockParam | WebFetchToolResultBlockParam {
  if (meta.resultBlockType === 'web_search_tool_result') {
    return {
      type: 'web_search_tool_result',
      tool_use_id: toolUseId,
      content: meta.result as WebSearchToolResultBlockParam['content'],
    }
  }
  return {
    type: 'web_fetch_tool_result',
    tool_use_id: toolUseId,
    content: meta.result as WebFetchToolResultBlockParam['content'],
  }
}

/**
 * Computes the `betas` array for a Messages request. Unions:
 * - `interleaved-thinking-2025-05-14` when interleaved thinking is enabled,
 * - `code-execution-2025-08-25` when a `code_execution` tool is present,
 * - `skills-2025-10-02` when that tool carries skills,
 * - `context-management-2025-06-27` when `context_management` is set.
 * Returns `undefined` when none apply (so the call site omits `betas`).
 */
export function computeAnthropicBetas(
  tools: Array<AnyTool> | undefined,
  modelOptions:
    | {
        thinking?: {
          type?: 'enabled' | 'disabled' | 'adaptive'
          budget_tokens?: number
        }
        context_management?: unknown | null
      }
    | undefined,
): Array<AnthropicBeta> | undefined {
  const betas = new Set<AnthropicBeta>()

  const useInterleavedThinking =
    modelOptions?.thinking?.type === 'enabled' &&
    typeof modelOptions.thinking.budget_tokens === 'number' &&
    modelOptions.thinking.budget_tokens > 0
  if (useInterleavedThinking) betas.add('interleaved-thinking-2025-05-14')

  // Context editing requires the beta header; the body field alone is not
  // enough (issue #1074). `null` is a typed "unset" — do not enable the beta.
  if (modelOptions?.context_management != null) {
    betas.add('context-management-2025-06-27')
  }

  // Code-execution beta is version-aware: select from the FIRST code_execution
  // tool's config type.
  const codeExecTool = tools?.find(
    (tool) => getAnthropicProviderToolKind(tool) === 'code_execution',
  )
  if (codeExecTool) {
    const cfgType = readCodeExecutionConfig(codeExecTool)?.type
    betas.add(
      cfgType === 'code_execution_20250522'
        ? 'code-execution-2025-05-22'
        : 'code-execution-2025-08-25',
    )
  }

  const hasSkills = tools?.some(
    (tool) =>
      getAnthropicProviderToolKind(tool) === 'code_execution' &&
      (readCodeExecutionSkills(tool)?.length ?? 0) > 0,
  )
  if (hasSkills) betas.add('skills-2025-10-02')

  return betas.size > 0 ? Array.from(betas) : undefined
}

const ANTHROPIC_MODEL_OPTION_KEYS: Array<keyof ExternalTextProviderOptions> = [
  'cache_control',
  'container',
  'context_management',
  'effort',
  'mcp_servers',
  'output_config',
  'service_tier',
  'stop_sequences',
  'thinking',
  'tool_choice',
  'top_k',
  'temperature',
  'top_p',
]

function copyValidAnthropicModelOptions(
  modelOptions: ExternalTextProviderOptions | undefined,
  logger: InternalLogger,
): Partial<InternalTextProviderOptions> {
  const validProviderOptions: Partial<InternalTextProviderOptions> = {}
  if (!modelOptions) return validProviderOptions

  const droppedKeyExemptSet = new Set<string>([
    ...ANTHROPIC_MODEL_OPTION_KEYS,
    'max_tokens',
  ])
  const droppedKeys = Object.keys(modelOptions).filter(
    (key) => !droppedKeyExemptSet.has(key),
  )
  if (droppedKeys.length > 0) {
    logger.errors(
      `anthropic.mapCommonOptionsToAnthropic dropped unknown modelOptions key(s): ${droppedKeys.join(', ')}`,
      {
        source: 'anthropic.mapCommonOptionsToAnthropic',
        droppedKeys,
        hint: droppedKeys.includes('system')
          ? 'pass system prompts via the top-level `systemPrompts` option; `modelOptions.system` is no longer honored'
          : undefined,
      },
    )
  }
  for (const key of ANTHROPIC_MODEL_OPTION_KEYS) {
    if (!(key in modelOptions)) continue
    const value = modelOptions[key]
    if (key === 'tool_choice' && typeof value === 'string') {
      ;(validProviderOptions as Record<string, unknown>)[key] = {
        type: value,
      }
    } else {
      ;(validProviderOptions as Record<string, unknown>)[key] = value
    }
  }
  return validProviderOptions
}

function buildAnthropicSystemBlocks(
  systemPrompts: TextOptions['systemPrompts'],
): Array<TextBlockParam> | undefined {
  const normalized =
    normalizeSystemPrompts<AnthropicSystemPromptMetadata>(systemPrompts)
  if (normalized.length === 0) return undefined
  return normalized.map(
    (p): TextBlockParam => ({
      type: 'text',
      text: p.content,
      ...(p.metadata?.cache_control && {
        cache_control: p.metadata.cache_control,
      }),
    }),
  )
}

function applyCodeExecutionSkills(
  tools: Array<AnyTool> | undefined,
  validProviderOptions: Partial<InternalTextProviderOptions>,
): void {
  const toolSkills = tools
    ?.map((tool) =>
      getAnthropicProviderToolKind(tool) === 'code_execution'
        ? readCodeExecutionSkills(tool)
        : undefined,
    )
    .find((skills) => skills && skills.length > 0)

  if (toolSkills && toolSkills.length > 0) {
    const existingContainer = validProviderOptions.container ?? undefined
    validProviderOptions.container = {
      id: existingContainer?.id ?? null,
      skills: toolSkills,
    }
  }
}

function resolveAnthropicMaxTokens(
  model: string,
  modelOptions: { max_tokens?: number } | undefined,
  thinkingBudget: number | undefined,
  stream: boolean,
): number {
  const defaultMaxTokens =
    modelOptions?.max_tokens ?? getAnthropicDefaultMaxTokens(model, { stream })
  return thinkingBudget && thinkingBudget >= defaultMaxTokens
    ? thinkingBudget + 1
    : defaultMaxTokens
}

/**
 * Configuration for Anthropic text adapter
 */
export interface AnthropicTextConfig extends AnthropicClientConfig {}

export type AnthropicTextAdapterConfig =
  | AnthropicTextConfig
  | { client: AnthropicMessagesClient }

/**
 * Anthropic-specific provider options for text/chat
 */
export type AnthropicTextProviderOptions = ExternalTextProviderOptions

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof AnthropicChatModelProviderOptionsByName
    ? AnthropicChatModelProviderOptionsByName[TModel]
    : AnthropicTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use default.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof AnthropicModelInputModalitiesByName
    ? AnthropicModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'document']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof AnthropicChatModelToolCapabilitiesByName
    ? NonNullable<AnthropicChatModelToolCapabilitiesByName[TModel]>
    : readonly []

type SdkAnthropicMessagesClient = {
  beta: {
    messages: Pick<Anthropic_SDK['beta']['messages'], 'create'>
  }
}

/**
 * Restore the package SDK's precise overloads at the adapter boundary.
 * Alternative clients may use a separate Anthropic 0.x SDK whose declarations
 * drift while implementing the same Messages protocol at runtime.
 */
function asSdkAnthropicMessagesClient(
  client: AnthropicMessagesClient,
): SdkAnthropicMessagesClient {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- The public callable deliberately erases version-specific SDK overloads; restore this package's SDK type at the internal boundary.
  return client as unknown as SdkAnthropicMessagesClient
}

/**
 * Anthropic Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Anthropic chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class AnthropicTextAdapter<
  TModel extends (typeof ANTHROPIC_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  AnthropicMessageMetadataByModality,
  TToolCapabilities,
  // TToolCallMetadata — anthropic has no tool-call metadata round-tripping
  unknown,
  // TSystemPromptMetadata — narrows `systemPrompts[i].metadata` at the
  // chat() call site so users get `cache_control` autocomplete.
  AnthropicSystemPromptMetadata
> {
  override readonly kind = 'text' as const
  readonly name = 'anthropic' as const

  private readonly client: SdkAnthropicMessagesClient

  constructor(config: AnthropicTextAdapterConfig, model: TModel) {
    super({}, model)
    this.client =
      'client' in config
        ? asSdkAnthropicMessagesClient(config.client)
        : createAnthropicClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { logger } = options
    try {
      const requestParams = this.mapCommonOptionsToAnthropic(options)

      logger.request(
        `activity=chat provider=anthropic model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'anthropic', model: this.model },
      )

      // `betas` is attached at the call site rather than in the shared mapper
      // because the beta set depends on both the tools and the modelOptions.
      const betas = computeAnthropicBetas(options.tools, options.modelOptions)

      const stream = await this.client.beta.messages.create(
        {
          ...requestParams,
          stream: true,
          ...(betas && { betas }),
        },
        {
          signal: options.request?.signal,
          headers: options.request?.headers,
        },
      )

      yield* processAnthropicStream(
        stream,
        options,
        () => generateId(this.name),
        logger,
      )
    } catch (error: unknown) {
      const err = error as Error & { status?: number; code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('anthropic.chatStream fatal', {
        error,
        source: 'anthropic.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: err.message || 'Unknown error occurred',
        code: err.code || String(err.status),
        // Forward the Anthropic SDK error's `.error` response body (e.g.
        // `{ type, message }`) when present; never the raw exception object.
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code || String(err.status),
        },
      }
    }
  }

  /**
     * Generate structured output using Anthropic's tool-based approach.
     * Anthropic doesn't have native structured output, so we use a tool with the schema
     * and force the model to call it.
     * The outputSchema is already JSON Schema (converted in the ai layer).
     */
  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    const requestParams = this.mapCommonOptionsToAnthropic(chatOptions, {
      stream: false,
    })

    // Create a tool that will capture the structured output
    // Anthropic's SDK requires input_schema with type: 'object' literal
    const structuredOutputTool = {
      name: 'structured_output',
      description:
        'Use this tool to provide your response in the required structured format.',
      input_schema: {
        type: 'object' as const,
        properties: outputSchema.properties ?? {},
        required: outputSchema.required ?? [],
      },
    }

    try {
      logger.request(
        `activity=chat provider=anthropic model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        { provider: 'anthropic', model: this.model },
      )
      const betas = computeAnthropicBetas(
        chatOptions.tools,
        chatOptions.modelOptions,
      )
      // Make non-streaming request with tool_choice forced to our structured output tool
      const response = await this.client.beta.messages.create(
        {
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          tool_choice: { type: 'tool', name: 'structured_output' },
          ...(betas && { betas }),
        },
        {
          signal: chatOptions.request?.signal,
          headers: chatOptions.request?.headers,
        },
      )

      // Extract the tool use content from the response
      let parsed: unknown = null
      let rawText = ''

      for (const block of response.content) {
        const isStructuredOutput =
          block.type === 'tool_use' && block.name === 'structured_output'
        if (isStructuredOutput) {
          parsed = block.input
          rawText = JSON.stringify(block.input)
          break
        }
      }

      if (parsed === null) {
        // Fallback: try to extract text content and parse as JSON
        rawText = response.content
          .map((b) => {
            if (b.type === 'text') {
              return b.text
            }
            return ''
          })
          .join('')
        try {
          parsed = JSON.parse(rawText)
        } catch {
          throw new Error(
            `Failed to extract structured output from response. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
          )
        }
      }

      return {
        data: parsed,
        rawText,
        usage: buildAnthropicUsage(response.usage),
      }
    } catch (error: unknown) {
      const err = error as Error
      logger.errors('anthropic.structuredOutput fatal', {
        error,
        source: 'anthropic.structuredOutput',
      })
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  private mapCommonOptionsToAnthropic(
    options: TextOptions<AnthropicTextProviderOptions>,
    { stream = true }: { stream?: boolean } = {},
  ) {
    const formattedMessages = this.formatMessages(options.messages)
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const validProviderOptions = copyValidAnthropicModelOptions(
      options.modelOptions,
      options.logger,
    )

    const thinkingBudget =
      validProviderOptions.thinking?.type === 'enabled'
        ? validProviderOptions.thinking.budget_tokens
        : undefined
    const maxTokens = resolveAnthropicMaxTokens(
      this.model,
      options.modelOptions,
      thinkingBudget,
      stream,
    )

    const systemBlocks = buildAnthropicSystemBlocks(options.systemPrompts)
    const combinedSchema = options.outputSchema as
      | Record<string, unknown>
      | undefined
    const outputConfig = combinedSchema
      ? {
          output_config: {
            ...(validProviderOptions.output_config ?? {}),
            format: {
              type: 'json_schema' as const,
              schema: combinedSchema,
            },
          },
        }
      : undefined

    applyCodeExecutionSkills(options.tools, validProviderOptions)

    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      messages: formattedMessages,
      ...(systemBlocks !== undefined && { system: systemBlocks }),
      ...(tools !== undefined && { tools }),
      ...validProviderOptions,
      ...(outputConfig ?? {}),
    }
    validateTextProviderOptions(requestParams)
    return requestParams
  }

  /**
     * Anthropic supports `output_config.format` + `tools` in a single streaming
     * Messages request only for Claude 4.5+ (GA 2026-01-29). For 4.4 and
     * earlier we keep the forced-tool-use workaround in
     * {@link structuredOutput} via the engine's finalization path.
     */
  supportsCombinedToolsAndSchema(): boolean {
    return ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(this.model)
  }

  private convertContentPartToAnthropic(
    part: ContentPart,
  ): TextBlockParam | ImageBlockParam | DocumentBlockParam {
    switch (part.type) {
      case 'text': {
        const metadata = part.metadata as AnthropicTextMetadata | undefined
        return {
          type: 'text',
          text: part.content,
          ...metadata,
        }
      }

      case 'image': {
        const metadata = part.metadata as AnthropicImageMetadata | undefined
        const imageSource: Base64ImageSource | URLImageSource =
          part.source.type === 'data'
            ? {
                type: 'base64',
                data: part.source.value,
                media_type: part.source.mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
              }
            : {
                type: 'url',
                url: part.source.value,
              }
        return {
          type: 'image',
          source: imageSource,
          ...(metadata?.cache_control !== undefined && {
            cache_control: metadata.cache_control,
          }),
        }
      }
      case 'document': {
        const metadata = part.metadata as AnthropicDocumentMetadata | undefined
        const title = metadata?.title ?? metadata?.filename
        const docSource: Base64PDFSource | URLPDFSource =
          part.source.type === 'data'
            ? {
                type: 'base64',
                data: part.source.value,
                media_type: part.source.mimeType as 'application/pdf',
              }
            : {
                type: 'url',
                url: part.source.value,
              }
        return {
          type: 'document',
          source: docSource,
          ...(metadata?.cache_control !== undefined && {
            cache_control: metadata.cache_control,
          }),
          ...(metadata?.citations !== undefined && {
            citations: metadata.citations,
          }),
          ...(metadata?.context !== undefined && {
            context: metadata.context,
          }),
          ...(title !== undefined && { title }),
        }
      }
      case 'audio':
      case 'video':
        throw new Error(
          `Anthropic does not support ${part.type} content directly`,
        )
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private formatToolResultMessage(
    message: ModelMessage,
    toolCallId: string,
  ): InternalTextProviderOptions['messages'][number] {
    const toolContent = message.content
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolCallId,
          content: Array.isArray(toolContent)
            ? toolContent.map((part) =>
                this.convertContentPartToAnthropic(part),
              )
            : typeof toolContent === 'string'
              ? toolContent
              : '',
        },
      ],
    }
  }

  private parseToolCallInput(toolCall: {
    function: { arguments?: string }
  }): unknown {
    try {
      const parsed = toolCall.function.arguments
        ? JSON.parse(toolCall.function.arguments)
        : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return toolCall.function.arguments
    }
  }

  private formatAssistantToolCallMessage(
    message: ModelMessage,
    toolCalls: NonNullable<ModelMessage['toolCalls']>,
  ): InternalTextProviderOptions['messages'][number] {
    const contentBlocks: Array<ContentBlockParam> = []

    this.appendThinkingBlocks(contentBlocks, message.thinking)

    if (message.content) {
      const content = typeof message.content === 'string' ? message.content : ''
      const textBlock: TextBlockParam = {
        type: 'text',
        text: content,
      }
      contentBlocks.push(textBlock)
    }

    for (const toolCall of toolCalls) {
      const parsedInput = this.parseToolCallInput(toolCall)

      const serverMeta = readAnthropicServerToolMetadata(toolCall.metadata)
      if (serverMeta) {
        const serverToolUseBlock: ServerToolUseBlockParam = {
          type: 'server_tool_use',
          id: toolCall.id,
          name: serverMeta.serverToolType,
          input: parsedInput,
        }
        contentBlocks.push(serverToolUseBlock)
        contentBlocks.push(buildServerToolResultBlock(toolCall.id, serverMeta))
        continue
      }

      const toolUseBlock: ToolUseBlockParam = {
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      }
      contentBlocks.push(toolUseBlock)
    }

    return {
      role: 'assistant',
      content: contentBlocks,
    }
  }

  private formatAssistantContentMessage(
    message: ModelMessage,
  ): InternalTextProviderOptions['messages'][number] {
    const contentBlocks: Array<ContentBlockParam> = []
    this.appendThinkingBlocks(contentBlocks, message.thinking)

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        contentBlocks.push(this.convertContentPartToAnthropic(part))
      }
    } else if (message.content) {
      contentBlocks.push({
        type: 'text',
        text: message.content,
      })
    }

    return {
      role: 'assistant',
      content: contentBlocks.length > 0 ? contentBlocks : '',
    }
  }

  private formatMessages(
    messages: Array<ModelMessage>,
  ): InternalTextProviderOptions['messages'] {
    const formattedMessages: InternalTextProviderOptions['messages'] = []

    for (const message of messages) {
      const role = message.role

      if (role === 'tool' && message.toolCallId) {
        formattedMessages.push(
          this.formatToolResultMessage(message, message.toolCallId),
        )
        continue
      }

      if (role === 'assistant' && message.toolCalls?.length) {
        formattedMessages.push(
          this.formatAssistantToolCallMessage(message, message.toolCalls),
        )
        continue
      }

      if (role === 'assistant') {
        formattedMessages.push(this.formatAssistantContentMessage(message))
        continue
      }

      if (role === 'user' && Array.isArray(message.content)) {
        formattedMessages.push({
          role: 'user',
          content: message.content.map((part) =>
            this.convertContentPartToAnthropic(part),
          ),
        })
        continue
      }

      formattedMessages.push({
        role: 'user',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content
              ? message.content.map((c) =>
                  this.convertContentPartToAnthropic(c),
                )
              : '',
      })
    }

    return this.mergeConsecutiveSameRoleMessages(formattedMessages)
  }

  private appendThinkingBlocks(
    contentBlocks: Array<ContentBlockParam>,
    thinkingParts: ModelMessage['thinking'],
  ): void {
    if (!thinkingParts?.length) return

    for (const thinking of thinkingParts) {
      if (!thinking.signature) continue
      const block: ThinkingBlockParam = {
        type: 'thinking',
        thinking: thinking.content,
        signature: thinking.signature,
      }
      contentBlocks.push(block)
    }
  }

  /**
     * Merge consecutive messages of the same role into a single message.
     * Anthropic's API requires strictly alternating user/assistant roles.
     * Tool results are wrapped as role:'user' messages, which can collide
     * with actual user messages in multi-turn conversations.
     *
     * Also filters out empty assistant messages (e.g., from a previous failed request).
     */
  private mergeConsecutiveSameRoleMessages(
    messages: InternalTextProviderOptions['messages'],
  ): InternalTextProviderOptions['messages'] {
    const merged: InternalTextProviderOptions['messages'] = []

    for (const msg of messages) {
      // Skip empty assistant messages (no content or empty string)
      if (msg.role === 'assistant') {
        const hasContent = Array.isArray(msg.content)
          ? msg.content.length > 0
          : typeof msg.content === 'string' && msg.content.length > 0
        if (!hasContent) {
          continue
        }
      }

      const prev = merged[merged.length - 1]
      if (prev && prev.role === msg.role) {
        // Normalize both contents to arrays and concatenate
        const prevBlocks = Array.isArray(prev.content)
          ? prev.content
          : typeof prev.content === 'string' && prev.content
            ? [{ type: 'text' as const, text: prev.content }]
            : []
        const msgBlocks = Array.isArray(msg.content)
          ? msg.content
          : typeof msg.content === 'string' && msg.content
            ? [{ type: 'text' as const, text: msg.content }]
            : []
        prev.content = [...prevBlocks, ...msgBlocks]
      } else {
        merged.push({ ...msg })
      }
    }

    for (const msg of merged) {
      if (Array.isArray(msg.content)) {
        const seenToolResultIds = new Set<string>()
        msg.content = msg.content.filter((block: any) => {
          if (block.type === 'tool_result' && block.tool_use_id) {
            if (seenToolResultIds.has(block.tool_use_id)) {
              return false // Remove duplicate
            }
            seenToolResultIds.add(block.tool_use_id)
          }
          return true
        })
      }
    }

    return merged
  }
}

/**
 * Creates an Anthropic chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 */
export function createAnthropicChat<
  TModel extends (typeof ANTHROPIC_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>
> {
  return new AnthropicTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an Anthropic chat adapter with an injected Messages client.
 * Type resolution happens here at the call site.
 */
export function createAnthropicChatWithClient<
  TModel extends (typeof ANTHROPIC_MODELS)[number],
>(
  model: TModel,
  client: AnthropicMessagesClient,
): AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>
> {
  return new AnthropicTextAdapter({ client }, model)
}

/**
 * Creates an Anthropic text adapter with automatic API key detection.
 * Type resolution happens here at the call site.
 */
export function anthropicText<TModel extends (typeof ANTHROPIC_MODELS)[number]>(
  model: TModel,
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>
> {
  const apiKey = getAnthropicApiKeyFromEnv()
  return createAnthropicChat(model, apiKey, config)
}
