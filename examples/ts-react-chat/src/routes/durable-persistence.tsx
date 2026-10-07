import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

export const Route = createFileRoute('/durable-persistence')({
  component: DurablePersistencePage,
})

/**
 * A fetch that reports how many text chunks each network read of an SSE
 * response carries. It counts before the client parses anything, so the
 * numbers show what the server sent and when, not when React rendered it.
 */
function countingFetch(onRead: (textChunks: number) => void): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init)
    const isSse = response.headers
      .get('content-type')
      ?.includes('text/event-stream')
    if (!response.body || !isSse) return response
    const decoder = new TextDecoder()
    let pending = ''
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(bytes, controller) {
          pending += decoder.decode(bytes, { stream: true })
          const events = pending.split('\n\n')
          pending = events.pop() ?? ''
          const textChunks = events.filter((event) =>
            event.includes('"type":"TEXT_MESSAGE_CONTENT"'),
          ).length
          if (textChunks > 0) onRead(textChunks)
          controller.enqueue(bytes)
        },
      }),
    )
    return new Response(counted, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

// The thread id lives in localStorage, so a reload opens the same thread. The
// transcript itself lives on the server.
const THREAD_KEY = 'durable-persistence:thread'

function newThreadId(): string {
  const id = `thread-${crypto.randomUUID()}`
  window.localStorage.setItem(THREAD_KEY, id)
  return id
}

function DurablePersistencePage() {
  // Read on the client only: the server render has no localStorage.
  const [threadId, setThreadId] = useState<string | null>(null)
  useEffect(() => {
    setThreadId(window.localStorage.getItem(THREAD_KEY) ?? newThreadId())
  }, [])

  return (
    <div style={page}>
      <h1>Durable persistence</h1>
      <p style={{ color: '#555' }}>
        <code>persistence: true</code> on the client. The server POST is the
        persistence guide's POST plus{' '}
        <code>durability: {'{ adapter: memoryStream(request) }'}</code>. Send a
        long prompt and watch the counter. Reload while it streams: the reply
        continues where it was. After a reload, the part you missed arrives as
        one step, then the rest streams.
      </p>
      <button
        type="button"
        onClick={() => setThreadId(newThreadId())}
        style={{ marginBottom: 12 }}
      >
        New thread
      </button>
      {threadId ? <ChatPane key={threadId} threadId={threadId} /> : null}
    </div>
  )
}

interface ChunkStats {
  chunks: number
  steps: number
  biggestStep: number
}

const NO_STATS: ChunkStats = { chunks: 0, steps: 0, biggestStep: 0 }

function ChatPane({ threadId }: { threadId: string }) {
  const [oldBatching, setOldBatching] = useState(false)
  const [slowModel, setSlowModel] = useState(true)
  const [stats, setStats] = useState<ChunkStats>(NO_STATS)
  // Network reads within 5ms of each other count as one step on screen.
  const tracker = useRef({ lastAt: 0, currentStep: 0 })

  const connection = useMemo(
    () =>
      fetchServerSentEvents('/api/durable-persistence', {
        fetchClient: countingFetch((textChunks) => {
          const now = performance.now()
          const t = tracker.current
          const newStep = now - t.lastAt > 5
          t.currentStep = (newStep ? 0 : t.currentStep) + textChunks
          t.lastAt = now
          const step = t.currentStep
          setStats((s) => ({
            chunks: s.chunks + textChunks,
            steps: s.steps + (newStep ? 1 : 0),
            biggestStep: Math.max(s.biggestStep, step),
          }))
        }),
      }),
    [],
  )

  const { messages, sendMessage, isLoading, connectionStatus } = useChat({
    threadId,
    connection,
    persistence: true,
    body: { oldBatching, slowModel },
  })
  const [input, setInput] = useState(
    'Write a 700-word story about a lighthouse keeper.',
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    setStats(NO_STATS)
    tracker.current = { lastAt: 0, currentStep: 0 }
    void sendMessage(text)
  }

  return (
    <>
      <label style={{ display: 'block', margin: '8px 0' }}>
        <input
          type="checkbox"
          checked={oldBatching}
          onChange={(e) => setOldBatching(e.target.checked)}
        />{' '}
        Old batching (no <code>batchWaitMs</code>, how <code>main</code>{' '}
        behaves)
      </label>
      <label style={{ display: 'block', margin: '8px 0' }}>
        <input
          type="checkbox"
          checked={slowModel}
          onChange={(e) => setSlowModel(e.target.checked)}
        />{' '}
        Slow model (30ms between text chunks, so the batching is easy to see)
      </label>
      <div style={{ margin: '12px 0', color: '#888', fontSize: 13 }}>
        thread: <code>{threadId}</code> | connection:{' '}
        <code>{connectionStatus}</code>
        <br />
        text chunks: <strong>{stats.chunks}</strong> | arrived in{' '}
        <strong>{stats.steps}</strong> steps | biggest step:{' '}
        <strong>{stats.biggestStep}</strong> chunks
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={message.role === 'user' ? userBubble : assistantBubble}
          >
            <div style={roleLabel}>{message.role}</div>
            {message.parts.map((part, index) =>
              part.type === 'text' && part.content ? (
                <p
                  key={`${message.id}-${index}`}
                  style={{ margin: 0, whiteSpace: 'pre-wrap' }}
                >
                  {part.content}
                </p>
              ) : null,
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: 16, display: 'flex', gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Streaming...' : 'Send'}
        </button>
      </form>
    </>
  )
}

const page: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
}

const bubble: React.CSSProperties = {
  borderRadius: 8,
  padding: '10px 14px',
  maxWidth: '85%',
}

const userBubble: React.CSSProperties = {
  ...bubble,
  alignSelf: 'flex-end',
  background: '#eef2ff',
}

const assistantBubble: React.CSSProperties = {
  ...bubble,
  alignSelf: 'flex-start',
  background: '#f6f6f6',
}

const roleLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#999',
  marginBottom: 4,
}
