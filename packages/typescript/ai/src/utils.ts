import type { ModelMessage } from "./types";

/**
 * Format messages for display
 */
export function formatMessage(message: ModelMessage): string {
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
export function systemMessage(content: string): ModelMessage {
  return { role: "system", content };
}

/**
 * Create a user message
 */
export function userMessage(content: string, name?: string): ModelMessage {
  return { role: "user", content, name };
}

/**
 * Create an assistant message
 */
export function assistantMessage(content: string): ModelMessage {
  return { role: "assistant", content };
}

/**
 * Prepend system prompts to the current message list.
 */
export function prependSystemPrompts(
  messages: ModelMessage[],
  systemPrompts?: string[],
  defaultPrompts: string[] = []
): ModelMessage[] {
  const prompts =
    systemPrompts && systemPrompts.length > 0 ? systemPrompts : defaultPrompts;

  if (!prompts || prompts.length === 0) {
    return messages;
  }

  const systemMessages = prompts.map((content) => ({
    role: "system" as const,
    content,
  }));

  return [...systemMessages, ...messages];
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
