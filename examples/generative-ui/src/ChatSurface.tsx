import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  GenerativeUIRenderer,
  CANONICAL_FIXTURES,
  type GraphDocument,
  type IntentPayload,
} from '@tanstack/ai-generative-ui'

/**
 * The inline-first surface (spec §1 principle 6, §15.1): a conversation stream
 * where a graph is *message content*, interleaved with the model's prose in the
 * host's chat typography. Follow-ups revise an already-rendered graph in place
 * (same graphId, next revision). This — not the Playground — is the demo.
 */

type Role = 'user' | 'assistant' | 'system'

interface Message {
  id: string
  role: Role
  text: string
  graphId?: string
  error?: boolean
}

interface FixtureStarter {
  scenario: string
  ask: string
  reply: string
}

// Instant, model-free demos (spec §14: nothing in the demo path *requires* a
// model). These drop a fixture graph straight into the stream as message content.
const FIXTURE_STARTERS: FixtureStarter[] = [
  {
    scenario: 'compare-plans-basic',
    ask: 'Compare the hosting plans',
    reply: "Here's how the three plans stack up side by side — Pro is the sweet spot for most teams.",
  },
  {
    scenario: 'bill-split',
    ask: 'Help me split a dinner bill',
    reply: 'Drag the tip and head-count and the totals recompute instantly — host-side, never model arithmetic.',
  },
  {
    scenario: 'chord-diagram-emaj7',
    ask: 'Show me an open Emaj7 voicing',
    reply: 'Here it is on the fretboard — tap any note to read its degree and spelling.',
  },
  {
    scenario: 'spend-monitor',
    ask: 'How is our spend tracking this month?',
    reply: 'Here’s the month at a glance.',
  },
  {
    scenario: 'savings-widget',
    ask: 'Let me explore retirement savings',
    reply: 'Here — a custom widget in a sandbox. Drag the contribution; the chart is drawn in-widget but the projected value is computed host-side, and "Save" comes back to me as a structured intent.',
  },
]

const LIVE_SUGGESTIONS = [
  'Build a mortgage calculator I can tweak',
  'A recipe card for chocolate lava cake with a serving-size stepper',
  'A migration checklist I can tick off',
  'Compare React state libraries in a table',
]

let idCounter = 0
const nextId = () => `m_${idCounter++}`

/** Minimal, safe inline markdown: **bold**, `code`, and paragraph breaks. */
function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  return (
    <>
      {paragraphs.map((para, pi) => {
        const lines = para.split(/\n/)
        return (
          <p key={pi} className="chat-prose-p">
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {renderInline(line)}
                {li < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}

function renderInline(line: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last) tokens.push(line.slice(last, match.index))
    if (match[1] !== undefined) {
      tokens.push(<strong key={key++}>{match[1]}</strong>)
    } else if (match[2] !== undefined) {
      tokens.push(
        <code key={key++} className="chat-inline-code">
          {match[2]}
        </code>,
      )
    }
    last = regex.lastIndex
  }
  if (last < line.length) tokens.push(line.slice(last))
  return tokens
}

export function ChatSurface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [graphs, setGraphs] = useState<Record<string, GraphDocument>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState('openai')
  const [expandedGraphId, setExpandedGraphId] = useState<string | null>(null)

  const endRef = useRef<HTMLDivElement | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        if (d.providers?.length) {
          setProviders(d.providers)
          setProvider(d.providers[0])
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, graphs])

  // Dev-only: expose the live graph store so the surface can be driven/asserted
  // from browser automation and E2E without reaching into React internals.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __genuiGraphs?: unknown }).__genuiGraphs = graphs
  }, [graphs])

  // A message renders its graph only if no *later* message references the same
  // graphId — so an in-place revision (rev N+1 of the same graphId) moves the
  // live graph down to the turn that mentions it, and never shows twice.
  const latestGraphRef = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of messages) if (m.graphId) map[m.graphId] = m.id
    return map
  }, [messages])

  const hasLive = providers.length > 0
  const empty = messages.length === 0

  function pushFixture(starter: FixtureStarter) {
    const fixture = CANONICAL_FIXTURES[starter.scenario]
    if (!fixture) return
    const clone: GraphDocument = JSON.parse(JSON.stringify(fixture))
    setGraphs((g) => ({ ...g, [clone.graphId]: clone }))
    setMessages((m) => [
      ...m,
      { id: nextId(), role: 'user', text: starter.ask },
      { id: nextId(), role: 'assistant', text: starter.reply, graphId: clone.graphId },
    ])
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')

    const userMsg: Message = { id: nextId(), role: 'user', text: trimmed }
    const history = [...messages, userMsg]
    setMessages(history)

    if (!hasLive) {
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'system',
          text: 'No model key configured — set one in .env.local to chat live, or try an instant demo below.',
        },
      ])
      return
    }

    setBusy(true)
    try {
      const payload = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: m.text,
          graph: m.graphId ? graphs[m.graphId] : undefined,
        }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to respond')

      const graph: GraphDocument | null = data.graph ?? null
      if (graph) setGraphs((g) => ({ ...g, [graph.graphId]: graph }))

      const prose: string =
        (typeof data.text === 'string' && data.text.trim()) ||
        (graph ? 'Here you go.' : 'Done.')

      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', text: prose, graphId: graph?.graphId },
      ])
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', error: true, text: err.message || 'Something went wrong.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  function handleIntent(intent: IntentPayload) {
    // Local intents (slider/tab/checklist) stay inside the renderer. Submit and
    // action intents are the bidirectional channel (§8) — surface them routing
    // back to the agent, without spending a model turn.
    if (intent.intentClass === 'local') return
    const payloadStr =
      intent.payload !== undefined ? ` · ${JSON.stringify(intent.payload)}` : ''
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: 'system',
        text: `intent · ${intent.intent}${payloadStr} · routed to agent (${intent.intentClass})`,
      },
    ])
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
          {empty ? (
            <Hero
              hasLive={hasLive}
              starters={FIXTURE_STARTERS}
              onFixture={pushFixture}
              suggestions={LIVE_SUGGESTIONS}
              onSuggestion={(s) => send(s)}
            />
          ) : (
            <div className="space-y-6">
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  graph={m.graphId ? graphs[m.graphId] : undefined}
                  showGraph={!!m.graphId && latestGraphRef[m.graphId] === m.id}
                  onIntent={handleIntent}
                  onExpand={setExpandedGraphId}
                />
              ))}
              {busy && <TypingRow />}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {expandedGraphId && graphs[expandedGraphId] && (
        <ExpandedGraphOverlay
          graph={graphs[expandedGraphId]}
          onIntent={handleIntent}
          onClose={() => setExpandedGraphId(null)}
        />
      )}

      {/* Composer */}
      <div className="border-t border-white/5 bg-[#070b14]/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4">
          <div className="chat-composer">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={hasLive ? 'Message the generative-UI agent…' : 'Try an instant demo above — or set an API key to chat live'}
              className="chat-composer-input"
              disabled={busy}
            />
            <div className="flex items-center gap-2 pl-2">
              {hasLive && (
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={busy}
                  className="chat-provider-select"
                  aria-label="Model provider"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                className="chat-send"
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-600 mt-2">
            Graphs are message content — the agent composing UI from a shared catalog, computed host-side, never model arithmetic.
          </p>
        </div>
      </div>
    </div>
  )
}

