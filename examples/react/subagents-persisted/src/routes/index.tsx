import { createFileRoute } from '@tanstack/react-router'
import { useAppChat } from '@/chat-ui'
import { THREAD_ID } from '@/lib/thread'

function ChatPage() {
  const chat = useAppChat({ threadId: THREAD_ID })
  return <chat.AppChat />
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
