import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js'
import { Portal } from 'solid-js/web'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import { getHoverDataAttributes, isMessageHighlighted } from './preview-model'
import { getHookDisplayName } from './hook-dashboard-model'
import type { HookRecord } from '../../store/hook-registry'
import type { HoverTarget } from './preview-model'
import type { Component, JSX } from 'solid-js'

interface GenerationPanelProps {
  hook: HookRecord
  hoverTarget: HoverTarget | null
}

interface GenerationProgress {
  value: number
  message?: string
}

interface GenerationMediaItem {
  src: string
  sourceType?: string
  mimeType?: string
  format?: string
  duration?: number
}

interface GenerationVideoJob {
  jobId: string
  status?: string
  progress?: number
  error?: string
}

interface GenerationRunView {
  id: string
  input: unknown | null
  result: unknown | null
  preview: GenerationPreviewState
  status: string
  isLoading: boolean
  progress?: GenerationProgress
  startedAt?: number
  updatedAt?: number
  completedAt?: number
  error?: string
  jobId?: string
  videoStatus?: unknown
}

interface GenerationOutputView {
  id: string
  runId: string
  runLabel: string
  title: string
  kind: 'image' | 'audio' | 'video' | 'text' | 'structured'
  item?: GenerationMediaItem
  text?: string
  value?: unknown
  job?: GenerationVideoJob
  completedAt?: number
}

type GenerationPreviewState =
  | {
      kind: 'image'
      items: Array<GenerationMediaItem>
    }
  | {
      kind: 'audio'
      items: Array<GenerationMediaItem>
    }
  | {
      kind: 'video'
      items: Array<GenerationMediaItem>
      job?: GenerationVideoJob
    }
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'structured'
      value: unknown
    }
  | {
      kind: 'empty'
    }

export const GenerationPanel: Component<GenerationPanelProps> = (props) => {
  const styles = useStyles()
  let runsContainer: HTMLDivElement | undefined
  const generationRuns = createMemo(() =>
    sortGenerationRuns(
      generationRunsFromUnknown(props.hook.state.runs, props.hook.state),
    ),
  )

  createEffect(() => {
    generationRuns().length
    queueMicrotask(() => {
      if (runsContainer) {
        runsContainer.scrollTop = runsContainer.scrollHeight
      }
    })
  })

  return (
    <Show
      when={generationRuns().length > 0}
      fallback={
        <section class={styles().hookDetails.section}>
          <div class={styles().hookDetails.sectionTitle}>Runs</div>
          <div class={styles().hookDetails.emptySmall}>
            No generation runs yet.
          </div>
        </section>
      }
    >
      <div
        class={styles().hookDetails.generationRuns}
        ref={(element) => {
          runsContainer = element
        }}
      >
        <For each={generationRuns()}>
          {(run, index) => (
            <GenerationRunCard
              hook={props.hook}
              run={run}
              index={index() + 1}
              totalRuns={generationRuns().length}
              highlighted={isMessageHighlighted(run.id, props.hoverTarget)}
            />
          )}
        </For>
      </div>
    </Show>
  )
}

