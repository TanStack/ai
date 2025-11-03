import { useEffect, useRef, type ReactNode } from "react";
import { useChatContext } from "./chat";
import type { UIMessage } from "@tanstack/ai-react";

export interface ChatMessagesProps {
  /** Custom render function for each message */
  children?: (message: UIMessage, index: number) => ReactNode;
  /** CSS class name */
  className?: string;
  /** Element to show when there are no messages */
  emptyState?: ReactNode;
  /** Element to show while loading the first message */
  loadingState?: ReactNode;
  /** Custom error renderer */
  errorState?: (props: { error: Error; reload: () => void }) => ReactNode;
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean;
}

/**
 * Messages container - renders all messages in the conversation
 *
 * @example
 * ```tsx
 * <Chat.Messages>
 *   {(message) => <Chat.Message message={message} />}
 * </Chat.Messages>
 * ```
 */
export function ChatMessages({
  children,
  className,
  emptyState,
  loadingState,
  errorState,
  autoScroll = true,
}: ChatMessagesProps) {
  const { messages, isLoading, error, reload } = useChatContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Error state
  if (error && errorState) {
    return <>{errorState({ error, reload })}</>;
  }

  // Loading state (only show if no messages yet)
  if (isLoading && messages.length === 0 && loadingState) {
    return <>{loadingState}</>;
  }

  // Empty state
  if (messages.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-chat-messages
      data-message-count={messages.length}
    >
      {messages.map((message, index) =>
        children ? (
          <div key={message.id} data-message-id={message.id}>
            {children(message, index)}
          </div>
        ) : (
          <div
            key={message.id}
            data-message-id={message.id}
            data-message-role={message.role}
          >
            {message.parts
              .filter((p) => p.type === "text")
              .map((p) => p.content)
              .join("")}
          </div>
        )
      )}
    </div>
  );
}

