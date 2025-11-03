import type { ReactNode } from "react";
import type { UIMessage, MessagePart } from "@tanstack/ai-react";

export interface ChatMessageProps {
  /** The message to render */
  message: UIMessage;
  /** CSS class name */
  className?: string;
  /** Custom part renderers */
  partRenderers?: {
    text?: (props: { content: string }) => ReactNode;
    toolCall?: (props: {
      id: string;
      name: string;
      arguments: string;
      state: string;
      approval?: any;
      output?: any;
    }) => ReactNode;
    toolResult?: (props: {
      toolCallId: string;
      content: string;
      state: string;
    }) => ReactNode;
  };
}

/**
 * Message component - renders a single message with all its parts
 *
 * This component natively understands TanStack AI's parts-based message format:
 * - text parts: rendered as content
 * - tool-call parts: rendered with state, approvals, etc.
 * - tool-result parts: rendered with results
 *
 * @example
 * ```tsx
 * <Chat.Message message={message} />
 * ```
 */
export function ChatMessage({
  message,
  className,
  partRenderers,
}: ChatMessageProps) {
  return (
    <div
      className={className}
      data-message-id={message.id}
      data-message-role={message.role}
      data-message-created={message.createdAt.toISOString()}
    >
      {message.parts.map((part, index) => (
        <MessagePart
          key={`${message.id}-part-${index}`}
          part={part}
          partRenderers={partRenderers}
        />
      ))}
    </div>
  );
}

function MessagePart({
  part,
  partRenderers,
}: {
  part: MessagePart;
  partRenderers?: ChatMessageProps["partRenderers"];
}) {
  // Text part
  if (part.type === "text") {
    if (partRenderers?.text) {
      return <>{partRenderers.text({ content: part.content })}</>;
    }
    return (
      <div data-part-type="text" data-part-content>
        {part.content}
      </div>
    );
  }

  // Tool call part
  if (part.type === "tool-call") {
    if (partRenderers?.toolCall) {
      return (
        <>
          {partRenderers.toolCall({
            id: part.id,
            name: part.name,
            arguments: part.arguments,
            state: part.state,
            approval: part.approval,
            output: part.output,
          })}
        </>
      );
    }

    return (
      <div
        data-part-type="tool-call"
        data-tool-name={part.name}
        data-tool-state={part.state}
        data-tool-id={part.id}
      >
        <div data-tool-header>
          <strong>{part.name}</strong>
          <span data-tool-state-badge>{part.state}</span>
        </div>
        {part.arguments && (
          <div data-tool-arguments>
            <pre>{part.arguments}</pre>
          </div>
        )}
        {part.approval && (
          <div data-tool-approval>
            {part.approval.approved !== undefined
              ? part.approval.approved
                ? "✓ Approved"
                : "✗ Denied"
              : "⏳ Awaiting approval..."}
          </div>
        )}
        {part.output && (
          <div data-tool-output>
            <pre>{JSON.stringify(part.output, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  }

  // Tool result part
  if (part.type === "tool-result") {
    if (partRenderers?.toolResult) {
      return (
        <>
          {partRenderers.toolResult({
            toolCallId: part.toolCallId,
            content: part.content,
            state: part.state,
          })}
        </>
      );
    }

    return (
      <div
        data-part-type="tool-result"
        data-tool-call-id={part.toolCallId}
        data-tool-result-state={part.state}
      >
        <div data-tool-result-content>{part.content}</div>
      </div>
    );
  }

  return null;
}

