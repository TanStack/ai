import { useState, useCallback, useRef, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Event log entry for tracking tool execution flow
 */
interface ToolEvent {
  timestamp: number
  type:
    | 'execution-start'
    | 'execution-complete'
    | 'approval-granted'
    | 'approval-denied'
    | 'error'
  toolName: string
  toolCallId?: string
  details?: string
}

/**
 * Client-side tool definitions with execute functions
 * These track execution for testing purposes
 */
function createTrackedTools(
  addEvent: (event: Omit<ToolEvent, 'timestamp'>) => void,
) {
  const showNotificationTool = toolDefinition({
    name: 'show_notification',
    description: 'Show a notification to the user',
    inputSchema: z.object({
      message: z.string(),
      type: z.enum(['info', 'warning', 'error']),
    }),
    outputSchema: z.object({
      displayed: z.boolean(),
      timestamp: z.number(),
    }),
  }).client(async (args) => {
    addEvent({
      type: 'execution-start',
      toolName: 'show_notification',
      details: args.message,
    })

    // Simulate async work
    await new Promise((r) => setTimeout(r, 50))

    addEvent({
      type: 'execution-complete',
      toolName: 'show_notification',
      details: args.message,
    })

    return {
      displayed: true,
      timestamp: Date.now(),
    }
  })

  const displayChartTool = toolDefinition({
    name: 'display_chart',
    description: 'Display a chart on the screen',
    inputSchema: z.object({
      type: z.enum(['bar', 'line', 'pie']),
      data: z.array(z.number()),
    }),
    outputSchema: z.object({
      rendered: z.boolean(),
      chartId: z.string(),
    }),
  }).client(async (args) => {
    addEvent({
      type: 'execution-start',
      toolName: 'display_chart',
      details: args.type,
    })

    // Simulate async work
    await new Promise((r) => setTimeout(r, 50))

    addEvent({
      type: 'execution-complete',
      toolName: 'display_chart',
      details: args.type,
    })

    return {
      rendered: true,
      chartId: `chart-${Date.now()}`,
    }
  })

  return [showNotificationTool, displayChartTool]
}

// Available test scenarios
const SCENARIOS = [
  { id: 'text-only', label: 'Text Only (No Tools)', category: 'basic' },
  { id: 'server-tool-single', label: 'Single Server Tool', category: 'basic' },
  { id: 'client-tool-single', label: 'Single Client Tool', category: 'basic' },
  { id: 'approval-tool', label: 'Approval Required Tool', category: 'basic' },
  {
    id: 'sequence-server-client',
    label: 'Server → Client Sequence',
    category: 'basic',
  },
  { id: 'parallel-tools', label: 'Parallel Tools', category: 'basic' },
  // Race condition / event flow scenarios
  {
    id: 'sequential-client-tools',
    label: 'Sequential Client Tools (2)',
    category: 'race',
  },
  {
    id: 'parallel-client-tools',
    label: 'Parallel Client Tools',
    category: 'race',
  },
  {
    id: 'sequential-approvals',
    label: 'Sequential Approvals (2)',
    category: 'race',
  },
  { id: 'parallel-approvals', label: 'Parallel Approvals', category: 'race' },
  { id: 'client-then-approval', label: 'Client → Approval', category: 'race' },
  { id: 'approval-then-client', label: 'Approval → Client', category: 'race' },
  {
    id: 'server-then-two-clients',
    label: 'Server → 2 Clients',
    category: 'race',
  },
  {
    id: 'triple-client-sequence',
    label: 'Triple Client Sequence',
    category: 'race',
  },
]

function ToolsTestPage() {
  const [scenario, setScenario] = useState('text-only')
  const [toolEvents, setToolEvents] = useState<Array<ToolEvent>>([])
  const [testStartTime, setTestStartTime] = useState<number | null>(null)
  const [testComplete, setTestComplete] = useState(false)

  // Track approvals we've responded to (to avoid duplicate responses)
  const respondedApprovals = useRef<Set<string>>(new Set())

  // Create event logger
  const addEvent = useCallback((event: Omit<ToolEvent, 'timestamp'>) => {
    setToolEvents((prev) => [...prev, { ...event, timestamp: Date.now() }])
  }, [])

  // Create tracked tools (memoized since addEvent is stable)
  const clientTools = useRef(createTrackedTools(addEvent)).current

  const { messages, sendMessage, isLoading, stop, addToolApprovalResponse } =
    useChat({
      // Include scenario in ID so client is recreated when scenario changes
      id: `tools-test-${scenario}`,
      connection: fetchServerSentEvents('/api/tools-test'),
      body: { scenario },
      tools: clientTools,
      onFinish: () => {
        setTestComplete(true)
      },
    })

  // Track when test completes (all tool calls are complete and not loading)
  useEffect(() => {
    if (!isLoading && testStartTime && messages.length > 1) {
      // Get all tool results (for server tools)
      const resultIds = new Set(
        messages.flatMap((msg) =>
          msg.parts
            .filter((p) => p.type === 'tool-result')
            .map((p) => (p as { toolCallId: string }).toolCallId),
        ),
      )

      // Check if any tool calls are still pending
      const allToolCalls = messages.flatMap((msg) =>
        msg.parts.filter((p) => p.type === 'tool-call'),
      )
      const pendingCalls = allToolCalls.filter(
        (tc) =>
          tc.state !== 'complete' &&
          tc.state !== 'output-available' &&
          tc.output === undefined &&
          !resultIds.has(tc.id),
      )
      if (pendingCalls.length === 0 && allToolCalls.length > 0) {
        setTestComplete(true)
      }
    }
  }, [isLoading, messages, testStartTime])

  const handleSendMessage = useCallback(() => {
    // Reset test state
    setToolEvents([])
    setTestComplete(false)
    setTestStartTime(Date.now())
    respondedApprovals.current.clear()
    sendMessage('Run the test scenario')
  }, [sendMessage])

  // Extract tool call parts from messages for display
  const toolCalls = messages.flatMap((msg) =>
    msg.parts
      .filter((p) => p.type === 'tool-call')
      .map((p) => ({
        messageId: msg.id,
        ...p,
      })),
  )

  // Extract tool result parts (for server tools)
  const toolResultIds = new Set(
    messages.flatMap((msg) =>
      msg.parts
        .filter((p) => p.type === 'tool-result')
        .map((p) => (p as { toolCallId: string }).toolCallId),
    ),
  )

  // Extract approval requests
  const pendingApprovals = toolCalls.filter(
    (tc) => tc.approval?.needsApproval && tc.state === 'approval-requested',
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '20px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ marginTop: 0 }}>Tool Testing Page</h1>

      {/* Scenario Selector */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="scenario-select" style={{ fontWeight: 'bold' }}>
          Test Scenario:{' '}
        </label>
        <select
          id="scenario-select"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          style={{ padding: '8px', fontSize: '14px' }}
        >
          <optgroup label="Basic Scenarios">
            {SCENARIOS.filter((s) => s.category === 'basic').map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Race Condition / Event Flow">
            {SCENARIOS.filter((s) => s.category === 'race').map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </select>
        {testComplete && (
          <span
            id="test-complete-indicator"
            style={{
              marginLeft: '10px',
              color: '#28a745',
              fontWeight: 'bold',
            }}
          >
            ✓ Test Complete
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          id="run-test-button"
          onClick={handleSendMessage}
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
        {isLoading && (
          <button
            id="stop-button"
            onClick={stop}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div
          id="approval-section"
          style={{
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            borderRadius: '4px',
            border: '1px solid #ffc107',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0' }}>
            Pending Approvals (
            <span id="pending-approval-count">{pendingApprovals.length}</span>)
          </h3>
          {pendingApprovals.map((tc) => (
            <div
              key={tc.id}
              data-approval-id={tc.approval?.id}
              data-tool-name={tc.name}
              className="approval-request"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <span>
                <strong>{tc.name}</strong>: {JSON.stringify(tc.arguments)}
              </span>
              <button
                id={`approve-${tc.id}`}
                className="approve-button"
                onClick={() => {
                  const approvalId = tc.approval?.id
                  if (
                    approvalId &&
                    !respondedApprovals.current.has(approvalId)
                  ) {
                    respondedApprovals.current.add(approvalId)
                    addEvent({
                      type: 'approval-granted',
                      toolName: tc.name,
                      toolCallId: tc.id,
                    })
                    addToolApprovalResponse({
                      id: approvalId,
                      approved: true,
                    })
                  }
                }}
                style={{
                  padding: '5px 15px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
              <button
                id={`deny-${tc.id}`}
                className="deny-button"
                onClick={() => {
                  const approvalId = tc.approval?.id
                  if (
                    approvalId &&
                    !respondedApprovals.current.has(approvalId)
                  ) {
                    respondedApprovals.current.add(approvalId)
                    addEvent({
                      type: 'approval-denied',
                      toolName: tc.name,
                      toolCallId: tc.id,
                    })
                    addToolApprovalResponse({
                      id: approvalId,
                      approved: false,
                    })
                  }
                }}
                style={{
                  padding: '5px 15px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Deny
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Event Log - tracks execution flow for testing */}
      <div
        id="event-log-section"
        style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#d1ecf1',
          borderRadius: '4px',
          border: '1px solid #bee5eb',
          maxHeight: '150px',
          overflow: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0' }}>
          Event Log (<span id="event-count">{toolEvents.length}</span>)
        </h3>
        {toolEvents.length === 0 ? (
          <p style={{ color: '#6c757d', margin: 0 }}>No events yet</p>
        ) : (
          <div id="event-log">
            {toolEvents.map((event, i) => (
              <div
                key={i}
                className={`event-entry event-${event.type}`}
                data-event-type={event.type}
                data-tool-name={event.toolName}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  marginBottom: '2px',
                  color:
                    event.type === 'execution-complete' ||
                    event.type === 'approval-granted'
                      ? '#155724'
                      : event.type === 'error' ||
                          event.type === 'approval-denied'
                        ? '#721c24'
                        : '#0c5460',
                }}
              >
                [
                {new Date(event.timestamp)
                  .toISOString()
                  .split('T')[1]
                  ?.slice(0, 12)}
                ] <strong>{event.type}</strong>: {event.toolName}
                {event.details ? ` - ${event.details}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tool Calls Display */}
      <div
        id="tool-calls-section"
        style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#e9ecef',
          borderRadius: '4px',
          maxHeight: '200px',
          overflow: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0' }}>Tool Calls</h3>
        {toolCalls.length === 0 ? (
          <p style={{ color: '#6c757d' }}>No tool calls yet</p>
        ) : (
          <table style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tool</th>
                <th style={{ textAlign: 'left' }}>State</th>
                <th style={{ textAlign: 'left' }}>Arguments</th>
                <th style={{ textAlign: 'left' }}>Output</th>
              </tr>
            </thead>
            <tbody id="tool-calls-table">
              {toolCalls.map((tc) => (
                <tr key={tc.id} data-tool-id={tc.id} data-tool-state={tc.state}>
                  <td>{tc.name}</td>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        backgroundColor:
                          tc.state === 'complete'
                            ? '#28a745'
                            : tc.state === 'streaming-arguments'
                              ? '#ffc107'
                              : tc.state === 'approval-requested'
                                ? '#17a2b8'
                                : '#6c757d',
                        color: 'white',
                        fontSize: '11px',
                      }}
                    >
                      {tc.state}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {typeof tc.arguments === 'string'
                      ? tc.arguments
                      : JSON.stringify(tc.arguments)}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {tc.output ? JSON.stringify(tc.output) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Messages JSON Display */}
      <div
        id="messages-json"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
      >
        <pre
          id="messages-json-content"
          style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {JSON.stringify(messages, null, 2)}
        </pre>
      </div>

      {/* Test metadata for assertions */}
      <div
        id="test-metadata"
        style={{ display: 'none' }}
        data-scenario={scenario}
        data-is-loading={isLoading.toString()}
        data-test-complete={testComplete.toString()}
        data-tool-call-count={toolCalls.length}
        data-pending-approval-count={pendingApprovals.length}
        data-complete-tool-count={
          toolCalls.filter(
            (tc) =>
              tc.state === 'complete' ||
              tc.state === 'output-available' ||
              tc.output !== undefined ||
              toolResultIds.has(tc.id),
          ).length
        }
        data-event-count={toolEvents.length}
        data-execution-start-count={
          toolEvents.filter((e) => e.type === 'execution-start').length
        }
        data-execution-complete-count={
          toolEvents.filter((e) => e.type === 'execution-complete').length
        }
        data-approval-granted-count={
          toolEvents.filter((e) => e.type === 'approval-granted').length
        }
        data-approval-denied-count={
          toolEvents.filter((e) => e.type === 'approval-denied').length
        }
      />

      {/* Event log as JSON for easy parsing in tests */}
      <script
        id="event-log-json"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toolEvents) }}
      />

      {/* Tool calls as JSON for easy parsing in tests */}
      <script
        id="tool-calls-json"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              state: tc.state,
              hasOutput: !!tc.output,
            })),
          ),
        }}
      />
    </div>
  )
}

export const Route = createFileRoute('/tools-test')({
  component: ToolsTestPage,
})
