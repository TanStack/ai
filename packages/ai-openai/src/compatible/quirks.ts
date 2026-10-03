import { clampReasoningLevel } from '@tanstack/ai'
import { reasoningBudget, reasoningValue } from '@tanstack/ai/adapter-internals'
import type {
  ModelReasoning,
  ReasoningLevel,
  ReasoningMap,
  ReasoningRequest,
  ResolvedPromptCache,
} from '@tanstack/ai'

/** How a Chat Completions request asks for thinking. */
export type OpenAICompatibleThinkingFormat =
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
 * The request quirks of an OpenAI-compatible provider or model. The same
 * fields as pi's `OpenAICompletionsCompat` and as `ModelCompat` in
 * `@tanstack/ai-models`, so a catalog record's `compat` drops in. An absent
 * field keeps today's request.
 */
export interface OpenAICompatibleCompat {
  /** How to ask for thinking. Default `'openai'` (`reasoning_effort`). */
  thinkingFormat?: OpenAICompatibleThinkingFormat
  /** `false`: the provider takes no `reasoning_effort`. Default `true`. */
  supportsReasoningEffort?: boolean
  /** `false`: send instructions as `system`, not `developer`. Default `true`. */
  supportsDeveloperRole?: boolean
  /** The field for the output token limit. Set only to rename it. */
  maxTokensField?: 'max_completion_tokens' | 'max_tokens'
  /** `true`: every earlier assistant message carries `reasoning_content` (DeepSeek). */
  requiresReasoningContentOnAssistantMessages?: boolean
  /** `false`: the provider rejects `store`, so it is dropped. */
  supportsStore?: boolean
  /** `false`: tools are sent with `strict: false`. */
  supportsStrictMode?: boolean
  /** `false`: no `stream_options: { include_usage }`. */
  supportsUsageInStreaming?: boolean
  /** `true`: send `tool_stream: true` with tools (Z.AI). */
  zaiToolStream?: boolean
  /** `true`: send the conversation id as session headers. */
  sendSessionAffinityHeaders?: boolean
  sessionAffinityFormat?: 'openai' | 'openrouter' | 'openai-nosession'
  /** `'anthropic'`: add Anthropic cache markers (Claude through OpenRouter). */
  cacheControlFormat?: 'anthropic'
  /** `false`: the provider has no long cache, so a `'long'` retention acts as `'short'`. */
  supportsLongCacheRetention?: boolean
  /** `true`: the model takes `prompt_cache_options` (OpenAI gpt-5.6 and later); older models reject it. */
  supportsExplicitPromptCacheMode?: boolean
  /** A top-level field for the thinking token budget, for example `thinking_token_budget`. */
  thinkingTokenBudgetField?: string
  /** Values for `chat_template_kwargs` (the `chat-template` format). */
  chatTemplateKwargs?: Record<string, unknown>
  /** Values for `chat_template_args` (the `baseten` format). */
  chatTemplateArgs?: Record<string, unknown>
  supportsTemperature?: boolean
}

/** A Chat Completions request body, as loose JSON. */
type Params = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The objects of an array field, for example `messages` or `tools`. */
const records = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter(isRecord) : []

/** pi: at least this many tokens stay for the answer under a shared ceiling. */
const MIN_ANSWER_TOKENS = 1024

/**
 * A chat template value: a fixed value, or `{ $var: 'thinking.enabled' }`,
 * `{ $var: 'thinking.budget' }`, or `{ omitWhenOff: true }` (pi's shapes).
 */
