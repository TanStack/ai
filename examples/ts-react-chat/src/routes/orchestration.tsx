import { createFileRoute } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchWorkflowEvents, useOrchestration } from '@tanstack/ai-react'
import type { WorkflowStep } from '@tanstack/ai-client'
import type { FileEntry } from '@/components/FileTreePanel'
import { CodeBlock } from '@/components/CodeBlock'
import { FileTreePanel } from '@/components/FileTreePanel'

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

interface SessionEntry {
  id: string
  userMessage: string
  /** Captured at the moment the user submitted, so the log keeps prior runs intact. */
  steps: Array<WorkflowStep>
  /** Final orchestrator output, when the run finishes. */
  finalResult?: OrchState['result']
  /** Set if the run errored out. */
  error?: { message: string; code?: string }
}

const PROMPT = '~/feature-orchestrator $'

interface OrchestratorRequest {
  userMessage: string
  previousSpec?: OrchState['spec']
  previousResult?: OrchState['result']
}

function OrchestrationPage() {
  const [input, setInput] = useState(
    'add a /metrics endpoint to my Express app',
  )
  // Past completed/erred runs in this session. The active run is read straight
  // from `orch.steps` etc.; once it finishes we snapshot it here so subsequent
  // runs append rather than overwrite.
  const [history, setHistory] = useState<Array<SessionEntry>>([])
  // Carries the most recent successful run's spec/result so the NEXT
  // submission is treated as a refinement (the orchestrator initializes
  // mid-flow and triage routes the new message to 'spec' refine).
  const [carryover, setCarryover] = useState<{
    spec?: OrchState['spec']
    result?: OrchState['result']
  } | null>(null)

  const orch = useOrchestration<OrchestratorRequest, unknown, OrchState>({
    connection: fetchWorkflowEvents('/api/orchestration'),
  })

  const isRunning = orch.status === 'running'
  const isPaused = orch.status === 'paused'
  const isBusy = isRunning || isPaused
  const isDone =
    orch.status === 'finished' ||
    orch.status === 'error' ||
    orch.status === 'aborted'

  // Snapshot the run into history on terminal status transitions so the log
  // accumulates across sessions instead of being wiped on the next start().
  // Also stash the run's spec/result as `carryover` so the next submission
  // can refine it instead of starting from scratch.
  const snapshottedRunIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isDone) return
    if (!orch.runId || snapshottedRunIdRef.current === orch.runId) return
    snapshottedRunIdRef.current = orch.runId
    setHistory((h) => [
      ...h,
      {
        id: orch.runId!,
        userMessage: orch.state?.lastUserMessage ?? '(no message)',
        steps: orch.steps,
        finalResult: orch.state?.result,
        error: orch.error
          ? { message: orch.error.message, code: orch.error.code }
          : undefined,
      },
    ])
    if (orch.status === 'finished' && orch.state?.spec) {
      setCarryover({
        spec: orch.state.spec,
        result: orch.state.result,
      })
    }
  }, [
    isDone,
    orch.runId,
    orch.state?.lastUserMessage,
    orch.state?.spec,
    orch.state?.result,
    orch.steps,
    orch.status,
    orch.error,
  ])

  // Partial-parse the active step's structured-output stream so spec/coder
  // output fills in live as JSON arrives.
  const liveSpec = useMemo(() => {
    if (orch.currentStep?.stepName !== 'spec') return undefined
    const parsed = parsePartialJSON(orch.currentText) as
      | { spec?: { title?: string; summary?: string; files?: Array<string> } }
      | undefined
    return parsed?.spec
  }, [orch.currentStep, orch.currentText])

  const liveCoderPatch = useMemo(() => {
    if (orch.currentStep?.stepName !== 'coder') return undefined
    return parsePartialJSON(orch.currentText) as
      | { filename?: string; patch?: string }
      | undefined
  }, [orch.currentStep, orch.currentText])

  // Patches that should appear in the right-side file tree: every finished
  // coder step in the active run, plus the partial-parsed in-flight one (if
  // any). Resets when a new run starts because `orch.steps` resets.
  const filesForPanel = useMemo<Array<FileEntry>>(() => {
    const files: Array<FileEntry> = []
    for (const step of orch.steps) {
      if (
        step.stepName === 'coder' &&
        step.status === 'finished' &&
        step.result &&
        typeof step.result === 'object'
      ) {
        const r = step.result as { filename?: string; patch?: string }
        if (typeof r.filename === 'string' && typeof r.patch === 'string') {
          files.push({ filename: r.filename, patch: r.patch })
        }
      }
    }
    if (
      orch.currentStep?.stepName === 'coder' &&
      liveCoderPatch &&
      typeof liveCoderPatch.filename === 'string'
    ) {
      files.push({
        filename: liveCoderPatch.filename,
        patch: liveCoderPatch.patch ?? '',
        streaming: true,
      })
    }
    return files
  }, [orch.steps, orch.currentStep, liveCoderPatch])

  const submit = useCallback(() => {
    if (!input.trim() || isBusy) return
    const msg = input.trim()
    // `:reset` / `:clear` drops the carryover so the next message starts a
    // brand-new orchestration instead of refining the prior result.
    if (msg === ':reset' || msg === ':clear') {
      setCarryover(null)
      setInput('')
      return
    }
    setInput('')
    void orch.start({
      userMessage: msg,
      previousSpec: carryover?.spec,
      previousResult: carryover?.result,
    })
  }, [input, isBusy, orch, carryover])

  const logRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [
    orch.steps.length,
    orch.currentText,
    orch.status,
    history.length,
    orch.pendingApproval,
  ])

  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!isBusy && !orch.pendingApproval) inputRef.current?.focus()
  }, [isBusy, orch.pendingApproval])

  // Ctrl+C cancels the run. We only intercept the keystroke when (a) the run
  // is busy and (b) the user isn't trying to copy a text selection — that
  // way the conventional copy shortcut still works on the terminal log.
  // Cmd+. is also accepted for ergonomics on macOS, where Cmd+C is firmly
  // owned by copy.
  useEffect(() => {
    if (!isBusy) return
    const onKey = (e: KeyboardEvent) => {
      const cmdDot = e.metaKey && e.key === '.'
      const ctrlC =
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'c' || e.key === 'C') &&
        !e.shiftKey &&
        !e.altKey
      if (!cmdDot && !ctrlC) return
      if (ctrlC) {
        const selection = window.getSelection()?.toString() ?? ''
        if (selection.trim().length > 0) return
      }
      e.preventDefault()
      orch.stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isBusy, orch])

  return (
    <main
      className="relative z-10 min-h-screen px-4 sm:px-8 py-8 max-w-[1500px] mx-auto"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <TerminalChrome status={orch.status} runId={orch.runId} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-0 lg:gap-4">
      <div
        ref={logRef}
        className="bg-ink-soft border-x border-b border-ink-line lg:border lg:border-ink-line px-5 sm:px-8 py-6 h-[72vh] overflow-y-auto text-[13.5px] leading-[1.7] text-bone"
      >
        <BootBanner />

        {history.map((entry) => (
          <ClosedSession key={entry.id} entry={entry} />
        ))}

        {orch.runId && !history.some((h) => h.id === orch.runId) && (
          <ActiveSession
            userMessage={orch.state?.lastUserMessage}
            steps={orch.steps}
            currentStep={orch.currentStep}
            currentText={orch.currentText}
            liveSpec={liveSpec}
            liveCoderPatch={liveCoderPatch}
            pendingApproval={orch.pendingApproval}
            onApprove={(approved, feedback) => orch.approve(approved, feedback)}
            error={orch.error}
            finalResult={
              orch.status === 'finished' ? orch.state?.result : undefined
            }
            phase={orch.state?.phase}
          />
        )}

        <PromptLine
          ref={inputRef}
          value={input}
          onValueChange={setInput}
          onSubmit={submit}
          onStop={isBusy ? () => orch.stop() : undefined}
          disabled={isBusy || !!orch.pendingApproval}
          refining={!!carryover && !isBusy}
          onResetCarryover={
            carryover ? () => setCarryover(null) : undefined
          }
        />
      </div>

        <FileTreePanel files={filesForPanel} />
      </div>
    </main>
  )
}

