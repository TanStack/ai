/**
 * Type Safety Test
 * 
 * This file demonstrates that the discriminated union types work correctly.
 * When you select an adapter, TypeScript should only show models for that adapter.
 */

import { AI } from "../packages/ai/src";
import { OpenAIAdapter } from "../packages/ai-openai/src";
import { AnthropicAdapter } from "../packages/ai-anthropic/src";
import { GeminiAdapter } from "../packages/ai-gemini/src";

const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
    }),
    anthropic: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    }),
    gemini: new GeminiAdapter({
      apiKey: process.env.GEMINI_API_KEY!,
    }),
  },
});

async function testTypeSafety() {
  // ✓ Valid: OpenAI adapter with OpenAI model
  await ai.chat({
    adapter: "openai",
    model: "gpt-4", // TypeScript should autocomplete only OpenAI models here
    messages: [{ role: "user", content: "Hello" }],
  });

  // ✓ Valid: Anthropic adapter with Anthropic model
  await ai.chat({
    adapter: "anthropic",
    model: "claude-3-5-sonnet-20241022", // TypeScript should autocomplete only Anthropic models here
    messages: [{ role: "user", content: "Hello" }],
  });

  // ✓ Valid: Gemini adapter with Gemini model
  await ai.chat({
    adapter: "gemini",
    model: "gemini-1.5-pro", // TypeScript should autocomplete only Gemini models here
    messages: [{ role: "user", content: "Hello" }],
  });

  // ✗ INVALID: This should show a TypeScript error
  // Uncommenting this should cause a type error because claude-3 is not an OpenAI model
  /*
  await ai.chat({
    adapter: "openai",
    model: "claude-3-5-sonnet-20241022", // Type error!
    messages: [{ role: "user", content: "Hello" }],
  });
  */

  // ✓ Valid: Fallbacks with correct adapter-model pairs
  await ai.chat({
    adapter: "openai",
    model: "gpt-4",
    fallbacks: [
      { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" }, // ✓
      { adapter: "gemini", model: "gemini-1.5-pro" }, // ✓
    ],
    messages: [{ role: "user", content: "Hello" }],
  });

  // ✗ INVALID: This should show a TypeScript error in fallbacks
  // Uncommenting this should cause a type error
  /*
  await ai.chat({
    adapter: "openai",
    model: "gpt-4",
    fallbacks: [
      { adapter: "anthropic", model: "gpt-3.5-turbo" }, // Type error! gpt-3.5-turbo is not an Anthropic model
    ],
    messages: [{ role: "user", content: "Hello" }],
  });
  */

  // ✓ Valid: Fallback-only mode with correct adapter-model pairs
  await ai.chat({
    fallbacks: [
      { adapter: "openai", model: "gpt-4" },
      { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
      { adapter: "gemini", model: "gemini-1.5-pro" },
    ],
    messages: [{ role: "user", content: "Hello" }],
  });

  console.log("✓ All type-safe examples compiled successfully!");
}

// Test discriminated union - TypeScript should narrow the type based on adapter
function testDiscriminatedUnion(
  options:
    | { adapter: "openai"; model: "gpt-4" | "gpt-3.5-turbo" }
    | { adapter: "anthropic"; model: "claude-3-5-sonnet-20241022" | "claude-3-opus-20240229" }
) {
  if (options.adapter === "openai") {
    // TypeScript knows model is "gpt-4" | "gpt-3.5-turbo" here
    const model: "gpt-4" | "gpt-3.5-turbo" = options.model;
    console.log("OpenAI model:", model);
  } else {
    // TypeScript knows model is Anthropic models here
    const model: "claude-3-5-sonnet-20241022" | "claude-3-opus-20240229" = options.model;
    console.log("Anthropic model:", model);
  }
}

testTypeSafety().catch(console.error);
