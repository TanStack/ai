import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchWorkflowEvents, useWorkflow } from '@tanstack/ai-react'
import { ArticleModal } from '@/components/ArticleModal'
import { DraftPreview } from '@/components/DraftPreview'
import { StateInspector } from '@/components/StateInspector'
import { WorkflowTimeline } from '@/components/WorkflowTimeline'

interface ArticleState {
  phase?: string
  draft?: { title: string; paragraphs: Array<string> }
}

// Steps whose streaming JSON payload is shaped like a Draft. While they're
// running we partial-parse `currentText` so the DraftPreview pane fills in
// live, paragraph by paragraph, instead of snapping in only after the agent
// finishes.
const DRAFT_PRODUCING_STEPS = new Set(['writer', 'editor'])

export const Route = createFileRoute('/workflow')({
  component: WorkflowPage,
})

type ArticleOutput =
  | { ok: true; article: { title: string; paragraphs: Array<string> } }
  | { ok: false; reason: string }

function WorkflowPage() {
  const [topic, setTopic] = useState('the cultural history of pufferfish')

  const wf = useWorkflow<{ topic: string }, ArticleOutput, ArticleState>({
    connection: fetchWorkflowEvents('/api/workflow'),
  })

  const isRunning = wf.status === 'running' || wf.status === 'paused'
  const finalResult = (
    wf.status === 'finished' ? wf.output : null
  ) as ArticleOutput | null

  // Live draft assembled from the streaming structured-output JSON deltas of
  // the active writer/editor step. Falls back to the committed `state.draft`
  // when no draft-producing step is mid-flight.
  const liveDraft = useMemo(() => {
    const stepName = wf.currentStep?.stepName
    if (!stepName || !DRAFT_PRODUCING_STEPS.has(stepName)) return undefined
    return parsePartialJSON(wf.currentText) as
      | { title?: string; paragraphs?: Array<string> }
      | undefined
  }, [wf.currentStep, wf.currentText])
  const isStreamingDraft = liveDraft !== undefined

  // Auto-open the modal when the workflow finalizes successfully. Local
  // dismiss state lets the user close it; re-running re-opens.
  const [modalOpen, setModalOpen] = useState(false)
  const lastRunIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      finalResult &&
      finalResult.ok &&
      wf.runId &&
      wf.runId !== lastRunIdRef.current
    ) {
      lastRunIdRef.current = wf.runId
      setModalOpen(true)
    }
    if (wf.status === 'idle' || wf.status === 'running') {
      // New run starting — clear the modal-shown marker so the next finish opens it.
      if (wf.runId !== lastRunIdRef.current) {
        // keep marker; only reset when user explicitly starts again with a different runId
      }
    }
  }, [finalResult, wf.runId, wf.status])

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
          onPublish={() => wf.approve(true)}
          onRevise={(feedback) => wf.approve(false, feedback)}
          onDiscard={() => wf.approve(false)}
        />
      )}

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-x-12 gap-y-10">
        <WorkflowTimeline
          steps={wf.steps}
          currentStep={wf.currentStep}
          currentText={wf.currentText}
        />
        <div className="flex flex-col gap-10 lg:sticky lg:top-8 lg:self-start">
          <DraftPreview
            draft={liveDraft ?? wf.state?.draft}
            phase={wf.state?.phase}
            streaming={isStreamingDraft}
          />
          <details className="group">
            <summary className="cursor-pointer label-mono text-taupe hover:text-citron transition-colors flex items-center gap-2 list-none">
              <span className="text-citron group-open:rotate-90 transition-transform inline-block">
                ▸
              </span>
              State Snapshot
            </summary>
            <div className="mt-4">
              <StateInspector state={wf.state} />
            </div>
          </details>
        </div>
      </div>

      {finalResult && finalResult.ok && (
        <>
          <PublishedSummary
            article={finalResult.article}
            onOpenModal={() => setModalOpen(true)}
          />
          {modalOpen && (
            <ArticleModal
              article={finalResult.article}
              onClose={() => setModalOpen(false)}
            />
          )}
        </>
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

function Masthead(props: { status: string; runId: string | null }) {
  return (
    <header className="relative">
      <div className="flex items-baseline justify-between mb-2">
        <span className="label-mono text-taupe">
          Volume I · Pipeline No. 01
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
        Article
        <br />
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
  onPublish: () => void
  onRevise: (feedback: string) => void
  onDiscard: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [feedback, setFeedback] = useState('')

  return (
    <div className="mt-10 anim-slip-in">
      <div className="tape-citron h-3" />
      <div className="bg-ink-soft border-x border-bone px-8 py-7 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
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
          <textarea
            ref={textareaRef}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Leave a note for the editor (optional — required to revise)"
            rows={3}
            className="mt-5 w-full bg-transparent border border-bone/40 focus:border-citron outline-none px-3 py-2 text-sm text-bone placeholder:text-taupe-deep resize-none transition-colors"
          />
        </div>
        <div className="flex flex-col gap-3 min-w-[140px]">
          <button
            onClick={props.onPublish}
            className="px-6 py-3 bg-citron text-ink label-mono hover:bg-bone transition-colors"
          >
            ✓ Publish
          </button>
          <button
            onClick={() => props.onRevise(feedback)}
            disabled={!feedback.trim()}
            className="px-6 py-3 border border-citron text-citron label-mono hover:bg-citron hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↻ Revise
          </button>
          <button
            onClick={props.onDiscard}
            className="px-6 py-3 border border-bone text-bone label-mono hover:bg-bone hover:text-ink transition-colors"
          >
            ✗ Discard
          </button>
        </div>
      </div>
      <div className="tape-citron h-3" />
    </div>
  )
}

function PublishedSummary(props: {
  article: { title: string; paragraphs: Array<string> }
  onOpenModal: () => void
}) {
  const wordCount = props.article.paragraphs.reduce(
    (n, p) => n + p.split(/\s+/).filter(Boolean).length,
    0,
  )
  return (
    <section className="mt-16 anim-log-in">
      <div className="flex items-baseline justify-between border-b border-bone pb-3 mb-6">
        <span className="label-mono text-citron">Published</span>
        <span className="label-mono text-taupe tabular">
          {props.article.paragraphs.length}¶ · {wordCount}w
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end">
        <h2
          className="text-4xl md:text-5xl leading-[0.97] tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: "'opsz' 144, 'SOFT' 30, 'WONK' 1",
          }}
        >
          {props.article.title}
        </h2>
        <button
          onClick={props.onOpenModal}
          className="px-6 py-3 bg-citron text-ink label-mono hover:bg-bone transition-colors w-fit justify-self-end"
        >
          ▸ Open Article
        </button>
      </div>
    </section>
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
