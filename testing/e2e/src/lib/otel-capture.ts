import type {
  AttributeValue,
  Attributes,
  SpanStatusCode,
} from '@opentelemetry/api'

export interface CapturedEvent {
  name: string
  attributes?: Attributes
}

export interface CapturedException {
  exception: string
  attributes?: Attributes
}

export interface CapturedSpan {
  id: string
  name: string
  kind?: number
  attributes: Record<string, AttributeValue>
  status: SpanStatusCode
  statusMessage?: string
  events: Array<CapturedEvent>
  exceptions: Array<CapturedException>
  ended: boolean
}

export interface CapturedHistogram {
  name: string
  value: number
  attributes?: Attributes
  unit?: string
}

export interface OtelCapture {
  spans: Array<CapturedSpan>
  histograms: Array<CapturedHistogram>
}

// Keyed by testId. Lives as a module-global — Nitro's dev server keeps a
// single JS context per process, which is all these tests need.
const captures: Map<string, OtelCapture> = new Map()

function bucketFor(captureId: string): OtelCapture {
  let bucket = captures.get(captureId)
  if (!bucket) {
    bucket = { spans: [], histograms: [] }
    captures.set(captureId, bucket)
  }
  return bucket
}

export function resetOtelCapture(captureId: string): void {
  captures.set(captureId, { spans: [], histograms: [] })
}

export function getOtelCapture(captureId: string): OtelCapture {
  return bucketFor(captureId)
}

/**
 * Append a new span or patch an existing one.
 *
 * Patches are applied with a shallow `Object.assign`, so nested objects and
 * arrays (e.g. `attributes`, `events`, `exceptions`) are replaced, not merged.
 * Callers that want to extend those fields must pre-merge before passing the
 * patch (see how `api.middleware-test.ts` spreads `{ ...attrs }`). Prefer
 * `recordOtelEvent` / `recordOtelException` for those fields — they append
 * rather than replace.
 */
export function recordOtelSpan(
  captureId: string,
  entry:
    | CapturedSpan
    | { id: string; patch: Partial<Omit<CapturedSpan, 'id'>> },
): void {
  const bucket = bucketFor(captureId)
  if ('patch' in entry) {
    const existing = bucket.spans.find((s) => s.id === entry.id)
    if (!existing) return
    Object.assign(existing, entry.patch)
    return
  }
  bucket.spans.push(entry)
}

export function recordOtelEvent(
  captureId: string,
  spanId: string,
  event: CapturedEvent,
): void {
  const existing = bucketFor(captureId).spans.find((s) => s.id === spanId)
  if (!existing) return
  existing.events.push(event)
}

export function recordOtelException(
  captureId: string,
  spanId: string,
  exception: CapturedException,
): void {
  const existing = bucketFor(captureId).spans.find((s) => s.id === spanId)
  if (!existing) return
  existing.exceptions.push(exception)
}

export function recordOtelHistogram(
  captureId: string,
  entry: CapturedHistogram,
): void {
  bucketFor(captureId).histograms.push(entry)
}
