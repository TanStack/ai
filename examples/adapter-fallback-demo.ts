/**
 * ADAPTER FALLBACK DEMONSTRATION
 * 
 * This example shows how to use the fallback feature to automatically
 * try multiple adapters in order when one fails (rate limits, errors, downtime).
 * 
 * NEW API: Each fallback now specifies both adapter name AND model
 * 
 * NOTE: This demo file has been updated to use the new fallbacks API.
 * For a complete example, see fallbacks-with-models-example.ts
 */

import { AI } from "../packages/ai/src";
import { OpenAIAdapter } from "../packages/ai-openai/src";
import { AnthropicAdapter } from "../packages/ai-anthropic/src";
import { OllamaAdapter } from "../packages/ai-ollama/src";

// ============================================
// EXAMPLE 1: Global Fallback Configuration in Constructor
// ============================================

const ai = new AI({
  adapters: {
    primary: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY || "",
    }),
    secondary: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    }),
    tertiary: new OllamaAdapter({
      host: "http://localhost:11434",
    }),
  },
  // Global fallback configuration - each specifies adapter AND model
  fallbacks: [
    { adapter: "primary", model: "gpt-4" },
    { adapter: "secondary", model: "claude-3-5-sonnet-20241022" },
    { adapter: "tertiary", model: "llama2" },
  ],
});

/**
 * Using global fallback configuration from constructor
 * If primary fails, tries secondary, then tertiary
 */
async function exampleGlobalFallback() {
  try {
    const result = await ai.chat({
      fallbacks: [], // Empty array means use global fallbacks
      messages: [
        {
          role: "user",
          content: "What is TypeScript?",
        },
      ],
    });

    console.log("✅ Success:", result.content);
  } catch (error: any) {
    console.error("❌ All fallbacks failed:", error.message);
  }
}

// ============================================
// EXAMPLE 2: Per-Request Fallback Override
// ============================================

/**
 * Override global fallback configuration for specific requests
 * This request will try: secondary -> primary -> tertiary
 */
async function exampleCustomFallback() {
  try {
    const result = await ai.chat({
      fallbacks: [
        { adapter: "secondary", model: "claude-3-haiku-20240307" }, // Try Anthropic first
        { adapter: "primary", model: "gpt-3.5-turbo" }, // Then OpenAI
        { adapter: "tertiary", model: "llama3" }, // Finally Ollama
      ],
      messages: [
        {
          role: "user",
          content: "Explain rate limiting",
        },
      ],
    });

    console.log("✅ Success:", result.content);
  } catch (error: any) {
    console.error("❌ All fallbacks failed:", error.message);
  }
}

// ============================================
// EXAMPLE 3: Single Adapter Mode (No Fallback)
// ============================================

/**
 * Use a specific adapter without fallback
 * If it fails, the error is thrown immediately
 */
async function exampleSingleAdapter() {
  try {
    const result = await ai.chat({
      adapter: "primary", // ✅ Type-safe: must be "primary" | "secondary" | "tertiary"
      model: "gpt-4", // ✅ Type-safe: must be valid for "primary" adapter
      messages: [
        {
          role: "user",
          content: "What is 2+2?",
        },
      ],
    });

    console.log("✅ Primary adapter success:", result.content);
  } catch (error: any) {
    console.error("❌ Primary adapter failed:", error.message);
  }
}

// ============================================
// EXAMPLE 4: Different Models Per Adapter
// ============================================

/**
 * Use different models optimized for each adapter
 */
async function exampleDifferentModelsPerAdapter() {
  try {
    const result = await ai.chat({
      fallbacks: [
        { adapter: "primary", model: "gpt-4o" }, // Latest OpenAI model
        { adapter: "secondary", model: "claude-3-5-sonnet-20241022" }, // Anthropic's best
        { adapter: "tertiary", model: "llama3" }, // Local fallback
      ],
      messages: [
        {
          role: "user",
          content: "Summarize the concept of machine learning",
        },
      ],
    });

    console.log("✅ Success:", result.content);
  } catch (error: any) {
    console.error("❌ All fallbacks failed:", error.message);
  }
}

// ============================================
// EXAMPLE 5: Type Safety Demo
// ============================================

/**
 * TypeScript enforces that models match their adapters
 */
function demonstrateTypeSafety() {
  // ✅ Valid - model matches adapter
  ai.chat({
    fallbacks: [
      { adapter: "primary", model: "gpt-4" }, // OpenAI model with OpenAI adapter
      { adapter: "secondary", model: "claude-3-5-sonnet-20241022" }, // Claude model with Anthropic adapter
    ],
    messages: [{ role: "user", content: "Hello" }],
  });

  // ❌ This would be a TypeScript error:
  // ai.chat({
  //   fallbacks: [
  //     { adapter: "primary", model: "claude-3-5-sonnet-20241022" }, // ERROR: Claude model with OpenAI adapter
  //   ],
  //   messages: [{ role: "user", content: "Hello" }],
  // });
}

// ============================================
// EXAMPLE 6: Without Global Fallbacks
// ============================================

const aiNoGlobalFallback = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY || "",
    }),
    anthropic: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    }),
  },
  // No global fallbacks configured
});

async function exampleWithoutGlobalFallback() {
  try {
    // Must provide fallbacks in each request
    const result = await aiNoGlobalFallback.chat({
      fallbacks: [
        { adapter: "openai", model: "gpt-4" },
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
      messages: [
        {
          role: "user",
          content: "What is AI?",
        },
      ],
    });

    console.log("✅ Success:", result.content);
  } catch (error: any) {
    console.error("❌ All fallbacks failed:", error.message);
  }
}

// ============================================
// RUN ALL EXAMPLES
// ============================================

async function main() {
  console.log("=".repeat(60));
  console.log("ADAPTER FALLBACK EXAMPLES");
  console.log("=".repeat(60));

  console.log("\n1. Global Fallback:");
  await exampleGlobalFallback();

  console.log("\n2. Custom Fallback Order:");
  await exampleCustomFallback();

  console.log("\n3. Single Adapter (No Fallback):");
  await exampleSingleAdapter();

  console.log("\n4. Different Models Per Adapter:");
  await exampleDifferentModelsPerAdapter();

  console.log("\n5. Type Safety:");
  demonstrateTypeSafety();

  console.log("\n6. Without Global Fallback:");
  await exampleWithoutGlobalFallback();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All examples complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
