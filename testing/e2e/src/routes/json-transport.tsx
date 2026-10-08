import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { fetchJson, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { z } from 'zod'
import { parseAimockPort } from '@/lib/devtools-test'
import { ChatUI } from '@/components/ChatUI'

/**
 * JSON transport harness (client half). `useChat` talks to
 * `/api/json-transport` through `fetchJson`, so every reply is one JSON body.
 *
 * - `?maxWaitMs=` is passed on to the server so it replies early and the
 *   client polls the rest.
 * - `persistence: true` + a threadId from `testId`: a reload keeps the same
 *   thread, hydrates `activeRun`, and joins the run with `joinRun`.
 */

const showNotification = toolDefinition({
  name: 'show_notification',
  description: 'Show a notification to the user',
  inputSchema: z.object({
    message: z.string(),
    type: z.enum(['info', 'warning', 'error']),
  }),
  outputSchema: z.object({ displayed: z.boolean() }),
}).client(() => ({ displayed: true }))

// Client stub for the server `delete_file` tool. `needsApproval` makes the
// pause hydrate as a tool approval, so ChatUI renders Approve / Deny.
const deleteFileApproval = toolDefinition({
  name: 'delete_file',
  description: 'Delete a file (requires approval)',
  inputSchema: z.object({ path: z.string() }),
  needsApproval: true,
}).client()

const tools = clientTools(showNotification, deleteFileApproval)

export const Route = createFileRoute('/json-transport')({
  component: JsonTransportPage,
  validateSearch: (search: Record<string, unknown>) => {
    const maxWaitMs = Number(search.maxWaitMs)
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: parseAimockPort(search.aimockPort),
      maxWaitMs: Number.isFinite(maxWaitMs) ? maxWaitMs : undefined,
    }
  },
})

function JsonTransportPage() {
  const { testId, aimockPort, maxWaitMs } = Route.useSearch()
  const connection = useMemo(
    () =>
      fetchJson(
        maxWaitMs === undefined
          ? '/api/json-transport'
          : `/api/json-transport?maxWaitMs=${maxWaitMs}`,
      ),
    [maxWaitMs],
  )
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const { messages, sendMessage, isLoading, interrupts, stop } = useChat({
    threadId: `json-transport-${testId ?? 'default'}`,
    connection,
    persistence: true,
    tools,
    body: { testId, aimockPort },
  })

  return (
    <>
      {hydrated ? <div data-testid="hydration-marker" hidden /> : null}
      <ChatUI
        messages={messages}
        isLoading={isLoading}
        onSendMessage={(text) => {
          void sendMessage(text)
        }}
        interrupts={interrupts}
        hasPendingInterrupt={interrupts.some((i) => i.status === 'pending')}
        onStop={stop}
      />
    </>
  )
}
