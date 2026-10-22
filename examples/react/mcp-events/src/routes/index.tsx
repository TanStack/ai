import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { emitDesk, subscribeDesk } from '@/lib/desk'
import type { DeskSnapshot } from '@/lib/desk'

function McpEventsPage() {
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'subscribe' | 'emit' | ''>('')

  async function onSubscribe() {
    setError('')
    setPending('subscribe')
    try {
      setSnapshot(await subscribeDesk())
    } catch (caught) {
      setSnapshot(null)
      setError(caught instanceof Error ? caught.message : 'Subscribe failed.')
    } finally {
      setPending('')
    }
  }

  async function onEmit() {
    setError('')
    setPending('emit')
    try {
      setSnapshot(await emitDesk())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Emit failed.')
    } finally {
      setPending('')
    }
  }

  const last = snapshot?.events[snapshot.events.length - 1]

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-bold text-white">Incident desk</h1>
      <p className="mb-6 text-gray-300">
        Subscribe to <code>incident.created</code>, then emit a signed webhook.
        This page shows the event that <code>createMCPEventWebhook</code>{' '}
        verified.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded bg-white px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          disabled={pending !== ''}
          onClick={() => {
            void onSubscribe()
          }}
        >
          {pending === 'subscribe' ? 'Subscribing' : 'Subscribe'}
        </button>
        <button
          type="button"
          className="rounded bg-emerald-400 px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          disabled={pending !== '' || snapshot === null}
          onClick={() => {
            void onEmit()
          }}
        >
          {pending === 'emit' ? 'Emitting' : 'Emit incident'}
        </button>
      </div>
      {error !== '' ? (
        <p className="mt-4 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {snapshot !== null ? (
        <div className="mt-8 space-y-6 text-gray-100">
          <section>
            <h2 className="text-xl font-semibold">Catalog</h2>
            <p>{snapshot.names.join(', ')}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Subscription</h2>
            <p>{snapshot.subscriptionId ?? 'none'}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Last event</h2>
            {last === undefined ? (
              <p>No delivery yet. Click Emit incident.</p>
            ) : (
              <pre className="whitespace-pre-wrap rounded bg-gray-800 p-4">
                {JSON.stringify(last, null, 2)}
              </pre>
            )}
          </section>
        </div>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: McpEventsPage,
})