// ============================================================================
// Terminal chrome
// ============================================================================

function TerminalChrome(props: { status: string; runId: string | null }) {
  return (
    <div className="bg-ink border border-ink-line border-b-0 px-4 py-2 flex items-center gap-3">
      <span className="flex gap-1.5">
        <span className="w-3 h-3 rounded-full bg-rust opacity-80" />
        <span className="w-3 h-3 rounded-full bg-citron opacity-80" />
        <span className="w-3 h-3 rounded-full bg-moss opacity-80" />
      </span>
      <span className="label-mono text-taupe ml-2 truncate">
        feature-orchestrator — {props.runId ? props.runId.slice(-12) : 'idle'}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <StatusDot status={props.status} />
        <span className="label-mono text-taupe">{props.status}</span>
      </span>
    </div>
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
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />
}

function BootBanner() {
  return (
    <div className="text-taupe-deep mb-5 select-none">
      <div>TanStack AI · Feature Orchestrator v1.0</div>
      <div>
        Type a feature request below. The orchestrator will draft a spec, ask
        for approval, generate patches, then review.
      </div>
      <Divider />
    </div>
  )
}

function Divider() {
  return (
    <div className="text-ink-line my-1 select-none">
      ────────────────────────────────────────────────────────────────────
    </div>
  )
}

// ============================================================================
// Session rendering
// ============================================================================

function ClosedSession(props: { entry: SessionEntry }) {
  return (
    <div className="mb-6 anim-log-in">
      <UserPromptLine message={props.entry.userMessage} />
      {props.entry.steps.map((step) => (
        <StepBlock key={step.stepId} step={step} active={false} />
      ))}
      {props.entry.error ? (
        <div className="mt-2 text-rust">
          ✗ run failed: {props.entry.error.message}
        </div>
      ) : props.entry.finalResult ? (
        <FinalSummary result={props.entry.finalResult} />
      ) : null}
      <Divider />
    </div>
  )
}

function ActiveSession(props: {
  userMessage: string | undefined
  steps: Array<WorkflowStep>
  currentStep: WorkflowStep | null
  currentText: string
  liveSpec:
    | { title?: string; summary?: string; files?: Array<string> }
    | undefined
  liveCoderPatch: { filename?: string; patch?: string } | undefined
  pendingApproval: { title: string; description?: string } | null | undefined
  onApprove: (approved: boolean, feedback?: string) => void
  error: { message: string; code?: string } | null | undefined
  finalResult: OrchState['result']
  phase: string | undefined
}) {
  return (
    <div className="anim-log-in">
      <UserPromptLine message={props.userMessage ?? '(starting)'} />

      {props.steps.map((step) => {
        const isActive = props.currentStep?.stepId === step.stepId
        return (
          <StepBlock
            key={step.stepId}
            step={step}
            active={isActive}
            liveSpec={isActive ? props.liveSpec : undefined}
            liveCoderPatch={isActive ? props.liveCoderPatch : undefined}
          />
        )
      })}

      {props.pendingApproval && (
        <ApprovalInline
          title={props.pendingApproval.title}
          description={props.pendingApproval.description}
          onApprove={(feedback) => props.onApprove(true, feedback)}
          onDeny={(feedback) => props.onApprove(false, feedback)}
        />
      )}

      {props.error && (
        <div className="mt-2 text-rust">
          ✗ run failed: {props.error.message}
        </div>
      )}

      {props.finalResult && <FinalSummary result={props.finalResult} />}

      {props.phase === 'done' && !props.finalResult && (
        <div className="mt-1 text-moss">✓ done</div>
      )}
    </div>
  )
}

function UserPromptLine(props: { message: string }) {
  return (
    <div className="flex gap-2 mb-1">
      <span className="text-citron shrink-0">{PROMPT}</span>
      <span className="text-bone break-words">{props.message}</span>
    </div>
  )
}

// ============================================================================
// Step rendering
// ============================================================================

function StepBlock(props: {
  step: WorkflowStep
  active: boolean
  liveSpec?:
    | { title?: string; summary?: string; files?: Array<string> }
    | undefined
  liveCoderPatch?: { filename?: string; patch?: string } | undefined
}) {
  const { step, active } = props
  const duration =
    step.finishedAt && step.startedAt ? step.finishedAt - step.startedAt : null

  return (
    <div className="mt-3">
      <StepHeader step={step} active={active} duration={duration} />
      <StepBody
        step={step}
        active={active}
        liveSpec={props.liveSpec}
        liveCoderPatch={props.liveCoderPatch}
      />
    </div>
  )
}

function StepHeader(props: {
  step: WorkflowStep
  active: boolean
  duration: number | null
}) {
  const { step, active, duration } = props
  const icon =
    step.status === 'failed' ? '✗' : step.status === 'finished' ? '✓' : '›'
  const iconColor =
    step.status === 'failed'
      ? 'text-rust'
      : step.status === 'finished'
        ? 'text-moss'
        : 'text-citron'
  return (
    <div className="flex items-baseline gap-2">
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="text-taupe">[{step.stepName}]</span>
      <span className="text-taupe-deep">
        {step.stepType?.replace('-', '·')}
      </span>
      {active && (
        <span className="text-citron anim-blink ml-1">running…</span>
      )}
      <span className="ml-auto text-taupe-deep tabular text-[12px]">
        {duration !== null ? `${duration}ms` : ''}
      </span>
    </div>
  )
}

function StepBody(props: {
  step: WorkflowStep
  active: boolean
  liveSpec?:
    | { title?: string; summary?: string; files?: Array<string> }
    | undefined
  liveCoderPatch?: { filename?: string; patch?: string } | undefined
}) {
  const { step, active } = props

  // Active spec step — render the partial-parsed spec as it streams.
  if (active && step.stepName === 'spec' && props.liveSpec) {
    return <SpecLine spec={props.liveSpec} streaming />
  }
  // Active coder step — render the partial patch.
  if (active && step.stepName === 'coder' && props.liveCoderPatch) {
    return <PatchLine patch={props.liveCoderPatch} streaming />
  }
  // Finished step result rendering.
  if (step.status === 'finished' && step.result !== undefined) {
    return <FinishedStepBody step={step} />
  }
  if (step.status === 'failed' && step.result !== undefined) {
    return (
      <div className="ml-5 mt-1 text-rust">
        {stringifyResult(step.result)}
      </div>
    )
  }
  return null
}

function FinishedStepBody(props: { step: WorkflowStep }) {
  const { step } = props
  const result = step.result as Record<string, unknown>

  if (step.stepName === 'spec' && isSpecOutput(result)) {
    return <SpecLine spec={result.spec} />
  }
  if (step.stepName === 'coder' && isPatchOutput(result)) {
    return <PatchLine patch={result} />
  }
  if (step.stepName === 'planner' && isPlannerOutput(result)) {
    return (
      <div className="ml-5 mt-1 text-taupe">
        <div>
          <span className="text-taupe-deep">files: </span>
          {result.files.join(', ')}
        </div>
        <div className="text-taupe-deep italic mt-0.5">
          {result.rationale}
        </div>
      </div>
    )
  }
  if (step.stepName === 'triage' && isTriageOutput(result)) {
    return (
      <div className="ml-5 mt-1 text-taupe">
        → next: <span className="text-citron">{result.next}</span>
        <span className="text-taupe-deep ml-2 italic">— {result.reason}</span>
      </div>
    )
  }
  if (step.stepName === 'review' && isReviewOutput(result)) {
    return (
      <div className="ml-5 mt-1 text-taupe">
        verdict:{' '}
        <span
          className={
            result.verdict === 'accept'
              ? 'text-moss'
              : result.verdict === 'reject'
                ? 'text-rust'
                : 'text-citron'
          }
        >
          {result.verdict}
        </span>
        <div className="text-taupe-deep italic mt-0.5">{result.notes}</div>
      </div>
    )
  }
  if (step.stepName === 'approval' && isApprovalOutput(result)) {
    return (
      <div className="ml-5 mt-1 text-taupe">
        {result.approved ? (
          <span className="text-moss">✓ approved</span>
        ) : (
          <span className="text-rust">✗ denied</span>
        )}
        {result.feedback && (
          <span className="text-taupe-deep italic ml-2">
            — “{result.feedback}”
          </span>
        )}
      </div>
    )
  }
  // Fallback: dim JSON
  return (
    <pre className="ml-5 mt-1 text-taupe-deep text-[12px] whitespace-pre-wrap">
      {stringifyResult(result)}
    </pre>
  )
}

function SpecLine(props: {
  spec: { title?: string; summary?: string; files?: Array<string> }
  streaming?: boolean
}) {
  return (
    <div className="ml-5 mt-1 text-bone">
      <div>
        <span className="text-taupe-deep">title: </span>
        {props.spec.title ?? (
          <span className="text-taupe-deep italic">…</span>
        )}
      </div>
      {props.spec.summary && (
        <div className="text-taupe italic mt-0.5">{props.spec.summary}</div>
      )}
      {props.spec.files && props.spec.files.length > 0 && (
        <div className="mt-1">
          <span className="text-taupe-deep">files:</span>
          {props.spec.files.map((f, i) => (
            <div key={`${f}-${i}`} className="text-citron pl-4">
              · {f}
            </div>
          ))}
        </div>
      )}
      {props.streaming && (
        <span className="anim-blink text-citron">▌</span>
      )}
    </div>
  )
}

function PatchLine(props: {
  patch: { filename?: string; patch?: string }
  streaming?: boolean
}) {
  return (
    <div className="ml-5 mt-1">
      <div className="text-taupe">
        <span className="text-taupe-deep">file: </span>
        <span className="text-citron">{props.patch.filename ?? '…'}</span>
      </div>
      <div className="mt-1">
        <CodeBlock
          code={props.patch.patch ?? ''}
          lang="diff"
          streaming={props.streaming}
          maxHeight="16rem"
        />
      </div>
    </div>
  )
}

// ============================================================================
// Inline approval prompt
// ============================================================================

/**
 * Approval prompt.
 *
 * Accepts free-text input. Parsing rules:
 *   - `y` / `yes`             → approve
 *   - `n` / `no`              → deny (no feedback)
 *   - `n: <feedback>`         → deny with feedback (refines the spec)
 *   - `<anything else>`       → deny with that text as feedback
 *
 * Empty submits do nothing — the user must explicitly approve or deny.
 */
function ApprovalInline(props: {
  title: string
  description?: string
  onApprove: (feedback?: string) => void
  onDeny: (feedback?: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const parseAndDispatch = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    if (lower === 'y' || lower === 'yes') {
      props.onApprove()
      return
    }
    if (lower === 'n' || lower === 'no') {
      props.onDeny()
      return
    }
    // `n: <feedback>` shorthand.
    const denyPrefix = trimmed.match(/^n(?:o)?\s*[:,-]\s*(.+)$/i)
    if (denyPrefix) {
      props.onDeny(denyPrefix[1].trim())
      return
    }
    // Anything else = denial with the raw text as feedback. Lets the user
    // just type "use fastify instead" without the `n:` prefix.
    props.onDeny(trimmed)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    parseAndDispatch(value)
  }

  return (
    <div className="mt-3 anim-slip-in">
      <div className="text-citron">
        <span className="mr-2">[?]</span>
        {props.title}
      </div>
      {props.description && (
        <div className="ml-5 text-taupe italic">{props.description}</div>
      )}
      <div className="ml-5 text-taupe-deep text-[12px] mt-0.5">
        type <span className="text-moss">y</span> to approve,{' '}
        <span className="text-rust">n</span> to deny, or free text to deny with
        refinement notes.
      </div>
      <form onSubmit={onSubmit} className="flex items-start gap-2 mt-1">
        <span className="text-citron shrink-0">approve? ›</span>
        <label className="relative flex-1 min-w-0 cursor-text block">
          <div className="whitespace-pre-wrap break-words text-bone min-h-[1.7em]">
            {value}
            <span className="anim-blink text-citron select-none">▌</span>
          </div>
          {!value && (
            <span className="absolute left-0 top-0 text-taupe-deep pointer-events-none select-none whitespace-pre">
              y / n / refinement notes
            </span>
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-transparent"
            style={{ caretColor: 'transparent' }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Approve prompt"
          />
        </label>
        <button
          type="button"
          onClick={() => props.onApprove()}
          className="text-moss hover:underline shrink-0"
        >
          [y]es
        </button>
        <button
          type="button"
          onClick={() => parseAndDispatch(value || 'n')}
          className="text-rust hover:underline shrink-0"
        >
          [n]o
        </button>
      </form>
    </div>
  )
}

// ============================================================================
// Final summary (rendered after a run finishes)
// ============================================================================

function FinalSummary(props: { result: OrchState['result'] }) {
  if (!props.result) return null
  return (
    <div className="mt-3 border-l-2 border-moss pl-4">
      <div className="text-moss">✓ implementation finished</div>
      <div className="text-taupe italic mt-0.5">
        “{props.result.rationale}”
      </div>
      <div className="text-taupe-deep mt-1">
        {props.result.patches.length} patches —{' '}
        {props.result.patches.map((p) => p.filename).join(', ')}
      </div>
    </div>
  )
}

// ============================================================================
// Prompt line (user input)
// ============================================================================

const PromptLine = forwardRefPromptLine()

function forwardRefPromptLine() {
  // Use a small helper so we can keep `forwardRef` import-free elsewhere in
  // this file and still expose an imperative focus handle.
  return function PromptLine(props: {
    ref: React.RefObject<HTMLTextAreaElement | null>
    value: string
    onValueChange: (v: string) => void
    onSubmit: () => void
    onStop?: (() => void) | undefined
    disabled: boolean
    refining: boolean
    onResetCarryover?: (() => void) | undefined
  }) {
    return (
      <div className="mt-4">
        {props.refining && (
          <div className="flex items-center gap-2 text-taupe-deep mb-1">
            <span className="text-moss">✓ session carries previous spec</span>
            <span>·</span>
            <span>
              your next message refines it (type{' '}
              <span className="text-citron">:reset</span> to start fresh
              {props.onResetCarryover && (
                <>
                  {' '}
                  or{' '}
                  <button
                    type="button"
                    onClick={props.onResetCarryover}
                    className="text-citron hover:underline"
                  >
                    [clear]
                  </button>
                </>
              )}
              )
            </span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="text-citron shrink-0 select-none">
            {props.refining ? '~/feature-orchestrator (refining) $' : PROMPT}
          </span>
          <InlineTerminalInput
            inputRef={props.ref}
            value={props.value}
            onValueChange={props.onValueChange}
            onSubmit={props.onSubmit}
            disabled={props.disabled}
            placeholder={
              props.disabled
                ? 'agent is working…'
                : props.refining
                  ? 'refinement notes…'
                  : 'feature request…'
            }
          />
          {props.onStop && (
            <button
              type="button"
              onClick={props.onStop}
              className="text-rust hover:underline shrink-0 ml-2"
            >
              [ctrl-c stop]
            </button>
          )}
        </div>
      </div>
    )
  }
}

/**
 * Single-line "terminal" input: renders the value in flow as plain text with a
 * blinking caret directly after it, while an absolutely-positioned transparent
 * textarea captures keystrokes. The native caret is hidden — the visible
 * ▌ block is the cursor.
 *
 * Wraps on overflow (the textarea grows vertically); the caret is always
 * positioned at the end of the value, not at the actual selection. Good
 * enough for a terminal-style prompt where typing always appends.
 */
function InlineTerminalInput(props: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onValueChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  placeholder: string
}) {
  const showPlaceholder = !props.value && !props.disabled
  return (
    <label className="relative flex-1 min-w-0 cursor-text block">
      {/* In-flow mirror that drives the wrapper's size; the visible caret
          sits right after it. `whitespace-pre-wrap` preserves spaces and
          allows the line to wrap on long input. */}
      <div className="whitespace-pre-wrap break-words text-bone min-h-[1.7em]">
        {props.value || (showPlaceholder ? '' : '')}
        {!props.disabled && (
          <span className="anim-blink text-citron select-none">▌</span>
        )}
      </div>
      {/* Placeholder overlay, only visible when empty. */}
      {showPlaceholder && (
        <span className="absolute left-0 top-0 text-taupe-deep pointer-events-none select-none whitespace-pre">
          {props.placeholder}
        </span>
      )}
      {/* The actual editable surface. Stacked on top of the mirror, native
          caret hidden, text fully transparent. Tab/click focus lands here. */}
      <textarea
        ref={props.inputRef}
        value={props.value}
        onChange={(e) => props.onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            props.onSubmit()
          }
        }}
        disabled={props.disabled}
        rows={1}
        className="absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none text-transparent disabled:opacity-50"
        style={{ caretColor: 'transparent' }}
        autoComplete="off"
        spellCheck={false}
        aria-label="Terminal input"
      />
    </label>
  )
}

// ============================================================================
// Type guards for typed step results
// ============================================================================

function isSpecOutput(
  v: Record<string, unknown>,
): v is { spec: { title: string; summary: string; files: Array<string> } } {
  return 'spec' in v && typeof v.spec === 'object' && v.spec !== null
}

function isPatchOutput(
  v: Record<string, unknown>,
): v is { filename: string; patch: string } {
  return typeof v.filename === 'string' && typeof v.patch === 'string'
}

function isPlannerOutput(
  v: Record<string, unknown>,
): v is { files: Array<string>; rationale: string } {
  return Array.isArray(v.files) && typeof v.rationale === 'string'
}

function isTriageOutput(
  v: Record<string, unknown>,
): v is { next: string; reason: string } {
  return typeof v.next === 'string' && typeof v.reason === 'string'
}

function isReviewOutput(
  v: Record<string, unknown>,
): v is { verdict: 'accept' | 'refine' | 'reject'; notes: string } {
  return typeof v.verdict === 'string' && typeof v.notes === 'string'
}

function isApprovalOutput(
  v: Record<string, unknown>,
): v is { approved: boolean; feedback?: string } {
  return typeof v.approved === 'boolean'
}

function stringifyResult(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
