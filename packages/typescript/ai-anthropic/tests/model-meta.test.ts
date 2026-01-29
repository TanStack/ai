import { describe, expectTypeOf, it } from 'vitest'
import type { AnthropicChatModelProviderOptionsByName } from '../src/model-meta'
import type {
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
  AnthropicSamplingOptions,
  AnthropicServiceTierOptions,
  AnthropicStopSequencesOptions,
  AnthropicThinkingOptions,
  AnthropicToolChoiceOptions,
} from '../src/text/text-provider-options'

/**
 * Type assertion tests for Anthropic model provider options.
 *
 * These tests verify that:
 * 1. Models with extended_thinking support have AnthropicThinkingOptions in their provider options
 * 2. Models without extended_thinking support do NOT have AnthropicThinkingOptions
 * 3. Models with priority_tier support have AnthropicServiceTierOptions in their provider options
 * 4. Models without priority_tier support do NOT have AnthropicServiceTierOptions
 * 5. All models have base options (container, context management, MCP, stop sequences, tool choice, sampling)
 */

// Base options that ALL chat models should have
type BaseOptions = AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicStopSequencesOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions

describe('Anthropic Model Provider Options Type Assertions', () => {
  describe('Models WITH extended_thinking support', () => {
    it('claude-sonnet-4-5 should support thinking options', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']

      // Should have thinking options
      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })

    it('claude-haiku-4-5 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4-1 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-1']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-sonnet-4 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-sonnet-4']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-3-7-sonnet should support thinking options', () => {
      type Options =
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()
    })

    it('claude-opus-4-5 should support thinking options', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-opus-4-5']

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty('thinking')
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })
  })

  describe('Models WITHOUT extended_thinking support', () => {
    it('claude-3-5-haiku should NOT have thinking options but SHOULD have service tier', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>()

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify service_tier exists but thinking does not
      expectTypeOf<Options>().toHaveProperty('service_tier')
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })

    it('claude-3-haiku should NOT have thinking options AND NOT have service tier', () => {
      type Options = AnthropicChatModelProviderOptionsByName['claude-3-haiku']

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>()

      // Should NOT have service tier options (no priority_tier support)
      expectTypeOf<Options>().not.toExtend<AnthropicServiceTierOptions>()

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>()

      // Verify base properties exist
      expectTypeOf<Options>().toHaveProperty('container')
      expectTypeOf<Options>().toHaveProperty('context_management')
      expectTypeOf<Options>().toHaveProperty('mcp_servers')
      expectTypeOf<Options>().toHaveProperty('stop_sequences')
      expectTypeOf<Options>().toHaveProperty('tool_choice')
      expectTypeOf<Options>().toHaveProperty('top_k')
    })
  })

  describe('Provider options type completeness', () => {
    it('AnthropicChatModelProviderOptionsByName should have entries for all chat models', () => {
      type Keys = keyof AnthropicChatModelProviderOptionsByName

      expectTypeOf<'claude-opus-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-haiku-4-5'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4-1'>().toExtend<Keys>()
      expectTypeOf<'claude-sonnet-4'>().toExtend<Keys>()
      expectTypeOf<'claude-3-7-sonnet'>().toExtend<Keys>()
      expectTypeOf<'claude-opus-4'>().toExtend<Keys>()
      expectTypeOf<'claude-3-5-haiku'>().toExtend<Keys>()
      expectTypeOf<'claude-3-haiku'>().toExtend<Keys>()
    })
  })

  describe('Detailed property type assertions', () => {
    it('all models should have container options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('container')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('container')
    })

    it('all models should have context management options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('context_management')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('context_management')
    })

    it('all models should have MCP options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('mcp_servers')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('mcp_servers')
    })

    it('all models should have stop sequences options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('stop_sequences')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('stop_sequences')
    })

    it('all models should have tool choice options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('tool_choice')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('tool_choice')
    })

    it('all models should have sampling options (top_k)', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toHaveProperty('top_k')
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toHaveProperty('top_k')
    })
  })

  describe('Type discrimination between model categories', () => {
    it('models with extended_thinking should extend AnthropicThinkingOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<AnthropicThinkingOptions>()
    })

    it('models without extended_thinking should NOT extend AnthropicThinkingOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().not.toExtend<AnthropicThinkingOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().not.toExtend<AnthropicThinkingOptions>()
    })

    it('models with priority_tier should extend AnthropicServiceTierOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<AnthropicServiceTierOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toExtend<AnthropicServiceTierOptions>()
    })

    it('models without priority_tier should NOT extend AnthropicServiceTierOptions', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().not.toExtend<AnthropicServiceTierOptions>()
    })

    it('all models should extend base options', () => {
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-haiku-4-5']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4-1']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-sonnet-4']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-7-sonnet']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-opus-4']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-5-haiku']
      >().toExtend<BaseOptions>()
      expectTypeOf<
        AnthropicChatModelProviderOptionsByName['claude-3-haiku']
      >().toExtend<BaseOptions>()
    })
  })
})
