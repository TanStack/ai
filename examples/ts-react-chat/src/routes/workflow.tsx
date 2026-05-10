import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchWorkflowEvents, useWorkflow } from '@tanstack/ai-react'
import { StateInspector } from '@/components/StateInspector'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'

export const Route = createFileRoute('/workflow')({
  component: WorkflowPage,
})

type ArticleOutput =
  | { ok: true; article: { title: string; paragraphs: Array<string> } }
  | { ok: false; reason: string }

function WorkflowPage() {
  const [topic, setTopic] = useState('the cultural history of pufferfish')

  const wf = useWorkflow<{ topic: string }, ArticleOutput, unknown>({
    connection: fetchWorkflowEvents('/api/workflow'),
  })

  const isRunning = wf.status === 'running' || wf.status === 'paused'
  const finalStep = wf.steps.at(-1)
  const finalResult = (wf.status === 'finished' ? finalStep?.result : null) as
    | ArticleOutput
    | null
    | undefined

  return (
    <main className="relative z-10 min-h-screen px-8 lg:px-16 py-12 max-w-[1320px] mx-auto">
      <Masthead status={wf.status} runId={wf.runId} />

      <Composer
        topic={topic}
        onTopicChange={setTopic}
        onRun={() => wf.start({ topic })}
        onStop={() => wf.stop()}
        disabled={isRunning}
        canStop={isRunning}
      />

      {wf.pendingApproval && (
        <ApprovalBand
          title={wf.pendingApproval.title}
          description={wf.pendingApproval.description}
          onApprove={() => wf.approve(true)}
          onDeny={() => wf.approve(false)}
        />
      )}

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-x-12 gap-y-10">
        <WorkflowTimeline
          steps={wf.steps}
          currentStep={wf.currentStep}
          currentText={wf.currentText}
        />
        <StateInspector state={wf.state} />
      </div>

      {finalResult && finalResult.ok && (
        <PublishedArticle article={finalResult.article} />
      )}

      {finalResult && finalResult.ok === false && (
        <RejectionNotice reason={finalResult.reason} />
      )}

      {wf.error && (
        <div className="mt-10 border-l-4 border-rust pl-5 py-2">
          <div className="label-mono text-rust mb-1">runtime error</div>
          <div className="font-mono text-sm text-bone">{wf.error.message}</div>
        </div>
      )}

      <Colophon />
    </main>
  )
}

function Masthead(props: {
  status: string
  runId: string | null
}) {
  return (
    <header className="relative">
      <div className="flex items-baseline justify-between mb-2">
        <span className="label-mono text-taupe">Volume I · Pipeline No. 01</span>
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
        Article<br />
        <em
          className="font-display-italic text-citron"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 80, 'WONK' 1" }}
        >
          Pipeline
        </em>
      </h1>
      <div className="flex items-center gap-3 mt-4">
        <StatusDot status={props.status} />
        <span className="label-mono text-bone">
          status — <span className="text-citron">{props.status}</span>
        </span>
      </div>
      <hr className="rule-double mt-6" />
    </header>
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
  topic: string
  onTopicChange: (t: string) => void
  onRun: () => void
  onStop: () => void
  disabled: boolean
  canStop: boolean
}) {
  return (
    <div className="mt-10">
      <label className="label-mono text-taupe block mb-3">Topic Brief</label>
      <div className="flex gap-3 items-stretch">
        <input
          value={props.topic}
          onChange={(e) => props.onTopicChange(e.target.value)}
          disabled={props.disabled}
          className="flex-1 bg-transparent border-b-2 border-bone focus:border-citron outline-none px-1 py-3 text-2xl text-bone placeholder:text-taupe-deep transition-colors disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: "'opsz' 36, 'SOFT' 50, 'WONK' 0",
          }}
          placeholder="What should we write about?"
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
            ✓ Approve
          </button>
          <button
            onClick={props.onDeny}
            className="px-6 py-3 border border-bone text-bone label-mono hover:bg-bone hover:text-ink transition-colors"
          >
            ✗ Deny
          </button>
        </div>
      </div>
      <div className="tape-citron h-3" />
    </div>
  )
}

function PublishedArticle(props: {
  article: { title: string; paragraphs: Array<string> }
}) {
  return (
    <article className="mt-16 relative anim-log-in">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-8">
        <span className="label-mono text-citron">Published</span>
        <span className="label-mono text-taupe">
          {new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>
      <h2
        className="text-5xl md:text-6xl leading-[0.95] tracking-tight mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
        }}
      >
        {props.article.title}
      </h2>
      <div className="columns-1 md:columns-2 gap-10 max-w-5xl">
        {props.article.paragraphs.map((p, i) => (
          <p
            key={i}
            className={`mb-5 text-bone leading-[1.65] text-[17px] break-inside-avoid ${
              i === 0
                ? 'first-letter:float-left first-letter:text-7xl first-letter:font-bold first-letter:leading-[0.85] first-letter:mr-3 first-letter:text-citron'
                : ''
            }`}
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: "'opsz' 17, 'SOFT' 100, 'WONK' 0",
            }}
          >
            {p}
          </p>
        ))}
      </div>
    </article>
  )
}

function RejectionNotice(props: { reason: string }) {
  return (
    <div className="mt-12 anim-log-in">
      <div className="border-l-4 border-rust bg-ink-soft px-6 py-5">
        <div className="label-mono text-rust mb-2">spiked</div>
        <p
          className="text-2xl italic text-bone leading-snug"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: "'opsz' 96, 'SOFT' 80, 'WONK' 1",
          }}
        >
          “{props.reason}”
        </p>
      </div>
    </div>
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
