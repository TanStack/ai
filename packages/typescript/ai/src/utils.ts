import type { Message } from "./types";

/**
 * Format messages for display
 */
export function formatMessage(message: Message): string {
  return `[${message.role.toUpperCase()}]: ${message.content}`;
}

/**
 * Count tokens (approximate - for demo purposes)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Create a system message
 */
export function systemMessage(content: string): Message {
  return { role: "system", content };
}

/**
 * Create a user message
 */
export function userMessage(content: string, name?: string): Message {
  return { role: "user", content, name };
}

/**
 * Create an assistant message
 */
export function assistantMessage(content: string): Message {
  return { role: "assistant", content };
}

/**
 * Merge streaming chunks into a complete response
 */
export async function mergeChunks(chunks: AsyncIterable<any>): Promise<string> {
  let result = "";
  for await (const chunk of chunks) {
    if (typeof chunk === "string") {
      result += chunk;
    } else if (chunk.content) {
      result += chunk.content;
    }
  }
  return result;
}
