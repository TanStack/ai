import type { AIAdapter, ChatCompletionOptions, StreamChunk } from "@tanstack/ai";
import { stubLLM } from "./stub-llm";

/**
 * Stub adapter for testing without using real LLM tokens
 * Returns canned tool call responses based on user input
 */
export function stubAdapter(): AIAdapter<
  string,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
> {
  return {
    name: "stub",
    async *chatStream(options: ChatCompletionOptions): AsyncIterable<StreamChunk> {
      // Use stub LLM instead of real API
      yield* stubLLM(options.messages);
    },
  } as any;
}

