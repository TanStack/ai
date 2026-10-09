import { describe, expect, it } from 'vitest'
import { applyChatModelCatalogInserts } from './native-insert'

const STUB = `const FOO = {
  id: 'claude-foo',
  supports: { input: ['text'], tools: [] },
  max_output_tokens: 1000,
}

export const ANTHROPIC_MODELS = [
  FOO.id,
] as const

export type AnthropicChatModelProviderOptionsByName = {
  [FOO.id]: AnthropicSamplingOptions
}

export type AnthropicChatModelToolCapabilitiesByName = {
  [FOO.id]: typeof FOO.supports.tools
}

export type AnthropicModelInputModalitiesByName = {
  [FOO.id]: typeof FOO.supports.input
}

export const ANTHROPIC_MODEL_INPUT_MODALITIES: Readonly<
  Record<string, ReadonlyArray<Modality>>
> = {
  [FOO.id]: FOO.supports.input,
} satisfies AnthropicModelInputModalitiesByName

const ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  [FOO.id]: FOO.max_output_tokens,
}

export const ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS = new Set<string>([
  FOO.id,
])
`

const ANTHROPIC_CONFIG = {
  chatArrayName: 'ANTHROPIC_MODELS',
  arrayRef: '.id' as const,
  providerOptionsTypeName: 'AnthropicChatModelProviderOptionsByName',
  inputModalitiesTypeName: 'AnthropicModelInputModalitiesByName',
  toolCapabilitiesTypeName: 'AnthropicChatModelToolCapabilitiesByName',
  maxOutputTokensMapName: 'ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS',
  combinedToolsAndSchemaSetName: 'ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS',
  providerOptionsIsMappedType: false,
}

describe('applyChatModelCatalogInserts', () => {
  it('writes the tool-capabilities row for a new Anthropic model', () => {
    const result = applyChatModelCatalogInserts(STUB, ANTHROPIC_CONFIG, [
      {
        constName: 'CLAUDE_FABLE_5_1',
        providerOptionsEntry:
          'AnthropicToolChoiceOptions & AnthropicMaxTokensOptions',
        hasMaxOutputTokens: true,
        acceptsCombinedToolsAndSchema: true,
      },
    ])

    expect(result).toContain('CLAUDE_FABLE_5_1.id,')
    expect(result).toContain(
      '[CLAUDE_FABLE_5_1.id]: typeof CLAUDE_FABLE_5_1.supports.tools',
    )
    expect(result).toContain(
      '[CLAUDE_FABLE_5_1.id]: typeof CLAUDE_FABLE_5_1.supports.input',
    )
    expect(result).toContain(
      '[CLAUDE_FABLE_5_1.id]: AnthropicToolChoiceOptions & AnthropicMaxTokensOptions',
    )
    expect(result).toContain(
      '[CLAUDE_FABLE_5_1.id]: CLAUDE_FABLE_5_1.max_output_tokens,',
    )
    expect(result).toContain(
      'export const ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS = new Set<string>([\n  CLAUDE_FABLE_5_1.id,',
    )
  })

  it('keeps the reasoning maps as they are', () => {
    const reasoning = `
export type AnthropicModelReasoningByName = {
  [FOO.id]: ModelReasoningCapability<typeof FOO.reasoning>
}

export const ANTHROPIC_MODEL_REASONING: Readonly<
  Record<string, ModelReasoning>
> = {
  [FOO.id]: FOO.reasoning,
} satisfies Record<keyof AnthropicModelReasoningByName, ModelReasoning>
`
    const result = applyChatModelCatalogInserts(
      STUB + reasoning,
      ANTHROPIC_CONFIG,
      [
        {
          constName: 'CLAUDE_FABLE_5_1',
          providerOptionsEntry: 'AnthropicMaxTokensOptions',
          hasMaxOutputTokens: true,
          acceptsCombinedToolsAndSchema: true,
        },
      ],
    )

    expect(result.endsWith(reasoning)).toBe(true)
  })

  it('leaves a -fast Anthropic model out of the combined set', () => {
    const result = applyChatModelCatalogInserts(STUB, ANTHROPIC_CONFIG, [
      {
        constName: 'CLAUDE_OPUS_5_FAST',
        providerOptionsEntry: 'AnthropicSamplingOptions',
        hasMaxOutputTokens: true,
        acceptsCombinedToolsAndSchema: false,
      },
    ])

    expect(result).toContain('CLAUDE_OPUS_5_FAST.id,')
    const set = result.slice(
      result.indexOf('ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS'),
    )
    expect(set).not.toContain('CLAUDE_OPUS_5_FAST')
  })

  it('writes the tool-capabilities row for OpenAI and Gemini (.name refs)', () => {
    const openaiStub = `export const OPENAI_CHAT_MODELS = [
  GPT5.name,
] as const

export type OpenAIChatModelProviderOptionsByName = {
  [GPT5.name]: OpenAIBaseOptions
}

export type OpenAIChatModelToolCapabilitiesByName = {
  [GPT5.name]: typeof GPT5.supports.tools
}

export type OpenAIModelInputModalitiesByName = {
  [GPT5.name]: typeof GPT5.supports.input
}
`
    const result = applyChatModelCatalogInserts(
      openaiStub,
      {
        chatArrayName: 'OPENAI_CHAT_MODELS',
        arrayRef: '.name',
        providerOptionsTypeName: 'OpenAIChatModelProviderOptionsByName',
        inputModalitiesTypeName: 'OpenAIModelInputModalitiesByName',
        toolCapabilitiesTypeName: 'OpenAIChatModelToolCapabilitiesByName',
        providerOptionsIsMappedType: false,
      },
      [
        {
          constName: 'GPT6',
          providerOptionsEntry: 'OpenAIBaseOptions',
          hasMaxOutputTokens: false,
        },
      ],
    )

    expect(result).toContain('[GPT6.name]: typeof GPT6.supports.tools')
    expect(result).toContain('GPT6.name,')
    // This stub has no runtime input-modalities map, so none is written.
    expect(result).not.toContain('GPT6.supports.input,')
  })

  it('writes the input-modalities row into the type map and the runtime map', () => {
    const result = applyChatModelCatalogInserts(STUB, ANTHROPIC_CONFIG, [
      {
        constName: 'CLAUDE_FABLE_5_1',
        providerOptionsEntry: 'AnthropicSamplingOptions',
        hasMaxOutputTokens: true,
      },
    ])

    expect(result).toContain(`> = {
  [FOO.id]: FOO.supports.input,
  [CLAUDE_FABLE_5_1.id]: CLAUDE_FABLE_5_1.supports.input,
} satisfies AnthropicModelInputModalitiesByName`)
  })
})
