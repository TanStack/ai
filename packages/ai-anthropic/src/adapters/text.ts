import {
  EventType,
  fileReferenceFor,
  isFileSource,
  normalizeSystemPrompts,
} from '@tanstack/ai'
import {
  REDACTED_THINKING_ID_PREFIX,
  orderedAssistantBlocks,
  splitMidConversationChanges,
  toRunErrorRawEvent,
  transformMessagesForReplay,
  sanitizeUnicode,
  sanitizeJsonArguments,
} from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { getAnthropicProviderToolKind } from '../tools/anthropic-provider-tool'
import {
  readCodeExecutionConfig,
  readCodeExecutionSkills,
} from '../tools/code-execution-tool'
import { validateTextProviderOptions } from '../text/text-provider-options'
import {
  ANTHROPIC_DEFERRED_TOOL_PLACEHOLDER_NAME,
  applyAnthropicPromptCache,
} from '../prompt-cache'
import { anthropicThinking, isAnthropicEffort } from '../text/reasoning'
import type { AnthropicEffort } from '../text/reasoning'
import { ANTHROPIC_MODEL_REASONING } from '../model-reasoning'
import type { AnthropicModelReasoningByName } from '../model-reasoning'
import { buildAnthropicUsage } from '../usage'
import {
  createAnthropicClient,
  generateId,
  resolveAnthropicCredentials,
} from '../utils/client'
import {
  ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS,
  ANTHROPIC_MODEL_INPUT_MODALITIES,
  ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS,
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
  ServerToolUseBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  ToolUseBlockParam,
  WebFetchToolResultBlockParam,
  WebSearchToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages'
import type {
  BetaBase64ImageSource,
  BetaBase64PDFSource,
  BetaContentBlockParam,
  BetaFileDocumentSource,
  BetaFileImageSource,
  BetaImageBlockParam,
  BetaMessageParam,
  BetaRequestDocumentBlock,
  BetaTextBlockParam,
  BetaTool,
  BetaURLImageSource,
  BetaURLPDFSource,
} from '@anthropic-ai/sdk/resources/beta/messages'
import type Anthropic_SDK from '@anthropic-ai/sdk'
import type { AnthropicBeta } from '@anthropic-ai/sdk/resources/beta/beta'
import type {
  AnyTool,
  ConfigReasoning,
  ContentPart,
  MidConversationChannels,
  Modality,
  ModelMessage,
  ModelReasoning,
  AdapterYieldChunk,
  NormalizedSystemPrompt,
  ReasoningCapability,
  TextOptions,
  ToolCall,
  ToolChoice,
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
  if (typeof metadata !== 'object' || metadata === null) return null
  const outer = metadata as { providerExecuted?: unknown; anthropic?: unknown }
  if (outer.providerExecuted !== true) return null
  const inner = outer.anthropic
  if (typeof inner !== 'object' || inner === null) return null
  const { serverToolType, resultBlockType, result } = inner as {
    serverToolType?: unknown
    resultBlockType?: unknown
    result?: unknown
  }
  if (
    typeof serverToolType !== 'string' ||
    (resultBlockType !== 'web_search_tool_result' &&
      resultBlockType !== 'web_fetch_tool_result')
  ) {
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
 * True when any message carries a provider file-handle source, so the request
 * must send the Files API beta header.
 */
export function messagesHaveFileSource(messages: Array<ModelMessage>): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(
        (part) => 'source' in part && isFileSource(part.source),
      ),
  )
}

/**
 * Computes the `betas` array for a Messages request. Unions:
 * - `interleaved-thinking-2025-05-14` when interleaved thinking is enabled,
 * - `code-execution-2025-08-25` when a `code_execution` tool is present,
 * - `skills-2025-10-02` when that tool carries skills,
 * - `context-management-2025-06-27` when `context_management` is set,
 * - `files-api-2025-04-14` when a message references an uploaded file handle,
 * - `mid-conversation-tool-changes-2026-07-01` in mid-conversation tool mode,
 * - `mid-conversation-output-config-2026-07-01` and
 *   `thinking-binding-controls-2026-08-01` with mid-conversation effort
 *   (`thinking.block_binding`).
 * Returns `undefined` when none apply (so the call site omits `betas`).
 */
export function computeAnthropicBetas(
  tools: Array<AnyTool> | undefined,
  modelOptions:
    | {
        thinking?: {
          type?: 'enabled' | 'disabled' | 'adaptive'
          budget_tokens?: number
          block_binding?: unknown
        }
        context_management?: unknown | null
        mcp_servers?: ReadonlyArray<unknown>
      }
    | undefined,
  hasFileSource = false,
  midConversationToolChanges = false,
): Array<AnthropicBeta> | undefined {
  const betas = new Set<AnthropicBeta>()

  if (hasFileSource) betas.add('files-api-2025-04-14')
  if (midConversationToolChanges) {
    betas.add('mid-conversation-tool-changes-2026-07-01')
  }

  const useInterleavedThinking =
    modelOptions?.thinking?.type === 'enabled' &&
    typeof modelOptions.thinking.budget_tokens === 'number' &&
    modelOptions.thinking.budget_tokens > 0
  if (useInterleavedThinking) betas.add('interleaved-thinking-2025-05-14')
  if (modelOptions?.thinking?.block_binding) {
    betas.add('mid-conversation-output-config-2026-07-01')
    betas.add('thinking-binding-controls-2026-08-01')
  }

  // Context editing requires the beta header; the body field alone is not
  // enough (issue #1074). `null` is a typed "unset" — do not enable the beta.
  if (modelOptions?.context_management != null) {
    betas.add('context-management-2025-06-27')
  }

  // The MCP connector needs its beta header as well (same shape as #1074);
  // an empty array is a typed "unset" — do not enable the beta.
  // ponytail: 2025-04-04 matches the `mcp_servers` shape we type
  // (`tool_configuration` on each server). 2025-11-20 needs an `mcp_toolset`
  // in `tools` for every server, which this adapter does not send yet.
  if (modelOptions?.mcp_servers && modelOptions.mcp_servers.length > 0) {
    betas.add('mcp-client-2025-04-04')
  }

  // Code-execution beta is version-aware: select from the FIRST code_execution
  // tool's config type.
  const codeExecTool = tools?.find(
    (tool) => getAnthropicProviderToolKind(tool) === 'code_execution',
  )
  if (codeExecTool) {
    const cfgType = readCodeExecutionConfig(codeExecTool)?.type
    // Each code_execution tool version pairs with a specific beta. Known
    // legacy variant maps explicitly; current/future variants (e.g.
    // `code_execution_20250825` and later) use the latest `-08-25` beta.
    betas.add(
      cfgType === 'code_execution_20250522'
        ? 'code-execution-2025-05-22'
        : 'code-execution-2025-08-25',
    )
  }

  // Skills beta: scan ALL code_execution tools so this AGREES with the
  // container-lift, which lifts skills from any code_execution tool that
  // carries them (not just the first).
  const hasSkills = tools?.some(
    (tool) =>
      getAnthropicProviderToolKind(tool) === 'code_execution' &&
      (readCodeExecutionSkills(tool)?.length ?? 0) > 0,
  )
  if (hasSkills) betas.add('skills-2025-10-02')

  return betas.size > 0 ? Array.from(betas) : undefined
}

/**
 * The models that reject a forced tool (`any` or a named `tool`) on every
 * request, with or without thinking.
 * ponytail: a hand list, because the model sync script writes model-meta.ts.
 * Move it to a model-meta capability when that script can set one.
 */
const ANTHROPIC_NO_FORCED_TOOL_MODELS: ReadonlySet<string> = new Set<
  (typeof ANTHROPIC_MODELS)[number]
>(['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5'])

/**
 * Maps `chat({ toolChoice })` to the Messages `tool_choice`. When the
 * request cannot force a tool, a forced choice falls back to `auto`.
 */
function toAnthropicToolChoice(
  choice: ToolChoice,
  { canForceTool }: { canForceTool: boolean },
) {
  if (choice === 'none') return { type: 'none' as const }
  if (choice === 'auto' || !canForceTool) return { type: 'auto' as const }
  if (choice === 'required') return { type: 'any' as const }
  return { type: 'tool' as const, name: choice.name }
}

/**
 * The tool placeholder of mid-conversation tool mode, copied from pi 0.87.1.
 * Anthropic adds hidden scaffolding once any tool has `defer_loading`. This
 * deferred tool is in every tool-mode request, so that scaffolding stays in
 * the cached prefix. The model never sees it.
 */
const DEFERRED_TOOL_PLACEHOLDER: BetaTool = {
  name: ANTHROPIC_DEFERRED_TOOL_PLACEHOLDER_NAME,
  description: 'Reserved placeholder. Never available. Never call this.',
  input_schema: { type: 'object', properties: {}, required: [] },
  defer_loading: true,
}

/**
 * A mid-conversation `system` message. SDK 0.97.1 types only `user` and
 * `assistant` messages and has no `tool_addition` block, so this type is local.
 */
interface AnthropicMidConversationSystemMessage {
  role: 'system'
  content: Array<
    | TextBlockParam
    | { type: 'tool_addition'; tool: { type: 'tool_reference'; name: string } }
  >
}

/** pi's effort message: a `system` message with no content that sets the effort. */
function effortMessage(effort: AnthropicEffort): BetaMessageParam {
  const message = { role: 'system', content: [], output_config: { effort } }
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- SDK 0.97.1 types no `system` message in `messages`; the models with mid-conversation effort accept one (pi 0.87.1).
  return message as unknown as BetaMessageParam
}

/**
 * Configuration for Anthropic text adapter
 */
export interface AnthropicTextConfig extends AnthropicClientConfig {
  /** Add the Claude Code identity and OAuth headers. */
  oauth?: boolean
  /** Replay ordinary thinking without a signature. The default is false. */
  allowEmptySignature?: boolean
  /** Identify a gateway separately from the direct Anthropic API. */
  provider?: string
  /**
   * The model's reasoning data, for example `modelReasoning(record)` from a
   * `@tanstack/ai-models` record. It wins over the adapter's own table, for
   * the thinking fields and for the levels `chat({ reasoning })` takes.
   * `false`: the model does not reason, so no thinking field goes out.
   */
  reasoning?: ModelReasoning
  /**
   * The mid-conversation channels (the
   * `mid-conversation-tool-changes-2026-07-01` beta and mid-conversation
   * `system` messages) of the models in
   * `ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS`. When absent, they are on
   * only for Anthropic's own API: a `baseURL`, a `fetch`, an injected
   * `client`, or the SDK's `ANTHROPIC_BASE_URL` env var turns the default off. `true` turns them on anyway, for a
   * gateway that passes the changes. `false` turns them off, so every
   * request is built as before. An object turns on only the channels it
   * names, for a gateway that passes one of them:
   * `{ systemPrompts: true }` sends a system prompt change in place and a
   * tool change as the full tool list.
   */
  midConversationChannels?: boolean | Partial<MidConversationChannels>
}

export type AnthropicTextAdapterConfig =
  | AnthropicTextConfig
  | {
      client: AnthropicMessagesClient
      /** See {@link AnthropicTextConfig.midConversationChannels}. */
      midConversationChannels?: AnthropicTextConfig['midConversationChannels']
      oauth?: boolean
      allowEmptySignature?: boolean
      provider?: string
      /** See {@link AnthropicTextConfig.reasoning}. */
      reasoning?: ModelReasoning
    }

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

/** The reasoning levels of a model, for `chat({ reasoning })`. `never`: none. */
type ResolveReasoning<TModel extends string> =
  TModel extends keyof AnthropicModelReasoningByName
    ? AnthropicModelReasoningByName[TModel]
    : never

/**
 * A model id: a known Anthropic model, or any other id, for example a
 * gateway or catalog id such as `anthropic/claude-sonnet-4.6`.
 */
export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number] | (string & {})

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
  TModel extends AnthropicModelId,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
  TReasoning extends ReasoningCapability = ResolveReasoning<TModel>,
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
  AnthropicSystemPromptMetadata,
  TReasoning