export const GenerationPreview: Component<{
  hook: HookRecord
  hoverTarget: HoverTarget | null
}> = (props) => {
  const styles = useStyles()
  const [expandedOutput, setExpandedOutput] =
    createSignal<GenerationOutputView | null>(null)
  const generationRuns = createMemo(() =>
    sortGenerationRuns(
      generationRunsFromUnknown(props.hook.state.runs, props.hook.state),
    ),
  )
  const outputs = createMemo(() =>
    generationRuns().flatMap((run, index) =>
      outputsFromRun(run, runLabel(index, generationRuns().length)),
    ),
  )

  createEffect(() => {
    if (!expandedOutput()) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedOutput(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    onCleanup(() => document.removeEventListener('keydown', handleKeyDown))
  })

  return (
    <>
      <Show
        when={outputs().length > 0}
        fallback={
          <div class={styles().hookDetails.emptySmall}>No output yet.</div>
        }
      >
        <div class={styles().hookDetails.generationOutputGrid}>
          <For each={outputs()}>
            {(output) => (
              <GenerationOutputTile
                output={output}
                highlighted={isOutputHighlighted(output, props.hoverTarget)}
                onOpen={() => setExpandedOutput(output)}
              />
            )}
          </For>
        </div>
      </Show>

      <Portal>
        <Show when={expandedOutput()}>
          {(output) => (
            <GenerationOutputModal
              output={output()}
              onClose={() => setExpandedOutput(null)}
            />
          )}
        </Show>
      </Portal>
    </>
  )
}

const GenerationRunCard: Component<{
  hook: HookRecord
  run: GenerationRunView
  index: number
  totalRuns: number
  highlighted: boolean
}> = (props) => {
  const styles = useStyles()
  const completedAt = createMemo(() => props.run.completedAt)
  const updatedAt = createMemo(() => props.run.updatedAt ?? props.run.startedAt)
  const progress = createMemo(() => props.run.progress)
  const outputCount = createMemo(() => outputsFromRun(props.run, '').length)

  return (
    <article
      {...getHoverDataAttributes({ messageIds: [props.run.id] })}
      data-testid="ai-devtools-generation-run"
      data-run-id={props.run.id}
      data-run-label={runLabel(props.index - 1, props.totalRuns)}
      class={`${styles().hookDetails.runCard} ${
        props.highlighted ? styles().hookDetails.runCardHighlighted : ''
      }`}
    >
      <header class={styles().hookDetails.runHeader}>
        <div class={styles().hookDetails.runHeading}>
          <div class={styles().hookDetails.runTitle}>
            {runLabel(props.index - 1, props.totalRuns)}
          </div>
          <div class={styles().hookDetails.runMeta}>{props.run.id}</div>
        </div>
        <div class={styles().hookDetails.runStatusGroup}>
          <span class={styles().hookDetails.runStatus}>
            {props.run.isLoading ? 'running' : props.run.status}
          </span>
          <span class={styles().hookDetails.runStatusMuted}>
            {props.hook.outputKind ?? 'generation'}
          </span>
        </div>
      </header>

      <div class={styles().hookDetails.runCardBody}>
        <div class={styles().hookDetails.runSummaryGrid}>
          <GenerationMeta label="hook" value={getHookDisplayName(props.hook)} />
          <GenerationMeta
            label="updated"
            value={
              completedAt()
                ? `completed ${formatTime(completedAt())}`
                : `updated ${formatTime(updatedAt())}`
            }
          />
          <GenerationMeta label="outputs" value={outputCount().toString()} />
          <GenerationMeta
            label="loading"
            value={props.run.isLoading ? 'yes' : 'no'}
          />
          <Show when={props.run.jobId}>
            {(jobId) => <GenerationMeta label="job" value={jobId()} />}
          </Show>
          <Show when={videoStatusLabel(props.run.videoStatus)}>
            {(status) => <GenerationMeta label="video" value={status()} />}
          </Show>
        </div>

        <Show when={progress()}>
          {(currentProgress) => <ProgressMeter progress={currentProgress()} />}
        </Show>

        <Show when={props.run.error}>
          {(message) => (
            <div class={styles().hookDetails.errorText}>{message()}</div>
          )}
        </Show>

        <div class={styles().hookDetails.runDetailsGrid}>
          <RunField label="Input">
            <JsonBlock value={props.run.input ?? null} compact />
          </RunField>
          <Show
            when={props.run.result !== null && props.run.result !== undefined}
          >
            <RunField label="Result Data">
              <JsonBlock value={props.run.result} compact />
            </RunField>
          </Show>
        </div>
      </div>
    </article>
  )
}

const GenerationOutputTile: Component<{
  output: GenerationOutputView
  highlighted: boolean
  onOpen: () => void
}> = (props) => {
  const styles = useStyles()
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="ai-devtools-generation-output"
      data-output-id={props.output.id}
      data-run-id={props.output.runId}
      data-output-kind={props.output.kind}
      {...getHoverDataAttributes({
        messageIds: [props.output.runId],
        partIds: [props.output.id],
      })}
      class={`${styles().hookDetails.outputTile} ${
        props.highlighted ? styles().hookDetails.outputTileHighlighted : ''
      }`}
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onOpen()
        }
      }}
    >
      <div class={styles().hookDetails.outputTileBody}>
        <OutputContent output={props.output} compact />
      </div>
      <div class={styles().hookDetails.outputTileFooter}>
        <span>{props.output.runLabel}</span>
        <span>{props.output.title}</span>
      </div>
    </div>
  )
}

