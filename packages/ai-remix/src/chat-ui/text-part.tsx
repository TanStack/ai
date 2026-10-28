import type { Handle } from 'remix/ui'

export interface TextPartProps {
  content: string
  role?: 'user' | 'assistant' | 'system'
  class?: string
  userClass?: string
  assistantClass?: string
}

export function TextPart(handle: Handle<TextPartProps>) {
  return () => {
    const roleClass =
      handle.props.role === 'user'
        ? handle.props.userClass
        : handle.props.role === 'assistant'
          ? handle.props.assistantClass
          : undefined
    const combinedClass = [handle.props.class, roleClass]
      .filter(Boolean)
      .join(' ')

    return (
      <div class={combinedClass || undefined} data-part-type="text">
        {handle.props.content}
      </div>
    )
  }
}
