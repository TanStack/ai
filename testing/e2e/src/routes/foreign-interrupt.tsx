import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness page for interrupts that arrive on the stream without a resume
 * binding this client owns. `/api/foreign-interrupt` ends a run with one bound
 * interrupt and one foreign one; this page renders both by `kind` so the spec
 * can assert the foreign one is visible but not resolvable, and that it does
 * not block resolving the bound one.
 */
function ForeignInterruptPage() {
  const { interrupts, messages, sendMessage } = useChat({
    threadId: 'foreign-1',
    connection: fetchServerSentEvents('/api/foreign-interrupt'),
  })

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  useEffect(() => {
    void sendMessage('go')
    // Fire the single run once on mount; the harness route ignores the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="foreign-interrupt-page">
      <div data-testid="interrupt-count">{interrupts.length}</div>
      <div data-testid="assistant-text">{assistantText}</div>
      {interrupts.map((interrupt) => (
        <div key={interrupt.id} data-testid={`interrupt-${interrupt.id}`}>
          <span data-testid={`kind-${interrupt.id}`}>{interrupt.kind}</span>
          <span data-testid={`can-resolve-${interrupt.id}`}>
            {String(interrupt.canResolve)}
          </span>
          <span data-testid={`message-${interrupt.id}`}>
            {interrupt.message ?? interrupt.reason}
          </span>
          {interrupt.kind === 'generic' ? (
            <button
              data-testid={`resolve-${interrupt.id}`}
              onClick={() => interrupt.resolveInterrupt({ confirmed: true })}
            >
              Confirm
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export const Route = createFileRoute('/foreign-interrupt')({
  component: ForeignInterruptPage,
})
