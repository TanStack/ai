import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchWorkflowEvents, useOrchestration } from '@tanstack/ai-react'
import { StateInspector } from '@/components/StateInspector'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'

export const Route = createFileRoute('/orchestration')({
  component: OrchestrationPage,
})

interface OrchState {
  phase?: string
  spec?: { title: string; summary: string; files: Array<string> }
  result?: {
    patches: Array<{ filename: string; patch: string }>
    rationale: string
  }
  lastUserMessage?: string
}

function OrchestrationPage() {
  const [message, setMessage] = useState(
    'add a /metrics endpoint to my Express app',
  )

  const orch = useOrchestration<{ userMessage: string }, unknown, OrchState>({
    connection: fetchWorkflowEvents('/api/orchestration'),
  })

  const isRunning = orch.status === 'running' || orch.status === 'paused'
  const phase = orch.state?.phase ?? 'idle'

  return (
    <main className="relative z-10 min-h-screen px-8 lg:px-16 py-12 max-w-[1320px] mx-auto">
      <Masthead status={orch.status} phase={phase} runId={orch.runId} />

      <Composer
        message={message}
        onMessageChange={setMessage}
        onRun={() => orch.start({ userMessage: message })}
        onStop={() => orch.stop()}
        disabled={isRunning}
        canStop={isRunning}
      />

      {orch.pendingApproval && (
        <ApprovalBand
          title={orch.pendingApproval.title}
          description={orch.pendingApproval.description}
          onApprove={() => orch.approve(true)}
          onDeny={() => orch.approve(false)}
        />
      )}

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-x-12 gap-y-10">
        <WorkflowTimeline
          steps={orch.steps}
          currentStep={orch.currentStep}
          currentText={orch.currentText}
        />
        <StateInspector state={orch.state} />
      </div>

      {orch.state?.spec && phase !== 'done' && (
        <SpecReadout spec={orch.state.spec} />
      )}

      {orch.state?.result && (
        <ImplementationReadout result={orch.state.result} />
      )}

      {orch.error && (
        <div className="mt-10 border-l-4 border-rust pl-5 py-2">
          <div className="label-mono text-rust mb-1">runtime error</div>
          <div className="font-mono text-sm text-bone">{orch.error.message}</div>
        </div>
      )}

      <Colophon />
    </main>
  )
}

function Masthead(props: {
  status: string
  phase: string
  runId: string | null
}) {
  return (
    <header className="relative">
      <div className="flex items-baseline justify-between mb-2">
        <span className="label-mono text-taupe">
          Volume I · Orchestrator No. 02
        </span>
        <span className="label-mono text-taupe tabular">
          {props.runId ? props.runId.slice(-12) : '—'}
        </span>
      </div>
      <hr className="rule-thick" />
      <h1
        className="mt-4 mb-2 text-[clamp(3rem,9vw,7rem)] leading-[0.92] tracking-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
        }}
      >
        Feature
        <br />
        <em
          className="font-display-italic text-citron"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 80, 'WONK' 1" }}
        >
          Orchestrator
        </em>
      </h1>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <PhaseBadge phase={props.phase} />
        <div className="flex items-center gap-3">
          <StatusDot status={props.status} />
          <span className="label-mono text-bone">
            status — <span className="text-citron">{props.status}</span>
          </span>
        </div>
      </div>

      <hr className="rule-double mt-6" />
    </header>
  )
}

function PhaseBadge(props: { phase: string }) {
  const labels: Array<{ key: string; label: string }> = [
    { key: 'scoping', label: 'Scoping' },
    { key: 'awaiting-approval', label: 'Awaiting' },
    { key: 'implementing', label: 'Implementing' },
    { key: 'review', label: 'Review' },
    { key: 'done', label: 'Done' },
  ]
  return (
    <ol className="flex items-center gap-1 label-mono">
      {labels.map((l, i) => {
        const isCurrent = l.key === props.phase
        return (
          <li key={l.key} className="flex items-center gap-1">
            <span
              className={
                isCurrent
                  ? 'text-ink bg-citron px-2 py-1'
                  : 'text-taupe-deep px-2 py-1'
              }
            >
              {String(i + 1).padStart(2, '0')} · {l.label}
            </span>
            {i < labels.length - 1 && <span className="text-ink-line">/</span>}
          </li>
        )
      })}
    </ol>
  )
}

function StatusDot(props: { status: string }) {
  const cls =
    props.status === 'running'
      ? 'bg-citron anim-citron-pulse'
      : props.status === 'paused'
        ? 'bg-citron'
        : props.status === 'error' || props.status === 'aborted'
          ? 'bg-rust'
          : props.status === 'finished'
            ? 'bg-moss'
            : 'bg-taupe-deep'
  return <span className={`inline-block w-2.5 h-2.5 ${cls}`} aria-hidden />
}

