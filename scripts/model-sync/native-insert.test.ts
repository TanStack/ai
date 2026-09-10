import { describe, expect, it } from 'vitest'
import {
  addToStringLiteralArray,
  applyChatModelCatalogInserts,
  extractStringLiteralArrayValues,
} from './native-insert'

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

const ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  [FOO.id]: FOO.max_output_tokens,
}
`

const ANTHROPIC_CONFIG = {
  chatArrayName: 'ANTHROPIC_MODELS',
  arrayRef: '.id' as const,
  providerOptionsTypeName: 'AnthropicChatModelProviderOptionsByName',
  inputModalitiesTypeName: 'AnthropicModelInputModalitiesByName',
  toolCapabilitiesTypeName: 'AnthropicChatModelToolCapabilitiesByName',
  maxOutputTokensMapName: 'ANTHROPIC_MODEL_MAX_OUTPUT_TOKENS',
  providerOptionsIsMappedType: false,
}

describe('applyChatModelCatalogInserts', () => {
  it('writes the tool-capabilities row for a new Anthropic model', () => {
    const result = applyChatModelCatalogInserts(STUB, ANTHROPIC_CONFIG, [
      {
        constName: 'CLAUDE_FABLE_5_1',
        providerOptionsEntry:
          'AnthropicAdaptiveOnlyThinkingOptions & AnthropicMaxTokensOptions',
        hasMaxOutputTokens: true,
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
      '[CLAUDE_FABLE_5_1.id]: AnthropicAdaptiveOnlyThinkingOptions & AnthropicMaxTokensOptions',
    )
    expect(result).toContain(
      '[CLAUDE_FABLE_5_1.id]: CLAUDE_FABLE_5_1.max_output_tokens,',
    )
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
  })
})

describe('string-literal arrays', () => {
  const stub = `export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
] as const
`

  it('inserts quoted ids after the opening bracket', () => {
    const result = addToStringLiteralArray(stub, 'ELEVENLABS_TTS_MODELS', [
      'eleven_v3_conversational',
    ])
    expect(result).toContain("  'eleven_v3_conversational',")
    expect(
      extractStringLiteralArrayValues(result, 'ELEVENLABS_TTS_MODELS'),
    ).toEqual(new Set(['eleven_v3_conversational', 'eleven_v3']))
  })
})
