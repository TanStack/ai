/**
 * Shared error-narrowing helper for activities that convert thrown values
 * into structured `RUN_ERROR` events.
 *
 * Accepts Error instances, objects with string-ish `message`/`code`, or bare
 * strings; always returns a shape safe to serialize. Never leaks the full
 * error object (which may carry request/response state from an SDK).
 *
 * Abort-shaped errors (DOM `AbortError`, OpenAI `APIUserAbortError`,
 * OpenRouter `RequestAbortedError`) are normalized to a stable
 * `{ message: 'Request aborted', code: 'aborted' }` shape so callers can
 * discriminate user-initiated cancellation from other failures without
 * matching on provider-specific message strings.
 */
const ABORT_ERROR_NAMES = new Set([
  'AbortError',
  'APIUserAbortError',
  'RequestAbortedError',
])

/**
 * True when a thrown value is an abort-shaped error (DOM `AbortError`, OpenAI
 * `APIUserAbortError`, OpenRouter `RequestAbortedError`) — i.e. user-initiated
 * cancellation rather than a genuine failure. Matches on the error `name` so
 * callers can discriminate aborts without depending on a signal's state or on
 * provider-specific message strings.
 */
export function isAbortShapedError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' && ABORT_ERROR_NAMES.has(name)
  }
  return false
}

/**
 * The `RUN_ERROR.code` a text adapter sets when the provider says the input
 * does not fit in the model's context window. Shorten the messages, then call
 * the model again. The provider's own text stays in `message`.
 */
export const CONTEXT_OVERFLOW_CODE = 'context_overflow'

// HTTP status codes carried as numbers (e.g. `error.status = 429`) are a
// common variant on SDK error classes; coerce so the resulting `code` field
// is stable as a string for downstream consumers.
function normalizeCode(codeField: unknown): string | undefined {
  if (typeof codeField === 'string') return codeField
  if (typeof codeField === 'number' && Number.isFinite(codeField)) {
    return String(codeField)
  }
  return undefined
}

// SDK error classes disagree on where they carry the HTTP status. Most expose a
// `code` (OpenAI/Anthropic error bodies), but some report it only as a numeric
// `status` — Google's `@google/genai` `ApiError` sets `status: number` and no
// `code` at all. Without this fallback such errors reach downstream consumers
// with `code: undefined`, so a 401/403/404/429 is indistinguishable from an
// unknown failure and cannot be classified.
//
// Only a *numeric* `status` is used: a string `status` is commonly an HTTP
// reason phrase ("Forbidden") or a symbolic status ("PERMISSION_DENIED"), not
// the numeric code consumers key on, so forwarding it would be misleading.
function extractCode(source: {
  code?: unknown
  status?: unknown
}): string | undefined {
  const fromCode = normalizeCode(source.code)
  if (fromCode !== undefined) return fromCode
  if (typeof source.status === 'number' && Number.isFinite(source.status)) {
    return String(source.status)
  }
  return undefined
}

export function toRunErrorPayload(
  error: unknown,
  fallbackMessage = 'Unknown error occurred',
): { message: string; code: string | undefined } {
  if (isAbortShapedError(error)) {
    return { message: 'Request aborted', code: 'aborted' }
  }
  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      code: extractCode(error as Error & { code?: unknown; status?: unknown }),
    }
  }
  if (typeof error === 'object' && error !== null) {
    const messageField = (error as { message?: unknown }).message
    return {
      message:
        typeof messageField === 'string' && messageField.length > 0
          ? messageField
          : fallbackMessage,
      code: extractCode(error as { code?: unknown; status?: unknown }),
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return { message: error, code: undefined }
  }
  return { message: fallbackMessage, code: undefined }
}

