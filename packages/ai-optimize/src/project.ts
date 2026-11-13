import { JSON_DIVISOR, TEXT_DIVISOR, estimateChars } from './estimate'
import { makeRef } from './stash'
import type { ContentPart } from '@tanstack/ai'
import type {
  OptimizationEvent,
  ResolvedArgsPolicy,
  ResolvedFieldProjection,
  ResolvedResultPolicy,
} from './types'
import type { ProjectionOrigin, Stash } from './stash'

/** State of a tool result in `ModelMessage` form — `'error'` maps to a tool
 *  message that carries an `error`; everything else is a success. */
export type ToolResultState = 'complete' | 'error' | 'streaming'

const TRUNCATED_PREFIX = '[Truncated for context:'
const DROPPED_PREFIX = '[Dropped for context:'

// Idempotence (cache honesty): a value already carrying a projection marker is
// returned unchanged, so projecting a projected message set is a no-op.
function alreadyProjected(s: string): boolean {
  return s.startsWith(TRUNCATED_PREFIX) || s.startsWith(DROPPED_PREFIX)
}

/**
 * Truncate one value per a resolved projection. Returns the replacement string
 * plus an event, or `null` for a no-op (below threshold, not smaller, already
 * projected). On a retrievable projection the ORIGINAL value — not its
 * serialization — is stashed under the deterministic ref.
 *
 * Non-string values are projected against their `JSON.stringify` form and the
 * leaf is replaced with the resulting preview *string*; the type change is
 * acceptable in the projection only.
 */
export function truncateValue(input: {
  raw: unknown
  projection: ResolvedFieldProjection
  fieldPath: string
  origin: ProjectionOrigin
  toolName: string
  toolCallId: string
  stash: Stash
}): { value: string; event: OptimizationEvent } | null {
  const { raw, projection, fieldPath, origin, toolName, toolCallId, stash } =
    input
  const isText = typeof raw === 'string'
  const s = isText ? (raw as string) : safeStringify(raw)
  if (alreadyProjected(s)) return null

  const origTokens = estimateChars(s.length, isText)
  if (origTokens <= projection.aboveTokens) return null

  const ref = makeRef(toolCallId, fieldPath, origin)
  const stashed = projection.retrievable
  if (stashed) stash.set(ref, { toolName, toolCallId, fieldPath, value: raw })

  const fail = () => {
    if (stashed) stash.delete(ref)
    return null
  }

  if (projection.truncate === 'drop_with_ref') {
    const value = stashed
      ? `${DROPPED_PREFIX} ${fieldPath}, ~${origTokens} tokens. Full content: retrieve_context(ref="${ref}")]`
      : `${DROPPED_PREFIX} ${fieldPath}, ~${origTokens} tokens.]`
    // If the projected form would be >= the original, keep the original.
    if (value.length >= s.length) return fail()
    return {
      value,
      event: event(
        toolName,
        toolCallId,
        fieldPath,
        origin,
        'drop_with_ref',
        origTokens,
        0,
        stashed ? ref : undefined,
      ),
    }
  }

  // Budget in chars, using the same divisor estimateChars used for origTokens,
  // so maxTokens means the same thing for text and for serialized JSON.
  const budget = projection.maxTokens * (isText ? TEXT_DIVISOR : JSON_DIVISOR)
  let head = ''
  let tail = ''
  if (projection.truncate === 'head') {
    head = s.slice(0, budget)
  } else if (projection.truncate === 'tail') {
    tail = s.slice(s.length - budget)
  } else {
    // head_tail: 60% head / 40% tail of the maxTokens budget.
    head = s.slice(0, Math.floor(budget * 0.6))
    tail = s.slice(s.length - Math.floor(budget * 0.4))
  }

  const keptChars = head.length + tail.length
  const elided = s.length - keptChars
  if (elided <= 0) return fail()

  const keptTokens = estimateChars(keptChars, isText)
  const base = `${TRUNCATED_PREFIX} ${fieldPath}, ~${origTokens} tokens, kept ~${keptTokens}.`
  const header = stashed
    ? `${base} Full content: retrieve_context(ref="${ref}")]`
    : `${base}]`
  const elideLine = `[... ${elided} chars elided ...]`
  const segments = [header]
  if (head) segments.push(head)
  segments.push(elideLine)
  if (tail) segments.push(tail)
  const value = segments.join('\n\n')

  // Projection-not-smaller no-op (no marker, no event).
  if (value.length >= s.length) return fail()

  return {
    value,
    event: event(
      toolName,
      toolCallId,
      fieldPath,
      origin,
      projection.truncate,
      origTokens,
      keptTokens,
      stashed ? ref : undefined,
    ),
  }
}

