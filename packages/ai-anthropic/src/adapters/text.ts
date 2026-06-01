import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { validateTextProviderOptions } from '../text/text-provider-options'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils'
import { ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS } from '../model-meta'
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
  TextBlockParam,
  ThinkingBlockParam,
  ToolUseBlockParam,
  URLImageSource,
  URLPDFSource,
} from '@anthropic-ai/sdk/resources/messages'
import type Anthropic_SDK from '@anthropic-ai/sdk'
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
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
import type { AnthropicClientConfig } from '../utils'

/**
 * Configuration for Anthropic text adapter
 */
export interface AnthropicTextConfig extends AnthropicClientConfig {}

/**
 * Anthropic-specific provider options for text/chat
 */
export type AnthropicTextProviderOptions = ExternalTextProviderOptions

// ===========================
// Type Resolution Helpers
// ===========================

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

// ===========================
// Adapter Implementation
// ===========================

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

  private readonly client: Anthropic_SDK

  constructor(config: AnthropicTextConfig, model: TModel) {
    super({}, model)
    this.client = createAnthropicClient(config)
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    try {
      const requestParams = this.mapCommonOptionsToAnthropic(options)

      logger.request(
        `activity=chat provider=anthropic model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'anthropic', model: this.model },
      )

      // `betas` is attached at the call site rather than in the shared mapper
      // because the `interleaved-thinking-2025-05-14` header is only useful for
      // the streaming path.
      const modelOptions = options.modelOptions as
        | InternalTextProviderOptions
        | undefined
      const useInterleavedThinking =
        modelOptions?.thinking?.type === 'enabled' &&
        typeof modelOptions.thinking.budget_tokens === 'number' &&
        modelOptions.thinking.budget_tokens > 0
      const betas: Array<AnthropicBeta> | undefined = useInterleavedThinking
        ? ['interleaved-thinking-2025-05-14']
        : undefined

      // `client.beta.messages` is Anthropic's permanent staging surface, not a
      // sunset path: it's a superset of `client.messages` that additionally
      // accepts the `betas: AnthropicBeta[]` header (e.g. interleaved
      // thinking) plus richer `container` (skills) and `context_management`
      // shapes that `InternalTextProviderOptions` carries. We route every
      // Messages call through it so the request mapper stays single-shape.
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

      yield* this.processAnthropicStream(
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

    const requestParams = this.mapCommonOptionsToAnthropic(chatOptions)

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
      // Make non-streaming request with tool_choice forced to our structured output tool
      const response = await this.client.beta.messages.create(
        {
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          tool_choice: { type: 'tool', name: 'structured_output' },
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
        if (block.type === 'tool_use' && block.name === 'structured_output') {
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
  ) {
    const modelOptions = options.modelOptions as
      | InternalTextProviderOptions
      | undefined

    const formattedMessages = this.formatMessages(options.messages)
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const validProviderOptions: Partial<InternalTextProviderOptions> = {}
    if (modelOptions) {
      const validKeys: Array<keyof InternalTextProviderOptions> = [
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
      ]
      const validKeySet = new Set<string>(validKeys)
      const droppedKeys = Object.keys(modelOptions).filter(
        (key) => !validKeySet.has(key),
      )
      if (droppedKeys.length > 0) {
        // Reachable when callers cast around the public type (e.g.
        // `modelOptions: { system: ... } as any`). Without this warning the
        // unknown keys are silently dropped — `system` in particular was a
        // previously-tested path for attaching `cache_control` and we don't
        // want that to fail in production with no signal.
        options.logger.errors(
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
      for (const key of validKeys) {
        if (key in modelOptions) {
          const value = modelOptions[key]
          if (key === 'tool_choice' && typeof value === 'string') {
            ;(validProviderOptions as Record<string, unknown>)[key] = {
              type: value,
            }
          } else {
            ;(validProviderOptions as Record<string, unknown>)[key] = value
          }
        }
      }
    }

    const thinkingBudget =
      validProviderOptions.thinking?.type === 'enabled'
        ? validProviderOptions.thinking.budget_tokens
        : undefined
    const defaultMaxTokens = options.maxTokens || 1024
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1
        : defaultMaxTokens

    // `InternalTextProviderOptions.system` is typed
    // `string | Array<TextBlockParam>` (no `| undefined`), so build it
    // outside the literal and spread it conditionally rather than
    // assigning `undefined` under exactOptionalPropertyTypes.
    const systemBlocks = ((): Array<TextBlockParam> | undefined => {
      const normalized = normalizeSystemPrompts<AnthropicSystemPromptMetadata>(
        options.systemPrompts,
      )
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
    })()
    // Wire engine-threaded outputSchema into Messages `output_config.format`
    // alongside any `tools` so the model emits tool calls during the agent
    // loop and a single schema-constrained JSON message on its final turn.
    // Merge into any existing `output_config` so callers can keep tuning
    // `output_config.effort` alongside the schema.
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

    // `InternalTextProviderOptions` declares `temperature`, `top_p`,
    // and `tools` as `T?: ...` (no `| undefined`), so spread them
    // conditionally rather than passing explicit `undefined` from the
    // optional common `TextOptions` fields under
    // exactOptionalPropertyTypes.
    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.topP !== undefined && { top_p: options.topP }),
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
          ...metadata,
        }
      }
      case 'document': {
        const metadata = part.metadata as AnthropicDocumentMetadata | undefined
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
          ...metadata,
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

  private formatMessages(
    messages: Array<ModelMessage>,
  ): InternalTextProviderOptions['messages'] {
    const formattedMessages: InternalTextProviderOptions['messages'] = []

    for (const message of messages) {
      const role = message.role

      if (role === 'tool' && message.toolCallId) {
        const toolContent = message.content
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content: Array.isArray(toolContent)
                ? toolContent.map((part) =>
                    this.convertContentPartToAnthropic(part),
                  )
                : typeof toolContent === 'string'
                  ? toolContent
                  : '',
            },
          ],
        })
        continue
      }

      if (role === 'assistant' && message.toolCalls?.length) {
        const contentBlocks: Array<ContentBlockParam> = []

        this.appendThinkingBlocks(contentBlocks, message.thinking)

        if (message.content) {
          const content =
            typeof message.content === 'string' ? message.content : ''
          const textBlock: TextBlockParam = {
            type: 'text',
            text: content,
          }
          contentBlocks.push(textBlock)
        }

        for (const toolCall of message.toolCalls) {
          let parsedInput: unknown = {}
          try {
            const parsed = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {}
            parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            parsedInput = toolCall.function.arguments
          }

          const toolUseBlock: ToolUseBlockParam = {
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          }
          contentBlocks.push(toolUseBlock)
        }

        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks,
        })

        continue
      }

      if (role === 'assistant') {
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

        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : '',
        })
        continue
      }

      if (role === 'user' && Array.isArray(message.content)) {
        const contentBlocks = message.content.map((part) =>
          this.convertContentPartToAnthropic(part),
        )
        formattedMessages.push({
          role: 'user',
          content: contentBlocks,
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

    // Post-process: Anthropic requires strictly alternating user/assistant roles.
    // Tool results are sent as role:'user' messages, which can create consecutive
    // user messages when followed by a new user message. Merge them.
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

    // De-duplicate tool_result blocks with the same tool_use_id.
    // This can happen when the core layer generates tool results from both
    // the tool-result part and the tool-call part's output field.
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

  private async *processAnthropicStream(
    stream: AsyncIterable<Anthropic_SDK.Beta.BetaRawMessageStreamEvent>,
    options: TextOptions<AnthropicTextProviderOptions>,
    genId: () => string,
    logger: InternalLogger,
  ): AsyncIterable<StreamChunk> {
    const model = options.model
    let accumulatedContent = ''
    let accumulatedThinking = ''
    let accumulatedSignature = ''
    const toolCallsMap = new Map<
      number,
      { id: string; name: string; input: string; started: boolean }
    >()
    let currentToolIndex = -1
    // Server-side tools share the `input_json_delta` wire format with client
    // `tool_use` blocks; routing both to the same buffer corrupts client tool
    // input.
    let currentServerTool: { id: string; name: string; input: string } | null =
      null

    // AG-UI lifecycle tracking
    const runId = options.runId ?? genId()
    const threadId = options.threadId ?? genId()
    const messageId = genId()
    let stepId: string | null = null
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedRunFinished = false
    // Track current content block type for proper content_block_stop handling
    let currentBlockType: string | null = null

    try {
      for await (const event of stream) {
        logger.provider(`provider=anthropic type=${event.type}`, {
          chunk: event,
        })
        // Emit RUN_STARTED on first event
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            runId,
            threadId,
            model,
            timestamp: Date.now(),
            parentRunId: options.parentRunId,
          }
        }

        if (event.type === 'content_block_start') {
          currentBlockType = event.content_block.type
          if (event.content_block.type === 'tool_use') {
            currentToolIndex++
            toolCallsMap.set(currentToolIndex, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
              started: false,
            })
          } else if (event.content_block.type === 'server_tool_use') {
            currentServerTool = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            }
          } else if (
            event.content_block.type === 'web_fetch_tool_result' ||
            event.content_block.type === 'web_search_tool_result'
          ) {
            // The result content arrives in full at content_block_start (no
            // deltas). Surface error variants so a failed fetch/search isn't
            // invisible to the consumer.
            const content = event.content_block.content as
              | { type?: string; error_code?: string }
              | Array<unknown>
            const errorBlock =
              !Array.isArray(content) &&
              (content.type === 'web_fetch_tool_result_error' ||
                content.type === 'web_search_tool_result_error')
                ? content
                : null
            if (errorBlock) {
              logger.errors(
                `anthropic.${event.content_block.type} error_code=${errorBlock.error_code}`,
                {
                  toolUseId: event.content_block.tool_use_id,
                  blockType: event.content_block.type,
                  errorCode: errorBlock.error_code,
                  source: 'anthropic.processAnthropicStream',
                },
              )
            }
          } else if (event.content_block.type === 'thinking') {
            accumulatedThinking = ''
            accumulatedSignature = ''
            // Emit REASONING and STEP_STARTED for thinking
            stepId = genId()
            reasoningMessageId = genId()

            // Spec REASONING events
            yield {
              type: EventType.REASONING_START,
              messageId: reasoningMessageId,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: reasoningMessageId,
              role: 'reasoning' as const,
              model,
              timestamp: Date.now(),
            }

            // Legacy STEP events (kept during transition)
            yield {
              type: EventType.STEP_STARTED,
              stepName: stepId,
              stepId,
              model,
              timestamp: Date.now(),
              stepType: 'thinking',
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Close reasoning before text starts
            if (reasoningMessageId && !hasClosedReasoning) {
              hasClosedReasoning = true
              yield {
                type: EventType.REASONING_MESSAGE_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
              }
              yield {
                type: EventType.REASONING_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
              }
            }

            // Emit TEXT_MESSAGE_START on first text content
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId,
                model,
                timestamp: Date.now(),
                role: 'assistant',
              }
            }

            const delta = event.delta.text
            accumulatedContent += delta
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId,
              model,
              timestamp: Date.now(),
              delta,
              content: accumulatedContent,
            }
          } else if (
            event.delta.type === 'thinking_delta' &&
            reasoningMessageId
          ) {
            const delta = event.delta.thinking
            accumulatedThinking += delta

            // Spec REASONING content event
            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: reasoningMessageId,
              delta,
              model,
              timestamp: Date.now(),
            }

            // Legacy STEP event
            yield {
              type: EventType.STEP_FINISHED,
              stepName: stepId || genId(),
              stepId: stepId || genId(),
              model,
              timestamp: Date.now(),
              delta,
              content: accumulatedThinking,
            }
          } else if (
            (event.delta as { type: string }).type === 'signature_delta'
          ) {
            accumulatedSignature +=
              (event.delta as { signature: string }).signature || ''
          } else if (event.delta.type === 'input_json_delta') {
            // Route deltas by current block type so server_tool_use input
            // never appends onto the prior client tool's buffer.
            if (currentBlockType === 'tool_use') {
              const existing = toolCallsMap.get(currentToolIndex)
              if (existing) {
                // Emit TOOL_CALL_START on first args delta
                if (!existing.started) {
                  existing.started = true
                  yield {
                    type: EventType.TOOL_CALL_START,
                    toolCallId: existing.id,
                    toolCallName: existing.name,
                    toolName: existing.name,
                    parentMessageId: messageId,
                    model,
                    timestamp: Date.now(),
                    index: currentToolIndex,
                  }
                }

                existing.input += event.delta.partial_json

                yield {
                  type: EventType.TOOL_CALL_ARGS,
                  toolCallId: existing.id,
                  model,
                  timestamp: Date.now(),
                  delta: event.delta.partial_json,
                  args: existing.input,
                }
              }
            } else if (
              currentBlockType === 'server_tool_use' &&
              currentServerTool
            ) {
              // Accumulate server tool input internally. We don't emit
              // TOOL_CALL_* events: the call is executed by Anthropic, not
              // by our agent loop, so surfacing it as a client tool call
              // would cause downstream code to try (and fail) to run it.
              currentServerTool.input += event.delta.partial_json
            }
          }
        } else if (event.type === 'content_block_stop') {
          if (currentBlockType === 'thinking') {
            // Emit signature so it can be replayed in multi-turn context
            if (accumulatedSignature && stepId) {
              yield {
                type: EventType.STEP_FINISHED,
                stepName: stepId,
                stepId,
                model,
                timestamp: Date.now(),
                delta: '',
                content: accumulatedThinking,
                signature: accumulatedSignature,
              }
            }
          } else if (currentBlockType === 'tool_use') {
            const existing = toolCallsMap.get(currentToolIndex)
            if (existing) {
              // If tool call wasn't started yet (no args), start it now
              if (!existing.started) {
                existing.started = true
                yield {
                  type: EventType.TOOL_CALL_START,
                  toolCallId: existing.id,
                  toolCallName: existing.name,
                  toolName: existing.name,
                  parentMessageId: messageId,
                  model,
                  timestamp: Date.now(),
                  index: currentToolIndex,
                }
              }

              // Emit TOOL_CALL_END
              let parsedInput: unknown = {}
              try {
                const parsed = existing.input ? JSON.parse(existing.input) : {}
                parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
              } catch {
                parsedInput = {}
              }

              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: existing.id,
                toolCallName: existing.name,
                toolName: existing.name,
                model,
                timestamp: Date.now(),
                input: parsedInput,
              }

              // Reset so a new TEXT_MESSAGE_START is emitted if text follows tool calls
              hasEmittedTextMessageStart = false
            }
          } else if (currentBlockType === 'server_tool_use') {
            if (currentServerTool) {
              // Anthropic executes the call; we only need a breadcrumb so
              // consumers (devtools, telemetry) can see what ran.
              logger.provider(
                `provider=anthropic server_tool_use name=${currentServerTool.name}`,
                {
                  toolUseId: currentServerTool.id,
                  name: currentServerTool.name,
                  input: currentServerTool.input,
                },
              )
            }
            currentServerTool = null
          } else if (
            currentBlockType === 'web_fetch_tool_result' ||
            currentBlockType === 'web_search_tool_result'
          ) {
            // The model already consumed the result; error variants were
            // already surfaced at content_block_start.
          } else {
            // Emit TEXT_MESSAGE_END only for text blocks (not tool_use blocks)
            if (hasEmittedTextMessageStart && accumulatedContent) {
              yield {
                type: EventType.TEXT_MESSAGE_END,
                messageId,
                model,
                timestamp: Date.now(),
              }
            }
          }
          currentBlockType = null
        } else if (event.type === 'message_stop') {
          // Close reasoning events if still open
          if (reasoningMessageId && !hasClosedReasoning) {
            hasClosedReasoning = true
            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: reasoningMessageId,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_END,
              messageId: reasoningMessageId,
              model,
              timestamp: Date.now(),
            }
          }

          // Only emit RUN_FINISHED from message_stop if message_delta didn't already emit one.
          // message_delta carries the real stop_reason (tool_use, end_turn, etc.),
          // while message_stop is just a completion signal.
          if (!hasEmittedRunFinished) {
            yield {
              type: EventType.RUN_FINISHED,
              runId,
              threadId,
              model,
              timestamp: Date.now(),
              finishReason: 'stop',
            }
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            hasEmittedRunFinished = true

            // Close reasoning events if still open
            if (reasoningMessageId && !hasClosedReasoning) {
              hasClosedReasoning = true
              yield {
                type: EventType.REASONING_MESSAGE_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
              }
              yield {
                type: EventType.REASONING_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
              }
            }

            switch (event.delta.stop_reason) {
              case 'tool_use': {
                yield {
                  type: EventType.RUN_FINISHED,
                  runId,
                  threadId,
                  model,
                  timestamp: Date.now(),
                  finishReason: 'tool_calls',
                  usage: {
                    promptTokens: event.usage.input_tokens || 0,
                    completionTokens: event.usage.output_tokens || 0,
                    totalTokens:
                      (event.usage.input_tokens || 0) +
                      (event.usage.output_tokens || 0),
                  },
                }
                break
              }
              case 'max_tokens': {
                yield {
                  type: EventType.RUN_ERROR,
                  model,
                  timestamp: Date.now(),
                  message:
                    'The response was cut off because the maximum token limit was reached.',
                  code: 'max_tokens',
                  error: {
                    message:
                      'The response was cut off because the maximum token limit was reached.',
                    code: 'max_tokens',
                  },
                }
                break
              }
              case 'stop_sequence':
              case 'end_turn':
              case 'pause_turn':
              case 'refusal':
              case 'model_context_window_exceeded':
              case 'compaction':
              default: {
                // All remaining Anthropic stop_reason variants map to the
                // generic "stop" finish reason — they describe *why* the
                // stream ended, but for AG-UI consumers the resulting event
                // shape is identical.
                yield {
                  type: EventType.RUN_FINISHED,
                  runId,
                  threadId,
                  model,
                  timestamp: Date.now(),
                  finishReason: 'stop',
                  usage: {
                    promptTokens: event.usage.input_tokens || 0,
                    completionTokens: event.usage.output_tokens || 0,
                    totalTokens:
                      (event.usage.input_tokens || 0) +
                      (event.usage.output_tokens || 0),
                  },
                }
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { status?: number; code?: string }
      const rawEvent = toRunErrorRawEvent(error)

      logger.errors('anthropic.processAnthropicStream fatal', {
        error,
        source: 'anthropic.processAnthropicStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        model,
        timestamp: Date.now(),
        message: err.message || 'Unknown error occurred',
        code: err.code || String(err.status),
        // Forward the Anthropic SDK error's `.error` response body when present.
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code || String(err.status),
        },
      }
    }
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
