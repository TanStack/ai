import { describe, it, expectTypeOf } from "vitest";
import type {
  OpenAIChatModelProviderOptionsByName,
} from "../src/model-meta";
import type {
  OpenAIBaseOptions,
  OpenAIReasoningOptions,
  OpenAIStructuredOutputOptions,
  OpenAIToolsOptions,
  OpenAIStreamingOptions,
  OpenAIMetadataOptions,
} from "../src/text/text-provider-options";

/**
 * Type assertion tests for OpenAI model provider options.
 * 
 * These tests verify that:
 * 1. Models with reasoning support have OpenAIReasoningOptions in their provider options
 * 2. Models without reasoning support do NOT have OpenAIReasoningOptions
 * 3. Models with structured output support have OpenAIStructuredOutputOptions
 * 4. Models without structured output support do NOT have OpenAIStructuredOutputOptions
 * 5. Models with tools support have OpenAIToolsOptions
 * 6. All chat models have base options (OpenAIBaseOptions, OpenAIMetadataOptions)
 */

// Base options that ALL chat models should have
type BaseOptions = OpenAIBaseOptions & OpenAIMetadataOptions;

// Full featured model options (reasoning + structured output + tools + streaming)
type FullFeaturedOptions = BaseOptions &
  OpenAIReasoningOptions &
  OpenAIStructuredOutputOptions &
  OpenAIToolsOptions &
  OpenAIStreamingOptions;

// Standard model options (structured output + tools + streaming, no reasoning)
type StandardOptions = BaseOptions &
  OpenAIStructuredOutputOptions &
  OpenAIToolsOptions &
  OpenAIStreamingOptions;

// Reasoning-only model options (reasoning but no tools/structured output streaming)
type ReasoningOnlyOptions = BaseOptions & OpenAIReasoningOptions;

