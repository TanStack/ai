import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useChat, fetchServerSentEvents, useMcpAppBridge } from '@tanstack/ai-react'
import { MCPAppResource } from '@tanstack/ai-react/mcp-apps'
import {
  GenerativeUIRenderer,
  FrameArtifactRenderer,
  validateGraph,
  LiveDriver,
  type ArtifactPin,
  type GraphDocument,
  type IntentPayload,
} from '@tanstack/ai-generative-ui'

/**
 * The inline-first surface (Draft 0.2 §11 / Draft 0.1 §1.6): a conversation
 * stream powered by `@tanstack/ai` `useChat`. The model composes Tier N catalog
 * graphs (the `render_ui` tool — its args ARE the graph) and authors Tier F
 * artifacts (the `generativeUiArtifacts` middleware's `create_artifact` tool,
 * built + stored server-side). Both render inline as message content, in the
 * host's chat typography.
 */

// chat() wires real adapters only for these; others stay in the Playground.
const CHAT_PROVIDERS = ['openai', 'anthropic']

const STARTERS = [
  'Compare three hosting plans in a table',
  'Build me a mortgage calculator I can tweak',
  'Show an open Emaj7 chord voicing as a fretboard diagram',
  'A monthly spend monitor with a sortable table and a chart',
  'A migration checklist I can tick off',
]

interface FramePin extends ArtifactPin {
  title?: string
  kind?: string
}

/* ---- inline markdown (bold / code / paragraphs) -------------------------- */
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
    if (match[1] !== undefined) tokens.push(<strong key={key++}>{match[1]}</strong>)
    else if (match[2] !== undefined) tokens.push(<code key={key++} className="chat-inline-code">{match[2]}</code>)
    last = regex.lastIndex
  }
  if (last < line.length) tokens.push(line.slice(last))
  return tokens
}

/** Parse a render_ui tool-call's args (a JSON string, possibly mid-stream) into a validated graph. */
function parseGraph(argsJson: string): GraphDocument | null {
  if (!argsJson) return null
  let raw: unknown
  try {
    raw = JSON.parse(argsJson)
  } catch {
    return null // still streaming / incomplete
  }
  if (!raw || typeof raw !== 'object' || !(raw as any).specVersion || !(raw as any).root) return null
  const validation = validateGraph(raw, { repair: true })
  return validation.valid && validation.graph ? validation.graph : LiveDriver.processModelOutput(raw)
}

const sandboxUrl = (pin: ArtifactPin, instanceId: string) =>
  `/sandbox/${pin.artifactId}/${pin.revision}?i=${encodeURIComponent(instanceId)}`

// MCP Apps (SEP-1865) sandbox proxy — served cross-origin (scripts/serve-sandbox.mjs)
// as @mcp-ui/client's AppRenderer requires. html-fragment artifacts render through
// this standard host path; react-tsx keeps the FrameArtifactRenderer.
const MCP_SANDBOX = { url: new URL('http://localhost:8765/sandbox_proxy.html') }