const GenerationOutputModal: Component<{
  output: GenerationOutputView
  onClose: () => void
}> = (props) => {
  const styles = useStyles()
  return (
    <div
      class={styles().hookDetails.outputModalBackdrop}
      data-testid="ai-devtools-output-modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          props.onClose()
        }
      }}
    >
      <section
        class={styles().hookDetails.outputModalDialog}
        data-testid="ai-devtools-output-modal"
        data-output-id={props.output.id}
        data-output-kind={props.output.kind}
        role="dialog"
        aria-modal="true"
        aria-label={`${props.output.runLabel} ${props.output.title}`}
      >
        <header class={styles().hookDetails.outputModalHeader}>
          <div>
            <div class={styles().hookDetails.outputModalTitle}>
              {props.output.title}
            </div>
            <div class={styles().hookDetails.runMeta}>
              {props.output.runLabel}
              {props.output.completedAt
                ? ` - ${formatTime(props.output.completedAt)}`
                : ''}
            </div>
          </div>
          <button
            type="button"
            class={styles().hookDetails.outputModalClose}
            data-testid="ai-devtools-output-modal-close"
            aria-label="Close output preview"
            onClick={props.onClose}
          >
            x
          </button>
        </header>
        <div class={styles().hookDetails.outputModalBody}>
          <OutputContent output={props.output} />
        </div>
      </section>
    </div>
  )
}

