import { on } from 'remix/ui'
import type { Handle, RemixNode } from 'remix/ui'
import { useChatContext } from './chat.tsx'

export interface ChatInputRenderProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  disabled: boolean
}

/** @deprecated Use `createChatUI()` and an application-owned input component. Removed in 1.0.0. */
export interface ChatInputProps {
  children?: (props: ChatInputRenderProps) => RemixNode
  class?: string
  placeholder?: string
  disabled?: boolean
  submitOnEnter?: boolean
}

/**
 * @deprecated Use `createChatUI()` and an application-owned input component.
 * Removed in 1.0.0.
 */
export function ChatInput(handle: Handle<ChatInputProps>) {
  let value = ''

  return () => {
    const { sendMessage, isLoading } = useChatContext(handle)
    const disabled = Boolean(handle.props.disabled || isLoading)
    const submitOnEnter = handle.props.submitOnEnter !== false

    function onChange(next: string) {
      value = next
      void handle.update()
    }

    function onSubmit() {
      if (!value.trim() || disabled) return
      void sendMessage(value)
      value = ''
      void handle.update()
    }

    const renderProps: ChatInputRenderProps = {
      value,
      onChange,
      onSubmit,
      isLoading,
      disabled,
    }

    if (typeof handle.props.children === 'function') {
      return handle.props.children(renderProps)
    }

    return (
      <div
        class={handle.props.class}
        data-chat-input
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <input
          data-chat-textarea
          disabled={disabled}
          placeholder={handle.props.placeholder ?? 'Type a message...'}
          type="text"
          value={value}
          mix={[
            on('input', (event) => {
              onChange((event.currentTarget as HTMLInputElement).value)
            }),
            on('keydown', (event) => {
              if (submitOnEnter && event.key === 'Enter') {
                event.preventDefault()
                onSubmit()
              }
            }),
          ]}
          style={{
            flex: '1',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(31, 41, 55, 0.5)',
            color: 'white',
            outline: 'none',
          }}
        />
        <button
          data-chat-submit
          disabled={disabled || !value.trim()}
          mix={[on('click', onSubmit)]}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'white',
            backgroundColor:
              disabled || !value.trim()
                ? 'rgba(107, 114, 128, 0.5)'
                : 'rgb(249, 115, 22)',
            border: 'none',
            borderRadius: '0.75rem',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    )
  }
}
