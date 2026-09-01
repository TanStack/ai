import type { ConnectionAdapter } from '@tanstack/ai-client'
import type { Handle, RemixNode } from 'remix/ui'
import { createChat } from '../create-chat.ts'
import type { CreateChatReturn, UIMessage } from '../types.ts'

export interface ChatProps {
  children?: RemixNode
  class?: string
  connection: ConnectionAdapter
  initialMessages?: Array<UIMessage>
  id?: string
  body?: Record<string, any>
  tools?: Array<any>
}

export function useChatContext(handle: Handle<any>): CreateChatReturn {
  const chat = handle.context.get(Chat)
  if (!chat) {
    throw new Error(
      'Chat components must be wrapped in <Chat>. Make sure you use Chat.Messages, Chat.Input, and the rest inside a <Chat> component.',
    )
  }
  return chat
}

export function Chat(handle: Handle<ChatProps, CreateChatReturn>) {
  const chat = createChat(handle as unknown as Handle, {
    connection: handle.props.connection,
    ...(handle.props.initialMessages !== undefined
      ? { initialMessages: handle.props.initialMessages }
      : {}),
    ...(handle.props.id !== undefined ? { threadId: handle.props.id } : {}),
    ...(handle.props.body !== undefined ? { body: handle.props.body } : {}),
    ...(handle.props.tools !== undefined ? { tools: handle.props.tools } : {}),
  })
  handle.context.set(chat)
  return () => (
    <div class={handle.props.class} data-chat-root>
      {handle.props.children}
    </div>
  )
}
