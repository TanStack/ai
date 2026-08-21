/**
 * Per-testId capture of middleware phase observations + yielded chunks for the
 * `phase-recorder` mode of `/middleware-test`. Mirrors the pattern used by
 * `otel-capture.ts`: server-side middleware records into a module-global Map
 * keyed by `testId`; the test page fetches it via
 * `GET /api/middleware-test?testId=...&kind=phase` after the run finishes and
 * surfaces it in DOM elements that the Playwright spec reads.
 */

export interface YieldedChunkSummary {
  /** The chunk's discriminant (e.g. RUN_STARTED, TEXT_MESSAGE_CONTENT). */
  type: string
  /** The run ID emitted on this specific stream chunk, when the event has one. */
  runId?: string
  outcomeType?: string
  interruptCount?: number
}

export interface GenericBoundaryCapture {
  phase: string
  runId: string
}

export interface GenericResolutionCapture {
  definitionId: string
  status: 'resolved' | 'cancelled'
  response?: unknown
}

export interface GenericToolExecutionCapture {
  name: string
  side: 'server'
}

export interface PhaseCapture {
  /**
   * Phases observed by `onChunk` across the entire run, in chunk-arrival
   * order. Duplicates are preserved so tests can spot transitions; specs
   * that only care about presence should use `.includes('structuredOutput')`.
   */
  phases: Array<string>
  /** Count of `onFinish` invocations. */
  onFinishCount: number
  /** Count of `onError` invocations. */
  onErrorCount: number
  /**
   * Chunks that were yielded out of `chat()` to the SSE consumer. Captured
   * by teeing the iterable in `api.middleware-test.ts` after the middleware
   * chain has applied its transformations.
   */
  yieldedChunks: Array<YieldedChunkSummary>
  boundaries: Array<GenericBoundaryCapture>
  resolutions: Array<GenericResolutionCapture>
  policies: Array<'continue' | 'cancel' | 'stop'>
  toolExecutions: Array<GenericToolExecutionCapture>
}

const captures: Map<string, PhaseCapture> = new Map()

function bucketFor(captureId: string): PhaseCapture {
  let bucket = captures.get(captureId)
  if (!bucket) {
    bucket = {
      phases: [],
      onFinishCount: 0,
      onErrorCount: 0,
      yieldedChunks: [],
      boundaries: [],
      resolutions: [],
      policies: [],
      toolExecutions: [],
    }
    captures.set(captureId, bucket)
  }
  return bucket
}

export function resetPhaseCapture(captureId: string): void {
  captures.set(captureId, {
    phases: [],
    onFinishCount: 0,
    onErrorCount: 0,
    yieldedChunks: [],
    boundaries: [],
    resolutions: [],
    policies: [],
    toolExecutions: [],
  })
}

export function getPhaseCapture(captureId: string): PhaseCapture {
  return bucketFor(captureId)
}

export function recordPhase(captureId: string, phase: string): void {
  bucketFor(captureId).phases.push(phase)
}

export function recordOnFinish(captureId: string): void {
  bucketFor(captureId).onFinishCount += 1
}

export function recordOnError(captureId: string): void {
  bucketFor(captureId).onErrorCount += 1
}

export function recordYieldedChunk(
  captureId: string,
  chunk: YieldedChunkSummary,
): void {
  bucketFor(captureId).yieldedChunks.push(chunk)
}

export function recordGenericBoundary(
  captureId: string,
  boundary: GenericBoundaryCapture,
): void {
  bucketFor(captureId).boundaries.push(boundary)
}

export function recordGenericResolution(
  captureId: string,
  resolution: GenericResolutionCapture,
): void {
  bucketFor(captureId).resolutions.push(resolution)
}

export function recordGenericPolicy(
  captureId: string,
  policy: 'continue' | 'cancel' | 'stop',
): void {
  bucketFor(captureId).policies.push(policy)
}

export function recordGenericToolExecution(
  captureId: string,
  execution: GenericToolExecutionCapture,
): void {
  bucketFor(captureId).toolExecutions.push(execution)
}
