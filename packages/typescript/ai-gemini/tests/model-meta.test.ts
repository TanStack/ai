import { describe, it, expectTypeOf } from "vitest";
import type {
  GeminiChatModelProviderOptionsByName,
} from "../src/model-meta";
import type {
  GeminiThinkingOptions,
  GeminiStructuredOutputOptions,
  GeminiToolConfigOptions,
  GeminiSafetyOptions,
  GeminiGenerationConfigOptions,
  GeminiCachedContentOptions,
} from "../src/text/text-provider-options";

/**
 * Type assertion tests for Gemini model provider options.
 * 
 * These tests verify that:
 * 1. Models with thinking support have GeminiThinkingOptions in their provider options
 * 2. Models without thinking support do NOT have GeminiThinkingOptions
 * 3. Models with structured output support have GeminiStructuredOutputOptions
 * 4. All models have base options (tool config, safety, generation config, cached content)
 */

// Base options that ALL chat models should have
type BaseOptions = GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions;

describe("Gemini Model Provider Options Type Assertions", () => {
  describe("Models WITH thinking support", () => {
    it("gemini-3-pro-preview should support thinking options", () => {
      type Model = "gemini-3-pro-preview";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty("generationConfig");
      expectTypeOf<Options>().toHaveProperty("safetySettings");
      expectTypeOf<Options>().toHaveProperty("toolConfig");
      expectTypeOf<Options>().toHaveProperty("cachedContent");
      expectTypeOf<Options>().toHaveProperty("responseMimeType");
      expectTypeOf<Options>().toHaveProperty("responseSchema");
    });

    it("gemini-2.5-pro should support thinking options", () => {
      type Model = "gemini-2.5-pro";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gemini-2.5-flash should support thinking options", () => {
      type Model = "gemini-2.5-flash";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gemini-2.5-flash-preview-09-2025 should support thinking options", () => {
      type Model = "gemini-2.5-flash-preview-09-2025";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gemini-2.5-flash-lite should support thinking options", () => {
      type Model = "gemini-2.5-flash-lite";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gemini-2.5-flash-lite-preview-09-2025 should support thinking options", () => {
      type Model = "gemini-2.5-flash-lite-preview-09-2025";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should have thinking options
      expectTypeOf<Options>().toExtend<GeminiThinkingOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Models WITHOUT thinking support", () => {
    it("gemini-2.0-flash should NOT have thinking options in type definition", () => {
      type Model = "gemini-2.0-flash";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should NOT have thinking options - verify it's not assignable
      // GeminiThinkingOptions has generationConfig.thinkingConfig which should not exist
      expectTypeOf<Options>().not.toExtend<
        GeminiThinkingOptions
      >();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify specific properties exist for structured output
      expectTypeOf<Options>().toHaveProperty("responseMimeType");
      expectTypeOf<Options>().toHaveProperty("responseSchema");
    });

    it("gemini-2.0-flash-lite should NOT have thinking options in type definition", () => {
      type Model = "gemini-2.0-flash-lite";
      type Options = GeminiChatModelProviderOptionsByName[Model];

      // Should NOT have thinking options
      expectTypeOf<Options>().not.toExtend<
        GeminiThinkingOptions
      >();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<GeminiStructuredOutputOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Provider options type completeness", () => {
    it("GeminiChatModelProviderOptionsByName should have entries for all chat models", () => {
      // Verify the type map has all expected model keys
      type Keys = keyof GeminiChatModelProviderOptionsByName;

      expectTypeOf<"gemini-3-pro-preview">().toExtend<Keys>();
      expectTypeOf<"gemini-2.5-pro">().toExtend<Keys>();
      expectTypeOf<"gemini-2.5-flash">().toExtend<Keys>();
      expectTypeOf<"gemini-2.5-flash-preview-09-2025">().toExtend<Keys>();
      expectTypeOf<"gemini-2.5-flash-lite">().toExtend<Keys>();
      expectTypeOf<"gemini-2.5-flash-lite-preview-09-2025">().toExtend<Keys>();
      expectTypeOf<"gemini-2.0-flash">().toExtend<Keys>();
      expectTypeOf<"gemini-2.0-flash-lite">().toExtend<Keys>();
    });
  });

  describe("Detailed property type assertions", () => {
    it("thinking models should allow thinkingConfig in generationConfig", () => {
      type Options = GeminiChatModelProviderOptionsByName["gemini-2.5-pro"];

      // The generationConfig should include thinkingConfig from GeminiGenerationConfigOptions
      // which intersects with GeminiThinkingOptions
      expectTypeOf<Options>().toHaveProperty("generationConfig");
    });

    it("structured output options should have responseMimeType and responseSchema", () => {
      type Options = GeminiChatModelProviderOptionsByName["gemini-2.0-flash"];

      expectTypeOf<Options>().toHaveProperty("responseMimeType");
      expectTypeOf<Options>().toHaveProperty("responseSchema");
      expectTypeOf<Options>().toHaveProperty("responseJsonSchema");
    });

    it("all models should have safety settings", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-3-pro-preview"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-pro"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-preview-09-2025"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite-preview-09-2025"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash"]>().toHaveProperty("safetySettings");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash-lite"]>().toHaveProperty("safetySettings");
    });

    it("all models should have tool config", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-3-pro-preview"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-pro"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-preview-09-2025"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite-preview-09-2025"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash"]>().toHaveProperty("toolConfig");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash-lite"]>().toHaveProperty("toolConfig");
    });

    it("all models should have cached content option", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-3-pro-preview"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-pro"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-preview-09-2025"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite-preview-09-2025"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash"]>().toHaveProperty("cachedContent");
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash-lite"]>().toHaveProperty("cachedContent");
    });
  });

  describe("Type discrimination between model categories", () => {
    it("models with thinking should extend GeminiThinkingOptions", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-3-pro-preview"]>().toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-pro"]>().toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash"]>().toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-preview-09-2025"]>().toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite"]>().toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite-preview-09-2025"]>().toExtend<GeminiThinkingOptions>();
    });

    it("models without thinking should NOT extend GeminiThinkingOptions", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash"]>().not.toExtend<GeminiThinkingOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash-lite"]>().not.toExtend<GeminiThinkingOptions>();
    });

    it("all models should extend GeminiStructuredOutputOptions", () => {
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-3-pro-preview"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-pro"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-preview-09-2025"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.5-flash-lite-preview-09-2025"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash"]>().toExtend<GeminiStructuredOutputOptions>();
      expectTypeOf<GeminiChatModelProviderOptionsByName["gemini-2.0-flash-lite"]>().toExtend<GeminiStructuredOutputOptions>();
    });
  });
});
