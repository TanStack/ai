import { createFileRoute } from '@tanstack/react-router'
import { useAppChat } from '@/chat-ui'

function ChatPage() {
  const chat = useAppChat({ threadId: 'subagents' })
  return <chat.AppChat />
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
