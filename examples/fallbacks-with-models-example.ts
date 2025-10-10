/**
 * Example: Adapter Fallbacks with Model Configuration
 * 
 * This example demonstrates the new fallback API where each fallback
 * specifies both the adapter name AND the model to use with that adapter.
 */

import { AI } from "../packages/ai/src";
import { OpenAIAdapter } from "../packages/ai-openai/src";
import { AnthropicAdapter } from "../packages/ai-anthropic/src";

// Create AI instance with adapters
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY!,
    }),
    anthropic: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    }),
  },
  // Global fallback configuration
  fallbacks: [
    { adapter: "openai", model: "gpt-4" },
    { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
  ],
});

async function demonstrateGlobalFallbacks() {
  console.log("\n--- Global Fallback Configuration ---");
  console.log("Using fallbacks from constructor...\n");

  try {
    // Will use global fallbacks: first tries OpenAI with gpt-4,
    // if that fails, tries Anthropic with claude-3-5-sonnet
    const result = await ai.chat({
      fallbacks: [], // Empty array triggers use of global fallbacks
      messages: [
        {
          role: "user",
          content: "Say hello!",
        },
      ],
    });

    console.log("Response:", result.content);
  } catch (error: any) {
    console.error("All adapters failed:", error.message);
  }
}

async function demonstratePerRequestFallbacks() {
  console.log("\n--- Per-Request Fallback Configuration ---");
  console.log("Overriding global fallbacks for this request...\n");

  try {
    // Override global fallbacks for this specific request
    // Try Anthropic's faster model first, then fall back to OpenAI
    const result = await ai.chat({
      fallbacks: [
        { adapter: "anthropic", model: "claude-3-haiku-20240307" },
        { adapter: "openai", model: "gpt-3.5-turbo" },
      ],
      messages: [
        {
          role: "user",
          content: "What's 2+2?",
        },
      ],
    });

    console.log("Response:", result.content);
  } catch (error: any) {
    console.error("All adapters failed:", error.message);
  }
}

async function demonstrateSingleAdapter() {
  console.log("\n--- Single Adapter Mode (No Fallback) ---");
  console.log("Using single adapter with specific model...\n");

  try {
    // Single adapter mode - no fallback, full type safety
    const result = await ai.chat({
      adapter: "openai",
      model: "gpt-4o", // Type-safe! Only OpenAI models allowed here
      messages: [
        {
          role: "user",
          content: "Tell me a joke",
        },
      ],
    });

    console.log("Response:", result.content);
  } catch (error: any) {
    console.error("Request failed:", error.message);
  }
}

async function demonstrateStreamingWithFallbacks() {
  console.log("\n--- Streaming with Fallbacks ---");
  console.log("Streaming with fallback configuration...\n");

  try {
    let fullResponse = "";

    for await (const chunk of ai.streamChat({
      fallbacks: [
        { adapter: "openai", model: "gpt-4" },
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
      messages: [
        {
          role: "user",
          content: "Count to 5",
        },
      ],
    })) {
      if (chunk.type === "content" && chunk.delta) {
        process.stdout.write(chunk.delta);
        fullResponse += chunk.delta;
      }
    }

    console.log("\n\nFull response:", fullResponse);
  } catch (error: any) {
    console.error("All adapters failed:", error.message);
  }
}

async function demonstrateDifferentModelsPerAdapter() {
  console.log("\n--- Different Models Per Adapter ---");
  console.log("Each fallback can specify its own model...\n");

  try {
    // First try OpenAI's latest model
    // If it fails (rate limit, etc.), try Anthropic's budget model
    // If that fails too, try OpenAI's cheaper model
    const result = await ai.chat({
      fallbacks: [
        { adapter: "openai", model: "gpt-4o" },
        { adapter: "anthropic", model: "claude-3-haiku-20240307" },
        { adapter: "openai", model: "gpt-3.5-turbo" },
      ],
      messages: [
        {
          role: "user",
          content: "Explain quantum computing in one sentence.",
        },
      ],
    });

    console.log("Response:", result.content);
  } catch (error: any) {
    console.error("All fallbacks failed:", error.message);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Adapter Fallbacks with Model Configuration");
  console.log("=".repeat(60));

  await demonstrateSingleAdapter();
  await demonstrateGlobalFallbacks();
  await demonstratePerRequestFallbacks();
  await demonstrateStreamingWithFallbacks();
  await demonstrateDifferentModelsPerAdapter();

  console.log("\n" + "=".repeat(60));
  console.log("Examples complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
