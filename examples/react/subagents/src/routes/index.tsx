import { createFileRoute } from '@tanstack/react-router'
import { useAppChat } from '@/chat-ui'

function ChatPage() {
  const chat = useAppChat()
  return <chat.AppChat />
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
