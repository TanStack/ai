import { useState, useRef, type ReactNode, type RefObject } from "react";
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
  /** Ref to the input element */
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement>;
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
  submitOnEnter = true,
}: ChatInputProps) {
  const { sendMessage, isLoading } = useChatContext();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const disabled = disabledProp || isLoading;

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    sendMessage(value);
    setValue("");
  };

  const renderProps: ChatInputRenderProps = {
    value,
    onChange: setValue,
    onSubmit: handleSubmit,
    isLoading,
    disabled,
    inputRef,
  };

  // Render prop pattern
  if (children) {
    return <>{children(renderProps)}</>;
  }

  // Default implementation
  return (
    <div
      className={className}
      data-chat-input
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        width: "100%",
      }}
    >
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={value}
        onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (submitOnEnter && e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        data-chat-textarea
        style={{
          flex: 1,
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "0.75rem",
          backgroundColor: "rgba(31, 41, 55, 0.5)",
          color: "white",
          outline: "none",
          transition: "all 0.2s",
        }}
        onFocus={(e) => {
          (e.target as HTMLInputElement).style.borderColor =
            "rgba(249, 115, 22, 0.4)";
          (e.target as HTMLInputElement).style.boxShadow =
            "0 0 0 2px rgba(249, 115, 22, 0.2)";
        }}
        onBlur={(e) => {
          (e.target as HTMLInputElement).style.borderColor =
            "rgba(255, 255, 255, 0.1)";
          (e.target as HTMLInputElement).style.boxShadow = "none";
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        data-chat-submit
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "white",
          backgroundColor:
            disabled || !value.trim()
              ? "rgba(107, 114, 128, 0.5)"
              : "rgb(249, 115, 22)",
          border: "none",
          borderRadius: "0.75rem",
          cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!disabled && value.trim()) {
            (e.target as HTMLButtonElement).style.backgroundColor =
              "rgb(234, 88, 12)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && value.trim()) {
            (e.target as HTMLButtonElement).style.backgroundColor =
              "rgb(249, 115, 22)";
          }
        }}
      >
        {isLoading ? "Sending..." : "Send"}
      </button>
    </div>
  );
}
