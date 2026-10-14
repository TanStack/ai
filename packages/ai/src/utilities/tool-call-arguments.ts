import { tanstackMetadata } from './merge-metadata'
import type { ToolCallEndEvent } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'

type JsonNode = {
  start: number
  end: number
  value: unknown
  keyToken?: string
  properties?: Map<string, JsonNode>
  items?: Array<JsonNode>
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    )
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) ||
    Array.isArray(right)
  )
    return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameJsonValue(Reflect.get(left, key), Reflect.get(right, key)),
    )
  )
}

function scanJson(raw: string, parsed: unknown): JsonNode {
  let cursor = 0
  const whitespace = () => {
    while (
      raw[cursor] === ' ' ||
      raw[cursor] === '\t' ||
      raw[cursor] === '\r' ||
      raw[cursor] === '\n'
    )
      cursor++
  }
  const stringToken = () => {
    const start = cursor++
    while (cursor < raw.length) {
      if (raw[cursor] === '\\') cursor += 2
      else if (raw[cursor++] === '"') break
    }
    return raw.slice(start, cursor)
  }
  const value = (parsedValue: unknown): JsonNode => {
    whitespace()
    const start = cursor
    if (raw[cursor] === '{') {
      cursor++
      whitespace()
      const properties = new Map<string, JsonNode>()
      while (raw[cursor] !== '}') {
        const keyToken = stringToken()
        const key: unknown = JSON.parse(keyToken)
        whitespace()
        cursor++
        const child =
          parsedValue !== null &&
          typeof parsedValue === 'object' &&
          typeof key === 'string'
            ? Reflect.get(parsedValue, key)
            : undefined
        const childNode = value(child)
        if (typeof key === 'string')
          properties.set(key, { ...childNode, keyToken })
        whitespace()
        if (raw[cursor] !== ',') break
        cursor++
        whitespace()
      }
      cursor++
      return { start, end: cursor, value: parsedValue, properties }
    }
    if (raw[cursor] === '[') {
      cursor++
      whitespace()
      const items: Array<JsonNode> = []
      while (raw[cursor] !== ']') {
        items.push(
          value(
            Array.isArray(parsedValue) ? parsedValue[items.length] : undefined,
          ),
        )
        whitespace()
        if (raw[cursor] !== ',') break
        cursor++
      }
      cursor++
      return { start, end: cursor, value: parsedValue, items }
    }
    if (raw[cursor] === '"') stringToken()
    else
      while (cursor < raw.length && !/[\s,}\]]/.test(raw[cursor] ?? ''))
        cursor++
    return { start, end: cursor, value: parsedValue }
  }
  return value(parsed)
}

function serializeValue(
  value: unknown,
  raw: string,
  node: JsonNode | undefined,
  seen: Set<object>,
): string | undefined {
  if (node && sameJsonValue(node.value, value))
    return raw.slice(node.start, node.end)
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return '-0'
    if (value === Infinity) return '1e999'
    if (value === -Infinity) return '-1e999'
    return JSON.stringify(value)
  }
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (seen.has(value))
    throw new TypeError('Cannot serialize circular tool input')
  seen.add(value)
  try {
    if (Array.isArray(value))
      return (
        '[' +
        Array.from(
          value,
          (item, index) =>
            serializeValue(item, raw, node?.items?.[index], seen) ?? 'null',
        ).join(',') +
        ']'
      )
    const properties: Array<string> = []
    for (const key of Object.keys(value)) {
      const serialized = serializeValue(
        Reflect.get(value, key),
        raw,
        node?.properties?.get(key),
        seen,
      )
      if (serialized !== undefined)
        properties.push(
          (node?.properties?.get(key)?.keyToken ?? JSON.stringify(key)) +
            ':' +
            serialized,
        )
    }
    return '{' + properties.join(',') + '}'
  } finally {
    seen.delete(value)
  }
}

/**
 * Keep `raw` when it is the same JSON value as `input`. When they differ,
 * write `input` again and keep the raw tokens of the values that did not
 * change. Empty or missing raw arguments use the input.
 */
export function reconcileToolCallArguments(
  raw: string | undefined,
  input: unknown,
): string {
  if (input === undefined) return raw ?? ''
  if (raw === undefined)
    return serializeValue(input, '', undefined, new Set()) ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Empty raw arguments are no arguments: the input is the value to keep.
    if (raw.trim() === '')
      return serializeValue(input, '', undefined, new Set()) ?? raw
    return raw
  }
  if (sameJsonValue(parsed, input)) return raw
  return serializeValue(input, raw, scanJson(raw, parsed), new Set()) ?? raw
}

/**
 * The input of a tool call from its raw arguments: `{}` for an empty string,
 * `undefined` when the arguments are not complete JSON (for example cut off)
 * or are `null`.
 */
export function parseToolArguments(args: string): unknown {
  if (args.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(args)
    return parsed ?? undefined
  } catch {
    return undefined
  }
}

/**
 * The final arguments and input of a tool call at TOOL_CALL_END. `streamed`
 * is the text of its TOOL_CALL_ARGS deltas. The END's raw `args` (the
 * provider's own string) win over it, and stay as they are when they are the
 * same JSON value as the END's `input`. Malformed arguments also stay, so the
 * tool reports the error and the model can repair them. `input` is always
 * the parse of `args`.
 */
export function finishToolCallArguments(
  streamed: string,
  end: ToolCallEndEvent,
): { args: string; input: unknown } {
  const metadata = tanstackMetadata(end)
  // Wire data: only a string is raw arguments.
  const endArgs: unknown = (end as AdapterYieldChunk).args ?? metadata?.args
  const rawArgs = typeof endArgs === 'string' ? endArgs : undefined
  const endInput = end.input ?? metadata?.input
  // Only an object or array is tool input. Anything else (`null`, a
  // function) keeps the raw or streamed arguments.
  const input =
    endInput !== null && typeof endInput === 'object' ? endInput : undefined
  let raw: string | undefined = rawArgs ?? streamed
  // Streamed text that is not JSON gives way to the input.
  if (rawArgs === undefined && input !== undefined) {
    try {
      JSON.parse(raw)
    } catch {
      raw = undefined
    }
  }
  let args: string
  try {
    args = reconcileToolCallArguments(raw, input)
  } catch {
    // An input with no JSON form (a cycle, a bigint): keep the raw arguments.
    args = raw ?? streamed
  }
  return { args, input: parseToolArguments(args) }
}
