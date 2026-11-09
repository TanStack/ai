import type { Unrecognized } from '@openrouter/sdk/types'

/**
 * One node of the generated rename tables (`tables/*.ts`):
 *
 * - `0`: keep the value as it is.
 * - a positive number: the object table `objects[n]`.
 * - `[1, node]`: an array of `node`.
 * - `[2, node]`: a record with `node` values.
 * - `[3, ...nodes]`: a union. The first node that fits the value is used.
 * - `[4, key, { [value]: node }, outKey?, unknownValue?]`: the SDK
 *   `discriminatedUnion`. A value that does not fit gives the SDK fallback
 *   `{ raw, [key]: 'UNKNOWN', isUnknown: true }`.
 */
export type RemapNode = number | Array<unknown>

/** One object schema of the SDK. */
export interface RemapObject {
  /** Every key of the schema and its node. Other keys are dropped, as zod does. */
  f: Record<string, RemapNode>
  /** Output names that differ from {@link autoName} (`null` drops the key). */
  m?: Record<string, string | null>
  /** Required keys. */
  q?: Array<string>
  /** Keys that only allow these values. */
  l?: Record<string, Array<unknown>>
  /** Default values. */
  d?: Record<string, unknown>
  /** Keep the unknown keys under this key (the SDK `collectExtraKeys`). */
  x?: string
  /** Spread the record under this key into the output (`...v.key`). */
  y?: string
}

/** The object tables of one API. */
export type RemapObjects = ReadonlyArray<RemapObject | null>

/**
 * The output name of a key when the tables do not say otherwise: a wire key
 * with `_` becomes camelCase, and a camelCase key becomes snake_case.
 */
export function autoName(key: string) {
  return key.includes('_')
    ? key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
    : key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNode(value: unknown): RemapNode {
  return typeof value === 'number' || Array.isArray(value) ? value : 0
}

/**
 * True when `value` fits `node`: for objects, the required keys are set and
 * the fixed-value keys hold an allowed value, all the way down. ponytail:
 * primitive field types are not checked; the tables do not keep them.
 */
export function fits(
  value: unknown,
  node: RemapNode,
  objects: RemapObjects,
): boolean {
  if (value === null || node === 0) return true
  if (typeof node === 'number') {
    const table = objects[node]
    if (!table || !isPlainObject(value)) return false
    const hasRequired = (table.q ?? []).every((key) => value[key] !== undefined)
    if (!hasRequired) return false
    for (const [key, allowed] of Object.entries(table.l ?? {})) {
      if (value[key] !== undefined && !allowed.includes(value[key]))
        return false
    }
    return Object.entries(table.f).every(
      ([key, child]) =>
        value[key] === undefined || fits(value[key], child, objects),
    )
  }
  const child = asNode(node[1])
  switch (node[0]) {
    case 1:
      return (
        Array.isArray(value) &&
        value.every((item) => fits(item, child, objects))
      )
    case 2:
      return (
        isPlainObject(value) &&
        Object.values(value).every((item) => fits(item, child, objects))
      )
    case 3:
      // The tables drop the primitive options of a union, so a primitive
      // value fits.
      return (
        typeof value !== 'object' ||
        node.slice(1).some((option) => fits(value, asNode(option), objects))
      )
    default:
      return true
  }
}

/**
 * Renames the keys of `value` the same way the SDK zod schema for `node`
 * does: camelCase to wire keys for a request, wire keys to camelCase for a
 * response. Unknown keys are dropped and defaults are filled in.
 *
 * @example
 * remap({ messages: [], maxTokens: 5 }, ChatRequest, OBJECTS)
 * // { messages: [], max_tokens: 5, stream: false }
 */
export function remap(
  value: unknown,
  node: RemapNode,
  objects: RemapObjects,
): unknown {
  if (value === null || value === undefined || node === 0) return value
  if (typeof node === 'number') {
    const table = objects[node]
    return table ? remapObject(value, table, objects) : value
  }
  const child = asNode(node[1])
  switch (node[0]) {
    case 1:
      return Array.isArray(value)
        ? value.map((item) => remap(item, child, objects))
        : value
    case 2:
      return isPlainObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              remap(item, child, objects),
            ]),
          )
        : value
    case 3: {
      const option = node
        .slice(1)
        .map(asNode)
        .find((candidate) => fits(value, candidate, objects))
      return option === undefined ? value : remap(value, option, objects)
    }
    default:
      return remapDiscriminated(value, node, objects)
  }
}