> {
  override readonly kind = 'text' as const
  readonly name = 'anthropic' as const
  override readonly api = 'anthropic-messages'
  override readonly provider: string
  // Consumes `file_id` sources issued by anthropicFiles() (Files API beta).
  override readonly supportsFileSources = true
  override readonly inputModalities =
    ANTHROPIC_MODEL_INPUT_MODALITIES[this.model]
  /** Set from `ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS` in the constructor. */
  override readonly midConversationChannels:
    | MidConversationChannels
    | undefined = undefined

  private readonly client: SdkAnthropicMessagesClient
  /** `config.reasoning`, which wins over `ANTHROPIC_MODEL_REASONING`. */
  private readonly modelReasoning: ModelReasoning | undefined
  private readonly oauth: boolean
  private readonly allowEmptySignature: boolean
  private readonly tokenAuthentication: boolean
  private readonly oauthHeaders = new Headers({
    'user-agent': 'claude-cli/2.1.280',
    'x-app': 'cli',
  })

  constructor(config: AnthropicTextAdapterConfig, model: TModel) {
    super({}, model)
    this.provider = config.provider ?? this.name
    this.modelReasoning =
      config.reasoning ?? ANTHROPIC_MODEL_REASONING[this.model]
    const credentials =
      'client' in config
        ? undefined
        : resolveAnthropicCredentials(config, config.oauth)
    this.oauth = config.oauth ?? credentials?.oauth ?? false
    this.tokenAuthentication = Boolean(credentials?.authToken) || this.oauth
    if (!('client' in config)) {
      for (const [name, value] of Object.entries(config.defaultHeaders ?? {})) {
        if (
          value != null &&
          (name.toLowerCase() === 'x-app' ||
            name.toLowerCase() === 'user-agent' ||
            name.toLowerCase() === 'anthropic-beta')
        )
          this.oauthHeaders.set(name, value)
      }
    }
    this.allowEmptySignature = config.allowEmptySignature ?? false
    this.client =
      'client' in config
        ? asSdkAnthropicMessagesClient(config.client)
        : createAnthropicClient(
            {
              ...config,
              ...(this.oauth && {
                defaultHeaders: {
                  'user-agent': 'claude-cli/2.1.280',
                  'x-app': 'cli',
                  ...config.defaultHeaders,
                },
              }),
            },
            this.oauth,
          )
    // On by default only on Anthropic's own API: a proxy, a gateway, Vertex,
    // or Bedrock (a `baseURL`, a `fetch`, an injected client, or the SDK's
    // ANTHROPIC_BASE_URL env var) may not pass the changes. The option wins.
    const envBaseURL =
      typeof process !== 'undefined' && Boolean(process.env.ANTHROPIC_BASE_URL)
    const customEndpoint =
      'client' in config ||
      Boolean(config.baseURL || config.fetch) ||
      envBaseURL
    const table = ANTHROPIC_MODEL_MID_CONVERSATION_CHANNELS[model]
    const option = config.midConversationChannels
    if (typeof option === 'object') {
      if (table)
        this.midConversationChannels = {
          tools: table.tools && option.tools === true,
          systemPrompts: table.systemPrompts && option.systemPrompts === true,
        }
    } else if (option ?? !customEndpoint) {
      this.midConversationChannels = table
    }
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
      // The request, not modelOptions: `reasoning` can turn budget
      // thinking (and so the interleaved-thinking beta) on.
      const betas = computeAnthropicBetas(
        options.tools,
        requestParams,
        messagesHaveFileSource(options.messages),
        // Mid-conversation tool mode puts the deferred placeholder in `tools`.
        requestParams.tools?.some(
          (tool) => tool.name === DEFERRED_TOOL_PLACEHOLDER.name,
        ),
      )
      const requestBetas = this.oauth
        ? [
            ...new Set<AnthropicBeta>([
              'claude-code-20250219',
              'oauth-2025-04-20',
              ...(betas ?? []),
            ]),
          ]
        : betas

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
          ...(requestBetas && { betas: requestBetas }),
        },
        {
          signal: options.request?.signal,
          headers: this.requestHeaders(options.request?.headers, requestBetas),
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
        metadata: {
          tanstack: {
            source: {
              provider: this.provider,
              api: this.api,
              model: options.model,
            },
          },
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

    // `structuredOutput()` issues a non-streaming `messages.create({ stream:
    // false })` below, so the defaulted `max_tokens` must stay under the SDK's
    // non-streaming 10-minute guard (issue #849) — pass `stream: false`.
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
        requestParams,
        messagesHaveFileSource(chatOptions.messages),
      )
      const requestBetas = this.oauth
        ? [
            ...new Set<AnthropicBeta>([
              'claude-code-20250219',
              'oauth-2025-04-20',
              ...(betas ?? []),
            ]),
          ]
        : betas
      // Make non-streaming request with tool_choice forced to our structured output tool
      const response = await this.client.beta.messages.create(
        {
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          tool_choice: { type: 'tool', name: 'structured_output' },
          ...(requestBetas && { betas: requestBetas }),
        },
        {
          signal: chatOptions.request?.signal,
          headers: this.requestHeaders(
            chatOptions.request?.headers,
            requestBetas,
          ),
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
        usage: buildAnthropicUsage(response.usage),
        responseId: response.id,
        model: response.model,
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

  private requestHeaders(
    headers: HeadersInit | undefined,
    betas: Array<AnthropicBeta> | undefined,
  ) {
    if (!this.tokenAuthentication) return headers
    const requestHeaders = new Headers(
      this.oauth ? this.oauthHeaders : undefined,
    )
    new Headers(headers).forEach((value, name) =>
      requestHeaders.set(name, value),
    )
    if (this.oauth) {
      const configured = (requestHeaders.get('anthropic-beta') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      requestHeaders.set(
        'anthropic-beta',
        [...new Set([...(betas ?? []), ...configured])].join(','),
      )
    }
    return { ...Object.fromEntries(requestHeaders), 'x-api-key': null }
  }

  private mapCommonOptionsToAnthropic(
    options: TextOptions<AnthropicTextProviderOptions>,
    { stream = true }: { stream?: boolean } = {},
  ) {
    const modelOptions = options.modelOptions

    const replay = transformMessagesForReplay(
      options.messages,
      {
        provider: this.provider,
        api: this.api,
        model: options.model,
      },
      (id, { attempt }) => {
        const clean = id.replace(/[^a-zA-Z0-9_-]/g, '_')
        const suffix = attempt === 0 ? '' : `_${attempt}`
        return clean.slice(0, 64 - suffix.length) + suffix
      },
    )
    const originalChanges = options.midConversationChanges?.changes ?? []
    const mappedChanges = originalChanges.map((change) => ({
      ...change,
      before: replay.boundaryMap[change.before] ?? change.before,
    }))
    const grouped = new Map<number, (typeof mappedChanges)[number]>()
    for (const change of mappedChanges) {
      const previous = grouped.get(change.before)
      grouped.set(
        change.before,
        previous
          ? {
              before: change.before,
              ...(previous.tools || change.tools
                ? {
                    tools: [...(previous.tools ?? []), ...(change.tools ?? [])],
                  }
                : {}),
              ...(previous.systemPrompts !== undefined ||
              change.systemPrompts !== undefined
                ? {
                    systemPrompts:
                      (previous.systemPrompts ?? 0) +
                      (change.systemPrompts ?? 0),
                  }
                : {}),
            }
          : change,
      )
    }
    const uniqueOriginalBoundaries =
      new Set(originalChanges.map((change) => change.before)).size ===
      originalChanges.length
    options = {
      ...options,
      messages: replay.messages,
      ...(options.midConversationChanges && {
        midConversationChanges: {
          ...options.midConversationChanges,
          changes: uniqueOriginalBoundaries
            ? [...grouped.values()]
            : mappedChanges,
        },
      }),
    }
    const mid = this.midConversationRequest(options)
    // `chat({ reasoning })`, as this model's thinking fields.
    const {
      output_config: reasoningOutputConfig,
      messageEffort,
      ...thinkingFields
    } = anthropicThinking(this.model, options.reasoning, this.modelReasoning)
    const formattedMessages = this.formatMessages(
      options.messages,
      mid?.systemMessages,
      messageEffort,
    )
    const tools = options.tools
      ? (mid?.tools ?? convertToolsToProviderFormat(options.tools))
      : undefined

    const validProviderOptions: Partial<InternalTextProviderOptions> = {}
    if (modelOptions) {
      const validKeys: Array<keyof AnthropicTextProviderOptions> = [
        'cache_control',
        'container',
        'context_management',
        'mcp_servers',
        'service_tier',
        'stop_sequences',
        'tool_choice',
        'top_k',
        'temperature',
        'top_p',
      ]
      // `max_tokens` is a legitimate public modelOptions field, but it is read
      // via a dedicated path (defaultMaxTokens below) rather than copied into
      // validProviderOptions. Exempt it from the dropped-key warning here so a
      // correct `modelOptions: { max_tokens }` call doesn't log a spurious
      // "dropped unknown key" error, while keeping it out of the copy loop.
      const droppedKeyExemptSet = new Set<string>([...validKeys, 'max_tokens'])
      const droppedKeys = Object.keys(modelOptions).filter(
        (key) => !droppedKeyExemptSet.has(key),
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

    // pi sends no `temperature` with mid-conversation effort.
    if (messageEffort !== undefined) delete validProviderOptions.temperature
    const thinkingBudget =
      thinkingFields.thinking?.type === 'enabled'
        ? thinkingFields.thinking.budget_tokens
        : undefined
    // Anthropic's Messages API *requires* `max_tokens`, so we must always send a
    // value. When the caller doesn't specify one, default to the resolved
    // model's real output ceiling (from model-meta) rather than a low constant
    // that silently truncates long responses with `stop_reason: "max_tokens"`
    // (issue #849). `max_tokens` is a ceiling, not a reservation — billing is on
    // tokens actually generated, so a higher default costs nothing extra.
    // For non-streaming requests (the `structuredOutput()` path) the default is
    // clamped to the SDK's non-streaming-safe limit so it doesn't trip the
    // "streaming required" 10-minute guard — see getAnthropicDefaultMaxTokens.
    const defaultMaxTokens =
      modelOptions?.max_tokens ??
      getAnthropicDefaultMaxTokens(this.model, { stream })
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1
        : defaultMaxTokens

    // `InternalTextProviderOptions.system` is typed
    // `string | Array<TextBlockParam>` (no `| undefined`), so build it
    // outside the literal and spread it conditionally rather than
    // assigning `undefined` under exactOptionalPropertyTypes.
    const systemBlocks = ((): Array<TextBlockParam> | undefined => {
      // With a prompt channel, `system` holds only the start prompts. They
      // keep their own `cache_control` metadata.
      const normalized =
        mid?.systemPrompts ??
        normalizeSystemPrompts<AnthropicSystemPromptMetadata>(
          options.systemPrompts,
        )
      if (normalized.length === 0 && !this.oauth) return undefined
      const blocks = normalized.map(
        (p): TextBlockParam => ({
          type: 'text',
          text: sanitizeUnicode(p.content),
          ...(p.metadata?.cache_control && {
            cache_control: p.metadata.cache_control,
          }),
        }),
      )
      return this.oauth
        ? [
            {
              type: 'text',
              text: "You are Claude Code, Anthropic's official CLI for Claude.",
            },
            ...blocks,
          ]
        : blocks
    })()
    // Wire engine-threaded outputSchema into Messages `output_config.format`
    // alongside any `tools` so the model emits tool calls during the agent
    // loop and a single schema-constrained JSON message on its final turn.
    // Merge into any existing `output_config` so callers can keep tuning
    // `output_config.effort` alongside the schema.
    const combinedSchema = options.outputSchema as
      | Record<string, unknown>
      | undefined
    const outputConfig =
      combinedSchema || reasoningOutputConfig
        ? {
            output_config: {
              ...reasoningOutputConfig,
              ...(combinedSchema
                ? {
                    format: {
                      type: 'json_schema' as const,
                      schema: combinedSchema,
                    },
                  }
                : {}),
            },
          }
        : undefined

    // Lift skills attached to a `code_execution` tool into the top-level
    // `container.skills` request param (Anthropic's required shape). Preserve any
    // `container.id` supplied via modelOptions for container reuse. This is the
    // canonical path for skills; `modelOptions.container.skills` is deprecated.
    const toolSkills = options.tools
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

    // `temperature`/`top_p` arrive via `...validProviderOptions` (sourced from
    // `modelOptions`). `InternalTextProviderOptions` declares `system` and
    // `tools` as `T?: ...` (no `| undefined`), so spread them conditionally
    // rather than passing explicit `undefined` under exactOptionalPropertyTypes.
    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      messages: formattedMessages,
      ...(systemBlocks !== undefined && { system: systemBlocks }),
      ...(tools !== undefined && { tools }),
      ...validProviderOptions,
      ...thinkingFields,
      ...(outputConfig ?? {}),
    }
    validateTextProviderOptions(requestParams)

    // `chat({ toolChoice })` is sent only when the request has tools. It goes
    // before the request spread, so a `tool_choice` in modelOptions wins. It
    // is not in `requestParams`, because that type has no `none` choice.
    // The API rejects a forced tool while thinking is on, and some models
    // reject it on every request.
    const isThinking =
      thinkingFields.thinking !== undefined &&
      thinkingFields.thinking.type !== 'disabled'
    const canForceTool =
      !isThinking && !ANTHROPIC_NO_FORCED_TOOL_MODELS.has(this.model)
    const toolChoiceField =
      tools?.length && options.toolChoice !== undefined
        ? {
            tool_choice: toAnthropicToolChoice(options.toolChoice, {
              canForceTool,
            }),
          }
        : undefined
    return {
      ...toolChoiceField,
      // Last step: the merged messages decide which message is last.
      ...applyAnthropicPromptCache(requestParams, options.promptCache),
    }
  }

  /**
   * Mid-conversation changes: the start prompts for `system`, the tool-mode
   * `tools`, and a `system` message for each change by message index.
   * Undefined when the request stays as today: the adapter has no channels,
   * the engine passed no changes, or the changes do not fit the current lists.
   */
  private midConversationRequest(
    options: TextOptions<AnthropicTextProviderOptions>,
  ):
    | {
        systemPrompts?: Array<
          NormalizedSystemPrompt<AnthropicSystemPromptMetadata>
        >
        tools?: InternalTextProviderOptions['tools']
        systemMessages: Map<number, BetaMessageParam>
      }
    | undefined {
    const channels = this.midConversationChannels
    if (!channels || !options.midConversationChanges) return undefined
    const split = splitMidConversationChanges({
      changes: options.midConversationChanges,
      tools: options.tools ?? [],
      systemPrompts: normalizeSystemPrompts<AnthropicSystemPromptMetadata>(
        options.systemPrompts,
      ),
    })
    if (!split) return undefined
    // Tool mode needs a start tool (Anthropic rejects a list where every
    // tool is deferred), and a provider tool cannot be deferred by name.
    const toolMode =
      channels.tools &&
      split.startTools.length > 0 &&
      ![...split.startTools, ...split.addedTools].some(
        (tool) => getAnthropicProviderToolKind(tool) !== undefined,
      )
    const systemMessages = new Map<number, BetaMessageParam>()
    for (const [before, change] of split.at) {
      const content: AnthropicMidConversationSystemMessage['content'] = [
        ...(channels.systemPrompts
          ? change.systemPrompts.map(
              (p): TextBlockParam => ({
                type: 'text',
                text: sanitizeUnicode(p.content),
              }),
            )
          : []),
        ...(toolMode
          ? change.tools.map((tool) => ({
              type: 'tool_addition' as const,
              tool: { type: 'tool_reference' as const, name: tool.name },
            }))
          : []),
      ]
      if (content.length === 0) continue
      const message: AnthropicMidConversationSystemMessage = {
        role: 'system',
        content,
      }
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- SDK 0.97.1 types no `system` message in `messages`; the models in the channel map accept one (pi 0.87.1).
      systemMessages.set(before, message as unknown as BetaMessageParam)
    }
    return {
      ...(channels.systemPrompts && {
        systemPrompts: split.startSystemPrompts,
      }),
      ...(toolMode && {
        tools: [
          ...convertToolsToProviderFormat(split.startTools),
          DEFERRED_TOOL_PLACEHOLDER,
          ...convertToolsToProviderFormat(split.addedTools).map((tool) => ({
            ...tool,
            defer_loading: true,
          })),
        ],
      }),
      systemMessages,
    }
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
  ): BetaTextBlockParam | BetaImageBlockParam | BetaRequestDocumentBlock {
    switch (part.type) {
      case 'text': {
        const metadata = part.metadata as AnthropicTextMetadata | undefined
        return {
          type: 'text',
          text: sanitizeUnicode(part.content),
          ...metadata,
        }
      }

      case 'image': {
        const metadata = part.metadata as AnthropicImageMetadata | undefined
        let imageSource:
          | BetaBase64ImageSource
          | BetaURLImageSource
          | BetaFileImageSource
        if (isFileSource(part.source)) {
          imageSource = {
            type: 'file',
            file_id: fileReferenceFor(part.source, this.name),
          }
        } else if (part.source.type === 'data') {
          imageSource = {
            type: 'base64',
            data: part.source.value,
            media_type: part.source.mimeType as
              | 'image/jpeg'
              | 'image/png'
              | 'image/gif'
              | 'image/webp',
          }
        } else {
          imageSource = {
            type: 'url',
            url: part.source.value,
          }
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
        let docSource:
          | BetaBase64PDFSource
          | BetaURLPDFSource
          | BetaFileDocumentSource
        if (isFileSource(part.source)) {
          docSource = {
            type: 'file',
            file_id: fileReferenceFor(part.source, this.name),
          }
        } else if (part.source.type === 'data') {
          docSource = {
            type: 'base64',
            data: part.source.value,
            media_type: part.source.mimeType as 'application/pdf',
          }
        } else {
          docSource = {
            type: 'url',
            url: part.source.value,
          }
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

  private formatMessages(
    messages: Array<ModelMessage>,
    /** Mid-conversation `system` messages by message index (`before`). */
    systemMessages?: ReadonlyMap<number, BetaMessageParam>,
    /**
     * Mid-conversation effort: this turn's effort. Each earlier assistant
     * message of this provider gets its own effort message before it, and
     * this one goes at the end (pi's `insertThinkingLevelMessages`).
     */
    messageEffort?: AnthropicEffort,
  ): InternalTextProviderOptions['messages'] {
    const formattedMessages: InternalTextProviderOptions['messages'] = []
    // A system message waits for the next assistant message (or the end),
    // so a `tool_result` still follows its `tool_use` directly.
    const pendingSystemMessages: InternalTextProviderOptions['messages'] = []

    for (const [index, message] of messages.entries()) {
      const role = message.role
      const systemMessage = systemMessages?.get(index)
      if (systemMessage) pendingSystemMessages.push(systemMessage)
      if (role === 'assistant') {
        formattedMessages.push(...pendingSystemMessages.splice(0))
        const stored = messageEffort && this.storedEffort(message)
        if (stored) formattedMessages.push(effortMessage(stored))
      }

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
                  ? sanitizeUnicode(toolContent)
                  : '',
              ...(message.error !== undefined && { is_error: true }),
            },
          ],
        })
        continue
      }

      // A valid block order map: send the blocks in the order the model
      // sent them. Unsigned thinking is still skipped at its place.
      const ordered =
        role === 'assistant' ? orderedAssistantBlocks(message) : undefined
      if (ordered) {
        const contentBlocks: Array<BetaContentBlockParam> = []
        for (const block of ordered) {
          if (block.type === 'thinking') {
            this.appendThinkingBlocks(contentBlocks, [block.thinking])
          } else if (block.type === 'tool-call') {
            this.appendToolCallBlocks(contentBlocks, block.toolCall)
          } else {
            contentBlocks.push({
              type: 'text',
              text: sanitizeUnicode(block.text),
            })
          }
        }
        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : '',
        })
        continue
      }

      if (role === 'assistant' && message.toolCalls?.length) {
        const contentBlocks: Array<BetaContentBlockParam> = []

        this.appendThinkingBlocks(contentBlocks, message.thinking)

        if (message.content) {
          const content =
            typeof message.content === 'string' ? message.content : ''
          const textBlock: TextBlockParam = {
            type: 'text',
            text: sanitizeUnicode(content),
          }
          contentBlocks.push(textBlock)
        }

        for (const toolCall of message.toolCalls) {
          this.appendToolCallBlocks(contentBlocks, toolCall)
        }

        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks,
        })

        continue
      }

      if (role === 'assistant') {
        const contentBlocks: Array<BetaContentBlockParam> = []
        this.appendThinkingBlocks(contentBlocks, message.thinking)

        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            contentBlocks.push(this.convertContentPartToAnthropic(part))
          }
        } else if (message.content) {
          contentBlocks.push({
            type: 'text',
            text: sanitizeUnicode(message.content),
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
            ? sanitizeUnicode(message.content)
            : message.content
              ? message.content.map((c) =>
                  this.convertContentPartToAnthropic(c),
                )
              : '',
      })
    }

    // A change with `before === messages.length` goes at the end.
    const endSystemMessage = systemMessages?.get(messages.length)
    if (endSystemMessage) pendingSystemMessages.push(endSystemMessage)
    formattedMessages.push(...pendingSystemMessages)

    // Post-process: Anthropic requires strictly alternating user/assistant roles.
    // Tool results are sent as role:'user' messages, which can create consecutive
    // user messages when followed by a new user message. Merge them.
    const merged = this.mergeConsecutiveSameRoleMessages(formattedMessages)
    return messageEffort ? [...merged, effortMessage(messageEffort)] : merged
  }

  /** The effort an assistant message of this provider was made with. */
  private storedEffort(message: ModelMessage): AnthropicEffort | undefined {
    const tanstack = message.metadata?.tanstack
    const effort = tanstack?.reasoningEffort
    return tanstack?.source?.provider === this.provider &&
      tanstack.source.api === this.api &&
      isAnthropicEffort(effort)
      ? effort
      : undefined
  }

  private appendThinkingBlocks(
    contentBlocks: Array<BetaContentBlockParam>,
    thinkingParts: ModelMessage['thinking'],
  ): void {
    if (!thinkingParts?.length) return

    for (const thinking of thinkingParts) {
      if (
        !thinking.signature &&
        (thinking.redacted || !this.allowEmptySignature)
      )
        continue
      if (thinking.redacted) {
        if (!thinking.signature) continue
        contentBlocks.push({
          type: 'redacted_thinking',
          data: thinking.signature,
        })
        continue
      }
      const block: ThinkingBlockParam = {
        type: 'thinking',
        thinking: sanitizeUnicode(thinking.content),
        signature: thinking.signature ?? '',
      }
      contentBlocks.push(block)
    }
  }

  /** A tool call as a `tool_use` block, or a server tool as its two blocks. */
  private appendToolCallBlocks(
    contentBlocks: Array<BetaContentBlockParam>,
    toolCall: ToolCall,
  ): void {
    let parsedInput: unknown = {}
    try {
      const parsed = toolCall.function.arguments
        ? JSON.parse(sanitizeJsonArguments(toolCall.function.arguments))
        : {}
      parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      // Anthropic needs an object input. Truncated or invalid JSON replays as {}.
      parsedInput = {}
    }

    // Provider-executed server tools (e.g. web_search) replay as the
    // original `server_tool_use` + result blocks so the model still sees
    // the prior evidence. Their result was captured verbatim during
    // streaming (see processAnthropicStream).
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
      return
    }

    const toolUseBlock: ToolUseBlockParam = {
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.function.name,
      input: parsedInput,
    }
    contentBlocks.push(toolUseBlock)
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
      // An effort message stays a message of its own.
      if (
        prev &&
        prev.role === msg.role &&
        !('output_config' in prev) &&
        !('output_config' in msg)
      ) {
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

    // Anthropic rejects a request that ends in a thinking-only assistant
    // message ("The final block in an assistant message cannot be `thinking`").
    // An interrupt can pause a turn that has thinking but no text. Drop it so
    // the request ends in the user message and the model answers again.
    const last = merged.at(-1)
    if (
      last?.role === 'assistant' &&
      Array.isArray(last.content) &&
      last.content.every(
        (block) =>
          block.type === 'thinking' || block.type === 'redacted_thinking',
      )
    ) {
      merged.pop()
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
  ): AsyncIterable<AdapterYieldChunk> {
    let model = options.model
    let responseId: string | undefined
    const source = {
      provider: this.provider,
      api: this.api,
      model: options.model,
    }
    // Mid-conversation effort: the message keeps its effort for the next turn.
    const { messageEffort } = anthropicThinking(
      this.model,
      options.reasoning,
      this.modelReasoning,
    )
    const effortMetadata = messageEffort
      ? { metadata: { tanstack: { reasoningEffort: messageEffort } } }
      : {}
    let accumulatedContent = ''
    let accumulatedThinking = ''
    let accumulatedSignature = ''
    const toolCallsMap = new Map<
      number,
      {
        id: string
        name: string
        input: string
        started: boolean
        hasInputDelta: boolean
      }
    >()
    let currentToolIndex = -1
    // Server-side tools share the `input_json_delta` wire format with client
    // `tool_use` blocks; routing both to the same buffer corrupts client tool
    // input.
    let currentServerTool: { id: string; name: string; input: string } | null =
      null
    // Completed server tools awaiting their matching result block. Anthropic
    // emits `server_tool_use` then a separate `*_tool_result` block; we hold
    // the call here (keyed by id) until the result arrives so we can emit a
    // single provider-executed tool call carrying the raw result for round-trip.
    const completedServerTools = new Map<
      string,
      { id: string; name: string; input: string }
    >()

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
    // Input and cache counts from message_start, for a closing message_delta
    // that leaves them out.
    let messageStartUsage: Anthropic_SDK.Beta.BetaUsage | undefined

    try {
      for await (const event of stream) {
        if (event.type === 'message_start') {
          responseId = event.message.id
          model = event.message.model
        }
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
            metadata: { tanstack: { source } },
          }
        }

        if (event.type === 'message_start') {
          messageStartUsage = event.message.usage
        } else if (event.type === 'content_block_start') {
          currentBlockType = event.content_block.type
          if (event.content_block.type === 'tool_use') {
            currentToolIndex++
            toolCallsMap.set(currentToolIndex, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: JSON.stringify(event.content_block.input) ?? '',
              started: false,
              hasInputDelta: false,
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

            // Emit the server tool as a single provider-executed tool call,
            // carrying its raw result so the evidence (e.g. web_search sources)
            // round-trips into the next turn's request. The agent loop skips
            // provider-executed calls, so this never triggers client execution.
            const serverTool = completedServerTools.get(
              event.content_block.tool_use_id,
            )
            if (serverTool) {
              completedServerTools.delete(serverTool.id)

              let parsedInput: unknown = {}
              try {
                const parsed = serverTool.input
                  ? JSON.parse(serverTool.input)
                  : {}
                parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
              } catch {
                parsedInput = {}
              }

              const serverToolMetadata = {
                providerExecuted: true,
                anthropic: {
                  serverToolType: serverTool.name,
                  resultBlockType: event.content_block.type,
                  result: content,
                },
              }

              currentToolIndex++
              yield {
                type: EventType.TOOL_CALL_START,
                toolCallId: serverTool.id,
                toolCallName: serverTool.name,
                toolName: serverTool.name,
                parentMessageId: messageId,
                model,
                timestamp: Date.now(),
                index: currentToolIndex,
                metadata: serverToolMetadata,
              }
              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: serverTool.id,
                toolCallName: serverTool.name,
                toolName: serverTool.name,
                model,
                timestamp: Date.now(),
                input: parsedInput,
              }

              // Text after the server tool starts a fresh message segment.
              hasEmittedTextMessageStart = false
            }
          } else if (event.content_block.type === 'thinking') {
            accumulatedThinking = ''
            accumulatedSignature = ''
            hasClosedReasoning = false
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
          } else if (event.content_block.type === 'redacted_thinking') {
            // Encrypted thinking: no text, and its data must go back to
            // Anthropic unchanged. It gets its own reasoning message, and the
            // encrypted value names that message. The id prefix marks the
            // data as a redacted block, not a signature. The step reuses the
            // id so the stream processor sees the prefix too.
            const redactedId = `${REDACTED_THINKING_ID_PREFIX}${genId()}`
            yield {
              type: EventType.REASONING_START,
              messageId: redactedId,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_MESSAGE_START,
              messageId: redactedId,
              role: 'reasoning' as const,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.STEP_STARTED,
              stepName: redactedId,
              stepId: redactedId,
              model,
              timestamp: Date.now(),
              stepType: 'thinking',
            }
            yield {
              type: EventType.STEP_FINISHED,
              stepName: redactedId,
              stepId: redactedId,
              model,
              timestamp: Date.now(),
              delta: '',
              content: '',
            }
            yield {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: 'message' as const,
              entityId: redactedId,
              encryptedValue: event.content_block.data,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_MESSAGE_END,
              messageId: redactedId,
              model,
              timestamp: Date.now(),
            }
            yield {
              type: EventType.REASONING_END,
              messageId: redactedId,
              model,
              timestamp: Date.now(),
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

                if (!existing.hasInputDelta) {
                  existing.input = ''
                  existing.hasInputDelta = true
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
            // Emit signature so it can be replayed in multi-turn context.
            // It belongs to the reasoning message, not the step, so an AG-UI
            // client finds that message by `entityId`.
            if (accumulatedSignature && stepId && reasoningMessageId) {
              yield {
                type: EventType.STEP_FINISHED,
                stepName: stepId,
                stepId,
                model,
                timestamp: Date.now(),
                delta: '',
                content: accumulatedThinking,
              }
              yield {
                type: EventType.REASONING_ENCRYPTED_VALUE,
                subtype: 'message' as const,
                entityId: reasoningMessageId,
                encryptedValue: accumulatedSignature,
                model,
                timestamp: Date.now(),
              }
            }
            // End this block's reasoning message here, so the next thinking
            // block gets its own end events.
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
              let parsedInput: unknown
              try {
                parsedInput = JSON.parse(existing.input)
              } catch {
                // Keep invalid JSON so validation can reject the call.
              }

              yield {
                type: EventType.TOOL_CALL_END,
                toolCallId: existing.id,
                toolCallName: existing.name,
                toolName: existing.name,
                model,
                timestamp: Date.now(),
                args: existing.input,
                ...(parsedInput === undefined ? {} : { input: parsedInput }),
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
              // Hold the call until its result block arrives so we can emit
              // both together as one provider-executed tool call.
              completedServerTools.set(currentServerTool.id, currentServerTool)
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
              ...(responseId !== undefined && { responseId }),
              ...effortMetadata,
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
            const usage = buildAnthropicUsage(event.usage, messageStartUsage)

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
                  ...(responseId !== undefined && { responseId }),
                  ...effortMetadata,
                  runId,
                  threadId,
                  model,
                  timestamp: Date.now(),
                  finishReason: 'tool_calls',
                  usage,
                }
                break
              }
              case 'max_tokens': {
                // Surface a warning when the truncating cap was the
                // adapter-supplied default (caller didn't pass `max_tokens`), so
                // the truncation isn't silently attributed to the model "doing
                // nothing" (issue #849). When the caller set `max_tokens`
                // themselves, hitting it is their own deliberate ceiling.
                if (options.modelOptions?.max_tokens == null) {
                  const defaultedMaxTokens = getAnthropicDefaultMaxTokens(model)
                  logger.warn(
                    `anthropic response truncated at the default max_tokens (${defaultedMaxTokens}) for model=${model}; pass maxTokens (or modelOptions.max_tokens) to raise the output ceiling`,
                    {
                      source: 'anthropic.processAnthropicStream',
                      model,
                      defaultedMaxTokens,
                    },
                  )
                }
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
                  usage,
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
                  ...(responseId !== undefined && { responseId }),
                  ...effortMetadata,
                  runId,
                  threadId,
                  model,
                  timestamp: Date.now(),
                  finishReason: 'stop',
                  usage,
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
        metadata: { tanstack: { source } },
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
 * The adapter type for a model and a config. A config with `reasoning` sets
 * the levels `chat({ reasoning })` takes; see {@link ConfigReasoning}.
 */
export type AnthropicTextAdapterFor<
  TModel extends AnthropicModelId,
  TConfig = AnthropicTextConfig,
> = AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>,
  ConfigReasoning<TConfig, ResolveReasoning<TModel>>
>

/**
 * Creates an Anthropic chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 */
export function createAnthropicChat<
  TModel extends AnthropicModelId,
  TConfig extends Omit<AnthropicTextConfig, 'apiKey'> = Omit<
    AnthropicTextConfig,
    'apiKey'
  >,
>(
  model: TModel,
  apiKey: string,
  config?: TConfig,
): AnthropicTextAdapterFor<TModel, TConfig> {
  return new AnthropicTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an Anthropic chat adapter with an injected Messages client.
 * Type resolution happens here at the call site.
 */
export function createAnthropicChatWithClient<TModel extends AnthropicModelId>(
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
export function anthropicText<
  TModel extends AnthropicModelId,
  TConfig extends AnthropicTextConfig = AnthropicTextConfig,
>(model: TModel, config?: TConfig): AnthropicTextAdapterFor<TModel, TConfig> {
  return new AnthropicTextAdapter(config ?? {}, model)
}
