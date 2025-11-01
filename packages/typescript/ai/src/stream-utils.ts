import type { ChatCompletionChunk, StreamChunk } from "./types";

/**
 * Converts legacy ChatCompletionChunk stream to new StreamChunk format
 * This is a helper for adapters that haven't implemented the new streaming yet
 */
export async function* convertLegacyStream(
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