function remapObject(
  value: unknown,
  table: RemapObject,
  objects: RemapObjects,
) {
  if (!isPlainObject(value)) return value
  const spread = table.y === undefined ? undefined : value[table.y]
  const out: Record<string, unknown> = isPlainObject(spread)
    ? { ...spread }
    : {}
  for (const [key, child] of Object.entries(table.f)) {
    let item = value[key]
    if (item === undefined) {
      if (!table.d || !(key in table.d)) continue
      item = table.d[key]
    }
    const name = table.m && key in table.m ? table.m[key] : autoName(key)
    if (name !== null && name !== undefined) {
      out[name] = remap(item, child, objects)
    }
  }
  if (table.x) {
    const extras = Object.fromEntries(
      Object.entries(value).filter(
        ([key, item]) => !(key in table.f) && item !== undefined,
      ),
    )
    if (Object.keys(extras).length) out[table.x] = extras
  }
  return out
}

function remapDiscriminated(
  value: unknown,
  node: Array<unknown>,
  objects: RemapObjects,
) {
  const key = String(node[1])
  const options = isPlainObject(node[2]) ? node[2] : {}
  const outKey = typeof node[3] === 'string' ? node[3] : key
  const unknownValue = typeof node[4] === 'string' ? node[4] : 'UNKNOWN'
  const discriminator = isPlainObject(value) ? value[key] : undefined
  const option =
    typeof discriminator === 'string' && Object.hasOwn(options, discriminator)
      ? asNode(options[discriminator])
      : undefined
  if (option === undefined || !fits(value, option, objects)) {
    return { raw: value, [outKey]: unknownValue, isUnknown: true }
  }
  const out = remap(value, option, objects)
  if (outKey !== key && isPlainObject(out)) out[outKey] = discriminator
  return out
}

/** `autoName` of a camelCase key, as a type. */
type SnakeCase<S extends string> = S extends `${infer H}${infer R}`
  ? `${H extends Lowercase<H> ? H : `_${Lowercase<H>}`}${SnakeCase<R>}`
  : S

/**
 * The type of `remap(value, node)` for an SDK request type `T`: keys in
 * snake_case, `additionalProperties` spread away. ponytail: it follows
 * `autoName` only; the few table renames (`m`) are not modelled. The SDK
 * forward-compatibility branches (`Unrecognized` open-enum values and the
 * `isUnknown` union fallback) map to `never`: they exist for responses.
 */
export type Wire<T> = T extends Unrecognized<unknown> | { isUnknown: true }
  ? never
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends ReadonlyArray<infer U>
      ? Array<Wire<U>>
      : T extends object
        ? {
            [K in keyof T as K extends 'additionalProperties'
              ? never
              : K extends string
                ? SnakeCase<K>
                : K]: Wire<T[K]>
          }
        : T

/**
 * `remap` for a request: the SDK request `value` renamed to the wire, typed
 * as {@link Wire}, so the generated client checks the body. The type is the
 * one trusted step; `tests/remap-oracle.test.ts` checks the runtime against
 * the SDK zod schemas.
 */
export function toWire<T>(
  value: T,
  node: RemapNode,
  objects: RemapObjects,
): Wire<T>
export function toWire(value: unknown, node: RemapNode, objects: RemapObjects) {
  return remap(value, node, objects)
}