const OutputContent: Component<{
  output: GenerationOutputView
  compact?: boolean
}> = (props) => {
  const styles = useStyles()
  const item = createMemo(() => props.output.item)
  return (
    <Show
      when={item()}
      fallback={
        <Show
          when={props.output.kind === 'text'}
          fallback={
            <div
              class={
                props.compact
                  ? styles().hookDetails.outputTileText
                  : styles().hookDetails.outputModalText
              }
            >
              <JsonTree
                value={props.output.value}
                defaultExpansionDepth={props.compact ? 1 : 2}
                copyable={!props.compact}
              />
            </div>
          }
        >
          <div
            class={
              props.compact
                ? styles().hookDetails.outputTileText
                : styles().hookDetails.outputModalText
            }
          >
            {props.output.text}
          </div>
        </Show>
      }
    >
      {(media) => (
        <Show
          when={props.output.kind === 'image'}
          fallback={
            <Show
              when={props.output.kind === 'video'}
              fallback={
                <audio
                  data-testid="ai-devtools-audio-output"
                  src={media().src}
                  controls
                  preload="metadata"
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <video
                data-testid="ai-devtools-video-output"
                src={media().src}
                controls={!props.compact}
                muted={props.compact}
                preload="metadata"
              />
            </Show>
          }
        >
          <img
            data-testid="ai-devtools-image-output"
            src={media().src}
            alt={props.output.title}
            loading="lazy"
            class={
              props.compact
                ? styles().hookDetails.outputTileImage
                : styles().hookDetails.outputModalMedia
            }
          />
        </Show>
      )}
    </Show>
  )
}

const GenerationMeta: Component<{ label: string; value: string }> = (props) => {
  const styles = useStyles()
  return (
    <div class={styles().hookDetails.generationMetaItem}>
      <span class={styles().hookDetails.generationMetaLabel}>
        {props.label}
      </span>{' '}
      <span class={styles().hookDetails.generationMetaValue}>
        {props.value}
      </span>
    </div>
  )
}

const RunField: Component<{ label: string; children: JSX.Element }> = (
  props,
) => {
  const styles = useStyles()
  return (
    <div class={styles().hookDetails.runField}>
      <div class={styles().hookDetails.generationMetaLabel}>{props.label}</div>
      {props.children}
    </div>
  )
}

const ProgressMeter: Component<{ progress: GenerationProgress }> = (props) => {
  const styles = useStyles()
  const value = createMemo(() => clampProgress(props.progress.value))
  return (
    <div class={styles().hookDetails.progressBlock}>
      <div class={styles().hookDetails.progressText}>
        <span>{value()}%</span>
        <Show when={props.progress.message}>
          {(message) => <span>{message()}</span>}
        </Show>
      </div>
      <div
        class={styles().hookDetails.progressTrack}
        data-testid="ai-devtools-generation-progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={value()}
      >
        <div
          class={styles().hookDetails.progressFill}
          style={{ width: `${value()}%` }}
        />
      </div>
    </div>
  )
}

const JsonBlock: Component<{ value: unknown; compact?: boolean }> = (props) => {
  const styles = useStyles()
  return (
    <div
      class={`${styles().hookDetails.jsonPanel} ${
        props.compact ? styles().hookDetails.jsonPanelCompact : ''
      }`}
    >
      <JsonTree
        value={props.value}
        defaultExpansionDepth={props.compact ? 1 : 2}
        copyable
      />
    </div>
  )
}

function generationRunsFromUnknown(
  value: unknown,
  currentState: Record<string, unknown>,
): Array<GenerationRunView> {
  if (Array.isArray(value)) {
    const runs = value.map(runFromUnknown).filter(isGenerationRunView)
    if (runs.length > 0) {
      return runs
    }
  }

  const currentRun = runFromCurrentSnapshot(currentState)
  return currentRun ? [currentRun] : []
}

function sortGenerationRuns(
  runs: Array<GenerationRunView>,
): Array<GenerationRunView> {
  return [...runs].sort((a, b) => runSortTime(a) - runSortTime(b))
}

function runSortTime(run: GenerationRunView): number {
  return run.startedAt ?? run.updatedAt ?? run.completedAt ?? 0
}

function runFromUnknown(value: unknown): GenerationRunView | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return undefined
  }

  const progress = progressFromUnknown(value.progress)
  const error = errorTextFromUnknown(value.error)
  const startedAt = numberFromUnknown(value.startedAt)
  const updatedAt = numberFromUnknown(value.updatedAt)
  const completedAt = numberFromUnknown(value.completedAt)
  const jobId = stringFromUnknown(value.jobId)
  return {
    id: value.id,
    input: 'input' in value ? value.input : null,
    result: 'result' in value ? value.result : null,
    preview: previewFromUnknown(value.preview, value.result),
    status: stringFromUnknown(value.status) ?? 'unknown',
    isLoading: value.isLoading === true,
    ...(progress ? { progress } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(error ? { error } : {}),
    ...(jobId ? { jobId } : {}),
    ...('videoStatus' in value ? { videoStatus: value.videoStatus } : {}),
  }
}

function runFromCurrentSnapshot(
  state: Record<string, unknown>,
): GenerationRunView | undefined {
  const progress = progressFromUnknown(state.progress)
  const error = errorTextFromUnknown(state.error)
  const jobId = stringFromUnknown(state.jobId)
  const hasCurrentRun =
    state.isLoading === true ||
    (state.input !== null && state.input !== undefined) ||
    (state.result !== null && state.result !== undefined) ||
    progress !== undefined ||
    error !== undefined

  if (!hasCurrentRun) return undefined

  return {
    id: stringFromUnknown(state.activeRunId) ?? 'current',
    input: state.input ?? null,
    result: state.result ?? null,
    preview: previewFromUnknown(state.preview, state.result),
    status: stringFromUnknown(state.status) ?? 'unknown',
    isLoading: state.isLoading === true,
    ...(progress ? { progress } : {}),
    ...(error ? { error } : {}),
    ...(jobId ? { jobId } : {}),
    ...('videoStatus' in state ? { videoStatus: state.videoStatus } : {}),
  }
}

