import type { StreamChunk, ModelMessage } from "@tanstack/ai";
import type { UIMessage } from "./types";
import { uiMessageToModelMessages } from "./message-converters";

/**
 * Connection adapter interface - converts a connection into a stream of chunks
 */
export interface ConnectionAdapter {
  /**
   * Connect and return an async iterable of StreamChunks
   * @param messages - The messages to send (UIMessages or ModelMessages)
   * @param data - Additional data to send
   */
  connect(
    messages: UIMessage[] | ModelMessage[],
    data?: Record<string, any>
  ): AsyncIterable<StreamChunk>;

  /**
   * Abort the current connection (optional)
   */
  abort?(): void;
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
  let abortController: AbortController | null = null;

  return {
    async *connect(messages, data) {
      abortController = new AbortController();

      // Convert UIMessages to ModelMessages if needed
      const modelMessages: ModelMessage[] = [];
      for (const msg of messages) {
        if ('parts' in msg) {
          // UIMessage - convert to ModelMessages
          modelMessages.push(...uiMessageToModelMessages(msg as UIMessage));
        } else {
          // Already ModelMessage
          modelMessages.push(msg as ModelMessage);
        }
      }

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add custom headers
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, options.headers);
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ messages: modelMessages, data }),
        credentials: options.credentials || "same-origin",
        signal: options.signal || abortController.signal,
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

      try {
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((line) => line.trim() !== "");

          for (const line of lines) {
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
        }
      } finally {
        reader.releaseLock();
      }
    },

    abort() {
      if (abortController) {
        abortController.abort();
        abortController = null;
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
  let abortController: AbortController | null = null;

  return {
    async *connect(messages, data) {
      abortController = new AbortController();

      // Convert UIMessages to ModelMessages if needed
      const modelMessages: ModelMessage[] = [];
      for (const msg of messages) {
        if ('parts' in msg) {
          // UIMessage - convert to ModelMessages
          modelMessages.push(...uiMessageToModelMessages(msg as UIMessage));
        } else {
          // Already ModelMessage
          modelMessages.push(msg as ModelMessage);
        }
      }

      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add custom headers
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, options.headers);
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({ messages: modelMessages, data }),
        credentials: options.credentials || "same-origin",
        signal: options.signal || abortController.signal,
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

      try {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed: StreamChunk = JSON.parse(line);
              yield parsed;
            } catch (parseError) {
              console.warn("Failed to parse HTTP stream chunk:", line);
            }
          }
        }

        // Process any remaining data in the buffer
        if (buffer.trim()) {
          try {
            const parsed: StreamChunk = JSON.parse(buffer);
            yield parsed;
          } catch (parseError) {
            console.warn("Failed to parse final chunk:", buffer);
          }
        }
      } finally {
        reader.releaseLock();
      }
    },

    abort() {
      if (abortController) {
        abortController.abort();
        abortController = null;
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
      // Convert UIMessages to ModelMessages if needed
      const modelMessages: ModelMessage[] = [];
      for (const msg of messages) {
        if ('parts' in msg) {
          // UIMessage - convert to ModelMessages
          modelMessages.push(...uiMessageToModelMessages(msg as UIMessage));
        } else {
          // Already ModelMessage
          modelMessages.push(msg as ModelMessage);
        }
      }
      
      yield* streamFactory(modelMessages, data);
    },
  };
}
