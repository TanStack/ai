import { useState, useRef, useEffect, type ReactNode, type KeyboardEvent } from "react";
import { useChatContext } from "./chat";

export interface ChatInputRenderProps {
  /** Current input value */
  value: string;
  /** Set input value */
  onChange: (value: string) => void;
  /** Submit the message */
  onSubmit: () => void;
  /** Is the chat currently loading */
  isLoading: boolean;
  /** Is input disabled */
  disabled: boolean;
  /** Ref for the textarea element */
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export interface ChatInputProps {
  /** Render prop for full control */
  children?: (props: ChatInputRenderProps) => ReactNode;
  /** CSS class name */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Disable input */
  disabled?: boolean;
  /** Auto-grow textarea */
  autoGrow?: boolean;
  /** Max height for auto-grow (in pixels) */
  maxHeight?: number;
  /** Submit on Enter (Shift+Enter for new line) */
  submitOnEnter?: boolean;
}

/**
 * Chat input component - handles message input and submission
 *
 * Features:
 * - Auto-growing textarea
 * - Submit on Enter (Shift+Enter for new line)
 * - Loading state management
 * - Full render prop support for custom UIs
 *
 * @example
 * ```tsx
 * <Chat.Input placeholder="Type your message..." />
 * ```
 *
 * @example Custom UI with render prop
 * ```tsx
 * <Chat.Input>
 *   {({ value, onChange, onSubmit, isLoading }) => (
 *     <div>
 *       <textarea value={value} onChange={(e) => onChange(e.target.value)} />
 *       <button onClick={onSubmit} disabled={isLoading}>Send</button>
 *     </div>
 *   )}
 * </Chat.Input>
 * ```
 */
export function ChatInput({
  children,
  className,
  placeholder = "Type a message...",
  disabled: disabledProp,
  autoGrow = true,
  maxHeight = 200,
  submitOnEnter = true,
}: ChatInputProps) {
  const { sendMessage, isLoading } = useChatContext();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = disabledProp || isLoading;

  // Auto-grow textarea
  useEffect(() => {
    if (autoGrow && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value, autoGrow, maxHeight]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    sendMessage(value);
    setValue("");
    // Reset height after submit
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderProps: ChatInputRenderProps = {
    value,
    onChange: setValue,
    onSubmit: handleSubmit,
    isLoading,
    disabled,
    inputRef: textareaRef,
  };

  // Render prop pattern
  if (children) {
    return <>{children(renderProps)}</>;
  }

  // Default implementation
  return (
    <div className={className} data-chat-input>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        data-chat-textarea
        style={{
          resize: "none",
          overflow: autoGrow ? "hidden" : "auto",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        data-chat-submit
      >
        {isLoading ? "Sending..." : "Send"}
      </button>
    </div>
  );
}

