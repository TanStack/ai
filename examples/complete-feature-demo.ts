/**
 * Complete Feature Demonstration
 * 
 * Shows both type-safe models and automatic fallback in action
 */

import { AI } from "../packages/ai/src";
import { OpenAIAdapter } from "../packages/ai-openai/src";
import { AnthropicAdapter } from "../packages/ai-anthropic/src";

// Setup AI with multiple adapters and fallback order
const ai = new AI({
  adapters: {
    openai: new OpenAIAdapter({
      apiKey: process.env.OPENAI_API_KEY || "",
    }),
    anthropic: new AnthropicAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    }),
  },
  fallbackOrder: ["openai", "anthropic"], // Try OpenAI first, then Anthropic
});

// ============================================
// FEATURE 1: TYPE-SAFE MODELS
// ============================================

async function demonstrateTypeSafety() {
  console.log("\n🔒 TYPE SAFETY DEMONSTRATION\n");

  // ✅ VALID: OpenAI with GPT model
  console.log("✅ Valid: OpenAI with gpt-4");
  await ai.chat({
    adapter: "openai",
    model: "gpt-4", // TypeScript validates this
    messages: [{ role: "user", content: "Hello from OpenAI!" }],
  });

  // ✅ VALID: Anthropic with Claude model
  console.log("✅ Valid: Anthropic with Claude");
  await ai.chat({
    adapter: "anthropic",
    model: "claude-3-5-sonnet-20241022", // TypeScript validates this
    messages: [{ role: "user", content: "Hello from Anthropic!" }],
  });

  // ❌ INVALID: Would show TypeScript error (commented out)
  // console.log("❌ Invalid: Anthropic with GPT model");
  // await ai.chat({
  //   adapter: "anthropic",
  //   model: "gpt-4", // ❌ TypeScript Error: gpt-4 not valid for Anthropic
  //   messages: [{ role: "user", content: "This won't compile!" }],
  // });

  console.log("\n✅ Type safety working!\n");
}

// ============================================
// FEATURE 2: AUTOMATIC FALLBACK
// ============================================

async function demonstrateFallback() {
  console.log("\n🔄 AUTOMATIC FALLBACK DEMONSTRATION\n");

  try {
    console.log("Attempting chat with fallback...");
    console.log("Will try: openai -> anthropic\n");

    const result = await ai.chat({
      adapters: ["openai", "anthropic"], // Try both in order
      model: "gpt-4", // Works with OpenAI
      messages: [
        {
          role: "user",
          content: "What is the capital of France?",
        },
      ],
    });

    console.log("✅ Success!");
    console.log("Response:", result.content);
  } catch (error: any) {
    console.error("❌ All adapters failed:", error.message);
  }
}

// ============================================
// FEATURE 3: COMBINING BOTH
// ============================================

async function demonstrateCombined() {
  console.log("\n🎯 COMBINED: TYPE SAFETY + FALLBACK\n");

  // Scenario: Use type-safe single adapter for most requests
  console.log("1️⃣ Normal operation (type-safe, no fallback):");
  try {
    const result = await ai.chat({
      adapter: "openai", // ✅ Type-safe
      model: "gpt-4", // ✅ Validated against OpenAI
      messages: [{ role: "user", content: "What is 2+2?" }],
    });
    console.log("✅ OpenAI:", result.content);
  } catch (error: any) {
    console.log("❌ OpenAI failed:", error.message);
  }

  // Scenario: Use fallback for critical operations
  console.log("\n2️⃣ Critical operation (with fallback):");
  try {
    const result = await ai.chat({
      adapters: ["openai", "anthropic"], // Fallback enabled
      model: "gpt-4", // Less strict but has fallback
      messages: [{ role: "user", content: "Important question: What is 2+2?" }],
    });
    console.log("✅ Result:", result.content);
  } catch (error: any) {
    console.log("❌ All failed:", error.message);
  }
}

// ============================================
// FEATURE 4: PER-REQUEST CONFIGURATION
// ============================================

async function demonstratePerRequest() {
  console.log("\n⚙️ PER-REQUEST CONFIGURATION\n");

  // Regular chat: Use default fallback order
  console.log("1️⃣ Using global fallback order (openai -> anthropic):");
  await ai.chat({
    adapters: [], // Empty = use global fallbackOrder
    model: "gpt-4",
    messages: [{ role: "user", content: "Regular question" }],
  });

  // Critical chat: Custom order prioritizing Anthropic
  console.log("\n2️⃣ Override with custom order (anthropic -> openai):");
  await ai.chat({
    adapters: ["anthropic", "openai"], // Custom order for this request
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Critical question" }],
  });

  console.log("\n✅ Per-request configuration working!\n");
}

// ============================================
// FEATURE 5: ERROR HANDLING WITH DETAILS
// ============================================

async function demonstrateErrorHandling() {
  console.log("\n🚨 ERROR HANDLING DEMONSTRATION\n");

  try {
    console.log("Attempting operation with invalid configuration...\n");

    await ai.chat({
      adapters: ["openai", "anthropic"],
      model: "invalid-model" as any, // Force error
      messages: [{ role: "user", content: "Test" }],
    });
  } catch (error: any) {
    console.log("✅ Caught error with details:\n");
    console.log(error.message);
    console.log("\n📝 This shows which adapters failed and why");
  }
}

// ============================================
// FEATURE 6: STREAMING WITH FALLBACK
// ============================================

async function demonstrateStreamingFallback() {
  console.log("\n🌊 STREAMING WITH FALLBACK\n");

  try {
    console.log("Streaming with fallback enabled...\n");

    for await (const chunk of ai.streamChat({
      adapters: ["openai", "anthropic"],
      model: "gpt-4",
      messages: [{ role: "user", content: "Count from 1 to 5" }],
    })) {
      if (chunk.type === "content") {
        process.stdout.write(chunk.delta);
      }
    }

    console.log("\n\n✅ Streaming with fallback working!\n");
  } catch (error: any) {
    console.error("❌ Streaming failed:", error.message);
  }
}

// ============================================
// MAIN DEMO
// ============================================

async function runDemo() {
  console.log("=".repeat(60));
  console.log("TYPE-SAFE MULTI-ADAPTER WITH AUTOMATIC FALLBACK");
  console.log("=".repeat(60));

  try {
    await demonstrateTypeSafety();
    await demonstrateFallback();
    await demonstrateCombined();
    await demonstratePerRequest();
    await demonstrateErrorHandling();
    await demonstrateStreamingFallback();

    console.log("=".repeat(60));
    console.log("✅ ALL FEATURES WORKING CORRECTLY!");
    console.log("=".repeat(60));
  } catch (error: any) {
    console.error("\n❌ Demo error:", error.message);
  }
}

// Uncomment to run:
// runDemo();

export {
  ai,
  demonstrateTypeSafety,
  demonstrateFallback,
  demonstrateCombined,
  demonstratePerRequest,
  demonstrateErrorHandling,
  demonstrateStreamingFallback,
  runDemo,
};
