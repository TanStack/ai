/**
 * `supports` blocks for newly synced native-provider models.
 *
 * Input modalities come from OpenRouter. Features come from
 * `supported_parameters`. Server-tool lists are the current first-party
 * vocabulary for that provider, written only when the catalog lists `tools`
 * or `tool_choice`. Anthropic thinking flags follow the same parameter
 * split as `buildAnthropicProviderOptionsType`.
 */

export type SyncedProvider = 'openai' | 'anthropic' | 'gemini' | 'grok'

export interface ProviderSupportsInput {
  provider: SyncedProvider
  inputModalities: Array<string>
  supportedParameters?: Array<string>
  reasoningMandatory?: boolean
}

const ANTHROPIC_SERVER_TOOLS = [
  'web_search',
  'web_fetch',
  'code_execution',
  'computer_use',
  'bash',
  'text_editor',
  'memory',
] as const

const OPENAI_SERVER_TOOLS = [
  'web_search',
  'web_search_preview',
  'file_search',
  'image_generation',
  'code_interpreter',
  'mcp',
  'computer_use',
  'local_shell',
  'shell',
  'apply_patch',
] as const

const GEMINI_SERVER_TOOLS = [
  'code_execution',
  'file_search',
  'google_search',
  'url_context',
] as const

const GROK_SERVER_TOOLS = [
  'web_search',
  'x_search',
  'file_search',
  'mcp',
] as const

function hasParam(params: Array<string>, names: Array<string>): boolean {
  return names.some((name) => params.includes(name))
}

function quoteList(values: Array<string>): string {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`
}

interface AnthropicProviderOptionsInput {
  supportedParameters?: Array<string>
  hasCachedPricing?: boolean
}

const ANTHROPIC_BASE_OPTIONS = [
  'AnthropicContainerOptions',
  'AnthropicContextManagementOptions',
  'AnthropicMCPOptions',
  'AnthropicServiceTierOptions',
  'AnthropicStopSequencesOptions',
] as const

/**
 * Per-model Anthropic provider-options intersection, inferred from the
 * OpenRouter catalog. Does not copy another model's tool list. Thinking is
 * not here: `chat({ reasoning })` sets it, with the levels of each model's
 * `reasoning` field in `model-meta.ts`.
 *
 * - sampling listed → sampling options.
 * - no sampling (Sonnet 5, Opus 4.7+, Fable 5) → `max_tokens` only.
 */
export function buildAnthropicProviderOptionsType(
  input: AnthropicProviderOptionsInput,
): string {
  const params = input.supportedParameters ?? []
  const hasSampling = hasParam(params, ['temperature', 'top_p', 'top_k'])

  const parts: Array<string> = [...ANTHROPIC_BASE_OPTIONS]
  if (input.hasCachedPricing) {
    parts.unshift('AnthropicCacheControlOptions')
  }

  parts.push('AnthropicToolChoiceOptions')
  parts.push(
    hasSampling ? 'AnthropicSamplingOptions' : 'AnthropicMaxTokensOptions',
  )

  return parts.join(' & ')
}

function toolsLine(hasTools: boolean, tools: ReadonlyArray<string>): string {
  return `    tools: ${hasTools ? quoteList([...tools]) : '[]'},`
}

/**
 * Thinking flags for a new Anthropic model. Same split as
 * `buildAnthropicProviderOptionsType`: mandatory or reasoning-without-sampling
 * is adaptive-only, reasoning-plus-sampling keeps budget thinking too, and
 * no reasoning param is budget thinking. `priority_tier` is on every current
 * hand-written Claude entry that lists thinking flags.
 */
export function buildAnthropicSupportsFlags(input: {
  supportedParameters?: Array<string>
  reasoningMandatory?: boolean
}): Array<string> {
  const params = input.supportedParameters ?? []
  const hasSampling = hasParam(params, ['temperature', 'top_p', 'top_k'])
  const hasReasoning = hasParam(params, [
    'include_reasoning',
    'reasoning',
    'reasoning_effort',
  ])
  const adaptiveOnly =
    input.reasoningMandatory === true || (hasReasoning && !hasSampling)
  const lines = [`    extended_thinking: ${adaptiveOnly ? 'false' : 'true'},`]
  if (adaptiveOnly || hasReasoning) {
    lines.push(`    adaptive_thinking: true,`)
  }
  lines.push(`    priority_tier: true,`)
  return lines
}

export function buildProviderSupportsBody(
  input: ProviderSupportsInput,
): string {
  const params = input.supportedParameters ?? []
  const inputList = quoteList(input.inputModalities)
  const hasTools = hasParam(params, ['tools', 'tool_choice'])
  const hasStructured = hasParam(params, [
    'response_format',
    'structured_outputs',
  ])
  const hasReasoning = hasParam(params, [
    'include_reasoning',
    'reasoning',
    'reasoning_effort',
  ])

  switch (input.provider) {
    case 'openai': {
      const features = ['streaming']
      if (hasTools) features.push('function_calling')
      if (hasStructured) features.push('structured_outputs')
      return [
        `    input: ${inputList},`,
        `    output: ['text'],`,
        `    endpoints: ['chat', 'chat-completions'],`,
        `    features: ${quoteList(features)},`,
        toolsLine(hasTools, OPENAI_SERVER_TOOLS),
      ].join('\n')
    }
    case 'anthropic':
      return [
        `    input: ${inputList},`,
        ...buildAnthropicSupportsFlags(input),
        toolsLine(hasTools, ANTHROPIC_SERVER_TOOLS),
      ].join('\n')
    case 'gemini': {
      const capabilities: Array<string> = []
      if (hasTools) capabilities.push('function_calling')
      if (hasStructured) capabilities.push('structured_output')
      if (hasReasoning) capabilities.push('thinking')
      const lines = [`    input: ${inputList},`, `    output: ['text'],`]
      if (capabilities.length > 0) {
        lines.push(`    capabilities: ${quoteList(capabilities)},`)
      }
      lines.push(toolsLine(hasTools, GEMINI_SERVER_TOOLS))
      return lines.join('\n')
    }
    case 'grok': {
      const capabilities: Array<string> = []
      if (hasReasoning) capabilities.push('reasoning')
      if (hasStructured) capabilities.push('structured_outputs')
      if (hasTools) capabilities.push('tool_calling')
      const lines = [`    input: ${inputList},`, `    output: ['text'],`]
      if (capabilities.length > 0) {
        lines.push(`    capabilities: ${quoteList(capabilities)},`)
      }
      lines.push(toolsLine(hasTools, GROK_SERVER_TOOLS))
      return lines.join('\n')
    }
  }
}