/**
 * Extract the provider's *structured error body* from a thrown value, to attach
 * as the AG-UI `rawEvent` on a RUN_ERROR event. This is the recoverable upstream
 * detail (provider name, the upstream model's error JSON, rate-limit/overload
 * codes, etc.) that `toRunErrorPayload`'s `{ message, code }` deliberately drops.
 *
 * Security boundary: only known provider-response-body fields are forwarded —
 * never the raw SDK exception object, which can carry request metadata such as
 * auth headers. (A request id is not a secret: `toRunErrorDetails` puts it on
 * the event as `requestId`.) The recognized sources, in priority order:
 *
 *  - `error.rawEvent` — a provider body an adapter attached explicitly (e.g. the
 *    OpenRouter mid-stream `chunk.error`).
 *  - `error.error` (object) — the parsed provider response body exposed by SDK
 *    `APIError` instances (OpenAI/Anthropic `{ type, message, code, param }`,
 *    OpenRouter typed errors whose `.error` carries `.metadata`). This is
 *    provider-shaped data, distinct from `.headers` / `.request_id`.
 *  - `error.metadata` — OpenRouter's `provider_name` + raw upstream body, when
 *    surfaced directly on the thrown error.
 *
 * Returns `undefined` when no structured provider body is present, so callers
 * omit the field entirely rather than setting it to `null`:
 *
 *   const rawEvent = toRunErrorRawEvent(error)
 *   yield { type: EventType.RUN_ERROR, ..., ...(rawEvent !== undefined && { rawEvent }) }
 */
export function toRunErrorRawEvent(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined
  const e = error as {
    rawEvent?: unknown
    error?: unknown
    metadata?: unknown
  }
  if (e.rawEvent !== undefined && e.rawEvent !== null) return e.rawEvent
  if (
    e.error !== undefined &&
    e.error !== null &&
    typeof e.error === 'object'
  ) {
    return e.error
  }
  if (e.metadata !== undefined && e.metadata !== null) return e.metadata
  return undefined
}

/** Read one response header from the `headers` that an SDK error carries. */
function responseHeader(error: object, name: string): string | undefined {
  const headers: unknown = Reflect.get(error, 'headers')
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  if (headers && typeof headers === 'object' && name in headers) {
    const value: unknown = Reflect.get(headers, name)
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

/** A non-empty string of at most 128 characters, else `undefined`. */
function shortString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' && value.length <= 128
    ? value
    : undefined
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? Reflect.get(value, key)
    : undefined
}

/**
 * Read the provider's error type and request id from a thrown value, to put
 * on a `RUN_ERROR` as `errorType` and `requestId`. Only keys that are present
 * are set, so you can spread the result into the event:
 *
 *   yield { type: EventType.RUN_ERROR, ..., ...toRunErrorDetails(error) }
 *
 * - `errorType` is the SDK error's `type` (OpenAI and Anthropic set it from
 *   the body), else the body's `error.type` (an Anthropic stream error event),
 *   else the body's `type`. For example `overloaded_error`.
 * - `requestId` is the SDK error's `requestID` or `request_id`, else the
 *   `request-id` or `x-request-id` response header.
 *
 * Each value must be a string of at most 128 characters.
 */
export function toRunErrorDetails(error: unknown): {
  errorType?: string
  requestId?: string
} {
  if (!error || typeof error !== 'object') return {}
  const body = field(error, 'error')
  const errorType =
    shortString(field(error, 'type')) ??
    shortString(field(field(body, 'error'), 'type')) ??
    shortString(field(body, 'type'))
  const requestId =
    shortString(field(error, 'requestID')) ??
    shortString(field(error, 'request_id')) ??
    shortString(responseHeader(error, 'request-id')) ??
    shortString(responseHeader(error, 'x-request-id'))
  return {
    ...(errorType !== undefined && { errorType }),
    ...(requestId !== undefined && { requestId }),
  }
}

/**
 * Read how long a provider asks you to wait before a retry, from the response
 * headers that an SDK error carries. It reads `retry-after-ms` first, then
 * `retry-after` in seconds or as an HTTP date. Gives `undefined` when no
 * usable header is present.
 *
 *   const retryAfterMs = toRetryAfterMs(error)
 *   yield { type: EventType.RUN_ERROR, ..., ...(retryAfterMs !== undefined && { retryAfterMs }) }
 */
export function toRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('headers' in error)) {
    return undefined
  }
  const get = (name: string) => responseHeader(error, name)
  const ms = Number(get('retry-after-ms') || NaN)
  if (Number.isFinite(ms) && ms >= 0) return ms
  const value = get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}