export function ChatSurface() {
  const [providers, setProviders] = useState<Array<string>>([])
  const [provider, setProvider] = useState('openai')
  const providerRef = useRef(provider)
  providerRef.current = provider

  const [input, setInput] = useState('')
  const [expandedGraph, setExpandedGraph] = useState<GraphDocument | null>(null)
  const [notices, setNotices] = useState<Array<string>>([])
  // toolCallId -> artifact pin, delivered by the genui:artifact custom event.
  const [framePins, setFramePins] = useState<Record<string, FramePin>>({})
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((d) => {
        const usable = (d.providers ?? []).filter((p: string) => CHAT_PROVIDERS.includes(p))
        if (usable.length) {
          setProviders(usable)
          setProvider(usable[0])
        }
      })
      .catch(() => {})
  }, [])

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat', async () => ({ body: { provider: providerRef.current } })),
    onCustomEvent: (eventType: string, data: any, context: { toolCallId?: string }) => {
      if (eventType === 'genui:artifact' && context.toolCallId && data?.pin) {
        setFramePins((p) => ({ ...p, [context.toolCallId!]: { ...data.pin, title: data.title, kind: data.kind } }))
      }
    },
  })

  // Host bridge for MCP Apps widgets: routes a widget's ui/message back into
  // this chat and opens links. (Our html-fragment artifacts don't call server
  // tools, so no callEndpoint is needed.)
  const mcpBridge = useMcpAppBridge({
    threadId: 'genui-chat',
    // Our html-fragment artifacts don't call server tools; this endpoint is a
    // required nominal (only hit if a widget invokes tools/call).
    callEndpoint: '/api/mcp-apps-call',
    chat: { sendMessage: async (content: string) => { await sendMessage(content) } },
    onLink: (url: string) => window.open(url, '_blank', 'noopener,noreferrer'),
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, notices])

  // Revise-in-place: a graphId / artifactId may appear in several tool-call
  // parts across turns; render only the latest so rev N+1 replaces rev N.
  const latest = useMemo(() => {
    const graphPart: Record<string, string> = {}
    const framePartByArtifact: Record<string, string> = {}
    for (const m of messages as Array<any>) {
      for (const part of m.parts ?? []) {
        if (part.type !== 'tool-call') continue
        if (part.name === 'render_ui') {
          const g = parseGraph(part.arguments)
          if (g) graphPart[g.graphId] = part.id
        } else if (part.name === 'create_artifact' || part.name === 'revise_artifact') {
          const pin = framePins[part.id]
          if (pin) framePartByArtifact[pin.artifactId] = part.id
        }
      }
    }
    return { graphPart, framePartByArtifact }
  }, [messages, framePins])

  function handleIntent(intent: IntentPayload) {
    if (intent.intentClass === 'local') return
    const payload = intent.payload !== undefined ? ` · ${JSON.stringify(intent.payload)}` : ''
    setNotices((n) => [...n, `intent · ${intent.intent}${payload} · routed to agent (${intent.intentClass})`])
  }

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    setInput('')
    void sendMessage(trimmed)
  }

  const empty = messages.length === 0

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8">
          {empty ? (
            <Hero starters={STARTERS} onSend={send} />
          ) : (
            <div className="space-y-6">
              {(messages as Array<any>).map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  framePins={framePins}
                  latest={latest}
                  mcpBridge={mcpBridge}
                  onIntent={handleIntent}
                  onExpand={setExpandedGraph}
                />
              ))}
              {notices.map((n, i) => (
                <div key={`notice_${i}`} className="flex justify-center">
                  <span className="chat-system-pill">{n}</span>
                </div>
              ))}
              {isLoading && <TypingRow />}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {expandedGraph && (
        <ExpandedGraphOverlay graph={expandedGraph} onIntent={handleIntent} onClose={() => setExpandedGraph(null)} />
      )}

      <div className="border-t border-white/5 bg-[#070b14]/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4">
          <div className="chat-composer">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder={providers.length ? 'Message the generative-UI agent…' : 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local to chat live'}
              className="chat-composer-input"
              disabled={isLoading}
            />
            <div className="flex items-center gap-2 pl-2">
              {providers.length > 0 && (
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={isLoading}
                  className="chat-provider-select"
                  aria-label="Model provider"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => send(input)} disabled={isLoading || !input.trim()} className="chat-send" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-600 mt-2">
            Two tiers, one conversation — render_ui composes a catalog graph; create_artifact builds a sandboxed frame. Both inline, numbers host-side.
          </p>
        </div>
      </div>
    </div>
  )
}

