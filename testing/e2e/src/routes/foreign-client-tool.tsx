import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Client half of the issue #1464 harness. `/api/foreign-client-tool` is an
 * AG-UI producer that is not TanStack AI. It calls the frontend tool `ping`
 * and ends the run with a success outcome. The client must run `ping` and
 * start the next run with its result.
 */

const ping = toolDefinition({
  name: 'ping',
  description: 'Reply with pong',
  inputSchema: z.object({}),
}).client(() => ({ reply: 'pong' }))

export const Route = createFileRoute('/foreign-client-tool')({
  component: ForeignClientToolPage,
})

function ForeignClientToolPage() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/foreign-client-tool'),
    tools: [ping],
  })

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  const pingOutputs = messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'tool-call' && part.name === 'ping' && part.output
        ? [JSON.stringify(part.output)]
        : [],
    ),
  )

  useEffect(() => {
    void sendMessage('ping me')
    // Fire the single run once on mount; the harness route ignores the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="foreign-client-tool-page">
      <div data-testid="ping-outputs">{pingOutputs.join(',')}</div>
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}
