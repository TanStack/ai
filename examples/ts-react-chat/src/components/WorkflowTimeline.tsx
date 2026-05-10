import type { WorkflowStep } from '@tanstack/ai-client'

export function WorkflowTimeline(props: {
  steps: Array<WorkflowStep>
  currentStep: WorkflowStep | null
  currentText?: string
}) {
  return (
    <section className="relative">
      <Header count={props.steps.length} />

      {props.steps.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="relative">
          {props.steps.map((step, i) => (
            <Entry
              key={step.stepId}
              ordinal={i + 1}
              step={step}
              isActive={props.currentStep?.stepId === step.stepId}
              currentText={
                props.currentStep?.stepId === step.stepId
                  ? props.currentText
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function Header(props: { count: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-6">
      <span className="label-mono text-bone">Pipeline Log</span>
      <span className="label-mono text-taupe tabular">
        {String(props.count).padStart(2, '0')} entries
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="text-4xl text-taupe-deep mb-2 font-display-italic">
        nothing yet.
      </div>
      <div className="label-mono text-taupe">awaiting first step</div>
    </div>
  )
}

function Entry(props: {
  ordinal: number
  step: WorkflowStep
  isActive: boolean
  currentText?: string
}) {
  const { ordinal, step, isActive, currentText } = props
  const duration =
    step.finishedAt && step.startedAt ? step.finishedAt - step.startedAt : null

  return (
    <li
      className="relative grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 py-5 anim-log-in"
      style={{ animationDelay: `${Math.min(ordinal - 1, 8) * 30}ms` }}
    >
      <div className="relative pt-0.5">
        <div
          className={`label-mono tabular text-right pr-3 ${
            step.status === 'failed'
              ? 'text-rust'
              : isActive
                ? 'text-citron'
                : 'text-taupe-deep'
          }`}
        >
          № {String(ordinal).padStart(2, '0')}
        </div>
        <div
          className={`absolute right-0 top-7 -bottom-5 w-px ${
            isActive ? 'bg-citron anim-citron-pulse' : 'bg-ink-line'
          }`}
        />
        {isActive && (
          <div className="absolute right-0 top-0 w-1 h-6 bg-citron" />
        )}
      </div>

      <div className="min-w-0 pl-3 border-l border-ink-line">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
          <h3
            className="text-2xl leading-tight uppercase tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 1",
            }}
          >
            {step.stepName}
          </h3>
          {step.stepType && (
            <span className="label-mono text-taupe">
              {step.stepType.replace('-', ' · ')}
            </span>
          )}
          <span className="label-mono text-taupe-deep tabular ml-auto">
            {step.status === 'running' ? (
              <>
                running
                <span className="anim-blink ml-1 text-citron">▌</span>
              </>
            ) : step.status === 'failed' ? (
              'failed'
            ) : duration !== null ? (
              `${duration}ms`
            ) : (
              'finished'
            )}
          </span>
        </header>

        {isActive && currentText && (
          <pre className="font-mono text-[12.5px] leading-relaxed text-bone whitespace-pre-wrap bg-ink-soft/60 border-l-2 border-citron px-4 py-3 mt-2">
            {currentText}
            <span className="anim-blink text-citron">▌</span>
          </pre>
        )}

        {step.status === 'finished' && step.result !== undefined && (
          <ResultBlock result={step.result} />
        )}
        {step.status === 'failed' && step.result !== undefined && (
          <FailureBlock result={step.result} />
        )}
      </div>
    </li>
  )
}

function ResultBlock(props: { result: unknown }) {
  const text = typeof props.result === 'string' ? props.result : null
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer label-mono text-taupe hover:text-citron transition-colors w-fit list-none flex items-center gap-2">
        <span className="text-citron group-open:rotate-90 transition-transform inline-block">
          ▸
        </span>
        result
      </summary>
      <div className="mt-2">
        {text !== null ? (
          <p
            className="text-bone leading-relaxed text-[15px]"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: "'opsz' 14, 'SOFT' 100, 'WONK' 0",
            }}
          >
            {text}
          </p>
        ) : (
          <pre className="font-mono text-[11.5px] leading-relaxed text-taupe whitespace-pre-wrap bg-ink-soft/40 border-l border-ink-line px-3 py-2 max-h-72 overflow-auto">
            {JSON.stringify(props.result, null, 2)}
          </pre>
        )}
      </div>
    </details>
  )
}

function FailureBlock(props: { result: unknown }) {
  const result = props.result as { error?: { message?: string } }
  const msg = result.error?.message ?? JSON.stringify(props.result)
  return (
    <div className="mt-3 border-l-2 border-rust pl-4 py-1">
      <div className="label-mono text-rust mb-1">error</div>
      <p className="font-mono text-[12.5px] text-bone leading-relaxed whitespace-pre-wrap">
        {msg}
      </p>
    </div>
  )
}