function Hero({ starters, onSend }: { starters: Array<string>; onSend: (s: string) => void }) {
  return (
    <div className="pt-10 sm:pt-16">
      <div className="flex items-center gap-2.5 mb-5">
        <BrandMark />
        <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">Open Generative UI · Draft 0.2</span>
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-[1.1]">
        The agent, talking in a<br className="hidden sm:block" /> richer medium.
      </h1>
      <p className="mt-4 text-slate-400 text-[15px] leading-relaxed max-w-xl">
        Ask for a comparison, a calculator, a chord diagram, or a data monitor. The reply renders
        inline — a catalog graph when structure wins, or a sandboxed custom artifact when craft does.
      </p>
      <div className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Try asking</p>
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s} type="button" onClick={() => onSend(s)} className="chat-suggest">{s}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface LatestMap {
  graphPart: Record<string, string>
  framePartByArtifact: Record<string, string>
}

function MessageRow({
  message,
  framePins,
  latest,
  mcpBridge,
  onIntent,
  onExpand,
}: {
  message: any
  framePins: Record<string, FramePin>
  latest: LatestMap
  mcpBridge: any
  onIntent: (i: IntentPayload) => void
  onExpand: (g: GraphDocument) => void
}) {
  if (message.role === 'user') {
    const text = textOf(message)
    return (
      <div className="flex justify-end">
        <div className="chat-user-bubble">{text}</div>
      </div>
    )
  }

  const parts: Array<any> = message.parts ?? []
  const text = textOf(message)

  return (
    <div className="flex gap-3">
      <BrandMark />
      <div className="flex-1 min-w-0 space-y-3">
        {text && (
          <div className="chat-assistant-prose">
            <Prose text={text} />
          </div>
        )}
        {parts.map((part, i) => {
          // ---- Tier F via the MCP Apps standard path: a ui-resource part ----
          // html-fragment artifacts flow through the SDK's MCPAppResource
          // (@mcp-ui/client AppRenderer) — the exact component that renders
          // external MCP server widgets.
          if (part.type === 'ui-resource') {
            return (
              <div className="chat-graph-frame animate-surface-rise" key={part.toolCallId ?? `uir-${i}`}>
                <div className="chat-graph-meta">
                  <span className="chat-graph-dot" />
                  <span className="font-mono">{part.resource?.uri}</span>
                  <span className="text-slate-600">·</span>
                  <span>MCP App</span>
                </div>
                {/* The MCP-Apps-native guest sizes the iframe via
                    ui/notifications/size-changed, so no fixed height is needed. */}
                <MCPAppResource part={part} sandbox={MCP_SANDBOX} bridge={mcpBridge} />
              </div>
            )
          }
          if (part.type !== 'tool-call') return null
          // ---- Tier N: render_ui graph ----
          if (part.name === 'render_ui') {
            const graph = parseGraph(part.arguments)
            if (!graph || latest.graphPart[graph.graphId] !== part.id) return null
            return (
              <div className="chat-graph-frame animate-surface-rise" key={part.id}>
                <div className="chat-graph-meta">
                  <span className="chat-graph-dot" />
                  <span className="font-mono">{graph.graphId}</span>
                  <span className="text-slate-600">·</span>
                  <span>rev {graph.revision}</span>
                  {graph.revision > 1 && <span className="chat-revised-badge">revised in place</span>}
                  <button type="button" className="chat-expand-btn" onClick={() => onExpand(graph)} title="Expand" aria-label="Expand">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <div className="chat-graph-scroll">
                  <GenerativeUIRenderer graph={graph} onIntent={onIntent} />
                </div>
              </div>
            )
          }
          // ---- Tier F: create/revise_artifact -> sandboxed frame ----
          // react-tsx keeps our FrameArtifactRenderer (needs a serving origin for
          // its import map + built bundle); html-fragment renders via the
          // ui-resource part above (the MCP Apps path), so skip its pin here.
          if (part.name === 'create_artifact' || part.name === 'revise_artifact') {
            const pin = framePins[part.id]
            if (!pin) {
              return (
                <div key={part.id} className="chat-graph-frame">
                  <div className="chat-graph-meta"><span className="chat-graph-dot" /><span>building artifact…</span></div>
                </div>
              )
            }
            if (pin.kind === 'html-fragment') return null
            if (latest.framePartByArtifact[pin.artifactId] !== part.id) return null
            return (
              <FrameArtifactRenderer
                key={part.id}
                pin={{ artifactId: pin.artifactId, revision: pin.revision }}
                sandboxUrl={sandboxUrl}
                title={pin.title ?? 'Generated artifact'}
                minHeight={120}
                onIntent={async (d) => {
                  onIntent({ graphId: pin.artifactId, nodeId: '', intent: d.intent, intentClass: d.intentClass, payload: d.payload, state: d.state } as IntentPayload)
                  return { ok: true, result: { acknowledged: true } }
                }}
              />
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

/** First text part's content (the assistant's prose / the user's message). */
function textOf(message: any): string {
  const parts: Array<any> = message.parts ?? []
  const t = parts.filter((p) => p.type === 'text').map((p) => p.content).join('')
  if (t) return t
  return typeof message.content === 'string' ? message.content : ''
}

function ExpandedGraphOverlay({ graph, onIntent, onClose }: { graph: GraphDocument; onIntent: (i: IntentPayload) => void; onClose: () => void }) {
  return (
    <div className="chat-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="chat-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="chat-overlay-bar">
          <span className="font-mono text-[11px] text-slate-400">{graph.graphId} · rev {graph.revision}</span>
          <button type="button" className="chat-overlay-close" onClick={onClose} aria-label="Close">✕</button>
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
      <div className="chat-typing"><span /><span /><span /></div>
    </div>
  )
}

function BrandMark() {
  return (
    <div className="chat-avatar" aria-hidden><span>◇</span></div>
  )
}
