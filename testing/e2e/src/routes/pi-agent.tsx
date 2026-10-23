import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

// TanStack `useChat` talks to the pi agent loop in `api.pi-agent.ts`.
export const Route = createFileRoute('/pi-agent')({
  component: PiAgentPage,
})

function PiAgentPage() {
  const { messages, sendMessage } = useChat({
    threadId: 'pi-agent',
    connection: fetchServerSentEvents('/api/pi-agent'),
  })

  const parts = messages.flatMap((message) =>
    message.role === 'assistant' ? message.parts : [],
  )
  const assistantText = parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('')
  const toolResults = parts.flatMap((part) =>
    part.type === 'tool-result' ? [part.content] : [],
  )

  useEffect(() => {
    void sendMessage('Weather in Oslo?')
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="pi-agent-page">
      <div data-testid="tool-results">{toolResults.join(',')}</div>
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}
