import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

export const Route = createFileRoute('/resumable')({
  component: ResumablePage,
})

// One resumable connection to the durability-backed endpoint. `connect` starts
// a run; `joinRun` replays an existing run from the start off the server's log.
const connection = fetchServerSentEvents('/api/resumable')

/** Append every TEXT_MESSAGE_CONTENT delta from a chunk stream to React state. */
async function drainInto(
  chunks: AsyncIterable<StreamChunk>,
  onText: (delta: string) => void,
): Promise<void> {
  for await (const chunk of chunks) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') onText(chunk.delta)
  }
}

function randomId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function ResumablePage() {
  const [prompt, setPrompt] = useState('Write a short haiku about durable streams.')
  const [runId, setRunId] = useState('')
  const [producerText, setProducerText] = useState('')
  const [producerStatus, setProducerStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const producerAbort = useRef<AbortController | null>(null)

  const [joinId, setJoinId] = useState('')
  const [joinText, setJoinText] = useState('')
  const [joinStatus, setJoinStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const joinAbort = useRef<AbortController | null>(null)

  async function startRun() {
    producerAbort.current?.abort()
    const controller = new AbortController()
    producerAbort.current = controller

    const nextRunId = randomId('run')
    const threadId = randomId('thread')
    setRunId(nextRunId)
    setJoinId(nextRunId)
    setProducerText('')
    setProducerStatus('streaming')

    const messages: Array<ModelMessage> = [{ role: 'user', content: prompt }]
    try {
      await drainInto(
        connection.connect(messages, undefined, controller.signal, {
          threadId,
          runId: nextRunId,
        }),
        (delta) => setProducerText((prev) => prev + delta),
      )
      setProducerStatus('done')
    } catch {
      if (!controller.signal.aborted) setProducerStatus('error')
    }
  }

  async function joinRun() {
    if (!joinId) return
    joinAbort.current?.abort()
    const controller = new AbortController()
    joinAbort.current = controller

    setJoinText('')
    setJoinStatus('streaming')
    try {
      await drainInto(connection.joinRun(joinId, controller.signal), (delta) =>
        setJoinText((prev) => prev + delta),
      )
      setJoinStatus('done')
    } catch {
      if (!controller.signal.aborted) setJoinStatus('error')
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Resumable streams</h1>
      <p style={{ color: '#555' }}>
        Start a run, then <strong>join it by run ID</strong> — here, in a second
        tab, or after the original tab reloads. The join replays the same
        response from the server&rsquo;s durability log without re-running the
        model. Because the connection is durable, a dropped socket also
        auto-reconnects with <code>Last-Event-ID</code>.
      </p>

      <section style={panel}>
        <h2 style={h2}>1. Start a run</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 8 }}>
          <button onClick={() => void startRun()} disabled={producerStatus === 'streaming'}>
            {producerStatus === 'streaming' ? 'Streaming…' : 'Send'}
          </button>
        </div>
        {runId ? (
          <p style={{ marginTop: 8 }}>
            Run ID: <code>{runId}</code>{' '}
            <button onClick={() => void navigator.clipboard.writeText(runId)}>Copy</button>
          </p>
        ) : null}
        <pre style={output}>{producerText || '—'}</pre>
        <small style={{ color: '#888' }}>status: {producerStatus}</small>
      </section>

      <section style={panel}>
        <h2 style={h2}>2. Join a run</h2>
        <p style={{ color: '#555', marginTop: 0 }}>
          Paste a run ID (auto-filled from above) and join. Try it while the run
          above is still streaming, or open this page in another tab first.
        </p>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="run-…"
          style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 8 }}>
          <button onClick={() => void joinRun()} disabled={!joinId || joinStatus === 'streaming'}>
            {joinStatus === 'streaming' ? 'Joining…' : 'Join'}
          </button>
        </div>
        <pre style={output}>{joinText || '—'}</pre>
        <small style={{ color: '#888' }}>status: {joinStatus}</small>
      </section>
    </div>
  )
}

const panel: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
  marginTop: 16,
}

const h2: React.CSSProperties = { marginTop: 0 }

const output: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  background: '#f6f6f6',
  padding: 12,
  borderRadius: 6,
  minHeight: 48,
  marginTop: 12,
}
