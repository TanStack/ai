import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * A server-authoritative chat (`persistence: true`) that mounts on the client,
 * after hydration, like a chat that waits for a thread id from localStorage.
 *
 * React Strict Mode replays the effects of a client mount (attach, detach,
 * attach). A component hydrated from the server render does not get that
 * replay, so `/persistence-durability` cannot show it. The GET answers with
 * the `server-interrupt` scenario's pending interrupt.
 */
const connection = fetchServerSentEvents(
  '/api/persistence-durability?scenario=server-interrupt',
)

export const Route = createFileRoute('/client-mount-hydrate')({
  component: ClientMountHydratePage,
})

function ClientMountHydratePage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <div data-testid="client-mount-hydrate-page" style={{ padding: 16 }}>
      {mounted ? <Chat /> : null}
    </div>
  )
}

function Chat() {
  const { interrupts } = useChat({
    threadId: 'client-mount-hydrate',
    connection,
    persistence: true,
  })
  return (
    <div data-testid="interrupt-count" data-count={String(interrupts.length)} />
  )
}
