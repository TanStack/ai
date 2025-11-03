import type { ReactNode } from "react";
import type { UIMessage, MessagePart } from "@tanstack/ai-react";

export interface ToolCallRenderProps {
  id: string;
  name: string;
  arguments: string;
  state: string;
  approval?: any;
  output?: any;
}

export interface ChatMessageProps {
  /** The message to render */
  message: UIMessage;
  /** Base CSS class name */
  className?: string;
  /** Additional className for user messages */
  userClassName?: string;
  /** Additional className for assistant messages */
  assistantClassName?: string;
  /** Custom renderer for text parts */
  textPartRenderer?: (props: { content: string }) => ReactNode;
  /** Named tool renderers - use the tool name as the key */
  toolsRenderer?: Record<string, (props: ToolCallRenderProps) => ReactNode>;
  /** Default tool renderer when tool name not found in toolsRenderer */
  defaultToolRenderer?: (props: ToolCallRenderProps) => ReactNode;
  /** Custom renderer for tool result parts */
  toolResultRenderer?: (props: {
    toolCallId: string;
    content: string;
    state: string;
  }) => ReactNode;
}

/**
 * Message component - renders a single message with all its parts
 *
 * This component natively understands TanStack AI's parts-based message format:
 * - text parts: rendered as content
 * - tool-call parts: rendered with state, approvals, etc.
 * - tool-result parts: rendered with results
 *
 * @example Basic usage
 * ```tsx
 * <Chat.Message message={message} />
 * ```
 *
 * @example With role-based styling
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   className="flex"
 *   userClassName="justify-end"
 *   assistantClassName="justify-start"
 * />
 * ```
 *
 * @example With named tool renderers
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   toolsRenderer={{
 *     recommendGuitar: ({ id, arguments: args }) => <GuitarCard {...JSON.parse(args)} />,
 *     weatherLookup: ({ id, arguments: args }) => <WeatherWidget {...JSON.parse(args)} />,
 *   }}
 *   defaultToolRenderer={() => null}
 * />
 * ```
 */
export function ChatMessage({
  message,
  className = "",
  userClassName = "",
  assistantClassName = "",
  textPartRenderer,
  toolsRenderer,
  defaultToolRenderer,
  toolResultRenderer,
}: ChatMessageProps) {
  // Combine classes based on role
  const roleClassName = message.role === "user" ? userClassName : message.role === "assistant" ? assistantClassName : "";
  const combinedClassName = [className, roleClassName].filter(Boolean).join(" ");

  return (
    <div
      className={combinedClassName || undefined}
      data-message-id={message.id}
      data-message-role={message.role}
      data-message-created={message.createdAt.toISOString()}
    >
      {message.parts.map((part, index) => (
        <MessagePart
          key={`${message.id}-part-${index}`}
          part={part}
          textPartRenderer={textPartRenderer}
          toolsRenderer={toolsRenderer}
          defaultToolRenderer={defaultToolRenderer}
          toolResultRenderer={toolResultRenderer}
        />
      ))}
    </div>
  );
}

function MessagePart({
  part,
  textPartRenderer,
  toolsRenderer,
  defaultToolRenderer,
  toolResultRenderer,
}: {
  part: MessagePart;
  textPartRenderer?: ChatMessageProps["textPartRenderer"];
  toolsRenderer?: ChatMessageProps["toolsRenderer"];
  defaultToolRenderer?: ChatMessageProps["defaultToolRenderer"];
  toolResultRenderer?: ChatMessageProps["toolResultRenderer"];
}) {
  // Text part
  if (part.type === "text") {
    if (textPartRenderer) {
      return <>{textPartRenderer({ content: part.content })}</>;
    }
    return (
      <div data-part-type="text" data-part-content>
        {part.content}
      </div>
    );
  }

  // Tool call part
  if (part.type === "tool-call") {
    const toolProps: ToolCallRenderProps = {
      id: part.id,
      name: part.name,
      arguments: part.arguments,
      state: part.state,
      approval: part.approval,
      output: part.output,
    };

    // Check if there's a specific renderer for this tool
    if (toolsRenderer?.[part.name]) {
      return <>{toolsRenderer[part.name](toolProps)}</>;
    }

    // Use default tool renderer if provided
    if (defaultToolRenderer) {
      return <>{defaultToolRenderer(toolProps)}</>;
    }

    // Fallback to built-in default renderer
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
    if (toolResultRenderer) {
      return (
        <>
          {toolResultRenderer({
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