function Composer(props: {
  message: string
  onMessageChange: (m: string) => void
  onRun: () => void
  onStop: () => void
  disabled: boolean
  canStop: boolean
}) {
  return (
    <div className="mt-10">
      <label className="label-mono text-taupe block mb-3">
        Feature Request
      </label>
      <div className="flex gap-3 items-stretch">
        <input
          value={props.message}
          onChange={(e) => props.onMessageChange(e.target.value)}
          disabled={props.disabled}
          className="flex-1 bg-transparent border-b-2 border-bone focus:border-citron outline-none px-1 py-3 text-2xl text-bone placeholder:text-taupe-deep transition-colors disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: "'opsz' 36, 'SOFT' 50, 'WONK' 0",
          }}
          placeholder="Describe what you want built…"
        />
        <button
          onClick={props.onRun}
          disabled={props.disabled}
          className="px-6 py-3 bg-citron text-ink label-mono hover:bg-bone hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ▸ Run
        </button>
        {props.canStop && (
          <button
            onClick={props.onStop}
            className="px-5 py-3 border border-rust text-rust label-mono hover:bg-rust hover:text-ink transition-colors"
          >
            ◼ Stop
          </button>
        )}
      </div>
    </div>
  )
}

function ApprovalBand(props: {
  title: string
  description?: string
  onApprove: () => void
  onDeny: () => void
}) {
  return (
    <div className="mt-10 anim-slip-in">
      <div className="tape-citron h-3" />
      <div className="bg-ink-soft border-x border-bone px-8 py-7 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="label-mono text-citron mb-2">decision required</div>
          <h2
            className="text-4xl leading-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontVariationSettings: "'opsz' 96, 'SOFT' 80, 'WONK' 1",
            }}
          >
            {props.title}
          </h2>
          {props.description && (
            <p className="mt-3 text-bone/80 text-[15px] max-w-2xl leading-relaxed">
              {props.description}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={props.onApprove}
            className="px-6 py-3 bg-citron text-ink label-mono hover:bg-bone transition-colors"
          >
            ✓ Implement
          </button>
          <button
            onClick={props.onDeny}
            className="px-6 py-3 border border-bone text-bone label-mono hover:bg-bone hover:text-ink transition-colors"
          >
            ✗ Refine
          </button>
        </div>
      </div>
      <div className="tape-citron h-3" />
    </div>
  )
}

function SpecReadout(props: {
  spec: { title: string; summary: string; files: Array<string> }
}) {
  return (
    <section className="mt-16 anim-log-in">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-6">
        <span className="label-mono text-citron">Spec Draft</span>
        <span className="label-mono text-taupe">
          {props.spec.files.length} files
        </span>
      </div>
      <h2
        className="text-4xl mb-4 leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
        }}
      >
        {props.spec.title}
      </h2>
      <p
        className="text-bone leading-relaxed text-[17px] max-w-3xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 17, 'SOFT' 100, 'WONK' 0",
        }}
      >
        {props.spec.summary}
      </p>
      <ul className="font-mono text-[12.5px] text-taupe space-y-1">
        {props.spec.files.map((f) => (
          <li key={f} className="flex gap-3">
            <span className="text-citron">›</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ImplementationReadout(props: {
  result: {
    patches: Array<{ filename: string; patch: string }>
    rationale: string
  }
}) {
  return (
    <section className="mt-16 anim-log-in">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-6">
        <span className="label-mono text-citron">Implementation</span>
        <span className="label-mono text-taupe">
          {props.result.patches.length} patches
        </span>
      </div>
      <p
        className="italic text-bone/90 text-xl mb-8 max-w-3xl"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 96, 'SOFT' 80, 'WONK' 1",
        }}
      >
        “{props.result.rationale}”
      </p>
      <div className="space-y-6">
        {props.result.patches.map((p, i) => (
          <article key={i} className="border-l-2 border-citron pl-5">
            <header className="flex items-baseline gap-3 mb-2">
              <span className="label-mono text-taupe-deep tabular">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-mono text-bone text-sm">{p.filename}</span>
            </header>
            <pre className="font-mono text-[12px] leading-relaxed text-bone whitespace-pre-wrap bg-ink-soft/60 px-4 py-3 max-h-72 overflow-auto">
              {p.patch}
            </pre>
          </article>
        ))}
      </div>
    </section>
  )
}

function Colophon() {
  return (
    <footer className="mt-20 pt-6 border-t border-ink-line">
      <div className="flex justify-between label-mono text-taupe-deep">
        <span>TanStack AI · Orchestration</span>
        <span>Set in Fraunces &amp; JetBrains Mono</span>
      </div>
    </footer>
  )
}
