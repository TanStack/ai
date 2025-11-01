import type { StreamChunk } from "@tanstack/ai";

/**
 * Represents an async iterable source of stream chunks
 */
export type StreamSource = AsyncIterable<StreamChunk>;

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Stream event types that can be emitted during streaming
 */
export type StreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_call"; index: number; toolCall: ToolCall }
  | { type: "error"; error: Error }
  | { type: "chunk"; chunk: StreamChunk };

/**
 * Callbacks for handling stream events
 */
export interface StreamEventHandlers {
  onContent?: (content: string) => void;
  onToolCall?: (index: number, toolCall: ToolCall) => void;
  onError?: (error: Error) => void;
  onChunk?: (chunk: StreamChunk) => void;
}

/**
 * Result of processing a stream
 */
export interface StreamResult {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * Creates a StreamSource from a Response object (SSE/fetch API)
 */
export async function* createResponseStreamSource(
  response: Response
): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  try {
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const dataLines = parseStreamChunk(chunk);

      for (const data of dataLines) {
        if (data === "[DONE]") continue;

        try {
          const parsed: StreamChunk = JSON.parse(data);
          yield parsed;
        } catch (parseError) {
          // Skip non-JSON lines or malformed chunks
          console.warn("Failed to parse stream chunk:", data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parses a raw text chunk into individual data lines
 * Handles Server-Sent Events (SSE) format
 */
export function parseStreamChunk(chunk: string): string[] {
  const lines = chunk.split("\n").filter((line) => line.trim() !== "");

  return lines.map((line) => {
    // Handle Server-Sent Events format
    const data = line.startsWith("data: ") ? line.slice(6) : line;
    return data;
  });
}

/**
 * Processes a stream of chunks and emits events
 *
 * @param source - The async iterable source of stream chunks
 * @param handlers - Event handlers for processing stream events
 * @returns A promise that resolves with the final stream result
 */
export async function processStream(
  source: StreamSource,
  handlers: StreamEventHandlers = {}
): Promise<StreamResult> {
  let accumulatedContent = "";
  const toolCalls: Map<number, ToolCall> = new Map();

  for await (const chunk of source) {
    // Emit raw chunk event
    handlers.onChunk?.(chunk);

    if (chunk.type === "content") {
      accumulatedContent = chunk.content;
      handlers.onContent?.(chunk.content);
    } else if (chunk.type === "tool_call") {
      const toolCallIndex = chunk.index;

      // Update or create tool call at index
      const existing = toolCalls.get(toolCallIndex);
      if (!existing) {
        const newToolCall: ToolCall = {
          id: chunk.toolCall.id,
          type: "function",
          function: {
            name: chunk.toolCall.function.name,
            arguments: chunk.toolCall.function.arguments,
          },
        };
        toolCalls.set(toolCallIndex, newToolCall);
      } else {
        // Accumulate arguments
        existing.function.arguments += chunk.toolCall.function.arguments;
      }

      handlers.onToolCall?.(toolCallIndex, chunk.toolCall);
    } else if (chunk.type === "error") {
      const error = new Error(chunk.error.message);
      handlers.onError?.(error);
      throw error;
    }
  }

  // Convert tool calls map to array
  const toolCallsArray = Array.from(toolCalls.values());

  return {
    content: accumulatedContent,
    toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
  };
}
