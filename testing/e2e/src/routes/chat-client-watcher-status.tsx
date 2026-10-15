import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import type { StreamChunk } from '@tanstack/ai'
import type { SubscribeConnectionAdapter } from '@tanstack/ai-react'

export const Route = createFileRoute('/chat-client-watcher-status')({
  component: ChatClientWatcherStatusPage,
})

const threadId = 'watched-thread'

function runChunks(runId: string, answer: string): Array<StreamChunk> {
  const base = { threadId, runId, timestamp: Date.now() }
  const messageId = `${runId}-answer`
  return [
    { ...base, type: EventType.RUN_STARTED },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: base.timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: answer,
      timestamp: base.timestamp,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: base.timestamp },
    { ...base, type: EventType.RUN_FINISHED, finishReason: 'stop' },
  ]
}

// Another tab sends. This page only watches the thread's events.
function createWatchedConnection() {
  const queue: Array<StreamChunk> = []
  let wake: (() => void) | undefined
  const connection: SubscribeConnectionAdapter = {
    subscribe(signal) {
      return (async function* () {
        while (!signal?.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve
              signal?.addEventListener('abort', () => resolve(), {
                once: true,
              })
            })
            wake = undefined
          }
          let chunk = queue.shift()
          while (chunk !== undefined) {
            yield chunk
            chunk = queue.shift()
          }
        }
      })()
    },
    send: () => Promise.resolve(),
  }
  const push = (chunks: Array<StreamChunk>) => {
    queue.push(...chunks)
    wake?.()
  }
  return { connection, push }
}

function ChatClientWatcherStatusPage() {
  const watched = useMemo(createWatchedConnection, [])
  const [hydrated, setHydrated] = useState(false)
  const [runs, setRuns] = useState(0)
  const { messages, status } = useChat({
    connection: watched.connection,
    threadId,
    live: true,
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  const answers = messages.filter((message) => message.role === 'assistant')

  return (
    <main className="p-6">
      <button
        data-testid="run"
        type="button"
        disabled={!hydrated}
        onClick={() => {
          const next = runs + 1
          setRuns(next)
          watched.push(runChunks(`run-${next}`, `Answer ${next}.`))
        }}
      >
        Run in another tab
      </button>
      <output data-testid="status">{status}</output>
      <output data-testid="answers">{answers.length}</output>
    </main>
  )
}
