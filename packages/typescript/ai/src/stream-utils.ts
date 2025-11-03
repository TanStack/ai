import type { ChatCompletionChunk, StreamChunk } from "./types";

/**
 * Converts ChatCompletionChunk stream to StreamChunk format
 * This is a helper for adapters using the simpler ChatCompletionChunk format
 */
export async function* convertChatCompletionStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  _model: string
): AsyncIterable<StreamChunk> {
  let accumulatedContent = "";
  const timestamp = Date.now();

  for await (const chunk of stream) {
    if (chunk.content) {
      accumulatedContent += chunk.content;
      yield {
        type: "content",
        id: chunk.id,
        model: chunk.model,
        timestamp,
        delta: chunk.content,
        content: accumulatedContent,
        role: chunk.role,
      };
    }

    if (chunk.finishReason) {
      yield {
        type: "done",
        id: chunk.id,
        model: chunk.model,
        timestamp,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
      };
    }
  }
}
