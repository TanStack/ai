/**
 * Example: Single Adapter with Optional Fallbacks
 * 
 * This demonstrates the new behavior where you can specify a primary adapter+model
 * and provide optional fallbacks if the primary fails.
 */

import { AI } from "../packages/ai/src";
import { OpenAIAdapter } from "../packages/ai-openai/src";
import { AnthropicAdapter } from "../packages/ai-anthropic/src";
import { GeminiAdapter } from "../packages/ai-gemini/src";

// Create AI instance with multiple adapters
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

async function main() {
  console.log("=== Single Adapter with Optional Fallbacks Demo ===\n");

  // Example 1: Single adapter without fallbacks (original behavior)
  console.log("1. Single adapter only (no fallbacks):");
  try {
    const result1 = await ai.chat({
      adapter: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hello!" }],
    });
    console.log("✓ Response:", result1.content);
  } catch (error: any) {
    console.log("✗ Failed:", error.message);
  }
  console.log();

  // Example 2: Single adapter with fallbacks - if primary fails, try fallbacks
  console.log("2. Single adapter with fallbacks:");
  try {
    const result2 = await ai.chat({
      adapter: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hello!" }],
      // If OpenAI fails, try these fallbacks in order
      fallbacks: [
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
        { adapter: "gemini", model: "gemini-1.5-pro" },
      ],
    });
    console.log("✓ Response:", result2.content);
  } catch (error: any) {
    console.log("✗ All failed:", error.message);
  }
  console.log();

  // Example 3: Fallback-only mode (no primary adapter specified)
  console.log("3. Fallback-only mode:");
  try {
    const result3 = await ai.chat({
      fallbacks: [
        { adapter: "openai", model: "gpt-4" },
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
        { adapter: "gemini", model: "gemini-1.5-pro" },
      ],
      messages: [{ role: "user", content: "Say hello!" }],
    });
    console.log("✓ Response:", result3.content);
  } catch (error: any) {
    console.log("✗ All failed:", error.message);
  }
  console.log();

  // Example 4: Streaming with fallbacks
  console.log("4. Streaming with primary + fallbacks:");
  try {
    const chunks: string[] = [];
    for await (const chunk of ai.chatStream({
      adapter: "openai",
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Count to 5" }],
      fallbacks: [
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
    })) {
      chunks.push(chunk.content);
    }
    console.log("✓ Streamed response:", chunks.join(""));
  } catch (error: any) {
    console.log("✗ Failed:", error.message);
  }
  console.log();

  // Example 5: Text generation with fallbacks
  console.log("5. Text generation with fallbacks:");
  try {
    const result5 = await ai.generateText({
      adapter: "gemini",
      model: "gemini-1.5-flash",
      prompt: "Write a haiku about coding",
      fallbacks: [
        { adapter: "openai", model: "gpt-3.5-turbo" },
        { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
    });
    console.log("✓ Generated text:", result5.text);
  } catch (error: any) {
    console.log("✗ Failed:", error.message);
  }
  console.log();

  // Example 6: Global fallbacks from constructor
  console.log("6. Using global fallbacks from constructor:");
  const aiWithGlobalFallbacks = new AI({
    adapters: {
      openai: new OpenAIAdapter({
        apiKey: process.env.OPENAI_API_KEY!,
      }),
      anthropic: new AnthropicAdapter({
        apiKey: process.env.ANTHROPIC_API_KEY!,
      }),
    },
    // These fallbacks are used by default if no fallbacks are provided in options
    fallbacks: [
      { adapter: "openai", model: "gpt-3.5-turbo" },
      { adapter: "anthropic", model: "claude-3-5-sonnet-20241022" },
    ],
  });

  try {
    // This will use the global fallbacks if the primary adapter fails
    const result6 = await aiWithGlobalFallbacks.chat({
      adapter: "openai",
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hello!" }],
    });
    console.log("✓ Response:", result6.content);
  } catch (error: any) {
    console.log("✗ Failed:", error.message);
  }
}

main().catch(console.error);
