/**
 * `supports` blocks for newly synced native-provider models.
 *
 * Input modalities and `supported_parameters` come from the native
 * modelschemas catalog (OpenRouter fills a field only when the native row
 * is empty). Server-tool lists are the current first-party vocabulary for
 * openai, anthropic, gemini and grok, written only when the catalog lists
 * `tools` or `tool_choice`. Anthropic thinking flags follow the same
 * parameter split as `buildAnthropicProviderOptionsType`.
 */

export const SYNCED_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'grok',
  'groq',
  'mistral',
  'byteplus',
  'elevenlabs',
] as const

export type SyncedProvider = (typeof SYNCED_PROVIDERS)[number]

export interface ProviderSupportsInput {
  provider: SyncedProvider
  inputModalities: Array<string>
  outputModalities?: Array<string>
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
  reasoningMandatory?: boolean
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
 * OpenRouter catalog. Does not copy another model's tool list.
 *
 * - `reasoning.mandatory` → adaptive-only thinking (Fable 5 / 5.1).
 * - reasoning params without sampling → adaptive-or-disabled (Sonnet 5,
 *   Opus 4.7+).
 * - reasoning + sampling → adaptive union plus sampling (Opus/Sonnet 4.6).
 * - no reasoning → budget-based thinking plus sampling when listed.
 */
export function buildAnthropicProviderOptionsType(
  input: AnthropicProviderOptionsInput,
): string {
  const params = input.supportedParameters ?? []
  const hasSampling = hasParam(params, ['temperature', 'top_p', 'top_k'])
  const hasReasoning = hasParam(params, [
    'include_reasoning',
    'reasoning',
    'reasoning_effort',
  ])

  const parts: Array<string> = [...ANTHROPIC_BASE_OPTIONS]
  if (input.hasCachedPricing) {
    parts.unshift('AnthropicCacheControlOptions')
  }

  if (input.reasoningMandatory) {
    parts.push('AnthropicAdaptiveOnlyThinkingOptions')
  } else if (hasReasoning && hasSampling) {
    parts.push('AnthropicAdaptiveThinkingOptions')
  } else if (hasReasoning) {
    parts.push('AnthropicAdaptiveOrDisabledThinkingOptions')
  } else {
    parts.push('AnthropicThinkingOptions')
  }

  parts.push('AnthropicToolChoiceOptions')

  if (hasSampling) {
    parts.push('AnthropicSamplingOptions')
  } else {
    parts.push('AnthropicMaxTokensOptions')
    if (hasReasoning || input.reasoningMandatory) {
      parts.push('AnthropicOutputConfigOptions')
    }
  }

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
    case 'groq': {
      const features = ['streaming']
      if (hasTools) features.push('tools')
      if (hasStructured) {
        features.push('json_object', 'json_schema')
      }
      if (hasReasoning) features.push('reasoning')
      if (input.inputModalities.includes('image')) features.push('vision')
      return [
        `    input: ${inputList},`,
        `    output: ['text'],`,
        `    endpoints: ['chat'],`,
        `    features: ${quoteList(features)},`,
        `    tools: [] as const,`,
      ].join('\n')
    }
    case 'mistral': {
      const features = ['streaming']
      if (hasTools) features.push('tools')
      if (hasStructured) {
        features.push('json_object', 'json_schema')
      }
      if (hasReasoning) features.push('reasoning')
      if (input.inputModalities.includes('image')) features.push('vision')
      return [
        `    input: ${inputList},`,
        `    output: ['text'],`,
        `    endpoints: ['chat'],`,
        `    features: ${quoteList(features)},`,
      ].join('\n')
    }
    case 'byteplus': {
      const capabilities: Array<string> = []
      if (hasReasoning) capabilities.push('reasoning')
      if (hasTools) capabilities.push('tool_calling')
      if (hasStructured) capabilities.push('structured_outputs')
      const output = quoteList(
        (input.outputModalities ?? ['text']).length > 0
          ? (input.outputModalities ?? ['text'])
          : ['text'],
      )
      const lines = [`    input: ${inputList},`, `    output: ${output},`]
      if (capabilities.length > 0) {
        lines.push(`    capabilities: ${quoteList(capabilities)},`)
      }
      lines.push(`    tools: [] as const,`)
      return lines.join('\n')
    }
    case 'elevenlabs':
      return `    input: ${inputList},`
  }
}
