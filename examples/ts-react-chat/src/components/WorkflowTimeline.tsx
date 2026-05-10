import type { WorkflowStep } from '@tanstack/ai-client'

export function WorkflowTimeline(props: {
  steps: Array<WorkflowStep>
  currentStep: WorkflowStep | null
  currentText?: string
}) {
  return (
    <div className="flex flex-col gap-2 p-4 border rounded">
      <div className="font-semibold text-sm">Timeline</div>
      {props.steps.length === 0 && (
        <div className="text-xs text-gray-500">No steps yet.</div>
      )}
      {props.steps.map((step) => {
        const active = props.currentStep?.stepId === step.stepId
        return (
          <div key={step.stepId} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={
                  step.status === 'finished'
                    ? 'text-green-600'
                    : step.status === 'failed'
                      ? 'text-red-600'
                      : 'text-blue-600'
                }
              >
                {step.status === 'finished'
                  ? 'OK'
                  : step.status === 'failed'
                    ? 'X'
                    : '...'}
              </span>
              <span className="font-medium">{step.stepName}</span>
              {step.stepType && (
                <span className="text-xs text-gray-500">[{step.stepType}]</span>
              )}
              {step.finishedAt && step.startedAt && (
                <span className="text-xs text-gray-400">
                  {step.finishedAt - step.startedAt}ms
                </span>
              )}
            </div>
            {active && props.currentText && (
              <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap">
                {props.currentText}
              </pre>
            )}
            {step.status === 'finished' && step.result !== undefined && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500">
                  result
                </summary>
                <pre className="bg-gray-50 p-2 rounded whitespace-pre-wrap overflow-auto max-h-48">
                  {JSON.stringify(step.result, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )
      })}
    </div>
  )
}
