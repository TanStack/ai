import { useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  useChat,
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { parseAimockPort } from '@/lib/devtools-test'
import {
  deleteReviewTool,
  renderReviewTool,
  reviewPlan,
} from '@/lib/generic-middleware-interrupts'
import { clientContextToolDefinition } from '@/lib/middleware-test-tools'

const MIDDLEWARE_MODES = [
  { id: 'none', label: 'No Middleware' },
  { id: 'chunk-transform', label: 'Chunk Transform (prefix text)' },
  { id: 'tool-skip', label: 'Tool Skip (skip with custom result)' },
  { id: 'capability', label: 'Capability (provide/consume prefix)' },
  { id: 'phase-recorder', label: 'Phase Recorder (capture phase + chunks)' },
  { id: 'otel', label: 'OpenTelemetry (capture spans/metrics)' },
  { id: 'memory', label: 'Memory (recall/save)' },
  { id: 'generic-lifecycle', label: 'Generic Interrupt Lifecycle' },
] as const

const genericPersistence = localStoragePersistence()

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
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: parseAimockPort(search.aimockPort),
      // `provider` / `model` are forwarded to the server route so the
      // structured-output × middleware spec can exercise both the
      // native-combined-mode path (modern openai / claude 4.5+) and the
      // legacy finalization path (claude 3.7, etc.) — see #605.
      provider:
        typeof search.provider === 'string' ? search.provider : undefined,
      model: typeof search.model === 'string' ? search.model : undefined,
      scenario:
        typeof search.scenario === 'string' ? search.scenario : undefined,
      middlewareMode:
        typeof search.middlewareMode === 'string'
          ? search.middlewareMode
          : undefined,
    }
  },
})

