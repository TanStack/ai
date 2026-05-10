import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useWorkflow } from '@tanstack/ai-react'
import { StateInspector } from '@/components/StateInspector'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'

export const Route = createFileRoute('/workflow')({
  component: WorkflowPage,
})

function WorkflowPage() {
  const [topic, setTopic] = useState('the cultural history of pufferfish')

  const wf = useWorkflow<{ topic: string }, unknown, unknown>({
    connection: {
      connect: async function* (body: unknown) {
        const response = await fetch('/api/workflow', {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
        if (!response.ok) {
          throw new Error(
            `HTTP error! status: ${response.status} ${response.statusText}`,
          )
        }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Response body is not readable')
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              const data = trimmed.startsWith('data: ')
                ? trimmed.slice(6)
                : trimmed
              if (data === '[DONE]') continue
              try {
                yield JSON.parse(data)
              } catch {
                // skip malformed chunks
              }
            }
          }
          if (buffer.trim()) {
            const data = buffer.trim().startsWith('data: ')
              ? buffer.trim().slice(6)
              : buffer.trim()
            try {
              yield JSON.parse(data)
            } catch {
              // skip
            }
          }
        } finally {
          reader.releaseLock()
        }
      },
    } as any,
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Article Workflow</h1>

      <div className="flex gap-2 mb-4">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="flex-1 border rounded px-2 py-1"
          placeholder="Topic"
          disabled={wf.status === 'running' || wf.status === 'paused'}
        />
        <button
          onClick={() => wf.start({ topic })}
          disabled={wf.status === 'running' || wf.status === 'paused'}
          className="px-4 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Run
        </button>
        {(wf.status === 'running' || wf.status === 'paused') && (
          <button
            onClick={() => wf.stop()}
            className="px-4 py-1 bg-red-500 text-white rounded"
          >
            Stop
          </button>
        )}
      </div>

      {wf.pendingApproval && (
        <div className="mb-4 p-4 border-2 border-yellow-400 rounded bg-yellow-50">
          <div className="font-semibold">{wf.pendingApproval.title}</div>
          {wf.pendingApproval.description && (
            <div className="text-sm mt-1">{wf.pendingApproval.description}</div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => wf.approve(true)}
              className="px-3 py-1 bg-green-600 text-white rounded"
            >
              Approve
            </button>
            <button
              onClick={() => wf.approve(false)}
              className="px-3 py-1 bg-red-500 text-white rounded"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <WorkflowTimeline
          steps={wf.steps}
          currentStep={wf.currentStep}
          currentText={wf.currentText}
        />
        <StateInspector state={wf.state} />
      </div>

      {wf.status === 'finished' && wf.steps.length > 0 && (
        <div className="mt-4 p-4 border rounded bg-green-50">
          <div className="font-semibold">Done</div>
          <pre className="text-xs whitespace-pre-wrap mt-2">
            {JSON.stringify(wf.steps.at(-1)?.result, null, 2)}
          </pre>
        </div>
      )}

      {wf.error && (
        <div className="mt-4 p-4 border rounded bg-red-50 text-red-700">
          <div className="font-semibold">Error</div>
          <div className="text-sm">{wf.error.message}</div>
        </div>
      )}
    </div>
  )
}