function Hero({
  hasLive,
  starters,
  onFixture,
  suggestions,
  onSuggestion,
}: {
  hasLive: boolean
  starters: FixtureStarter[]
  onFixture: (s: FixtureStarter) => void
  suggestions: string[]
  onSuggestion: (s: string) => void
}) {
  return (
    <div className="pt-10 sm:pt-16">
      <div className="flex items-center gap-2.5 mb-5">
        <BrandMark />
        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">Open Generative UI · Draft 0.1</span>
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-[1.1]">
        The agent, talking in a<br className="hidden sm:block" /> richer medium.
      </h1>
      <p className="mt-4 text-slate-400 text-[15px] leading-relaxed max-w-xl">
        Ask for a comparison, a calculator, a plan, a form, or a diagram. The reply
        is a live interface rendered inline — structure from a shared catalog, numbers
        computed by host code, interactions flowing back as structured intents.
      </p>

      <div className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Instant demos — no model needed</p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {starters.map((s) => (
            <button
              key={s.scenario}
              type="button"
              onClick={() => onFixture(s)}
              className="chat-starter"
            >
              <span className="chat-starter-ask">{s.ask}</span>
              <span className="chat-starter-tag">fixture</span>
            </button>
          ))}
        </div>
      </div>

      {hasLive && (
        <div className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Or compose something live</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onSuggestion(s)} className="chat-suggest">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageRow({
  message,
  graph,
  showGraph,
  onIntent,
  onExpand,
}: {
  message: Message
  graph?: GraphDocument
  showGraph: boolean
  onIntent: (i: IntentPayload) => void
  onExpand: (graphId: string) => void
}) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center">
        <span className="chat-system-pill">{message.text}</span>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="chat-user-bubble">{message.text}</div>
      </div>
    )
  }

  // assistant
  return (
    <div className="flex gap-3">
      <BrandMark />
      <div className="flex-1 min-w-0 space-y-3">
        {message.text && (
          <div className={message.error ? 'chat-assistant-error' : 'chat-assistant-prose'}>
            <Prose text={message.text} />
          </div>
        )}
        {showGraph && graph && (
          <div className="chat-graph-frame animate-surface-rise" key={`${graph.graphId}_${graph.revision}`}>
            <div className="chat-graph-meta">
              <span className="chat-graph-dot" />
              <span className="font-mono">{graph.graphId}</span>
              <span className="text-slate-600">·</span>
              <span>rev {graph.revision}</span>
              {graph.revision > 1 && <span className="chat-revised-badge">revised in place</span>}
              <button
                type="button"
                className="chat-expand-btn"
                onClick={() => onExpand(graph.graphId)}
                title="Expand"
                aria-label="Expand"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {/* Inline is height-capped (chat-graph-scroll); expand for the full surface. */}
            <div className="chat-graph-scroll">
              <GenerativeUIRenderer graph={graph} onIntent={onIntent} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ExpandedGraphOverlay({
  graph,
  onIntent,
  onClose,
}: {
  graph: GraphDocument
  onIntent: (i: IntentPayload) => void
  onClose: () => void
}) {
  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="chat-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-overlay-bar">
          <span className="font-mono text-[11px] text-slate-400">
            {graph.graphId} · rev {graph.revision}
          </span>
          <button type="button" className="chat-overlay-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="chat-overlay-body">
          <GenerativeUIRenderer graph={graph} onIntent={onIntent} />
        </div>
      </div>
    </div>
  )
}

function TypingRow() {
  return (
    <div className="flex gap-3">
      <BrandMark />
      <div className="chat-typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}

function BrandMark() {
  return (
    <div className="chat-avatar" aria-hidden>
      <span>◇</span>
    </div>
  )
}
