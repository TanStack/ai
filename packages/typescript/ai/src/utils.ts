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
