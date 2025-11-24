// Test file to verify standalone functions have per-model type safety on providerOptions
import { chat, chatCompletion } from "./standalone-functions";
import { AIAdapter } from "./types";
import type { OpenAIChatModelProviderOptionsByName } from "../../ai-openai/src/model-meta";

// Mock OpenAI adapter type for testing
type TestOpenAIAdapter = AIAdapter<
  ["gpt-4-turbo", "gpt-5"], // chat models
  string[], // embedding models
  any, // chat provider options
  any, // embedding provider options
  OpenAIChatModelProviderOptionsByName // model-specific provider options
>;

const openai = {} as TestOpenAIAdapter;

// Test 1: "gpt-4-turbo" should NOT allow 'text' field (no structured output support)
async function testGpt4Turbo() {
  const stream = chat({
    adapter: openai,
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      // @ts-expect-error - 'text' should not exist for gpt-4-turbo
      text: "should error",
    },
  });

  // Test chatCompletion too
  const result = await chatCompletion({
    adapter: openai,
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      // @ts-expect-error - 'text' should not exist for gpt-4-turbo
      text: "should error",
    },
  });
}

// Test 2: "gpt-5" SHOULD allow 'text' field (has structured output support)
async function testGpt5() {
  const stream = chat({
    adapter: openai,
    model: "gpt-5",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      text: "should work", // No error expected
    },
  });

  // Test chatCompletion too
  const result = await chatCompletion({
    adapter: openai,
    model: "gpt-5",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      text: "should work", // No error expected
    },
  });
}

// Test 3: Verify other options work for both models
async function testCommonOptions() {
  const stream1 = chat({
    adapter: openai,
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      temperature: 0.7,
      maxTokens: 100,
    },
  });

  const stream2 = chat({
    adapter: openai,
    model: "gpt-5",
    messages: [{ role: "user", content: "Hello" }],
    providerOptions: {
      temperature: 0.7,
      maxTokens: 100,
    },
  });
}