function MiddlewareTestPage() {
  const { testId, aimockPort, provider, model, ...searchSelection } =
    Route.useSearch()
  const [scenario, setScenario] = useState(
    searchSelection.scenario ?? 'basic-text',
  )
  const [middlewareMode, setMiddlewareMode] = useState(
    searchSelection.middlewareMode ?? 'none',
  )
  const [testComplete, setTestComplete] = useState(false)
  const [phaseCapture, setPhaseCapture] =
    useState<PhaseCaptureSnapshot>(EMPTY_PHASE_CAPTURE)
  const [memoryCapture, setMemoryCapture] = useState<{
    configs: Array<{ systemPrompts: Array<string>; toolNames: Array<string> }>
    saveCount: number
  }>({ configs: [], saveCount: 0 })
  const [clientToolExecutions, setClientToolExecutions] = useState(0)
  const [clientToolWaiting, setClientToolWaiting] = useState(false)
  const clientToolResolver = useRef<
    ((value: { context: string }) => void) | null
  >(null)
  const [clientContextTool] = useState(() =>
    clientContextToolDefinition.client(
      () =>
        new Promise<{ context: string }>((resolve) => {
          clientToolResolver.current = resolve
          setClientToolWaiting(true)
        }),
    ),
  )

  const clientToolList = useMemo(
    () =>
      clientTools(
        deleteReviewTool.client(),
        renderReviewTool.client(async ({ reviewId }) => {
          setClientToolExecutions((count) => count + 1)
          return { rendered: true, reviewId }
        }),
        clientContextTool,
      ),
    [clientContextTool],
  )

  const { messages, sendMessage, isLoading, error, interrupts } = useChat<
    typeof clientToolList,
    undefined,
    unknown,
    readonly [typeof reviewPlan]
  >({
    threadId: `mw-test-${testId ?? 'manual'}-${scenario}-${middlewareMode}-${provider ?? 'openai'}-${model ?? 'default'}`,
    connection: fetchServerSentEvents('/api/middleware-test'),
    body: { scenario, middlewareMode, testId, aimockPort, provider, model },
    tools: clientToolList,
    interrupts: [reviewPlan],
    persistence:
      middlewareMode === 'generic-lifecycle' ? genericPersistence : undefined,
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
      if (middlewareMode === 'memory' && testId) {
        void fetch(
          `/api/middleware-test?testId=${encodeURIComponent(testId)}&kind=memory`,
        )
          .then((res) => (res.ok ? res.json() : { configs: [], saveCount: 0 }))
          .then((data) => {
            setMemoryCapture(data)
            setTestComplete(true)
          })
          .catch(() => {
            setMemoryCapture({ configs: [], saveCount: 0 })
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
    setClientToolExecutions(0)
    setClientToolWaiting(false)
    clientToolResolver.current = null
    sendMessage(`[${scenario}] run test`)
  }

  const handleResolveClientTool = () => {
    const resolve = clientToolResolver.current
    if (!resolve) return
    clientToolResolver.current = null
    setClientToolWaiting(false)
    resolve({ context: 'client-result' })
  }

  type ActiveInterrupt = (typeof interrupts)[number]
  const reviewInterrupts = interrupts.filter(
    (
      interrupt,
    ): interrupt is Extract<ActiveInterrupt, { definitionId: 'review-plan' }> =>
      interrupt.kind === 'generic' &&
      'definitionId' in interrupt &&
      interrupt.definitionId === reviewPlan.id,
  )
  const approvalInterrupts = interrupts.filter(
    (
      interrupt,
    ): interrupt is Extract<ActiveInterrupt, { kind: 'tool-approval' }> =>
      interrupt.kind === 'tool-approval',
  )

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
          <option value="run-error">Run Error</option>
          <option value="structured-output">Structured Output</option>
          <option value="structured-output-stream">
            Structured Output (Stream)
          </option>
          <option value="structured-client-tool-wait">
            Structured Output + Client Tool Wait
          </option>
          <option value="generic-before-model">Generic Before Model</option>
          <option value="generic-after-model">Generic After Model</option>
          <option value="generic-before-tools-continue">
            Generic Before Tools Continue
          </option>
          <option value="generic-before-tools-cancel">
            Generic Before Tools Cancel
          </option>
          <option value="generic-before-tools-stop">
            Generic Before Tools Stop
          </option>
          <option value="generic-after-tools">Generic After Tools</option>
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

      <button
        id="mw-client-tool-resolve"
        onClick={handleResolveClientTool}
        disabled={!clientToolWaiting}
        style={{
          marginLeft: '10px',
          padding: '10px 20px',
          fontSize: '14px',
          backgroundColor: '#16a34a',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: clientToolWaiting ? 'pointer' : 'not-allowed',
          opacity: clientToolWaiting ? 1 : 0.7,
        }}
      >
        Resolve Client Tool
      </button>

      {reviewInterrupts.map((interrupt) => (
        <div
          key={interrupt.id}
          data-testid="generic-review-plan"
          data-definition-id={interrupt.definitionId}
          data-payload={JSON.stringify(interrupt.payload)}
        >
          <span>{interrupt.message}</span>
          <button
            data-testid="resolve-review-plan"
            onClick={() =>
              interrupt.resolveInterrupt({
                approved: true,
                note: 'approved in middleware e2e',
              })
            }
          >
            Resolve review
          </button>
          <button
            data-testid="cancel-review-plan"
            onClick={() => interrupt.cancel()}
          >
            Cancel review
          </button>
        </div>
      ))}

      {approvalInterrupts.map((interrupt) => (
        <div key={interrupt.id} data-testid="delete-review-approval">
          <button
            data-testid="approve-delete-review"
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve tool
          </button>
          <button
            data-testid="reject-delete-review"
            onClick={() => interrupt.resolveInterrupt(false)}
          >
            Reject tool
          </button>
        </div>
      ))}

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
      <pre id="mw-error" style={{ display: 'none' }}>
        {error?.message ?? ''}
      </pre>
      <pre id="mw-phases-json" style={{ display: 'none' }}>
        {JSON.stringify(phaseCapture.phases)}
      </pre>
      <span id="mw-onfinish-count" style={{ display: 'none' }}>
        {phaseCapture.onFinishCount}
      </span>
      <pre id="mw-yielded-chunks-json" style={{ display: 'none' }}>
        {JSON.stringify(phaseCapture.yieldedChunks)}
      </pre>
      <pre id="mw-memory-json" style={{ display: 'none' }}>
        {JSON.stringify(memoryCapture)}
      </pre>

      <div
        id="mw-metadata"
        style={{ display: 'none' }}
        data-is-loading={isLoading.toString()}
        data-test-complete={testComplete.toString()}
        data-client-tool-waiting={clientToolWaiting.toString()}
        data-message-count={messages.length}
        data-interrupt-count={interrupts.length}
        data-client-tool-executions={clientToolExecutions}
      />
    </div>
  )
}
