import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

/**
 * Harness page for MCP tools gated with `needsApproval`. The browser has no
 * client definition for them, so `useChat` surfaces the pause as a
 * `server-tool-approval` item. `/api/mcp-policy-test` with `policy: 'approval'`
 * gates every MCP tool.
 */
function McpApprovalPage() {
  const { testId, aimockPort } = Route.useSearch()
  const { interrupts, messages, sendMessage } = useChat({
    threadId: `mcp-approval-${testId ?? 'local'}`,
    connection: fetchServerSentEvents('/api/mcp-policy-test'),
    forwardedProps: { testId, aimockPort, policy: 'approval' },
  })

  useEffect(() => {
    void sendMessage('[mcp] how much is the strat guitar')
    // Fire the single run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join(' ')

  return (
    <div data-testid="mcp-approval-page">
      <div data-testid="assistant-text">{assistantText}</div>
      {interrupts.map((interrupt) => (
        <div key={interrupt.id} data-testid="interrupt">
          <span data-testid="interrupt-kind">{interrupt.kind}</span>
          {interrupt.kind === 'server-tool-approval' ? (
            <>
              <span data-testid="interrupt-tool">{interrupt.toolName}</span>
              <span data-testid="interrupt-args">
                {JSON.stringify(interrupt.originalArgs)}
              </span>
              <button
                data-testid="approve"
                disabled={!interrupt.canResolve}
                onClick={() => interrupt.resolveInterrupt(true)}
              >
                Approve
              </button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export const Route = createFileRoute('/mcp-approval')({
  component: McpApprovalPage,
  validateSearch: parseDevtoolsRouteSearch,
})
