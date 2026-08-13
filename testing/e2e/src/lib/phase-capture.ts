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
}

export interface PhaseCapture {
  /**
   * Phases observed by `onChunk` across the entire run, in chunk-arrival
   * order. Duplicates are preserved so tests can spot transitions; specs
   * that only care about presence should use `.includes('structuredOutput')`.
   */
  phases: Array<string>
  /** Count of `onFinish` invocations — must be exactly 1 per `chat()` call. */
  onFinishCount: number
  /**
   * Chunks that were yielded out of `chat()` to the SSE consumer. Captured
   * by teeing the iterable in `api.middleware-test.ts` after the middleware
   * chain has applied its transformations.
   */
  yieldedChunks: Array<YieldedChunkSummary>
}

const captures: Map<string, PhaseCapture> = new Map()

function bucketFor(captureId: string): PhaseCapture {
  let bucket = captures.get(captureId)
  if (!bucket) {
    bucket = { phases: [], onFinishCount: 0, yieldedChunks: [] }
    captures.set(captureId, bucket)
  }
  return bucket
}

export function resetPhaseCapture(captureId: string): void {
  captures.set(captureId, {
    phases: [],
    onFinishCount: 0,
    yieldedChunks: [],
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

export function recordYieldedChunk(
  captureId: string,
  chunk: YieldedChunkSummary,
): void {
  bucketFor(captureId).yieldedChunks.push(chunk)
}
