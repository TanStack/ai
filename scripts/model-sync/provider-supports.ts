/**
 * Conservative `supports` blocks for newly synced native-provider models.
 *
 * The generator only writes facts it can see: input modalities from
 * the modelschemas catalog (OpenRouter enrich when the native row is
 * empty), plus features inferred from `supported_parameters`.
 * It does not copy a reference model's tool list (computer_use, x_search,
 * google_search, …) onto every new id.
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
}

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
        `    tools: [],`,
      ].join('\n')
    }
    case 'anthropic':
      return [`    input: ${inputList},`, `    tools: [],`].join('\n')
    case 'gemini': {
      const capabilities: Array<string> = []
      if (hasTools) capabilities.push('function_calling')
      if (hasStructured) capabilities.push('structured_output')
      if (hasReasoning) capabilities.push('thinking')
      const lines = [`    input: ${inputList},`, `    output: ['text'],`]
      if (capabilities.length > 0) {
        lines.push(`    capabilities: ${quoteList(capabilities)},`)
      }
      lines.push(`    tools: [],`)
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
      lines.push(`    tools: [],`)
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
