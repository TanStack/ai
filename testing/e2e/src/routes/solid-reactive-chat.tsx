import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/solid-reactive-chat')({
  component: SolidReactiveChatPage,
})

function SolidReactiveChatPage() {
  const controls = useRef<{
    sendMessage: (text: string) => Promise<void>
    setProvider: (provider: string) => void
  } | null>(null)
  const [ready, setReady] = useState(false)
  const [requests, setRequests] = useState<
    Array<{ users: number; provider: unknown }>
  >([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let dispose: (() => void) | undefined
    void Promise.all([import('@tanstack/ai-solid'), import('solid-js')])
      .then(([{ useChat }, { createRoot, createSignal }]) => {
        if (!active) return
        dispose = createRoot((disposeRoot) => {
          const [provider, setProvider] = createSignal('openai')
          const chat = useChat({
            fetcher: ({ messages, data, threadId, runId }) => {
              setRequests((current) => [
                ...current,
                {
                  users: messages.filter((message) => message.role === 'user')
                    .length,
                  provider: data?.['provider'],
                },
              ])
              const messageId = `response-${runId}`
              const body = [
                { type: 'RUN_STARTED', threadId, runId },
                {
                  type: 'TEXT_MESSAGE_CONTENT',
                  messageId,
                  model: 'test',
                  timestamp: Date.now(),
                  delta: 'ok',
                  content: 'ok',
                },
                {
                  type: 'RUN_FINISHED',
                  threadId,
                  runId,
                  model: 'test',
                  timestamp: Date.now(),
                  finishReason: 'stop',
                },
              ]
                .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                .join('')
              return new Response(body, {
                headers: { 'Content-Type': 'text/event-stream' },
              })
            },
            get body() {
              return { provider: provider() }
            },
          })
          controls.current = { sendMessage: chat.sendMessage, setProvider }
          setReady(true)
          return disposeRoot
        })
      })
      .catch((loadError: unknown) => {
        if (active) setError(String(loadError))
      })
    return () => {
      active = false
      controls.current = null
      dispose?.()
    }
  }, [])

  return (
    <main>
      <button
        type="button"
        data-testid="send-first"
        disabled={!ready}
        onClick={() => void controls.current?.sendMessage('First')}
      >
        Send first
      </button>
      <button
        type="button"
        data-testid="change-provider"
        disabled={!ready}
        onClick={() => controls.current?.setProvider('anthropic')}
      >
        Change provider
      </button>
      <button
        type="button"
        data-testid="send-second"
        disabled={!ready}
        onClick={() => void controls.current?.sendMessage('Second')}
      >
        Send second
      </button>
      <output data-testid="requests">{JSON.stringify(requests)}</output>
      {error !== null && <output data-testid="load-error">{error}</output>}
    </main>
  )
}
