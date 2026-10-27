/**
 * A2UI v0.9 — operation types, container parsing, and JSON Pointer helpers.
 *
 * Open Generative UI Draft 0.1, addendum §A2. Implemented from the A2UI
 * specification (Apache 2.0), not from any CopilotKit source. CopilotKit's
 * docs were used only to identify the sharp edges worth testing against
 * (nested vs flat operation shape, bound-prop leakage, silent catalog
 * fallback) — see addendum §A2.2.
 */

/** A2UI component: flat entry in a surface's component list. */
export interface A2uiComponent {
  id: string
  /** A2UI catalog type name, e.g. "Card", "Column", "Text". */
  component: string
  /** Singular child reference (Card, Modal, ...). */
  child?: string
  /** Child references (Column, Row, List, ...). */
  children?: Array<string>
  /** Tabs: labelled panel references. */
  tabItems?: Array<{ title?: string; child: string }>
  /** A2UI action descriptor on interactive components. */
  action?: A2uiAction
  /** All remaining catalog props, literals or { path } bindings. */
  [prop: string]: unknown
}

export interface A2uiAction {
  event: {
    name: string
    context?: Record<string, unknown>
  }
}

/** A data-model binding: a JSON Pointer into the surface's data model. */
export interface A2uiBinding {
  path: string
}

export function isBinding(value: unknown): value is A2uiBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof (value as { path: unknown }).path === 'string' &&
    Object.keys(value as object).length === 1
  )
}

/** v0.9 operations are NESTED: dispatch is on the operation key. */
export type A2uiOperation =
  | {
      version: 'v0.9'
      createSurface: { surfaceId: string; catalogId: string; root?: string }
    }
  | {
      version: 'v0.9'
      updateComponents: { surfaceId: string; components: Array<A2uiComponent> }
    }
  | {
      version: 'v0.9'
      updateDataModel: { surfaceId: string; path: string; value: unknown }
    }
  | { version: 'v0.9'; deleteSurface: { surfaceId: string } }

export type A2uiOperationKind =
  | 'createSurface'
  | 'updateComponents'
  | 'updateDataModel'
  | 'deleteSurface'

const OP_KINDS: Array<A2uiOperationKind> = [
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
]

/** Flat legacy spellings that must NOT be silently dropped (addendum §A2.2). */
const FLAT_KINDS = new Set([
  'create_surface',
  'update_components',
  'update_data_model',
  'delete_surface',
])

export interface Diagnostic {
  code: string
  message: string
  surfaceId?: string
  componentId?: string
}

export interface ParseResult {
  operations: Array<A2uiOperation>
  diagnostics: Array<Diagnostic>
}

function parseOne(
  raw: unknown,
  diagnostics: Array<Diagnostic>,
): A2uiOperation | undefined {
  if (typeof raw !== 'object' || raw === null) {
    diagnostics.push({
      code: 'op-not-object',
      message: 'A2UI operation is not an object; ignored.',
    })
    return undefined
  }
  const obj = raw as Record<string, unknown>

  // Flat legacy shape: strictness of the spec, without its silence.
  if (typeof obj.type === 'string' && FLAT_KINDS.has(obj.type)) {
    diagnostics.push({
      code: 'flat-op-ignored',
      message:
        `Flat A2UI operation "${obj.type}" ignored: v0.9 operations are nested ` +
        `({ createSurface: {...} }), and consumers dispatch on the operation key.`,
    })
    return undefined
  }

  // Pin v0.9: a future version's operations diagnostic-and-drop here
  // rather than being best-effort parsed into a wrong surface.
  if (typeof obj.version === 'string' && obj.version !== 'v0.9') {
    diagnostics.push({
      code: 'version-unsupported',
      message: `A2UI version "${obj.version}" is not supported by this adapter (pinned to v0.9); operation ignored.`,
    })
    return undefined
  }

  for (const kind of OP_KINDS) {
    if (kind in obj) {
      // Version is carried by the container in some integrations; default it.
      return { version: 'v0.9', [kind]: obj[kind] } as A2uiOperation
    }
  }
  diagnostics.push({
    code: 'op-unknown',
    message: 'Unrecognised A2UI operation shape; ignored.',
  })
  return undefined
}

/**
 * Extract A2UI operations from whatever a driver/tool produced:
 * a bare array, a single operation, or CopilotKit's fixed-schema
 * tool-result container `{ "a2ui_operations": [...] }` (possibly as a
 * JSON string, which is how tool results often arrive).
 */
export function parseA2uiOperations(input: unknown): ParseResult {
  const diagnostics: Array<Diagnostic> = []
  let value: unknown = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {
        operations: [],
        diagnostics: [
          {
            code: 'container-not-json',
            message: 'A2UI container string is not valid JSON.',
          },
        ],
      }
    }
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'a2ui_operations' in value &&
    Array.isArray((value as { a2ui_operations: unknown }).a2ui_operations)
  ) {
    value = (value as { a2ui_operations: Array<unknown> }).a2ui_operations
  }
  const list = Array.isArray(value) ? value : [value]
  const operations: Array<A2uiOperation> = []
  for (const raw of list) {
    const op = parseOne(raw, diagnostics)
    if (op) operations.push(op)
  }
  return { operations, diagnostics }
}

/** JSON Pointer (RFC 6901) segment unescaping. */
function unescapeSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function getByPointer(model: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return model
  const segments = pointer.replace(/^\//, '').split('/').map(unescapeSegment)
  let current: unknown = model
  for (const seg of segments) {
    if (Array.isArray(current)) {
      current = current[Number(seg)]
    } else if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return current
}

/** Returns a new model with `value` set at `pointer` ("/" replaces the root). */
export function setByPointer(
  model: unknown,
  pointer: string,
  value: unknown,
): unknown {
  if (pointer === '' || pointer === '/') return value
  const segments = pointer.replace(/^\//, '').split('/').map(unescapeSegment)
  const set = (node: unknown, depth: number): unknown => {
    const seg = segments[depth]
    if (seg === undefined) return value
    const last = depth === segments.length - 1
    if (Array.isArray(node)) {
      const copy = [...node]
      copy[Number(seg)] = last ? value : set(copy[Number(seg)], depth + 1)
      return copy
    }
    if (typeof node === 'object' && node !== null) {
      const copy = { ...(node as Record<string, unknown>) }
      copy[seg] = last ? value : set(copy[seg], depth + 1)
      return copy
    }
    // No container here yet: create one shaped by this segment.
    if (/^\d+$/.test(seg)) {
      const arr: Array<unknown> = []
      arr[Number(seg)] = last ? value : set(undefined, depth + 1)
      return arr
    }
    return { [seg]: last ? value : set(undefined, depth + 1) }
  }
  return set(model, 0)
}

/** "/passenger/name" -> "passenger.name" (OGUI §5.3 state path form). */
export function pointerToStatePath(pointer: string): string {
  return pointer.replace(/^\//, '').split('/').map(unescapeSegment).join('.')
}
