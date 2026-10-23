import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import { fromChatTransport } from '@tanstack/ai-ui-message-stream'
import { DefaultChatTransport } from 'ai'
import { z } from 'zod'

// The route's tool, so its approval is a bound `tool-approval` interrupt.
const addToCart = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the cart',
  inputSchema: z.object({ guitarId: z.string(), quantity: z.number() }),
  needsApproval: true,
})

const tools = [addToCart] as const

// TanStack `useChat` talks to the AI SDK `streamText` route in
// `api.ai-sdk-server.ts`. `?prompt=` sets the first user message.
const connection = fromChatTransport(
  new DefaultChatTransport({ api: '/api/ai-sdk-server' }),
  { tools },
)

export const Route = createFileRoute('/ai-sdk-server')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: AISDKServerPage,
})

function AISDKServerPage() {
  const { prompt = '[chat] recommend a guitar' } = Route.useSearch()
  const { messages, sendMessage, interrupts } = useChat({
    threadId: 'ai-sdk-server',
    connection,
    tools,
  })

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')
  const toolResults = messages
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === 'tool-result' ? [part.content] : []))
  const activities = messages.flatMap((message) =>
    message.role === 'activity'
      ? message.parts.flatMap((part) =>
          part.type === 'activity' ? [JSON.stringify(part.content)] : [],
        )
      : [],
  )

  useEffect(() => {
    void sendMessage(prompt)
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="ai-sdk-server-page">
      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <button
            key={interrupt.id}
            data-testid="approve-button"
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve {interrupt.toolName}
          </button>
        ) : null,
      )}
      {activities.map((content, index) => (
        <div key={index} data-testid="activity-content">
          {content}
        </div>
      ))}
      <div data-testid="tool-results">{toolResults.join(',')}</div>
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}