function outputsFromRun(
  run: GenerationRunView,
  runLabelValue: string,
): Array<GenerationOutputView> {
  if (run.preview.kind === 'image' || run.preview.kind === 'audio') {
    const kind = run.preview.kind
    const items = run.preview.items

    return items.map((item, index) => ({
      id: `${run.id}:${kind}:${index}`,
      runId: run.id,
      runLabel: runLabelValue,
      title: `${titleCase(kind)} ${index + 1}`,
      kind,
      item,
      ...completedAtPatch(run),
    }))
  }

  if (run.preview.kind === 'video') {
    const preview = run.preview
    const items = preview.items
    const job = preview.job

    return items.map((item, index) => ({
      id: `${run.id}:video:${index}`,
      runId: run.id,
      runLabel: runLabelValue,
      title: `Video ${index + 1}`,
      kind: 'video',
      item,
      ...(job ? { job } : {}),
      ...completedAtPatch(run),
    }))
  }

  if (run.preview.kind === 'text' && run.preview.text.trim().length > 0) {
    return [
      {
        id: `${run.id}:text`,
        runId: run.id,
        runLabel: runLabelValue,
        title: 'Text',
        kind: 'text',
        text: run.preview.text,
        ...completedAtPatch(run),
      },
    ]
  }

  if (run.preview.kind === 'structured') {
    return [
      {
        id: `${run.id}:structured`,
        runId: run.id,
        runLabel: runLabelValue,
        title: 'Structured',
        kind: 'structured',
        value: run.preview.value,
        ...completedAtPatch(run),
      },
    ]
  }

  return []
}

function completedAtPatch(
  run: GenerationRunView,
): Pick<GenerationOutputView, 'completedAt'> | Record<string, never> {
  return run.completedAt !== undefined ? { completedAt: run.completedAt } : {}
}

function isOutputHighlighted(
  output: GenerationOutputView,
  hoverTarget: HoverTarget | null,
): boolean {
  return (
    isMessageHighlighted(output.runId, hoverTarget) ||
    (hoverTarget?.partIds.includes(output.id) ?? false)
  )
}

function isGenerationRunView(
  value: GenerationRunView | undefined,
): value is GenerationRunView {
  return value !== undefined
}

function previewFromUnknown(
  value: unknown,
  fallbackResult: unknown,
): GenerationPreviewState {
  if (isRecord(value) && typeof value.kind === 'string') {
    if (value.kind === 'image') {
      return { kind: 'image', items: mediaItemsFromUnknown(value.items) }
    }
    if (value.kind === 'audio') {
      return { kind: 'audio', items: mediaItemsFromUnknown(value.items) }
    }
    if (value.kind === 'video') {
      return {
        kind: 'video',
        items: mediaItemsFromUnknown(value.items),
        ...(isVideoJob(value.job) ? { job: value.job } : {}),
      }
    }
    if (value.kind === 'text') {
      return {
        kind: 'text',
        text: typeof value.text === 'string' ? value.text : '',
      }
    }
    if (value.kind === 'structured') {
      return { kind: 'structured', value: value.value }
    }
    if (value.kind === 'empty') {
      return { kind: 'empty' }
    }
  }

  if (fallbackResult === null || fallbackResult === undefined) {
    return { kind: 'empty' }
  }

  return {
    kind: 'structured',
    value: fallbackResult,
  }
}

function progressFromUnknown(value: unknown): GenerationProgress | undefined {
  if (!isRecord(value) || typeof value.value !== 'number') {
    return undefined
  }

  return {
    value: value.value,
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
  }
}

function mediaItemsFromUnknown(value: unknown): Array<GenerationMediaItem> {
  if (!Array.isArray(value)) return []
  return value.filter(isMediaItem)
}

function isMediaItem(value: unknown): value is GenerationMediaItem {
  if (!isRecord(value) || typeof value.src !== 'string') {
    return false
  }
  return true
}

function isVideoJob(value: unknown): value is GenerationVideoJob {
  return isRecord(value) && typeof value.jobId === 'string'
}

function errorTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.message === 'string') {
    return value.message
  }
  return undefined
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function videoStatusLabel(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined

  const status = stringFromUnknown(value.status)
  const progress = numberFromUnknown(value.progress)
  if (!status && progress === undefined) return undefined

  return [status, progress !== undefined ? formatProgress(progress) : undefined]
    .filter((part): part is string => Boolean(part))
    .join(' ')
}

function runLabel(index: number, totalRuns: number): string {
  return `Run ${index + 1} of ${totalRuns}`
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function formatProgress(value: number | undefined): string {
  return typeof value === 'number' ? `${clampProgress(value)}%` : 'unknown'
}

function formatTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'unknown'
  return new Date(timestamp).toLocaleTimeString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
