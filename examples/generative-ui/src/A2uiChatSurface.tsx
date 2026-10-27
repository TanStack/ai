import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  A2uiSurfaceStore,
  GenerativeUIRenderer,
  type Diagnostic,
  type IntentPayload,
} from '@tanstack/ai-generative-ui'

/**
 * Chat-driven A2UI. The model emits A2UI v0.9 operations through the a2ui_ops
 * tool (server/a2ui-chat-route.ts). Here every a2ui_ops call across the whole
 * conversation is replayed, in order, into one persistent A2uiSurfaceStore — so
 * "build a dashboard" then "add a budget metric" accumulate into an evolving
 * surface, rendered by the same GenerativeUIRenderer the Chat tab uses.
 */

const STARTERS = [
  'Show a flight card from PDX to SFO',
  'Build a spend dashboard: two metrics and a bar chart by week',
  'Make a signup form with name, email, and a submit button',
]

const FOLLOW_UPS = [
  'Add a budget metric',
  'Turn the chart into a pie chart',
  'Add a row to the table',
]

interface ToolCallPart {
  type: string
  name?: string
  arguments?: string
  id?: string
}

/** Pull the ordered a2ui_ops operation batches out of the message history. */
function collectOps(messages: Array<any>): Array<unknown> {
  const batches: Array<unknown> = []
  for (const m of messages) {
    for (const part of (m.parts ?? []) as Array<ToolCallPart>) {
      if (part.type !== 'tool-call' || part.name !== 'a2ui_ops') continue
      if (!part.arguments) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(part.arguments)
      } catch {
        continue // still streaming
      }
      const ops = (parsed as { operations?: unknown }).operations
      if (Array.isArray(ops)) batches.push(...ops)
    }
  }
  return batches
}

/** First text content of a message (prose). */
function textOf(message: any): string {
  const parts: Array<any> = message.parts ?? []
  const t = parts
    .filter((p) => p.type === 'text')
    .map((p) => p.content)
    .join('')
  if (t) return t
  return typeof message.content === 'string' ? message.content : ''
}

export function A2uiChatSurface() {
  const [providers, setProviders] = useState<Array<string>>([])
  const [provider, setProvider] = useState('openai')
  const providerRef = useRef(provider)
  providerRef.current = provider
  const [input, setInput] = useState('')
  const [intents, setIntents] = useState<Array<string>>([])
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        const usable = (d.providers ?? []).filter((p: string) =>
          ['openai', 'anthropic'].includes(p),
        )
        if (usable.length) {
          setProviders(usable)
          setProvider(usable[0])
        }
      })
      .catch(() => {})
  }, [])

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/a2ui-chat', async () => ({
      body: { provider: providerRef.current },
    })),
  })

  // Replay every a2ui_ops batch into a fresh store — a pure function of the
  // message history, so it's deterministic across re-renders.
  const { surfaces, diagnostics } = useMemo(() => {
    const store = new A2uiSurfaceStore()
    const diags: Array<Diagnostic> = []
    for (const op of collectOps(messages as Array<any>)) {
      diags.push(...store.applyContainer(op))
    }
    const built = store.listSurfaces().map((id) => {
      const result = store.getGraphWithDiagnostics(id)
      diags.push(...result.diagnostics)
      return result.graph
    })
    return { surfaces: built.filter(Boolean), diagnostics: diags }
  }, [messages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setInput('')
    void sendMessage(trimmed)
  }

  const onIntent = (intent: IntentPayload) => {
    setIntents((prev) => [
      `${intent.intentClass} · ${intent.intent}${
        intent.payload ? ` ${JSON.stringify(intent.payload)}` : ''
      }`,
      ...prev,
    ])
  }

  const empty = messages.length === 0
  const suggestions = empty ? STARTERS : FOLLOW_UPS

  return (
    <div className="h-full overflow-hidden bg-[#070b14] text-slate-200">
      <div className="mx-auto grid h-full w-full max-w-6xl grid-cols-1 lg:grid-cols-2 gap-4 px-4 sm:px-6 py-6 min-h-0">
        {/* Left: the conversation */}
        <div className="flex flex-col min-h-0 rounded-xl border border-white/10 bg-[#0b1120]">
          <div className="flex items-center justify-between px-3 h-10 border-b border-white/5">
            <span className="text-[11px] font-mono text-slate-400">
              a2ui agent · emits a2ui_ops
            </span>
            {providers.length > 0 ? (
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={isLoading}
                className="rounded border border-white/10 bg-[#070b14] px-2 py-1 text-[11px] text-slate-300"
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {empty ? (
              <p className="text-xs text-slate-500 leading-relaxed">
                {providers.length
                  ? 'Ask the agent to build a surface, then ask it to change it. Each request emits A2UI operations that render on the right.'
                  : 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local to chat live.'}
              </p>
            ) : (
              (messages as Array<any>).map((m) => {
                const text = textOf(m)
                const toolCalls = (
                  (m.parts ?? []) as Array<ToolCallPart>
                ).filter((p) => p.type === 'tool-call' && p.name === 'a2ui_ops')
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white max-w-[85%]">
                        {text}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={m.id} className="space-y-1.5">
                    {text ? (
                      <div className="text-xs text-slate-300 leading-relaxed">
                        {text}
                      </div>
                    ) : null}
                    {toolCalls.map((tc, i) => (
                      <div
                        key={tc.id ?? i}
                        className="inline-flex items-center gap-1.5 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-emerald-300"
                      >
                        ⚙ a2ui_ops
                      </div>
                    ))}
                  </div>
                )
              })
            )}
            {isLoading ? (
              <div className="text-[11px] font-mono text-slate-500">…</div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="border-t border-white/5 p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={isLoading}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                placeholder="Build or change a surface…"
                className="flex-1 rounded-lg border border-white/10 bg-[#070b14] px-3 py-2 text-xs text-white placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Right: the live surface(s) */}
        <div className="flex flex-col min-h-0 gap-3 overflow-y-auto">
          {surfaces.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-slate-500">
              The surface the agent builds renders here.
            </div>
          ) : (
            surfaces.map((graph) => (
              <div
                key={graph!.graphId}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-mono text-slate-400">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                    provenance: {graph!.provenance.driver}
                  </span>
                  <span>{graph!.graphId}</span>
                  <span>rev {graph!.revision}</span>
                </div>
                <GenerativeUIRenderer graph={graph!} onIntent={onIntent} />
              </div>
            ))
          )}

          {intents.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0b1120] p-3">
              <p className="text-[11px] font-mono text-slate-500 mb-1">
                intents fired
              </p>
              <ul className="space-y-1">
                {intents.map((line, i) => (
                  <li key={i} className="text-[11px] font-mono text-indigo-300">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {diagnostics.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#0b1120] p-3">
              <p className="text-[11px] font-mono text-slate-500 mb-1">
                diagnostics · {diagnostics.length} (never silent)
              </p>
              <ul className="space-y-1 max-h-32 overflow-auto">
                {diagnostics.map((d, i) => (
                  <li
                    key={i}
                    className="text-[11px] font-mono text-amber-300/80"
                  >
                    {d.code}
                    {d.componentId ? `  ·  ${d.componentId}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
