import type { Handle, RemixNode } from 'remix/ui'
import { ThinkingPart } from './thinking-part.tsx'
import type { UIMessage } from '../types.ts'

export interface ToolCallRenderProps {
  id: string
  name: string
  arguments: string
  state: string
  approval?: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  output?: unknown
}

export interface ChatMessageProps {
  message: UIMessage
  class?: string
  userClass?: string
  assistantClass?: string
  textPartRenderer?: (props: { content: string }) => RemixNode
  thinkingPartRenderer?: (props: {
    content: string
    isComplete?: boolean
  }) => RemixNode
  toolsRenderer?: Record<string, (props: ToolCallRenderProps) => RemixNode>
  defaultToolRenderer?: (props: ToolCallRenderProps) => RemixNode
  toolResultRenderer?: (props: {
    toolCallId: string
    content: string
    state: string
  }) => RemixNode
}

function toolResultContentToString(
  content: string | Array<{ type: string; content?: string }>,
): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.content ?? '')
    .join('')
}

export function ChatMessage(handle: Handle<ChatMessageProps>) {
  return () => {
    const message = handle.props.message
    const roleClass =
      message.role === 'user'
        ? handle.props.userClass
        : handle.props.assistantClass
    const combinedClass = [handle.props.class, roleClass]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        class={combinedClass || undefined}
        data-message-id={message.id}
        data-message-role={message.role}
        data-message-created={message.createdAt?.toISOString()}
      >
        {message.parts.map((part, index) => (
          <MessagePart
            key={`${message.id}-part-${index}`}
            defaultToolRenderer={handle.props.defaultToolRenderer}
            isThinkingComplete={
              part.type === 'thinking' &&
              message.parts.slice(index + 1).some((p) => p.type === 'text')
            }
            part={part}
            textPartRenderer={handle.props.textPartRenderer}
            thinkingPartRenderer={handle.props.thinkingPartRenderer}
            toolResultRenderer={handle.props.toolResultRenderer}
            toolsRenderer={handle.props.toolsRenderer}
          />
        ))}
      </div>
    )
  }
}

function MessagePart(
  handle: Handle<{
    part: UIMessage['parts'][number]
    isThinkingComplete?: boolean
    textPartRenderer?: ChatMessageProps['textPartRenderer']
    thinkingPartRenderer?: ChatMessageProps['thinkingPartRenderer']
    toolsRenderer?: ChatMessageProps['toolsRenderer']
    defaultToolRenderer?: ChatMessageProps['defaultToolRenderer']
    toolResultRenderer?: ChatMessageProps['toolResultRenderer']
  }>,
) {
  return () => {
    const part = handle.props.part

    if (part.type === 'text') {
      if (handle.props.textPartRenderer) {
        return handle.props.textPartRenderer({ content: part.content })
      }
      return (
        <div data-part-type="text" data-part-content>
          {part.content}
        </div>
      )
    }

    if (part.type === 'thinking') {
      if (handle.props.thinkingPartRenderer) {
        return handle.props.thinkingPartRenderer({
          content: part.content,
          isComplete: handle.props.isThinkingComplete,
        })
      }
      return (
        <ThinkingPart
          content={part.content}
          isComplete={handle.props.isThinkingComplete}
        />
      )
    }

    if (part.type === 'tool-call') {
      const toolProps: ToolCallRenderProps = {
        id: part.id,
        name: part.name,
        arguments: part.arguments,
        state: part.state,
        approval: part.approval,
        output: part.output,
      }
      const named = handle.props.toolsRenderer?.[part.name]
      if (named) return named(toolProps)
      if (handle.props.defaultToolRenderer) {
        return handle.props.defaultToolRenderer(toolProps)
      }
      return (
        <div
          data-part-type="tool-call"
          data-tool-id={part.id}
          data-tool-name={part.name}
          data-tool-state={part.state}
        >
          <div data-tool-header>
            <strong>{part.name}</strong>
            <span data-tool-state-badge>{part.state}</span>
          </div>
          {part.arguments ? (
            <div data-tool-arguments>
              <pre>{part.arguments}</pre>
            </div>
          ) : null}
          {part.approval ? (
            <div data-tool-approval>
              {part.approval.approved !== undefined
                ? part.approval.approved
                  ? 'Approved'
                  : 'Denied'
                : 'Awaiting approval...'}
            </div>
          ) : null}
          {part.output ? (
            <div data-tool-output>
              <pre>{JSON.stringify(part.output, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      )
    }

    if (part.type === 'tool-result') {
      const content = toolResultContentToString(part.content)
      if (handle.props.toolResultRenderer) {
        return handle.props.toolResultRenderer({
          toolCallId: part.toolCallId,
          content,
          state: part.state,
        })
      }
      return (
        <div
          data-part-type="tool-result"
          data-tool-call-id={part.toolCallId}
          data-tool-result-state={part.state}
        >
          <div data-tool-result-content>{content}</div>
        </div>
      )
    }

    return null
  }
}
