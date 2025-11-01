import type { StreamChunk } from "./types";

/**
 * Convert a StreamChunk async iterable to a ReadableStream in Server-Sent Events format
 *
 * This creates a ReadableStream that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends with "data: [DONE]\n\n"
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @returns ReadableStream in Server-Sent Events format
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openai(), model: "gpt-4o", messages: [...] });
 * const readableStream = toServerSentEventsStream(stream);
 * // Use with Response, or any API that accepts ReadableStream
 * ```
 */
export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // Send each chunk as Server-Sent Events format
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }

        // Send completion marker
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error: any) {
        // Send error chunk
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: {
                message: error.message || "Unknown error occurred",
                code: error.code,
              },
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}

/**
 * Create a streaming HTTP response from a StreamChunk async iterable
 * Includes proper headers for Server-Sent Events
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options
 * @returns Response object with SSE headers and streaming body
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const { messages } = await request.json();
 *   const stream = chat({ adapter: openai(), model: "gpt-4o", messages });
 *   return toStreamResponse(stream);
 * }
 * ```
 */
export function toStreamResponse(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit
): Response {
  return new Response(toServerSentEventsStream(stream), {
    ...init,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...(init?.headers || {}),
    },
  });
}