describe("OpenAI Chat Model Provider Options Type Assertions", () => {
  describe("Models WITH reasoning AND structured output AND tools support (Full Featured)", () => {
    it("gpt-5.1 should support all features", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5.1"];

      // Should have reasoning options
      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();

      // Should have tools options
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();

      // Should have streaming options
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();

      // Verify specific properties exist
      expectTypeOf<Options>().toHaveProperty("reasoning");
      expectTypeOf<Options>().toHaveProperty("text");
      expectTypeOf<Options>().toHaveProperty("tool_choice");
      expectTypeOf<Options>().toHaveProperty("stream_options");
      expectTypeOf<Options>().toHaveProperty("metadata");
      expectTypeOf<Options>().toHaveProperty("store");
    });

    it("gpt-5.1-codex should support all features", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5.1-codex"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-5 should support all features", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-5-pro should support all features", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5-pro"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Models WITH structured output AND tools but WITHOUT reasoning (Standard)", () => {
    it("gpt-5-mini should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5-mini"];

      // Should NOT have reasoning options
      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();

      // Should have structured output options
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();

      // Should have tools options
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();

      // Should have streaming options
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-5-nano should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5-nano"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-5-codex should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5-codex"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4.1 should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4.1"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4.1-mini should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4.1-mini"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4.1-nano should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4.1-nano"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o-mini should have structured output and tools but NOT reasoning", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o-mini"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Models WITH reasoning but LIMITED other features (Reasoning Models)", () => {
    it("o3 should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o3"];

      // Should have reasoning options
      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();

      // Should NOT have structured output options
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();

      // Should NOT have tools options
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();

      // Should NOT have streaming options
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();

      // Should have base options
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o3-pro should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o3-pro"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o3-mini should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o3-mini"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o4-mini should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o4-mini"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o3-deep-research should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o3-deep-research"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o4-mini-deep-research should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o4-mini-deep-research"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o1 should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o1"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("o1-pro should have reasoning but NOT structured output or tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["o1-pro"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Models WITH tools but WITHOUT structured output or reasoning (Legacy Models)", () => {
    it("gpt-4 should have tools and streaming but NOT reasoning or structured output", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4-turbo should have tools and streaming but NOT reasoning or structured output", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4-turbo"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-3.5-turbo should have tools and streaming but NOT reasoning or structured output", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Models WITH minimal features (Basic Models)", () => {
    it("chatgpt-4.0 should only have streaming and base options", () => {
      type Options = OpenAIChatModelProviderOptionsByName["chatgpt-4.0"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-audio should only have streaming and base options", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-audio"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-audio-mini should only have streaming and base options", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-audio-mini"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o-audio should only have streaming and base options", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o-audio"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o-mini-audio should only have streaming and base options", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o-mini-audio"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Chat-only models WITH reasoning AND structured output but WITHOUT tools", () => {
    it("gpt-5.1-chat should have reasoning and structured output but NOT tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5.1-chat"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-5-chat should have reasoning and structured output but NOT tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5-chat"];

      expectTypeOf<Options>().toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Codex/Preview models", () => {
    it("gpt-5.1-codex-mini should have structured output and tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-5.1-codex-mini"];

      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("codex-mini-latest should have structured output and tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["codex-mini-latest"];

      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o-search-preview should have structured output and tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o-search-preview"];

      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("gpt-4o-mini-search-preview should have structured output and tools", () => {
      type Options = OpenAIChatModelProviderOptionsByName["gpt-4o-mini-search-preview"];

      expectTypeOf<Options>().toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });

    it("computer-use-preview should have tools but NOT structured output", () => {
      type Options = OpenAIChatModelProviderOptionsByName["computer-use-preview"];

      expectTypeOf<Options>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<Options>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<Options>().toExtend<OpenAIToolsOptions>();
      expectTypeOf<Options>().toExtend<OpenAIStreamingOptions>();
      expectTypeOf<Options>().toExtend<BaseOptions>();
    });
  });

  describe("Provider options type completeness", () => {
    it("OpenAIChatModelProviderOptionsByName should have entries for all chat models", () => {
      type Keys = keyof OpenAIChatModelProviderOptionsByName;

      // Full featured models
      expectTypeOf<"gpt-5.1">().toExtend<Keys>();
      expectTypeOf<"gpt-5.1-codex">().toExtend<Keys>();
      expectTypeOf<"gpt-5">().toExtend<Keys>();
      expectTypeOf<"gpt-5-pro">().toExtend<Keys>();

      // Standard models (structured output + tools, no reasoning)
      expectTypeOf<"gpt-5-mini">().toExtend<Keys>();
      expectTypeOf<"gpt-5-nano">().toExtend<Keys>();
      expectTypeOf<"gpt-5-codex">().toExtend<Keys>();
      expectTypeOf<"gpt-4.1">().toExtend<Keys>();
      expectTypeOf<"gpt-4.1-mini">().toExtend<Keys>();
      expectTypeOf<"gpt-4.1-nano">().toExtend<Keys>();
      expectTypeOf<"gpt-4o">().toExtend<Keys>();
      expectTypeOf<"gpt-4o-mini">().toExtend<Keys>();

      // Reasoning-only models
      expectTypeOf<"o3">().toExtend<Keys>();
      expectTypeOf<"o3-pro">().toExtend<Keys>();
      expectTypeOf<"o3-mini">().toExtend<Keys>();
      expectTypeOf<"o4-mini">().toExtend<Keys>();
      expectTypeOf<"o3-deep-research">().toExtend<Keys>();
      expectTypeOf<"o4-mini-deep-research">().toExtend<Keys>();
      expectTypeOf<"o1">().toExtend<Keys>();
      expectTypeOf<"o1-pro">().toExtend<Keys>();

      // Legacy models
      expectTypeOf<"gpt-4">().toExtend<Keys>();
      expectTypeOf<"gpt-4-turbo">().toExtend<Keys>();
      expectTypeOf<"gpt-3.5-turbo">().toExtend<Keys>();

      // Basic models
      expectTypeOf<"chatgpt-4.0">().toExtend<Keys>();
      expectTypeOf<"gpt-audio">().toExtend<Keys>();
      expectTypeOf<"gpt-audio-mini">().toExtend<Keys>();
      expectTypeOf<"gpt-4o-audio">().toExtend<Keys>();
      expectTypeOf<"gpt-4o-mini-audio">().toExtend<Keys>();

      // Chat-only models
      expectTypeOf<"gpt-5.1-chat">().toExtend<Keys>();
      expectTypeOf<"gpt-5-chat">().toExtend<Keys>();

      // Codex/Preview models
      expectTypeOf<"gpt-5.1-codex-mini">().toExtend<Keys>();
      expectTypeOf<"codex-mini-latest">().toExtend<Keys>();
      expectTypeOf<"gpt-4o-search-preview">().toExtend<Keys>();
      expectTypeOf<"gpt-4o-mini-search-preview">().toExtend<Keys>();
      expectTypeOf<"computer-use-preview">().toExtend<Keys>();
    });
  });

  describe("Detailed property type assertions", () => {
    it("all models should have metadata option", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"]>().toHaveProperty("metadata");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["chatgpt-4.0"]>().toHaveProperty("metadata");
    });

    it("all models should have store option", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"]>().toHaveProperty("store");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["chatgpt-4.0"]>().toHaveProperty("store");
    });

    it("all models should have service_tier option", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"]>().toHaveProperty("service_tier");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["chatgpt-4.0"]>().toHaveProperty("service_tier");
    });

    it("models with tools support should have tool_choice and parallel_tool_calls", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("parallel_tool_calls");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toHaveProperty("tool_choice");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"]>().toHaveProperty("tool_choice");
    });

    it("models with structured output should have text option", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1-chat"]>().toHaveProperty("text");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-chat"]>().toHaveProperty("text");
    });

    it("models with streaming should have stream_options", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toHaveProperty("stream_options");
      expectTypeOf<OpenAIChatModelProviderOptionsByName["chatgpt-4.0"]>().toHaveProperty("stream_options");
    });
  });

  describe("Type discrimination between model categories", () => {
    it("full featured models should extend all options", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toExtend<FullFeaturedOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1-codex"]>().toExtend<FullFeaturedOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toExtend<FullFeaturedOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-pro"]>().toExtend<FullFeaturedOptions>();
    });

    it("standard models should NOT extend reasoning options but should extend structured output and tools", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toExtend<StandardOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-nano"]>().toExtend<StandardOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toExtend<StandardOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1-mini"]>().toExtend<StandardOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toExtend<StandardOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o-mini"]>().toExtend<StandardOptions>();

      // Verify these do NOT extend reasoning options (discrimination already tested above)
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().not.toExtend<OpenAIReasoningOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().not.toExtend<OpenAIReasoningOptions>();
    });

    it("reasoning-only models should extend reasoning options but NOT structured output or tools", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().toExtend<ReasoningOnlyOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3-pro"]>().toExtend<ReasoningOnlyOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3-mini"]>().toExtend<ReasoningOnlyOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o4-mini"]>().toExtend<ReasoningOnlyOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().toExtend<ReasoningOnlyOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1-pro"]>().toExtend<ReasoningOnlyOptions>();

      // Verify these do NOT extend structured output or tools options
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().not.toExtend<OpenAIStructuredOutputOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().not.toExtend<OpenAIToolsOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().not.toExtend<OpenAIStructuredOutputOptions>();
    });

    it("all models should extend base options", () => {
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-mini"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4.1"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4o"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o3"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["o1"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-4"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-3.5-turbo"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["chatgpt-4.0"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5.1-chat"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["gpt-5-chat"]>().toExtend<BaseOptions>();
      expectTypeOf<OpenAIChatModelProviderOptionsByName["computer-use-preview"]>().toExtend<BaseOptions>();
    });
  });
});
