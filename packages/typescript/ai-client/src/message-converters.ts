import type { ModelMessage } from "@tanstack/ai";
import type {
  UIMessage,
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from "./types";

/**
 * Convert UIMessages or ModelMessages to ModelMessages
 */
export function convertMessagesToModelMessages(
  messages: UIMessage[] | ModelMessage[]
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  for (const msg of messages) {
    if ("parts" in msg) {
      // UIMessage - convert to ModelMessages
      modelMessages.push(...uiMessageToModelMessages(msg as UIMessage));
    } else {
      // Already ModelMessage
      modelMessages.push(msg as ModelMessage);
    }
  }
  return modelMessages;
}

/**
 * Convert a UIMessage to ModelMessage(s)
 *
 * This conversion handles the parts-based structure:
 * - Text parts → content field
 * - ToolCall parts → toolCalls array
 * - ToolResult parts → separate role="tool" messages
 *
 * @param uiMessage - The UIMessage to convert
 * @returns An array of ModelMessages (may be multiple if tool results are present)
 */
export function uiMessageToModelMessages(uiMessage: UIMessage): ModelMessage[] {
  const messages: ModelMessage[] = [];

  // Separate parts by type
  const textParts: TextPart[] = [];
  const toolCallParts: ToolCallPart[] = [];
  const toolResultParts: ToolResultPart[] = [];

  for (const part of uiMessage.parts) {
    if (part.type === "text") {
      textParts.push(part);
    } else if (part.type === "tool-call") {
      toolCallParts.push(part);
    } else if (part.type === "tool-result") {
      toolResultParts.push(part);
    }
  }

  // Build the main message (system, user, or assistant)
  const content = textParts.map((p) => p.content).join("") || null;
  const toolCalls =
    toolCallParts.length > 0
      ? toolCallParts
          .filter(
            (p) =>
              p.state === "input-complete" ||
              p.state === "approval-responded" ||
              p.output !== undefined // Include if has output (client tool result)
          )
          .map((p) => ({
            id: p.id,
            type: "function" as const,
            function: {
              name: p.name,
              arguments: p.arguments,
            },
          }))
      : undefined;

  // Create the main message
  if (uiMessage.role !== "assistant" || content || !toolCalls) {
    messages.push({
      role: uiMessage.role,
      content,
      ...(toolCalls && toolCalls.length > 0 && { toolCalls }),
    });
  } else if (toolCalls && toolCalls.length > 0) {
    // Assistant message with only tool calls
    messages.push({
      role: "assistant",
      content,
      toolCalls,
    });
  }

  // Add tool result messages (only completed ones)
  for (const toolResultPart of toolResultParts) {
    if (
      toolResultPart.state === "complete" ||
      toolResultPart.state === "error"
    ) {
      messages.push({
        role: "tool",
        content: toolResultPart.content,
        toolCallId: toolResultPart.toolCallId,
      });
    }
  }

  return messages;
}

/**
 * Convert a ModelMessage to UIMessage
 *
 * This conversion creates a parts-based structure:
 * - content field → TextPart
 * - toolCalls array → ToolCallPart[]
 * - role="tool" messages should be converted separately and merged
 *
 * @param modelMessage - The ModelMessage to convert
 * @param id - Optional ID for the UIMessage (generated if not provided)
 * @returns A UIMessage with parts
 */
export function modelMessageToUIMessage(
  modelMessage: ModelMessage,
  id?: string
): UIMessage {
  const parts: MessagePart[] = [];

  // Handle content
  if (modelMessage.content) {
    parts.push({
      type: "text",
      content: modelMessage.content,
    });
  }

  // Handle tool calls
  if (modelMessage.toolCalls && modelMessage.toolCalls.length > 0) {
    for (const toolCall of modelMessage.toolCalls) {
      parts.push({
        type: "tool-call",
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        state: "input-complete", // Model messages have complete arguments
      });
    }
  }

  // Handle tool results (when role is "tool")
  if (modelMessage.role === "tool" && modelMessage.toolCallId) {
    parts.push({
      type: "tool-result",
      toolCallId: modelMessage.toolCallId,
      content: modelMessage.content || "",
      state: "complete",
    });
  }

  return {
    id: id || generateMessageId(),
    role: modelMessage.role === "tool" ? "assistant" : modelMessage.role,
    parts,
  };
}

/**
 * Convert an array of ModelMessages to UIMessages
 *
 * This handles merging tool result messages with their corresponding assistant messages
 *
 * @param modelMessages - Array of ModelMessages to convert
 * @returns Array of UIMessages
 */
export function modelMessagesToUIMessages(
  modelMessages: ModelMessage[]
): UIMessage[] {
  const uiMessages: UIMessage[] = [];
  let currentAssistantMessage: UIMessage | null = null;

  for (let i = 0; i < modelMessages.length; i++) {
    const msg = modelMessages[i];

    if (msg.role === "tool") {
      // Tool result - merge into the last assistant message if possible
      if (
        currentAssistantMessage &&
        currentAssistantMessage.role === "assistant"
      ) {
        currentAssistantMessage.parts.push({
          type: "tool-result",
          toolCallId: msg.toolCallId!,
          content: msg.content || "",
          state: "complete",
        });
      } else {
        // No assistant message to merge into, create a standalone one
        const toolResultUIMessage = modelMessageToUIMessage(msg);
        uiMessages.push(toolResultUIMessage);
      }
    } else {
      // Regular message
      const uiMessage = modelMessageToUIMessage(msg);
      uiMessages.push(uiMessage);

      // Track assistant messages for potential tool result merging
      if (msg.role === "assistant") {
        currentAssistantMessage = uiMessage;
      } else {
        currentAssistantMessage = null;
      }
    }
  }

  return uiMessages;
}

/**
 * Normalize a message (UIMessage or ModelMessage) to a UIMessage
 * Ensures the message has an ID and createdAt timestamp
 *
 * @param message - Either a UIMessage or ModelMessage
 * @param generateId - Function to generate a message ID if needed
 * @returns A UIMessage with guaranteed id and createdAt
 */
export function normalizeToUIMessage(
  message: UIMessage | ModelMessage,
  generateId: () => string
): UIMessage {
  if ("parts" in message) {
    // Already a UIMessage
    return {
      ...message,
      id: message.id || generateId(),
      createdAt: message.createdAt || new Date(),
    };
  } else {
    // ModelMessage - convert to UIMessage
    return {
      ...modelMessageToUIMessage(message, generateId()),
      createdAt: new Date(),
    };
  }
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
