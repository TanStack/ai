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
  // `?finish=tool_calls` ends turn 1 with finishReason 'tool_calls' instead
  // of a success outcome, the way a custom server forwards it.
  validateSearch: (search: Record<string, unknown>) => ({
    finish:
      search.finish === 'tool_calls'
        ? ('tool_calls' as const)
        : ('success' as const),
    // The router writes the result back to the URL (`approval=true`) and
    // checks it again, so `true` must stay `true`.
    approval: search.approval === true || search.approval === 1,
    // `?queue=1` queues a second message while the first run streams.
    queue: search.queue === true || search.queue === 1,
  }),
})

function ForeignClientToolPage() {
  const { finish, approval, queue } = Route.useSearch()
  const { messages, sendMessage, interrupts } = useChat({
    threadId: 'foreign-client-tool',
    connection: fetchServerSentEvents(
      `/api/foreign-client-tool?finish=${finish}`,
    ),
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
    if (queue) void sendMessage('queued')
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
