import { createSignal } from 'solid-js'
import { useChatContext } from './chat'
import type { JSX } from 'solid-js'

export interface ChatInputRenderProps {
  /** Current input value */
  value: string
  /** Set input value */
  onChange: (value: string) => void
  /** Submit the message */
  onSubmit: () => void
  /** Is the chat currently loading */
  isLoading: boolean
  /** Is input disabled */
  disabled: boolean
  /** Ref callback for the input element */
  ref: (el: HTMLInputElement | HTMLTextAreaElement) => void
}

export interface ChatInputProps {
  /** Render prop for full control */
  children?: (props: ChatInputRenderProps) => JSX.Element
  /** CSS class name */
  class?: string
  /** Placeholder text */
  placeholder?: string
  /** Disable input */
  disabled?: boolean
  /** Submit on Enter (Shift+Enter for new line) */
  submitOnEnter?: boolean
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
 *       <textarea value={value} onInput={(e) => onChange(e.target.value)} />
 *       <button onClick={onSubmit} disabled={isLoading}>Send</button>
 *     </div>
 *   )}
 * </Chat.Input>
 * ```
 */
export function ChatInput(props: ChatInputProps) {
  const { sendMessage, isLoading } = useChatContext()
  const [value, setValue] = createSignal('')

  const disabled = () => props.disabled || isLoading()

  const handleSubmit = () => {
    if (!value().trim() || disabled()) return
    sendMessage(value())
    setValue('')
  }

  const renderProps = (): ChatInputRenderProps => ({
    value: value(),
    onChange: setValue,
    onSubmit: handleSubmit,
    isLoading: isLoading(),
    disabled: disabled(),

    ref: () => {},
  })

  // Render prop pattern
  if (props.children) {
    return <>{props.children(renderProps())}</>
  }

  // Default implementation
  return (
    <div
      class={props.class}
      data-chat-input
      style={{
        display: 'flex',
        gap: '0.75rem',
        'align-items': 'center',
        width: '100%',
      }}
    >
      <input
        type="text"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((props.submitOnEnter ?? true) && e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          }
        }}
        placeholder={props.placeholder ?? 'Type a message...'}
        disabled={disabled()}
        data-chat-textarea
        style={{
          flex: 1,
          padding: '0.75rem 1rem',
          'font-size': '0.875rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          'border-radius': '0.75rem',
          'background-color': 'rgba(31, 41, 55, 0.5)',
          color: 'white',
          outline: 'none',
          transition: 'all 0.2s',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.4)'
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249, 115, 22, 0.2)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled() || !value().trim()}
        data-chat-submit
        style={{
          padding: '0.75rem 1.5rem',
          'font-size': '0.875rem',
          'font-weight': 500,
          color: 'white',
          'background-color':
            disabled() || !value().trim()
              ? 'rgba(107, 114, 128, 0.5)'
              : 'rgb(249, 115, 22)',
          border: 'none',
          'border-radius': '0.75rem',
          cursor: disabled() || !value().trim() ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          'white-space': 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!disabled() && value().trim()) {
            e.currentTarget.style.backgroundColor = 'rgb(234, 88, 12)'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled() && value().trim()) {
            e.currentTarget.style.backgroundColor = 'rgb(249, 115, 22)'
          }
        }}
      >
        {isLoading() ? 'Sending...' : 'Send'}
      </button>
    </div>
  )
}
