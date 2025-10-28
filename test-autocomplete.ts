// Test file to verify autocomplete works correctly
import { aiMultiple } from "./packages/ai/src/ai";
import { createOpenAI } from "./packages/ai-openai/src/openai-adapter";
import { createOllama } from "./packages/ai-ollama/src/ollama-adapter";
import { createAnthropic } from "./packages/ai-anthropic/src/anthropic-adapter";

// Test multiple adapters with const generic
const testAI = aiMultiple({
  adapters: {
    openai: createOpenAI("test-key"),
    ollama: createOllama(),
    anthropic: createAnthropic("test-key"),
  },
});

// This should autocomplete: adapter should be "openai" | "ollama" | "anthropic"
// And model should be type-safe based on the selected adapter
testAI.chat({
  adapter: "openai", // <-- Should autocomplete: "openai" | "ollama" | "anthropic"
  model: "gpt-4", // <-- Should show models for openai
  messages: [{ role: "user", content: "test" }],
});

// Test with different adapter
testAI.chat({
  adapter: "ollama", // <-- Should autocomplete
  model: "llama2", // <-- Should show models for ollama
  messages: [{ role: "user", content: "test" }],
});

// Test with anthropic
testAI.chat({
  adapter: "anthropic", // <-- Should autocomplete
  model: "claude-3-opus-20240229", // <-- Should show models for anthropic
  messages: [{ role: "user", content: "test" }],
});
