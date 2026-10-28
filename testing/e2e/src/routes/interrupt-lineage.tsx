import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { EventType } from '@tanstack/ai/client'
import type { StreamChunk } from '@tanstack/ai/client'
import type { SubscribeConnectionAdapter } from '@tanstack/ai-client'

function InterruptLineagePage() {
  const [eventCount, setEventCount] = useState(0)
  const replay = useMemo(() => {
    const chunks: Array<StreamChunk> = []
    let wake: (() => void) | undefined
    const connection: SubscribeConnectionAdapter = {
      async *subscribe(signal) {
        while (!signal?.aborted) {
          const chunk = chunks.shift()
          if (chunk) {
            yield chunk
          } else {
            await new Promise<void>((resolve) => {
              wake = resolve
              signal?.addEventListener('abort', () => resolve(), { once: true })
            })
          }
        }
      },
      send: () => Promise.resolve(),
    }
    return {
      connection,
      publish(chunk: StreamChunk) {
        chunks.push(chunk)
        wake?.()
        wake = undefined
      },
    }
  }, [])
  const { interrupts, isSubscribed } = useChat({
    threadId: 'lineage-1',
    connection: replay.connection,
    live: true,
    onChunk: () => setEventCount((count) => count + 1),
  })

  const publish = (chunk: StreamChunk) => replay.publish(chunk)
  const start = (runId: string, parentRunId?: string) =>
    publish({
      type: EventType.RUN_STARTED,
      threadId: 'lineage-1',
      runId,
      parentRunId,
      timestamp: Date.now(),
    })

  return (
    <section style={{ fontSize: 20, lineHeight: 1.5, padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Interrupt replay</h1>
      <p>
        Events processed: <span data-testid="event-count">{eventCount}</span>
      </p>
      <p>
        Pending decisions:{' '}
        <span data-testid="interrupt-count">{interrupts.length}</span>
      </p>
      <fieldset
        disabled={!isSubscribed}
        style={{
          fontSize: 'inherit',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 0',
        }}
      >
        <legend>Replay events</legend>
        <button
          className="rounded border px-4 py-2"
          style={{ font: 'inherit' }}
          onClick={() => start('run-A')}
        >
          Start parent
        </button>
        <button
          className="rounded border px-4 py-2"
          style={{ font: 'inherit' }}
          onClick={() => start('run-B', 'run-A')}
        >
          Link child
        </button>
        <button
          className="rounded border px-4 py-2"
          style={{ font: 'inherit' }}
          onClick={() =>
            publish({
              type: EventType.RUN_FINISHED,
              runId: 'run-B',
              threadId: 'lineage-1',
              timestamp: Date.now(),
              outcome: { type: 'success' },
            })
          }
        >
          Finish child
        </button>
        <button
          className="rounded border px-4 py-2"
          style={{ font: 'inherit' }}
          onClick={() =>
            publish({
              type: EventType.RUN_FINISHED,
              runId: 'run-A',
              threadId: 'lineage-1',
              timestamp: Date.now(),
              outcome: {
                type: 'interrupt',
                interrupts: [
                  {
                    id: 'pause-A',
                    reason: 'confirmation',
                    message: 'Approve this step?',
                  },
                ],
              },
            })
          }
        >
          Pause parent
        </button>
      </fieldset>
      {interrupts.map((interrupt) => (
        <p key={interrupt.id}>{interrupt.message}</p>
      ))}
    </section>
  )
}

export const Route = createFileRoute('/interrupt-lineage')({
  component: InterruptLineagePage,
})
