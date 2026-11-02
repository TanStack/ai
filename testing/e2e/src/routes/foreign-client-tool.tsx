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
 *
 * With `?approval=1`, `ping` needs approval. The server does not ask for it,
 * so the client shows its own approval (issue #1945).
 */

const ping = toolDefinition({
  name: 'ping',
  description: 'Reply with pong',
  inputSchema: z.object({}),
}).client(() => ({ reply: 'pong' }))
const pingWithApproval = toolDefinition({
  name: 'ping',
  description: 'Reply with pong',
  inputSchema: z.object({}),
  needsApproval: true,
}).client(() => ({ reply: 'pong' }))

export const Route = createFileRoute('/foreign-client-tool')({
  component: ForeignClientToolPage,
  validateSearch: (search: Record<string, unknown>) => ({
    approval: search.approval === 1 || search.approval === '1',
  }),
})

function ForeignClientToolPage() {
  const { approval } = Route.useSearch()
  const { messages, sendMessage, interrupts } = useChat({
    threadId: 'foreign-client-tool',
    connection: fetchServerSentEvents('/api/foreign-client-tool'),
    tools: [approval ? pingWithApproval : ping],
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
      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <div key={interrupt.id} data-testid="approval">
            <button onClick={() => interrupt.resolveInterrupt(true)}>
              Approve
            </button>
            <button onClick={() => interrupt.resolveInterrupt(false)}>
              Deny
            </button>
          </div>
        ) : null,
      )}
    </div>
  )
}
