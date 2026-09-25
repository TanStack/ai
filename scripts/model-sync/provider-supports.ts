/**
 * Conservative `supports` blocks for newly synced native-provider models.
 *
 * The generator only writes facts it can see: input modalities from
 * OpenRouter, plus features inferred from `supported_parameters`.
 * It does not copy a reference model's tool list (computer_use, x_search,
 * google_search, …) onto every new id.
 */

export type SyncedProvider = 'openai' | 'anthropic' | 'gemini' | 'grok'

export interface ProviderSupportsInput {
  provider: SyncedProvider
  inputModalities: Array<string>
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
  }
}
