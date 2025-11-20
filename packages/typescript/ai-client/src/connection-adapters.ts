import type { StreamChunk, ModelMessage } from "@tanstack/ai";
import type { UIMessage } from "./types";
import { convertMessagesToModelMessages } from "./message-converters";

/**
 * Merge custom headers into request headers
 */
function mergeHeaders(
  customHeaders?: Record<string, string> | Headers
): Record<string, string> {
  if (!customHeaders) {
    return {};
  }
  if (customHeaders instanceof Headers) {
    const result: Record<string, string> = {};
    customHeaders.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return customHeaders;
}

/**
 * Read lines from a stream (newline-delimited)
 */
async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal
): AsyncGenerator<string> {
  try {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      // Check if aborted before reading
      if (abortSignal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          yield line;
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Connection adapter interface - converts a connection into a stream of chunks
 */
export interface ConnectionAdapter {
  /**
   * Connect and return an async iterable of StreamChunks
   * @param messages - The messages to send (UIMessages or ModelMessages)
   * @param data - Additional data to send
   * @param abortSignal - Optional abort signal for request cancellation
   */
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>,
    abortSignal?: AbortSignal
  ): AsyncIterable<StreamChunk>;
}

/**
 * Options for fetch-based connection adapters
 */
export interface FetchConnectionOptions {
  headers?: Record<string, string> | Headers;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
}

/**
 * Create a Server-Sent Events connection adapter
 *
 * @param url - The API endpoint URL
 * @param options - Fetch options (headers, credentials, etc.)
 * @returns A connection adapter for SSE streams
 *
 * @example
 * ```typescript
 * const connection = fetchServerSentEvents('/api/chat', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * const client = new ChatClient({ connection });
 * ```
 */
export function fetchServerSentEvents(
  url: string,
  options: FetchConnectionOptions = {}
): ConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      const modelMessages = convertMessagesToModelMessages(messages);

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...mergeHeaders(options.headers),
      };

      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ messages: modelMessages, data }),
        credentials: options.credentials || "same-origin",
        signal: abortSignal || options.signal,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }

      // Parse Server-Sent Events format
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      for await (const line of readStreamLines(reader, abortSignal)) {
        // Handle Server-Sent Events format
        const data = line.startsWith("data: ") ? line.slice(6) : line;

        if (data === "[DONE]") continue;

        try {
          const parsed: StreamChunk = JSON.parse(data);
          yield parsed;
        } catch (parseError) {
          // Skip non-JSON lines or malformed chunks
          console.warn("Failed to parse SSE chunk:", data);
        }
      }
    },
  };
}

/**
 * Create an HTTP streaming connection adapter (for raw streaming without SSE format)
 *
 * @param url - The API endpoint URL
 * @param options - Fetch options (headers, credentials, etc.)
 * @returns A connection adapter for HTTP streams
 *
 * @example
 * ```typescript
 * const connection = fetchHttpStream('/api/chat', {
 *   headers: { 'Authorization': 'Bearer token' }
 * });
 *
 * const client = new ChatClient({ connection });
 * ```
 */
export function fetchHttpStream(
  url: string,
  options: FetchConnectionOptions = {}
): ConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal) {
      // Convert UIMessages to ModelMessages if needed
      const modelMessages = convertMessagesToModelMessages(messages);

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...mergeHeaders(options.headers),
      };

      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ messages: modelMessages, data }),
        credentials: options.credentials || "same-origin",
        signal: abortSignal || options.signal,
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText}`
        );
      }

      // Parse raw HTTP stream (newline-delimited JSON)
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      for await (const line of readStreamLines(reader, abortSignal)) {
        try {
          const parsed: StreamChunk = JSON.parse(line);
          yield parsed;
        } catch (parseError) {
          console.warn("Failed to parse HTTP stream chunk:", line);
        }
      }
    },
  };
}

/**
 * Create a direct stream connection adapter (for server functions or direct streams)
 *
 * @param streamFactory - A function that returns an async iterable of StreamChunks
 * @returns A connection adapter for direct streams
 *
 * @example
 * ```typescript
 * // With TanStack Start server function
 * const connection = stream(() => serverFunction({ messages }));
 *
 * const client = new ChatClient({ connection });
 * ```
 */
export function stream(
  streamFactory: (
    messages: ModelMessage[],
    data?: Record<string, any>
  ) => AsyncIterable<StreamChunk>
): ConnectionAdapter {
  return {
    async *connect(messages, data) {
      const modelMessages = convertMessagesToModelMessages(messages);
      yield* streamFactory(modelMessages, data);
    },
  };
}
