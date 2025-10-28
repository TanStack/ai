/**
 * Example demonstrating endpoint-specific models and provider options
 * 
 * This example shows how the SDK now provides type-safe suggestions based on:
 * 1. Which endpoint you're calling (chat, image, embed)
 * 2. Which models support that endpoint
 * 3. What provider options are available for that endpoint
 */

import { AI } from "@tanstack/ai";
import { OpenAIAdapter } from "@tanstack/ai-openai";

// Create OpenAI adapter with API key
const openAiAdapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Create AI instance
const ai = new AI({
  adapters: {
    openai: openAiAdapter,
  },
});

// ============================================================================
// CHAT ENDPOINT - Only chat models are suggested
// ============================================================================
async function chatExample() {
  const response = await ai.chat({
    adapter: "openai",
    // ✅ Only chat models are suggested: gpt-5, gpt-4, gpt-4o, o3, etc.
    // ❌ Image models (dall-e-3, gpt-image-1) are NOT suggested
    // ❌ Embedding models (text-embedding-3-large) are NOT suggested
    model: "gpt-5",
    messages: [{ role: "user", content: "Hello!" }],

    // providerOptions is typed specifically for CHAT endpoint
    providerOptions: {
      // ✅ Chat-specific options are available:
      reasoningEffort: "high",        // For o3/reasoning models
      parallelToolCalls: true,        // Enable parallel tool execution
      store: true,                    // Store for later retrieval
      maxCompletionTokens: 1000,      // Token limit
      logprobs: true,                 // Return log probabilities

      // ❌ Image-specific options are NOT available:
      // quality: "hd",               // TypeScript error!
      // style: "vivid",              // TypeScript error!
    },
  });

  console.log(response);
}

// ============================================================================
// IMAGE ENDPOINT - Only image models are suggested
// ============================================================================
async function imageExample() {
  const result = await ai.image({
    adapter: "openai",
    // ✅ Only image models are suggested: gpt-image-1, gpt-image-1-mini, dall-e-3, dall-e-2
    // ❌ Chat models (gpt-5, gpt-4o) are NOT suggested
    // ❌ Embedding models are NOT suggested
    model: "gpt-image-1",
    prompt: "A futuristic city with flying cars",

    // providerOptions is typed specifically for IMAGE endpoint
    providerOptions: {
      // ✅ Image-specific options are available:
      quality: "hd",                  // Image quality (gpt-image-1, dall-e-3)
      style: "vivid",                 // Image style (dall-e-3)
      background: "transparent",      // Transparent background (gpt-image-1)
      outputFormat: "png",            // Output format (gpt-image-1)
      seed: 12345,                    // Reproducibility seed

      // ❌ Chat-specific options are NOT available:
      // reasoningEffort: "high",     // TypeScript error!
      // parallelToolCalls: true,     // TypeScript error!
    },
  });

  console.log(result);
}

// ============================================================================
// EMBEDDING ENDPOINT - Only embedding models are suggested (future work)
// ============================================================================
async function embeddingExample() {
  const result = await ai.embed({
    adapter: "openai",
    // When embeddings are fully typed, only embedding models will be suggested:
    // ✅ text-embedding-3-large, text-embedding-3-small, text-embedding-ada-002
    // ❌ Chat models (gpt-5) are NOT suggested
    // ❌ Image models (dall-e-3) are NOT suggested
    model: "text-embedding-3-large",
    input: "Hello, world!",

    // In the future, providerOptions will be typed for EMBEDDING endpoint:
    // providerOptions: {
    //   encodingFormat: "float",     // Encoding format
    //   dimensions: 1536,            // Number of dimensions (text-embedding-3 only)
    // }
  });

  console.log(result);
}

// ============================================================================
// TYPE ERRORS DEMONSTRATION
// ============================================================================
async function typeErrorExamples() {
  // ERROR 1: Using image model for chat
  // @ts-expect-error - "dall-e-3" is not a valid chat model
  await ai.chat({
    adapter: "openai",
    model: "dall-e-3",  // ❌ TypeScript error: dall-e-3 is for images only!
    messages: [{ role: "user", content: "Hello" }],
  });

  // ERROR 2: Using chat model for image generation
  // @ts-expect-error - "gpt-5" is not a valid image model
  await ai.image({
    adapter: "openai",
    model: "gpt-5",  // ❌ TypeScript error: gpt-5 is for chat only!
    prompt: "A landscape",
  });

  // ERROR 3: Using image options for chat
  await ai.chat({
    adapter: "openai",
    model: "gpt-5",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      // @ts-expect-error - quality is not available for chat
      quality: "hd",  // ❌ TypeScript error: quality is for images only!
    },
  });

  // ERROR 4: Using chat options for image
  await ai.image({
    adapter: "openai",
    model: "gpt-image-1",
    prompt: "A sunset",
    providerOptions: {
      // @ts-expect-error - reasoningEffort is not available for images
      reasoningEffort: "high",  // ❌ TypeScript error: reasoningEffort is for chat only!
    },
  });
}

// Run examples
if (require.main === module) {
  console.log("=== Chat Example ===");
  chatExample().catch(console.error);

  console.log("\n=== Image Example ===");
  imageExample().catch(console.error);

  console.log("\n=== Embedding Example ===");
  embeddingExample().catch(console.error);
}

export { chatExample, imageExample, embeddingExample, typeErrorExamples };
