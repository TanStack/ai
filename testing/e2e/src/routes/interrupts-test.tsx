import { useCallback, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { ToolCallPart } from '@tanstack/ai'
import {
  SCENARIO_LIST,
  admitRescue,
  assignEnclosure,
  finalizeAdoption,
  getScenario,
  logFieldSighting,
  printCertificate,
  printIntakeTag,
  scheduleVetCheck,
  shareAdoptionStory,
} from '@/lib/interrupt-scenario-tools'
import type { ResolutionConfig } from '@/lib/interrupt-scenario-tools'

/**
 * Interrupt playground — deterministic e2e host for every wildlife interrupt
 * scenario (server/client boolean, shared payload, branch payload, edited
 * args, generic, batch). Mirrors the /tools-test selectors so the shared
 * helpers apply, and adds per-item cancel, generic resolve/cancel, and root
 * batch controls (resolveInterrupts / cancelInterrupts).
 */

interface InterruptEvent {
  timestamp: number
  type:
    | 'approval-granted'
    | 'approval-denied'
    | 'approval-cancelled'
    | 'generic-resolved'
    | 'generic-cancelled'
    | 'execution-complete'
    | 'custom-event'
  toolName: string
  interruptId?: string
  details?: string
}

/** Loose interrupt view — the harness drives a mixed set, so it deliberately
 *  uses the untyped surface instead of the per-tool typed overloads. */
interface LooseInterrupt {
  kind: string
  id?: string
  interruptId?: string
  toolCallId?: string
  toolName?: string
  status?: string
  resolveInterrupt: (arg1?: unknown, arg2?: unknown) => void
  cancel: () => void
}

function InterruptsTestPage() {
  const { testId, aimockPort, scenario: initialScenario } = Route.useSearch()
  const [scenario, setScenario] = useState(initialScenario || 'admit')
  const [events, setEvents] = useState<Array<InterruptEvent>>([])
  const [testComplete, setTestComplete] = useState(false)
  const responded = useRef<Set<string>>(new Set())

  const addEvent = useCallback((event: Omit<InterruptEvent, 'timestamp'>) => {
    setEvents((prev) => [...prev, { ...event, timestamp: Date.now() }])
  }, [])

  // Client tools. Server tools get bare `.client()` stubs so the
  // InterruptManager hydrates their pause as `tool-approval` (schema hashes
  // must match the server). Client tools get echoing executors so approval is
  // observable in the event log / messages.
  const clientTools = useRef([
    admitRescue.client(),
    scheduleVetCheck.client(),
    finalizeAdoption.client(),
    assignEnclosure.client(),
    printIntakeTag.client(async ({ animal }) => {
      addEvent({
        type: 'execution-complete',
        toolName: 'printIntakeTag',
        details: animal,
      })
      return { tag: `tag_${animal.toLowerCase()}` }
    }),
    logFieldSighting.client(async ({ species, location }) => {
      addEvent({
        type: 'execution-complete',
        toolName: 'logFieldSighting',
        details: `${species}@${location}`,
      })
      return { sightingId: `sighting_${species.toLowerCase()}` }
    }),
    shareAdoptionStory.client(async ({ animal }) => {
      addEvent({
        type: 'execution-complete',
        toolName: 'shareAdoptionStory',
        details: animal,
      })
      return { url: `https://sanctuary.example/${animal.toLowerCase()}` }
    }),
    printCertificate.client(async ({ animal, adopter, date }) => {
      addEvent({
        type: 'execution-complete',
        toolName: 'printCertificate',
        // Echo the (possibly edited) args so the edited-args spec can assert.
        details: `${animal}|${adopter}|${date}`,
      })
      return { certificate: `cert_${animal.toLowerCase()}_${date}` }
    }),
  ]).current

  const {
    messages,
    sendMessage,
    isLoading,
    stop,
    interrupts,
    resolveInterrupts,
    cancelInterrupts,
    error,
  } = useChat({
    id: `interrupts-test-${scenario}`,
    connection: fetchServerSentEvents('/api/interrupts-test'),
    forwardedProps: { scenario, testId, aimockPort },
    tools: clientTools,
    onFinish: () => setTestComplete(true),
    onCustomEvent: (eventType: string, data: unknown) =>
      addEvent({
        type: 'custom-event',
        toolName: eventType,
        details: JSON.stringify(data),
      }),
  })

  const loose = interrupts as unknown as ReadonlyArray<LooseInterrupt>
  const pendingApprovals = loose.filter(
    (i) => i.kind === 'tool-approval' && i.status === 'pending',
  )
  const pendingGeneric = loose.filter(
    (i) => i.kind === 'generic' && i.status === 'pending',
  )

  const scenarioDef = getScenario(scenario)

  const configForTool = (toolName?: string): ResolutionConfig => {
    if (scenarioDef?.resolutionByTool && toolName) {
      return scenarioDef.resolutionByTool[toolName] ?? {}
    }
    return scenarioDef?.resolution ?? {}
  }

  const once = (key: string | undefined): boolean => {
    if (!key || responded.current.has(key)) return false
    responded.current.add(key)
    return true
  }

  const approve = (item: LooseInterrupt) => {
    if (!once(item.interruptId ?? item.id)) return
    const cfg = configForTool(item.toolName)
    const options: { editedArgs?: unknown; payload?: unknown } = {}
    if (cfg.editedArgs) options.editedArgs = cfg.editedArgs
    if (cfg.approvePayload) options.payload = cfg.approvePayload
    addEvent({
      type: 'approval-granted',
      toolName: item.toolName ?? '',
      interruptId: item.interruptId,
    })
    item.resolveInterrupt(true, options)
  }

  const deny = (item: LooseInterrupt) => {
    if (!once(item.interruptId ?? item.id)) return
    const cfg = configForTool(item.toolName)
    const options: { payload?: unknown } = {}
    if (cfg.denyPayload) options.payload = cfg.denyPayload
    addEvent({
      type: 'approval-denied',
      toolName: item.toolName ?? '',
      interruptId: item.interruptId,
    })
    item.resolveInterrupt(false, options)
  }

  const cancel = (item: LooseInterrupt) => {
    if (!once(item.interruptId ?? item.id)) return
    addEvent({
      type: 'approval-cancelled',
      toolName: item.toolName ?? '',
      interruptId: item.interruptId,
    })
    item.cancel()
  }

  const resolveGeneric = (item: LooseInterrupt) => {
    if (!once(item.interruptId ?? item.id)) return
    addEvent({
      type: 'generic-resolved',
      toolName: 'generic',
      interruptId: item.interruptId,
    })
    item.resolveInterrupt(scenarioDef?.resolution?.approvePayload ?? {})
  }

  const cancelGeneric = (item: LooseInterrupt) => {
    if (!once(item.interruptId ?? item.id)) return
    addEvent({
      type: 'generic-cancelled',
      toolName: 'generic',
      interruptId: item.interruptId,
    })
    item.cancel()
  }

  // Root batch controls.
  const approveAll = () => {
    for (const i of pendingApprovals) once(i.interruptId ?? i.id)
    addEvent({ type: 'approval-granted', toolName: 'batch' })
    resolveInterrupts(true)
  }
  const denyAll = () => {
    for (const i of pendingApprovals) once(i.interruptId ?? i.id)
    addEvent({ type: 'approval-denied', toolName: 'batch' })
    resolveInterrupts(false)
  }
  const cancelAll = () => {
    for (const i of pendingApprovals) once(i.interruptId ?? i.id)
    addEvent({ type: 'approval-cancelled', toolName: 'batch' })
    cancelInterrupts()
  }
  const resolveAllMixed = () => {
    for (const i of pendingApprovals) once(i.interruptId ?? i.id)
    addEvent({ type: 'approval-granted', toolName: 'batch-mixed' })
    resolveInterrupts((raw: unknown) => {
      const item = raw as LooseInterrupt
      const cfg = configForTool(item.toolName)
      const options: { editedArgs?: unknown; payload?: unknown } = {}
      if (cfg.editedArgs) options.editedArgs = cfg.editedArgs
      if (cfg.approvePayload) options.payload = cfg.approvePayload
      item.resolveInterrupt(true, options)
      return undefined
    })
  }

  const handleRun = useCallback(() => {
    setEvents([])
    setTestComplete(false)
    responded.current.clear()
    sendMessage(`[${scenario}] run test`)
  }, [scenario, sendMessage])

  const toolCalls: Array<ToolCallPart> = messages.flatMap((msg) =>
    msg.parts.filter(
      (p): p is Extract<typeof p, { type: 'tool-call' }> =>
        p.type === 'tool-call',
    ),
  )

  // Server tool results can arrive as separate `tool-result` parts rather than
  // on the tool-call part; index them by tool-call id so a spec can read the
  // executed output (this is how the edited-args scenarios are observed).
  const toolResults = new Map<string, unknown>()
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'tool-result') {
        const p = part as {
          toolCallId: string
          content?: unknown
          output?: unknown
        }
        toolResults.set(p.toolCallId, p.output ?? p.content)
      }
    }
  }
  const outputFor = (tc: ToolCallPart) => tc.output ?? toolResults.get(tc.id)

  const count = (type: InterruptEvent['type']) =>
    events.filter((e) => e.type === type).length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        fontFamily: 'system-ui, sans-serif',
        color: '#e2e8f0',
      }}
    >
      <h1 style={{ marginTop: 0 }}>Interrupt Playground</h1>

      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="scenario-select" style={{ fontWeight: 'bold' }}>
          Scenario:{' '}
        </label>
        <select
          id="scenario-select"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          style={{
            padding: '8px',
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #475569',
            borderRadius: '4px',
          }}
        >
          {SCENARIO_LIST.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {testComplete && (
          <span
            id="test-complete-indicator"
            style={{ marginLeft: '10px', color: '#28a745', fontWeight: 'bold' }}
          >
            ✓ Test Complete
          </span>
        )}
      </div>

      {error && (
        <div
          id="error-display"
          style={{
            padding: '10px',
            background: 'rgba(220, 53, 69, 0.15)',
            border: '1px solid rgba(220, 53, 69, 0.4)',
            borderRadius: '4px',
            marginBottom: '10px',
            color: '#f8a4a4',
          }}
        >
          Error: {error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button id="run-test-button" onClick={handleRun} disabled={isLoading}>
          Run Test
        </button>
        {isLoading && (
          <button id="stop-button" onClick={stop}>
            Stop
          </button>
        )}
      </div>

      {/* Tool-approval interrupts */}
      {pendingApprovals.length > 0 && (
        <div id="approval-section" style={sectionStyle('#ffc107')}>
          <h3 style={{ margin: '0 0 10px 0' }}>
            Pending Approvals (
            <span id="pending-approval-count">{pendingApprovals.length}</span>)
          </h3>
          {pendingApprovals.map((item) => {
            const key = item.toolCallId ?? item.interruptId ?? item.id ?? ''
            return (
              <div
                key={key}
                className="approval-request"
                data-tool-name={item.toolName}
                data-interrupt-id={item.interruptId}
                style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
              >
                <span>
                  <strong>{item.toolName}</strong>
                </span>
                <button
                  id={`approve-${key}`}
                  className="approve-button"
                  onClick={() => approve(item)}
                >
                  Approve
                </button>
                <button
                  id={`deny-${key}`}
                  className="deny-button"
                  onClick={() => deny(item)}
                >
                  Deny
                </button>
                <button
                  id={`cancel-${key}`}
                  className="cancel-button"
                  onClick={() => cancel(item)}
                >
                  Cancel
                </button>
              </div>
            )
          })}

          {/* Root batch controls */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button id="resolve-all-approve" onClick={approveAll}>
              Approve All
            </button>
            <button id="resolve-all-deny" onClick={denyAll}>
              Deny All
            </button>
            <button id="cancel-all" onClick={cancelAll}>
              Cancel All
            </button>
            <button id="resolve-all-mixed" onClick={resolveAllMixed}>
              Resolve All (mixed)
            </button>
          </div>
        </div>
      )}

      {/* Generic interrupts */}
      {pendingGeneric.length > 0 && (
        <div id="generic-section" style={sectionStyle('#8b5cf6')}>
          <h3 style={{ margin: '0 0 10px 0' }}>
            Generic Interrupts (
            <span id="pending-generic-count">{pendingGeneric.length}</span>)
          </h3>
          {pendingGeneric.map((item) => {
            const key = item.interruptId ?? item.id ?? ''
            return (
              <div
                key={key}
                className="generic-request"
                data-interrupt-id={item.interruptId}
                style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}
              >
                <button
                  id={`resolve-generic-${key}`}
                  className="resolve-generic-button"
                  onClick={() => resolveGeneric(item)}
                >
                  Resolve
                </button>
                <button
                  id={`cancel-generic-${key}`}
                  className="cancel-generic-button"
                  onClick={() => cancelGeneric(item)}
                >
                  Cancel
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Messages JSON for assertions */}
      <div
        id="messages-json"
        style={{
          overflow: 'auto',
          maxHeight: '40vh',
          padding: '10px',
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(100, 116, 139, 0.3)',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#94a3b8',
        }}
      >
        <pre
          id="messages-json-content"
          style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {JSON.stringify(messages, null, 2)}
        </pre>
      </div>

      {/* Hidden metadata for assertions */}
      <div
        id="test-metadata"
        style={{ display: 'none' }}
        data-scenario={scenario}
        data-is-loading={isLoading.toString()}
        data-test-complete={testComplete.toString()}
        data-tool-call-count={toolCalls.length}
        data-pending-approval-count={pendingApprovals.length}
        data-pending-generic-count={pendingGeneric.length}
        data-interrupt-count={loose.length}
        data-interrupt-kinds={loose.map((i) => i.kind).join(',')}
        data-complete-tool-count={
          toolCalls.filter(
            (tc) =>
              tc.state === 'approval-responded' || outputFor(tc) !== undefined,
          ).length
        }
        data-event-count={events.length}
        data-approval-granted-count={count('approval-granted')}
        data-approval-denied-count={count('approval-denied')}
        data-approval-cancelled-count={count('approval-cancelled')}
        data-generic-resolved-count={count('generic-resolved')}
        data-generic-cancelled-count={count('generic-cancelled')}
        data-execution-complete-count={count('execution-complete')}
        data-has-error={(!!error).toString()}
        data-error-message={error?.message || ''}
      />

      <script
        id="event-log-json"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(events) }}
      />
      <script
        id="tool-calls-json"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              state: tc.state,
              output: outputFor(tc),
            })),
          ),
        }}
      />
    </div>
  )
}

function sectionStyle(accent: string) {
  return {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: `${accent}22`,
    borderRadius: '4px',
    border: `1px solid ${accent}66`,
  } as const
}

export const Route = createFileRoute('/interrupts-test')({
  component: InterruptsTestPage,
  validateSearch: (search: Record<string, unknown>) => {
    const port =
      typeof search.aimockPort === 'string'
        ? parseInt(search.aimockPort, 10)
        : undefined
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: port != null && !isNaN(port) ? port : undefined,
      scenario:
        typeof search.scenario === 'string' ? search.scenario : undefined,
    }
  },
})
