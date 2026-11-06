import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

// AI SDK `useChat({ resume: true })` against the resumable TanStack route in
// `api.ai-sdk-resume.$.ts`. `?chat=` is the chat id, so a reload rejoins it.
const transport = new DefaultChatTransport({ api: '/api/ai-sdk-resume/chat' })

export const Route = createFileRoute('/ai-sdk-resume')({
  validateSearch: (search: Record<string, unknown>) => ({
    chat: typeof search.chat === 'string' ? search.chat : 'ai-sdk-resume',
  }),
  component: AISDKResumePage,
})

function AISDKResumePage() {
  const { chat } = Route.useSearch()
  const { messages, sendMessage } = useChat({
    id: chat,
    transport,
    resume: true,
  })

  const assistant = messages.filter((message) => message.role === 'assistant')

  return (
    <div data-testid="ai-sdk-resume-page">
      <button
        data-testid="send-button"
        onClick={() => void sendMessage({ text: 'Tell me about the river' })}
      >
        Send
      </button>
      <div data-testid="assistant-count">{assistant.length}</div>
      <div data-testid="assistant-text">
        {assistant
          .flatMap((message) => message.parts)
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('')}
      </div>
    </div>
  )
}
