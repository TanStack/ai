import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

const MIDDLEWARE_MODES = [
  { id: 'none', label: 'No Middleware' },
  { id: 'chunk-transform', label: 'Chunk Transform (prefix text)' },
  { id: 'tool-skip', label: 'Tool Skip (skip with custom result)' },
  { id: 'capability', label: 'Capability (provide/consume prefix)' },
  { id: 'phase-recorder', label: 'Phase Recorder (capture phase + chunks)' },
  { id: 'otel', label: 'OpenTelemetry (capture spans/metrics)' },
] as const

interface PhaseCaptureSnapshot {
  phases: Array<string>
  onFinishCount: number
  yieldedChunks: Array<{ type: string }>
}

const EMPTY_PHASE_CAPTURE: PhaseCaptureSnapshot = {
  phases: [],
  onFinishCount: 0,
  yieldedChunks: [],
}

/**
 * Defensively coerce the `/api/middleware-test?kind=phase` response into a
 * `PhaseCaptureSnapshot`. The server returns a well-typed object, but this
 * page can't import server-only types and we want zero `as` casts on the
 * untrusted parse, so we validate each field shape before reading it.
 */
function toPhaseCapture(raw: unknown): PhaseCaptureSnapshot {
  if (!raw || typeof raw !== 'object') return EMPTY_PHASE_CAPTURE
  const obj: Record<string, unknown> = { ...raw }
  const phasesRaw = obj.phases
  const onFinishRaw = obj.onFinishCount
  const yieldedRaw = obj.yieldedChunks
  const phases =
    Array.isArray(phasesRaw) && phasesRaw.every((p) => typeof p === 'string')
      ? phasesRaw
      : []
  const onFinishCount =
    typeof onFinishRaw === 'number' && Number.isFinite(onFinishRaw)
      ? onFinishRaw
      : 0
  const yieldedChunks = Array.isArray(yieldedRaw)
    ? yieldedRaw
        .map((c) => {
          if (!c || typeof c !== 'object') return null
          const inner: Record<string, unknown> = { ...c }
          const t = inner.type
          return typeof t === 'string' ? { type: t } : null
        })
        .filter((c): c is { type: string } => c !== null)
    : []
  return { phases, onFinishCount, yieldedChunks }
}

export const Route = createFileRoute('/middleware-test')({
  component: MiddlewareTestPage,
  validateSearch: (search: Record<string, unknown>) => {
    const port =
      typeof search.aimockPort === 'string'
        ? parseInt(search.aimockPort, 10)
        : undefined
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: port != null && !isNaN(port) ? port : undefined,
      // `provider` / `model` are forwarded to the server route so the
      // structured-output × middleware spec can exercise both the
      // native-combined-mode path (modern openai / claude 4.5+) and the
      // legacy finalization path (claude 3.7, etc.) — see #605.
      provider:
        typeof search.provider === 'string' ? search.provider : undefined,
      model: typeof search.model === 'string' ? search.model : undefined,
    }
  },
})

function MiddlewareTestPage() {
  const { testId, aimockPort, provider, model } = Route.useSearch()
  const [scenario, setScenario] = useState('basic-text')
  const [middlewareMode, setMiddlewareMode] = useState('none')
  const [testComplete, setTestComplete] = useState(false)
  const [phaseCapture, setPhaseCapture] =
    useState<PhaseCaptureSnapshot>(EMPTY_PHASE_CAPTURE)

  const { messages, sendMessage, isLoading } = useChat({
    id: `mw-test-${scenario}-${middlewareMode}-${provider ?? 'openai'}-${model ?? 'default'}`,
    connection: fetchServerSentEvents('/api/middleware-test'),
    body: { scenario, middlewareMode, testId, aimockPort, provider, model },
    onFinish: () => {
      // For phase-recorder mode the spec reads `#mw-phases-json` /
      // `#mw-onfinish-count` / `#mw-yielded-chunks-json` AFTER
      // `data-test-complete=true`. Pull the server-side capture before
      // flipping the completion flag so the DOM is consistent when the
      // spec's `waitForFunction` returns.
      if (middlewareMode === 'phase-recorder' && testId) {
        void fetch(
          `/api/middleware-test?testId=${encodeURIComponent(testId)}&kind=phase`,
        )
          .then((res) => (res.ok ? res.json() : EMPTY_PHASE_CAPTURE))
          .then((data) => {
            setPhaseCapture(toPhaseCapture(data))
            setTestComplete(true)
          })
          .catch(() => {
            setPhaseCapture(EMPTY_PHASE_CAPTURE)
            setTestComplete(true)
          })
        return
      }
      setTestComplete(true)
    },
  })

  const handleRun = () => {
    setTestComplete(false)
    setPhaseCapture(EMPTY_PHASE_CAPTURE)
    sendMessage(`[${scenario}] run test`)
  }

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'system-ui',
        color: '#e2e8f0',
      }}
    >
      <h1>Middleware Test</h1>

      <div style={{ marginBottom: '10px' }}>
        <label>Scenario: </label>
        <select
          id="mw-scenario-select"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          style={{
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #475569',
            borderRadius: '4px',
            padding: '6px',
          }}
        >
          <option value="basic-text">Basic Text</option>
          <option value="capability">Capability</option>
          <option value="with-tool">With Tool</option>
          <option value="structured-output">Structured Output</option>
          <option value="structured-output-stream">
            Structured Output (Stream)
          </option>
        </select>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label>Middleware: </label>
        <select
          id="mw-mode-select"
          value={middlewareMode}
          onChange={(e) => setMiddlewareMode(e.target.value)}
          style={{
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #475569',
            borderRadius: '4px',
            padding: '6px',
          }}
        >
          {MIDDLEWARE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <button
        id="mw-run-button"
        onClick={handleRun}
        disabled={isLoading}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        Run Test
      </button>

      <pre
        id="mw-messages-json"
        style={{
          marginTop: '20px',
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(100, 116, 139, 0.3)',
          borderRadius: '4px',
          color: '#94a3b8',
          padding: '10px',
          maxHeight: '400px',
          overflow: 'auto',
        }}
      >
        {JSON.stringify(messages, null, 2)}
      </pre>

      {/*
        Phase-recorder surfaces. These are always rendered so the Playwright
        spec can do a flat `.textContent()` read without conditional waits;
        they're empty/zeroed for runs that don't use `phase-recorder` mode.
      */}
      <pre id="mw-phases-json" style={{ display: 'none' }}>
        {JSON.stringify(phaseCapture.phases)}
      </pre>
      <span id="mw-onfinish-count" style={{ display: 'none' }}>
        {phaseCapture.onFinishCount}
      </span>
      <pre id="mw-yielded-chunks-json" style={{ display: 'none' }}>
        {JSON.stringify(phaseCapture.yieldedChunks)}
      </pre>

      <div
        id="mw-metadata"
        style={{ display: 'none' }}
        data-is-loading={isLoading.toString()}
        data-test-complete={testComplete.toString()}
        data-message-count={messages.length}
      />
    </div>
  )
}
