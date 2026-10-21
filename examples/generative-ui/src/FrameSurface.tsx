import { useEffect, useState } from 'react'
import { FrameArtifactRenderer } from '@tanstack/ai-generative-ui'
import type { ArtifactPin } from '@tanstack/ai-generative-ui'

interface LibraryEntry {
  fixtureId: string
  artifactId: string
  revision: number
  title: string
  kind: string
  dataSource?: { name: string; params?: Record<string, unknown> }
}

/** Open an SSE stream to a host data source and push each value into the frame. */
function liveSubscription(ds: {
  name: string
  params?: Record<string, unknown>
}) {
  const qs = new URLSearchParams({ source: ds.name })
  if (ds.params) qs.set('params', JSON.stringify(ds.params))
  const href = `/api/live?${qs.toString()}`
  return (emit: (data: unknown) => void) => {
    const es = new EventSource(href)
    es.onmessage = (e) => {
      try {
        emit(JSON.parse(e.data))
      } catch {
        // ignore malformed frame
      }
    }
    return () => es.close()
  }
}

interface LogLine {
  t: number
  kind: 'state' | 'submit' | 'action'
  label: string
  detail: string
}

/**
 * Tier F (Frame) surface — Draft 0.2. Renders stored artifacts inline through
 * the sandboxed iframe + bridge (never the demo's point of gravity; this is a
 * library/test surface, §11, Draft 0.1 §1.6). The right rail proves the bridge:
 * host-owned state writes and routed submit/action intents, live.
 */
export function FrameSurface() {
  const [artifacts, setArtifacts] = useState<Array<LibraryEntry>>([])
  const [log, setLog] = useState<Array<LogLine>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/frame/list')
      .then((r) => r.json())
      .then((d) => setArtifacts(d.artifacts ?? []))
      .catch((e) => setError(String(e)))
  }, [])

  const push = (line: Omit<LogLine, 't'>) =>
    setLog((l) => [{ t: Date.now(), ...line }, ...l].slice(0, 40))

  const sandboxUrl = (pin: ArtifactPin, instanceId: string) =>
    `/sandbox/${pin.artifactId}/${pin.revision}?i=${encodeURIComponent(instanceId)}`

  return (
    <div className="h-full overflow-auto bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="min-w-0">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900 font-display tracking-tight">
              Frame tier
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-prose">
              Tier F artifacts (Draft 0.2): model- or constructor-authored
              source — a hand-tuned SVG fragment, or a React component using
              TanStack Table &amp; Charts — compiled at write time and served
              into a sandboxed, theme-matched iframe. Numbers stay
              host-authoritative; interactions leave only as structured intents.
            </p>
          </div>

          {error && (
            <div className="text-sm text-rose-600 mb-4">
              Failed to load library: {error}
            </div>
          )}

          <div className="space-y-6">
            {artifacts.map((a) => (
              <div key={a.artifactId}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-xs font-mono text-slate-400">
                    {a.kind}
                  </span>
                  <a
                    href={`/a/${a.artifactId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline ml-auto"
                  >
                    open standalone ↗
                  </a>
                </div>
                <FrameArtifactRenderer
                  pin={{ artifactId: a.artifactId, revision: a.revision }}
                  sandboxUrl={sandboxUrl}
                  title={a.title}
                  minHeight={120}
                  subscribeData={
                    a.dataSource ? liveSubscription(a.dataSource) : undefined
                  }
                  onStateChange={(s) =>
                    push({
                      kind: 'state',
                      label: a.title,
                      detail: JSON.stringify(s),
                    })
                  }
                  onIntent={async (d) => {
                    push({
                      kind: d.intentClass,
                      label: `${d.intent} · ${a.title}`,
                      detail: JSON.stringify(d.payload ?? {}),
                    })
                    // Simulate the host's approval machinery resolving (§6.3).
                    return { ok: true, result: { acknowledged: true } }
                  }}
                />
              </div>
            ))}
            {artifacts.length === 0 && !error && (
              <div className="text-sm text-slate-400">Building fixtures…</div>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 self-start">
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
              Bridge traffic
            </div>
            <div className="max-h-[70vh] overflow-auto divide-y divide-slate-50">
              {log.length === 0 && (
                <div className="px-3 py-3 text-xs text-slate-400">
                  Interact with a frame — state writes and intents appear here.
                </div>
              )}
              {log.map((l, i) => (
                <div key={i} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        l.kind === 'action'
                          ? 'bg-rose-100 text-rose-700'
                          : l.kind === 'submit'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {l.kind}
                    </span>
                    <span className="text-slate-700 font-medium truncate">
                      {l.label}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-slate-500 break-all">
                    {l.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