function templateValues(
  values: Record<string, unknown> | undefined,
  reasoning: ModelReasoning | undefined,
  effort: ReasoningLevel | undefined,
  budget: number | undefined,
): Record<string, unknown> | undefined {
  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    if (typeof value !== 'object' || value === null) {
      resolved[key] = value
      continue
    }
    if (!effort && 'omitWhenOff' in value && value.omitWhenOff) continue
    const variable = '$var' in value ? value.$var : undefined
    if (variable === 'thinking.enabled') resolved[key] = !!effort
    else if (variable === 'thinking.budget') {
      if (budget !== undefined) resolved[key] = budget
    } else {
      const mapped = reasoningValue(reasoning, effort ?? 'off')
      if (typeof mapped === 'string') resolved[key] = mapped
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

/**
 * Write the thinking fields of `request` into `params`, the way pi's
 * `buildParams` does for each `thinkingFormat`. `reasoning: false` (a model
 * that does not reason) gets nothing.
 */
export function applyThinking(
  params: Params,
  request: ReasoningRequest,
  reasoning: ModelReasoning | undefined,
  compat: OpenAICompatibleCompat,
  modelMaxTokens?: number,
): void {
  if (reasoning === false) return
  const level = clampReasoningLevel(reasoning, request.level)
  // pi's `reasoningEffort`: undefined means thinking off.
  const effort = level === 'off' ? undefined : level
  const on = effort !== undefined
  const value = (target: ReasoningLevel) => reasoningValue(reasoning, target)
  const map: ReasoningMap | undefined = reasoning?.map
  const effortAllowed = compat.supportsReasoningEffort !== false
  const ceiling =
    (typeof params.max_tokens === 'number' ? params.max_tokens : undefined) ??
    (typeof params.max_completion_tokens === 'number'
      ? params.max_completion_tokens
      : undefined) ??
    modelMaxTokens
  const budget = on
    ? ceiling === undefined
      ? reasoningBudget(request)
      : Math.min(
          reasoningBudget(request),
          Math.max(0, ceiling - MIN_ANSWER_TOKENS),
        )
    : undefined

  switch (compat.thinkingFormat ?? 'openai') {
    case 'zai': {
      params.thinking = on
        ? { type: 'enabled', clear_thinking: false }
        : { type: 'disabled' }
      const mapped = on && effortAllowed ? value(effort) : null
      if (typeof mapped === 'string') params.reasoning_effort = mapped
      break
    }
    case 'qwen': {
      params.enable_thinking = on
      const mapped = on && effortAllowed ? value(effort) : null
      if (typeof mapped === 'string') params.reasoning_effort = mapped
      break
    }
    case 'qwen-chat-template':
      params.chat_template_kwargs = {
        enable_thinking: on,
        preserve_thinking: true,
      }
      break
    case 'chat-template': {
      const kwargs = templateValues(
        compat.chatTemplateKwargs,
        reasoning,
        effort,
        budget,
      )
      if (kwargs) params.chat_template_kwargs = kwargs
      break
    }
    case 'baseten': {
      const args = templateValues(
        compat.chatTemplateArgs,
        reasoning,
        effort,
        budget,
      )
      if (args) params.chat_template_args = args
      if (effortAllowed) {
        const mapped = value(effort ?? 'off')
        if (typeof mapped === 'string') params.reasoning_effort = mapped
      }
      break
    }
    case 'deepseek':
      if (on) params.thinking = { type: 'enabled' }
      else if (map?.off !== null) params.thinking = { type: 'disabled' }
      if (on && effortAllowed) params.reasoning_effort = value(effort) ?? effort
      break
    case 'openrouter':
      if (on) params.reasoning = { effort: value(effort) ?? effort }
      else if (map?.off !== null)
        params.reasoning = { effort: map?.off ?? 'none' }
      break
    case 'ant-ling': {
      const mapped = on ? map?.[effort] : undefined
      if (typeof mapped === 'string') params.reasoning = { effort: mapped }
      break
    }
    case 'together':
      params.reasoning = { enabled: on }
      if (on && effortAllowed) params.reasoning_effort = value(effort) ?? effort
      break
    case 'string-thinking':
      if (on) params.thinking = value(effort) ?? effort
      else if (map?.off !== null) params.thinking = map?.off ?? 'none'
      break
    case 'openai':
      if (effortAllowed) {
        const mapped = value(effort ?? 'off')
        // `off` maps to nothing unless the model has an off value, like `none`.
        if (typeof mapped === 'string' && (on || map?.off !== undefined))
          params.reasoning_effort = mapped
      }
      break
  }

  if (compat.thinkingTokenBudgetField && budget !== undefined && budget > 0)
    params[compat.thinkingTokenBudgetField] = budget
}

/** An Anthropic cache marker. `ttl: '1h'` keeps the cache for one hour. */
type CacheMarker = { type: 'ephemeral'; ttl?: '1h' }

/** Put an Anthropic cache marker on the last text part of a message. */
function markMessage(
  message: Record<string, unknown>,
  marker: CacheMarker,
): boolean {
  const content = message.content
  if (typeof content === 'string') {
    if (content.length === 0) return false
    message.content = [{ type: 'text', text: content, cache_control: marker }]
    return true
  }
  if (!Array.isArray(content)) return false
  for (let index = content.length - 1; index >= 0; index--) {
    const part: unknown = content[index]
    if (isRecord(part) && part.type === 'text') {
      content[index] = { ...part, cache_control: marker }
      return true
    }
  }
  return false
}

/**
 * The quirks that are not about thinking: the instruction role, the token
 * field name, `store`, strict tools, `tool_stream`, and cache markers.
 * `promptCache` sets the cache markers. When it is absent, the markers stay
 * as today.
 */
export function applyRequestQuirks(
  params: Params,
  compat: OpenAICompatibleCompat,
  reasons: boolean,
  promptCache: ResolvedPromptCache | undefined,
): void {
  const messages = records(params.messages)
  const instructions = messages.find((message) => message.role === 'system')
  if (instructions && reasons && compat.supportsDeveloperRole !== false)
    instructions.role = 'developer'

  const rename = (from: string, to: string) => {
    if (params[from] === undefined) return
    params[to] = params[from]
    delete params[from]
  }
  if (compat.maxTokensField === 'max_tokens')
    rename('max_completion_tokens', 'max_tokens')
  if (compat.maxTokensField === 'max_completion_tokens')
    rename('max_tokens', 'max_completion_tokens')

  if (compat.supportsStore === false) delete params.store
  if (compat.supportsTemperature === false) delete params.temperature

  const tools = records(params.tools)
  if (tools.length > 0) {
    if (compat.supportsStrictMode === false)
      for (const tool of tools)
        if (isRecord(tool.function))
          tool.function = { ...tool.function, strict: false }
    if (compat.zaiToolStream) params.tool_stream = true
  }

  const addsMarkers =
    compat.cacheControlFormat === 'anthropic' &&
    promptCache?.retention !== 'none'
  if (addsMarkers) {
    const isLong =
      promptCache?.retention === 'long' &&
      compat.supportsLongCacheRetention !== false
    const marker: CacheMarker = isLong
      ? { type: 'ephemeral', ttl: '1h' }
      : { type: 'ephemeral' }
    const system = messages.find(
      (message) => message.role === 'system' || message.role === 'developer',
    )
    if (system) markMessage(system, marker)
    const lastTool = tools.at(-1)
    if (lastTool) lastTool.cache_control = marker
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (
        message &&
        ['user', 'assistant', 'tool'].includes(String(message.role)) &&
        markMessage(message, marker)
      )
        break
    }
  }
}

/**
 * The thinking of an earlier assistant turn, sent back as
 * `reasoning_content`. Some providers (DeepSeek) refuse the next turn without
 * it, so it is `''` when the turn had no thinking.
 */
export function replayReasoning(
  thinking: ReadonlyArray<{ content: string }> | undefined,
): string {
  return (thinking ?? [])
    .map((part) => part.content)
    .filter((content) => content.trim().length > 0)
    .join('\n')
}

/** The session headers for `sendSessionAffinityHeaders`, as pi sends them. */
export function sessionHeaders(
  compat: OpenAICompatibleCompat,
  sessionId: string | undefined,
): Record<string, string> | undefined {
  if (!sessionId || !compat.sendSessionAffinityHeaders) return undefined
  if (compat.sessionAffinityFormat === 'openrouter')
    return { 'x-session-id': sessionId }
  return {
    ...((compat.sessionAffinityFormat ?? 'openai') === 'openai'
      ? { session_id: sessionId }
      : {}),
    'x-client-request-id': sessionId,
    'x-session-affinity': sessionId,
  }
}