function event(
  toolName: string,
  toolCallId: string,
  fieldPath: string,
  origin: ProjectionOrigin,
  strategy: ResolvedFieldProjection['truncate'],
  originalTokens: number,
  keptTokens: number,
  ref: string | undefined,
): OptimizationEvent {
  return {
    type: 'projected',
    toolName,
    toolCallId,
    fieldPath,
    origin,
    strategy,
    originalTokens,
    keptTokens,
    ref,
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Navigate dot-separated object keys. Stops at non-objects; arrays are opaque
 *  (elements are not individually addressable in v1). */
function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const key of path.split('.')) {
    if (!isPlainObject(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

function setPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.')
  const last = keys.pop()
  if (last === undefined) return
  let cur: Record<string, unknown> = root
  for (const key of keys) {
    const next = cur[key]
    if (!isPlainObject(next)) return
    cur = next
  }
  cur[last] = value
}

/** Visit every string leaf reachable through plain-object keys. Does NOT
 *  descend into arrays — array elements are not individually addressable. */
function walkStringLeaves(
  node: Record<string, unknown>,
  prefix: string,
  visit: (path: string, value: string) => string | undefined,
): void {
  for (const key of Object.keys(node)) {
    const value = node[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      const replacement = visit(path, value)
      if (replacement !== undefined) node[key] = replacement
    } else if (isPlainObject(value)) {
      walkStringLeaves(value, path, visit)
    }
  }
}

function structuredField(
  output: Record<string, unknown>,
  policy: ResolvedResultPolicy,
  toolName: string,
  toolCallId: string,
  stash: Stash,
): { content: string; events: Array<OptimizationEvent> } {
  const clone = structuredClone(output) as Record<string, unknown>
  const events: Array<OptimizationEvent> = []
  const origin: ProjectionOrigin = 'result'

  // Explicit field rules first (author policy + optimize overrides). These
  // always take effect, even when the default is flatten — an author that drops
  // `body` is never overridden (and re-stashed) by a consumer's flatten default.
  for (const [path, projection] of Object.entries(policy.fields)) {
    if (path === '$') continue
    const leaf = getPath(clone, path)
    if (leaf === undefined) continue
    const res = truncateValue({
      raw: leaf,
      projection,
      fieldPath: path,
      origin,
      toolName,
      toolCallId,
      stash,
    })
    if (res) {
      setPath(clone, path, res.value)
      events.push(res.event)
    }
  }

  const dflt = policy.default
  if (dflt?.mode === 'leaves') {
    // Every un-ruled oversized string leaf, truncated on its own.
    walkStringLeaves(clone, '', (path, value) => {
      if (policy.fields[path]) return undefined // explicit rule already handled it
      const res = truncateValue({
        raw: value,
        projection: dflt.projection,
        fieldPath: path,
        origin,
        toolName,
        toolCallId,
        stash,
      })
      if (!res) return undefined
      events.push(res.event)
      return res.value
    })
  } else if (dflt?.mode === 'flatten') {
    // Serialize the (already field-surgered) result and truncate it as one
    // string, so explicitly-ruled fields keep their projection.
    const res = truncateValue({
      raw: clone,
      projection: dflt.projection,
      fieldPath: '$',
      origin,
      toolName,
      toolCallId,
      stash,
    })
    if (res) {
      events.push(res.event)
      return { content: res.value, events }
    }
  }

  return { content: JSON.stringify(clone), events }
}

/**
 * Pure projection of one tool result. `output` is the tool's raw output value
 * (pre-serialization) used for structured field surgery; `content` is its
 * `ModelMessage` form. Keys, IDs, and unoptimized fields survive whole.
 */
export function projectToolResult(input: {
  toolName: string
  toolCallId: string
  state: ToolResultState
  content: string | Array<ContentPart>
  output: unknown
  policy: ResolvedResultPolicy | undefined
  stash: Stash
}): { content: string | Array<ContentPart>; events: Array<OptimizationEvent> } {
  const { toolName, toolCallId, state, content, output, policy, stash } = input
  if (!policy) return { content, events: [] }
  // Errors are sacred: exempt unless explicitly opted in.
  if (state === 'error' && !policy.includeErrors) return { content, events: [] }

  // ContentPart arrays: text parts projected as one string; non-text parts
  // (images, files) pass through untouched, after the preview.
  if (Array.isArray(content)) {
    const rule = policy.fields['$'] ?? policy.default?.projection
    if (!rule) return { content, events: [] }
    const textParts = content.filter(
      (p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text',
    )
    const nonText = content.filter((p) => p.type !== 'text')
    const joined = textParts.map((p) => p.content).join('\n\n')
    if (!joined) return { content, events: [] }
    const res = truncateValue({
      raw: joined,
      projection: rule,
      fieldPath: '$',
      origin: 'result',
      toolName,
      toolCallId,
      stash,
    })
    if (!res) return { content, events: [] }
    return {
      content: [{ type: 'text', content: res.value }, ...nonText],
      events: [res.event],
    }
  }

  // A `$` rule addresses the whole result and wins over the default; a
  // non-object result has no fields to surger, so it also goes whole-value.
  const wholeRule = policy.fields['$']
  if (wholeRule || !isPlainObject(output)) {
    const rule = wholeRule ?? policy.default?.projection
    if (!rule) return { content, events: [] }
    const res = truncateValue({
      raw: output,
      projection: rule,
      fieldPath: '$',
      origin: 'result',
      toolName,
      toolCallId,
      stash,
    })
    if (!res) return { content, events: [] }
    return { content: res.value, events: [res.event] }
  }

  // Plain object with explicit field rules and/or a default (leaves | flatten).
  const explicitPaths = Object.keys(policy.fields).filter((p) => p !== '$')
  if (explicitPaths.length > 0 || policy.default?.mode) {
    return structuredField(output, policy, toolName, toolCallId, stash)
  }

  return { content, events: [] }
}

/**
 * Pure projection of a completed tool call's arguments (D3). Args stay an
 * object — only optimized leaves become preview strings. Approval prompts and the
 * live stream always show full arguments; this applies only to the *history
 * form of completed calls*.
 */
export function projectToolCallArgs(input: {
  toolName: string
  toolCallId: string
  args: unknown
  policy: ResolvedArgsPolicy | undefined
  stash: Stash
}): { args: unknown; events: Array<OptimizationEvent> } {
  const { toolName, toolCallId, args, policy, stash } = input
  if (!policy) return { args, events: [] }

  if (!isPlainObject(args)) {
    const rule = policy.fields['$']
    if (!rule) return { args, events: [] }
    const res = truncateValue({
      raw: args,
      projection: rule,
      fieldPath: '$',
      origin: 'args',
      toolName,
      toolCallId,
      stash,
    })
    return res ? { args: res.value, events: [res.event] } : { args, events: [] }
  }

  const clone = structuredClone(args) as Record<string, unknown>
  const events: Array<OptimizationEvent> = []
  for (const [path, projection] of Object.entries(policy.fields)) {
    if (path === '$') continue
    const leaf = getPath(clone, path)
    if (leaf === undefined) continue
    const res = truncateValue({
      raw: leaf,
      projection,
      fieldPath: path,
      origin: 'args',
      toolName,
      toolCallId,
      stash,
    })
    if (res) {
      setPath(clone, path, res.value)
      events.push(res.event)
    }
  }
  return { args: clone, events }
}
