/**
 * How hard a model thinks. The same levels as `chat({ reasoning })` in
 * `@tanstack/ai`, declared here too so this package has no dependencies.
 */
export type ReasoningLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/**
 * The provider value to send for each level, or `null` when the model does
 * not support the level. A level with no entry passes as its own name (except
 * `xhigh` and `max`, which need an entry). `off: null` means "send nothing".
 */
export type ReasoningMap = Partial<Record<ReasoningLevel, string | null>>

/**
 * A model's reasoning data, in the shape of the `reasoning` config of the
 * `@tanstack/ai` adapters (`ModelReasoning` there). `false`: the model does
 * not reason. Otherwise its level map, whether it takes a token budget, and
 * for Anthropic Messages, its thinking shape.
 */
export type ModelReasoning =
  | false
  | {
      map?: ReasoningMap
      budget: boolean
      adaptive?: boolean
      midConversationEffort?: boolean
    }

/** The wire protocol of a model. It picks the adapter. */
export type WireApi =
  | 'anthropic-messages'
  | 'openai-completions'
  | 'openai-responses'
  | 'azure-openai-responses'
  | 'google-generative-ai'
  | 'google-vertex'
  | 'bedrock-converse-stream'
  | 'mistral-conversations'

/** The input kinds a model reads. */
export type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

/** How a Chat Completions request asks for thinking. */
export type ThinkingFormat =
  | 'openai'
  | 'deepseek'
  | 'zai'
  | 'qwen'
  | 'qwen-chat-template'
  | 'chat-template'
  | 'baseten'
  | 'openrouter'
  | 'together'
  | 'string-thinking'
  | 'ant-ling'

/**
 * Wire quirks of a model: the provider rule merged with the model's own
 * hints (the model wins). An absent field means "the adapter default".
 * The Chat Completions fields follow pi's `OpenAICompletionsCompat`.
 */
export interface ModelCompat {
  // Chat Completions request shape.
  thinkingFormat?: ThinkingFormat
  supportsReasoningEffort?: boolean
  supportsDeveloperRole?: boolean
  maxTokensField?: 'max_completion_tokens' | 'max_tokens'
  requiresReasoningContentOnAssistantMessages?: boolean
  supportsStore?: boolean
  supportsStrictMode?: boolean
  supportsUsageInStreaming?: boolean
  zaiToolStream?: boolean
  sendSessionAffinityHeaders?: boolean
  sessionAffinityFormat?: 'openai' | 'openrouter' | 'openai-nosession'
  cacheControlFormat?: 'anthropic'
  supportsLongCacheRetention?: boolean
  thinkingTokenBudgetField?: string
  chatTemplateKwargs?: Record<string, unknown>
  chatTemplateArgs?: Record<string, unknown>
  supportsTemperature?: boolean
  // Anthropic Messages.
  forceAdaptiveThinking?: boolean
  /** The level goes into the messages, not into `output_config` (pi's flag). */
  supportsMidConvoEffort?: boolean
  supportsMidConvoSystemMessages?: boolean
  supportsStrictTools?: boolean
  allowEmptySignature?: boolean
  supportsEagerToolInputStreaming?: boolean
  supportsCacheControlOnTools?: boolean
  // OpenAI Responses.
  supportsAdditionalTools?: boolean
  supportsToolSearch?: boolean
  supportsOpenAIGrammarTools?: boolean
  /** `true`: the model takes `prompt_cache_options` (OpenAI gpt-5.6 and later); older models reject it. */
  supportsExplicitPromptCacheMode?: boolean
}

/** Prices in USD per 1M tokens. */
export interface ModelCostRates {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /**
   * Higher prices for a call with more input, for example long context. A
   * call uses the tier with the highest `inputTokensAbove` below its input
   * (uncached + cache read + cache write). Same rule as pi.
   */
  tiers?: ReadonlyArray<ModelCostTier>
}

/** The prices of a call with more than `inputTokensAbove` input tokens. */
export interface ModelCostTier {
  inputTokensAbove: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** One model of one provider. */
export interface ModelRecord {
  /** The model id to send. Flue and pi use the same ids. */
  id: string
  /** The provider id, for example `'deepseek'`. */
  provider: string
  name: string
  api: WireApi
  /** The default endpoint. `{VAR}` parts come from the environment. */
  baseUrl: string
  input: ReadonlyArray<InputModality>
  /** `false`: the model does not think, and supports only `off`. */
  reasoning: boolean
  /** The level map. None: every level up to `high` passes as its own name. */
  reasoningMap?: ReasoningMap
  /** `true`: the provider takes a thinking token budget. */
  reasoningBudget?: boolean
  cost: ModelCostRates
  /** Tokens. `0` means not known. */
  contextWindow: number
  /** The most output tokens. `0` means not known. */
  maxTokens: number
  headers?: Readonly<Record<string, string>>
  compat?: ModelCompat
  /** The data came from the same model at another provider, for example `'anthropic/claude-sonnet-4-5'`. */
  borrowedFrom?: string
}

/** One provider. */
export interface ProviderRecord {
  id: string
  name: string
  /** The default endpoint. A model can have its own `baseUrl`. */
  baseUrl: string
  apis: ReadonlyArray<WireApi>
  /**
   * Where the credentials come from: a list of alternatives. Each one is a
   * set of environment variables that must all be set, for example
   * `[['AWS_PROFILE'], ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']]`.
   */
  env: ReadonlyArray<ReadonlyArray<string>>
}

/** Token counts of one call. `input` is the uncached input only. */
export interface TokenCounts {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  /**
   * The part of `cacheWrite` written with a 1-hour retention
   * (`promptCache: 'long'` on Anthropic). It costs 2x the input price.
   */
  cacheWrite1h?: number
}

/** What a call cost, in USD. */
export interface Cost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}
