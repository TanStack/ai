import { describe, it, expectTypeOf } from "vitest";
import type {
  AnthropicChatModelProviderOptionsByName,
} from "../src/model-meta";
import type {
  AnthropicContainerOptions,
  AnthropicContextManagementOptions,
  AnthropicMCPOptions,
  AnthropicServiceTierOptions,
  AnthropicStopSequencesOptions,
  AnthropicThinkingOptions,
  AnthropicToolChoiceOptions,
  AnthropicSamplingOptions,
} from "../src/text/text-provider-options";

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
  AnthropicSamplingOptions;

describe("Anthropic Model Provider Options Type Assertions", () => {
  describe("Models WITH extended_thinking support", () => {
    it("claude-sonnet-4-5-20250929 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty("thinking");
      expectTypeOf<Options>().toHaveProperty("service_tier");
      expectTypeOf<Options>().toHaveProperty("container");
      expectTypeOf<Options>().toHaveProperty("context_management");
      expectTypeOf<Options>().toHaveProperty("mcp_servers");
      expectTypeOf<Options>().toHaveProperty("stop_sequences");
      expectTypeOf<Options>().toHaveProperty("tool_choice");
      expectTypeOf<Options>().toHaveProperty("top_k");
    });

    it("claude-haiku-4-5-20251001 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("claude-opus-4-1-20250805 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("claude-sonnet-4-20250514 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("claude-3-7-sonnet-20250219 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("claude-opus-4-20250514 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("claude-opus-4-5-20251101 should support thinking options", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"];

      expectTypeOf<Options>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty("thinking");
      expectTypeOf<Options>().toHaveProperty("service_tier");
      expectTypeOf<Options>().toHaveProperty("container");
      expectTypeOf<Options>().toHaveProperty("context_management");
      expectTypeOf<Options>().toHaveProperty("mcp_servers");
      expectTypeOf<Options>().toHaveProperty("stop_sequences");
      expectTypeOf<Options>().toHaveProperty("tool_choice");
      expectTypeOf<Options>().toHaveProperty("top_k");
    });
  });

  describe("Models WITHOUT extended_thinking support", () => {
    it("claude-3-5-haiku-20241022 should NOT have thinking options but SHOULD have service tier", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"];

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>();

      // Should have service tier options (priority_tier support)
      expectTypeOf<Options>().toExtend<AnthropicServiceTierOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify service_tier exists but thinking does not
      expectTypeOf<Options>().toHaveProperty("service_tier");
      expectTypeOf<Options>().toHaveProperty("container");
      expectTypeOf<Options>().toHaveProperty("context_management");
      expectTypeOf<Options>().toHaveProperty("mcp_servers");
      expectTypeOf<Options>().toHaveProperty("stop_sequences");
      expectTypeOf<Options>().toHaveProperty("tool_choice");
      expectTypeOf<Options>().toHaveProperty("top_k");
    });

    it("claude-3-haiku-20240307 should NOT have thinking options AND NOT have service tier", () => {
      type Options = AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"];

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<AnthropicThinkingOptions>();

      // Should NOT have service tier options (no priority_tier support)
      expectTypeOf<Options>().not.toExtend<AnthropicServiceTierOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify base properties exist
      expectTypeOf<Options>().toHaveProperty("container");
      expectTypeOf<Options>().toHaveProperty("context_management");
      expectTypeOf<Options>().toHaveProperty("mcp_servers");
      expectTypeOf<Options>().toHaveProperty("stop_sequences");
      expectTypeOf<Options>().toHaveProperty("tool_choice");
      expectTypeOf<Options>().toHaveProperty("top_k");
    });
  });

  describe("Provider options type completeness", () => {
    it("AnthropicChatModelProviderOptionsByName should have entries for all chat models", () => {
      type Keys = keyof AnthropicChatModelProviderOptionsByName;

      expectTypeOf<"claude-opus-4-5-20251101">().toExtend<Keys>();
      expectTypeOf<"claude-sonnet-4-5-20250929">().toExtend<Keys>();
      expectTypeOf<"claude-haiku-4-5-20251001">().toExtend<Keys>();
      expectTypeOf<"claude-opus-4-1-20250805">().toExtend<Keys>();
      expectTypeOf<"claude-sonnet-4-20250514">().toExtend<Keys>();
      expectTypeOf<"claude-3-7-sonnet-20250219">().toExtend<Keys>();
      expectTypeOf<"claude-opus-4-20250514">().toExtend<Keys>();
      expectTypeOf<"claude-3-5-haiku-20241022">().toExtend<Keys>();
      expectTypeOf<"claude-3-haiku-20240307">().toExtend<Keys>();
    });
  });

  describe("Detailed property type assertions", () => {
    it("all models should have container options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("container");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("container");
    });

    it("all models should have context management options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("context_management");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("context_management");
    });

    it("all models should have MCP options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("mcp_servers");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("mcp_servers");
    });

    it("all models should have stop sequences options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("stop_sequences");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("stop_sequences");
    });

    it("all models should have tool choice options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("tool_choice");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("tool_choice");
    });

    it("all models should have sampling options (top_k)", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toHaveProperty("top_k");
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toHaveProperty("top_k");
    });
  });

  describe("Type discrimination between model categories", () => {
    it("models with extended_thinking should extend AnthropicThinkingOptions", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toExtend<AnthropicThinkingOptions>();
    });

    it("models without extended_thinking should NOT extend AnthropicThinkingOptions", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().not.toExtend<AnthropicThinkingOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().not.toExtend<AnthropicThinkingOptions>();
    });

    it("models with priority_tier should extend AnthropicServiceTierOptions", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toExtend<AnthropicServiceTierOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toExtend<AnthropicServiceTierOptions>();
    });

    it("models without priority_tier should NOT extend AnthropicServiceTierOptions", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().not.toExtend<AnthropicServiceTierOptions>();
    });

    it("all models should extend base options", () => {
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-5-20251101"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-5-20250929"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-haiku-4-5-20251001"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-1-20250805"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-sonnet-4-20250514"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-7-sonnet-20250219"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-opus-4-20250514"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-5-haiku-20241022"]>().toExtend<BaseOptions>();
      expectTypeOf<AnthropicChatModelProviderOptionsByName["claude-3-haiku-20240307"]>().toExtend<BaseOptions>();
    });
  });
});
