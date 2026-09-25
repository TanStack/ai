import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { webSocket } from '@tanstack/ai-react'

export const Route = createFileRoute('/websocket-adapter')({
  component: WebSocketAdapterPage,
})

/**
 * Client-adapter arm of the WebSocket delivery-durability harness: drives the
 * REAL `webSocket()` connection adapter (not a hand-rolled socket) against
 * `/api/durable-delivery-ws`, so the adapter's envelope unwrapping, ping
 * filtering, offset de-dupe, and auto-reconnect are what the e2e asserts.
 *
 * "run" streams the fixed sequence over one socket. "run with drop" adds
 * `?dropAfter=2`, making the server drop the socket after two frames — the
 * adapter must then reconnect at `?runId=&offset=` and resume the remainder
 * from the durability log, exactly once and in order.
 */
function WebSocketAdapterPage() {
  const [result, setResult] = useState('')
  // Buttons enable only after hydration so a Playwright click can't land
  // before React has attached the handlers (click auto-waits for enabled).
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  async function run(dropAfter: number | null) {
    const runId = `e2e-ws-adapter-${dropAfter === null ? 'plain' : 'drop'}-${Date.now()}`
    const base = `${location.origin.replace(/^http/, 'ws')}/api/durable-delivery-ws`
    const connection = webSocket(
      dropAfter === null ? base : `${base}?dropAfter=${dropAfter}`,
      { reconnect: { delayMs: 25, maxAttempts: 5 } },
    )
    const controller = new AbortController()
    const received: Array<{ type: string; delta?: string }> = []
    const consume = (async () => {
      for await (const chunk of connection.subscribe(controller.signal)) {
        received.push({
          type: chunk.type,
          ...('delta' in chunk && typeof chunk.delta === 'string'
            ? { delta: chunk.delta }
            : {}),
        })
        if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
          controller.abort()
        }
      }
    })()
    try {
      await connection.send([], undefined, undefined, {
        threadId: 'thread-durable',
        runId,
      })
      await consume
      setResult(JSON.stringify({ runId, received }))
    } catch (error) {
      setResult(JSON.stringify({ runId, received, error: String(error) }))
    }
  }

  return (
    <div>
      <h1>webSocket() adapter harness</h1>
      <button
        data-testid="ws-adapter-run"
        disabled={!ready}
        onClick={() => void run(null)}
      >
        run
      </button>
      <button
        data-testid="ws-adapter-run-drop"
        disabled={!ready}
        onClick={() => void run(2)}
      >
        run with drop
      </button>
      <pre data-testid="ws-adapter-result">{result}</pre>
    </div>
  )
}
