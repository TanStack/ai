import { For, Show } from 'solid-js'
import { ThinkingPart } from './thinking-part'
import type { JSX } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'

export interface ToolCallRenderProps {
  id: string
  name: string
  arguments: string
  state: string
  approval?: any
  output?: any
}

export interface ChatMessageProps {
  /** The message to render */
  message: UIMessage
  /** Base CSS class name */
  class?: string
  /** Additional class for user messages */
  userClass?: string
  /** Additional class for assistant messages */
  assistantClass?: string
  /** Custom renderer for text parts */
  textPartRenderer?: (props: { content: string }) => JSX.Element
  /** Custom renderer for thinking parts */
  thinkingPartRenderer?: (props: {
    content: string
    isComplete?: boolean
  }) => JSX.Element
  /** Named tool renderers - use the tool name as the key */
  toolsRenderer?: Record<string, (props: ToolCallRenderProps) => JSX.Element>
  /** Default tool renderer when tool name not found in toolsRenderer */
  defaultToolRenderer?: (props: ToolCallRenderProps) => JSX.Element
  /** Custom renderer for tool result parts */
  toolResultRenderer?: (props: {
    toolCallId: string
    content: string
    state: string
  }) => JSX.Element
}

/**
 * Message component - renders a single message with all its parts
 *
 * This component natively understands TanStack AI's parts-based message format:
 * - thinking parts: rendered as collapsible thinking/reasoning sections (auto-collapses when complete)
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
 *   class="flex"
 *   userClass="justify-end"
 *   assistantClass="justify-start"
 * />
 * ```
 *
 * @example With custom thinking renderer
 * ```tsx
 * <ChatMessage
 *   message={message}
 *   thinkingPartRenderer={({ content, isComplete }) => (
 *     <details open={!isComplete}>
 *       <summary>Thinking...</summary>
 *       <pre>{content}</pre>
 *     </details>
 *   )}
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
export function ChatMessage(props: ChatMessageProps) {
  // Combine classes based on role
  const roleClass = () =>
    props.message.role === 'user'
      ? (props.userClass ?? '')
      : props.message.role === 'assistant'
        ? (props.assistantClass ?? '')
        : ''
  const combinedClass = () =>
    [props.class ?? '', roleClass()].filter(Boolean).join(' ')

  return (
    <div
      class={combinedClass() || undefined}
      data-message-id={props.message.id}
      data-message-role={props.message.role}
      data-message-created={props.message.createdAt?.toISOString()}
    >
      <For each={props.message.parts}>
        {(part, index) => {
          // Check if thinking is complete (if there's a text part after this thinking part)
          const isThinkingComplete = () =>
            part.type === 'thinking' &&
            props.message.parts
              .slice(index() + 1)
              .some((p) => p.type === 'text')

          return (
            <MessagePart
              part={part}
              isThinkingComplete={isThinkingComplete()}
              textPartRenderer={props.textPartRenderer}
              thinkingPartRenderer={props.thinkingPartRenderer}
              toolsRenderer={props.toolsRenderer}
              defaultToolRenderer={props.defaultToolRenderer}
              toolResultRenderer={props.toolResultRenderer}
            />
          )
        }}
      </For>
    </div>
  )
}

function MessagePart(props: {
  part: any
  isThinkingComplete?: boolean
  textPartRenderer?: ChatMessageProps['textPartRenderer']
  thinkingPartRenderer?: ChatMessageProps['thinkingPartRenderer']
  toolsRenderer?: ChatMessageProps['toolsRenderer']
  defaultToolRenderer?: ChatMessageProps['defaultToolRenderer']
  toolResultRenderer?: ChatMessageProps['toolResultRenderer']
}) {
  // Text part
  if (props.part.type === 'text') {
    if (props.textPartRenderer) {
      return <>{props.textPartRenderer({ content: props.part.content })}</>
    }
    return (
      <div data-part-type="text" data-part-content>
        {props.part.content}
      </div>
    )
  }

  // Thinking part
  if (props.part.type === 'thinking') {
    if (props.thinkingPartRenderer) {
      return (
        <>
          {props.thinkingPartRenderer({
            content: props.part.content,
            isComplete: props.isThinkingComplete,
          })}
        </>
      )
    }
    return (
      <ThinkingPart
        content={props.part.content}
        isComplete={props.isThinkingComplete}
      />
    )
  }

  // Tool call part
  if (props.part.type === 'tool-call') {
    const toolProps: ToolCallRenderProps = {
      id: props.part.id,
      name: props.part.name,
      arguments: props.part.arguments,
      state: props.part.state,
      approval: props.part.approval,
      output: props.part.output,
    }

    // Check if there's a specific renderer for this tool
    if (props.toolsRenderer?.[props.part.name]) {
      return <>{props.toolsRenderer[props.part.name]?.(toolProps)}</>
    }

    // Use default tool renderer if provided
    if (props.defaultToolRenderer) {
      return <>{props.defaultToolRenderer(toolProps)}</>
    }

    // Fallback to built-in default renderer
    return (
      <div
        data-part-type="tool-call"
        data-tool-name={props.part.name}
        data-tool-state={props.part.state}
        data-tool-id={props.part.id}
      >
        <div data-tool-header>
          <strong>{props.part.name}</strong>
          <span data-tool-state-badge>{props.part.state}</span>
        </div>
        <Show when={props.part.arguments}>
          <div data-tool-arguments>
            <pre>{props.part.arguments}</pre>
          </div>
        </Show>
        <Show when={props.part.approval}>
          <div data-tool-approval>
            {props.part.approval.approved !== undefined
              ? props.part.approval.approved
                ? '✓ Approved'
                : '✗ Denied'
              : '⏳ Awaiting approval...'}
          </div>
        </Show>
        <Show when={props.part.output}>
          <div data-tool-output>
            <pre>{JSON.stringify(props.part.output, null, 2)}</pre>
          </div>
        </Show>
      </div>
    )
  }

  // Tool result part
  if (props.part.type === 'tool-result') {
    if (props.toolResultRenderer) {
      return (
        <>
          {props.toolResultRenderer({
            toolCallId: props.part.toolCallId,
            content: props.part.content,
            state: props.part.state,
          })}
        </>
      )
    }

    return (
      <div
        data-part-type="tool-result"
        data-tool-call-id={props.part.toolCallId}
        data-tool-result-state={props.part.state}
      >
        <div data-tool-result-content>{props.part.content}</div>
      </div>
    )
  }

  return null
}
