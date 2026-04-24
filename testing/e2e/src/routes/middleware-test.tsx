import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const MIDDLEWARE_MODES = [
  { id: 'none', label: 'No Middleware' },
  { id: 'chunk-transform', label: 'Chunk Transform (prefix text)' },
  { id: 'tool-skip', label: 'Tool Skip (skip with custom result)' },
] as const

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
    }
  },
})

function MiddlewareTestPage() {
  const { testId, aimockPort } = Route.useSearch()
  const [scenario, setScenario] = useState('basic-text')
  const [middlewareMode, setMiddlewareMode] = useState('none')
  const [testComplete, setTestComplete] = useState(false)

  const { messages, sendMessage, isLoading } = useChat({
    id: `mw-test-${scenario}-${middlewareMode}`,
    connection: fetchServerSentEvents('/api/middleware-test'),
    body: { scenario, middlewareMode, testId, aimockPort },
    onFinish: () => setTestComplete(true),
  })

  const handleRun = () => {
    setTestComplete(false)
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
          <option value="with-tool">With Tool</option>
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
