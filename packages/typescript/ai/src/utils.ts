import type { ModelMessage } from "./types";


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
