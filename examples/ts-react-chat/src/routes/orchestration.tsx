import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useOrchestration } from '@tanstack/ai-react'
import { StateInspector } from '@/components/StateInspector'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'

export const Route = createFileRoute('/orchestration')({
  component: OrchestrationPage,
})

function OrchestrationPage() {
  const [message, setMessage] = useState(
    'add a /metrics endpoint to my Express app',
  )

  const orch = useOrchestration<{ userMessage: string }, unknown, unknown>({
    endpoint: '/api/orchestration',
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Feature Orchestrator</h1>

      <div className="flex gap-2 mb-4">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 border rounded px-2 py-1"
          placeholder="Describe what you want"
          disabled={orch.status === 'running' || orch.status === 'paused'}
        />
        <button
          onClick={() => orch.start({ userMessage: message })}
          disabled={orch.status === 'running' || orch.status === 'paused'}
          className="px-4 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Run
        </button>
      </div>

      {orch.pendingApproval && (
        <div className="mb-4 p-4 border-2 border-yellow-400 rounded bg-yellow-50">
          <div className="font-semibold">{orch.pendingApproval.title}</div>
          {orch.pendingApproval.description && (
            <div className="text-sm mt-1">
              {orch.pendingApproval.description}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => orch.approve(true)}
              className="px-3 py-1 bg-green-600 text-white rounded"
            >
              Approve
            </button>
            <button
              onClick={() => orch.approve(false)}
              className="px-3 py-1 bg-red-500 text-white rounded"
            >
              Keep refining
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <WorkflowTimeline
          steps={orch.steps}
          currentStep={orch.currentStep}
          currentText={orch.currentText}
        />
        <StateInspector state={orch.state} />
      </div>

      {orch.error && (
        <div className="mt-4 p-4 border rounded bg-red-50 text-red-700">
          <div className="font-semibold">Error</div>
          <div className="text-sm">{orch.error.message}</div>
        </div>
      )}
    </div>
  )
}
