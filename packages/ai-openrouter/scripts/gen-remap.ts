/**
 * Generates the rename tables in `src/client/tables/` from the zod schemas of
 * the installed `@openrouter/sdk`. Run it again after an SDK upgrade, from
 * `packages/ai-openrouter`:
 *
 *   pnpm exec tsx scripts/gen-remap.ts
 *   pnpm exec oxfmt src/client/tables
 *
 * Then run `tests/remap-oracle.test.ts` and `tests/client-parity.test.ts`.
 *
 * The tables drive `remap()` in `src/client/remap.ts`. For each object schema
 * they hold its keys (zod drops unknown keys), the key renames of the SDK
 * `remap$` transforms that do not follow the camelCase/snake_case rule, the
 * required keys, the keys that only allow fixed values (they pick a union
 * option), and the default values. One file per API keeps the text adapter
 * free of the responses and video tables.
 */
import { register } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autoName } from '../src/client/remap'
import type { RemapNode, RemapObject } from '../src/client/remap'

// The SDK keeps the arguments of `discriminatedUnion()` and
// `collectExtraKeys()` in closures. This load hook tags the returned schemas
// with those arguments, so the walk below can read them.
const hook = `
export async function load(url, context, next) {
  const result = await next(url, context)
  const patch = (from, name, tag) => {
    const source = String(result.source).replace('export function ' + name + '(', 'function ' + from + '(')
    return { ...result, source: source + '\\nexport function ' + name + '(a, b, c) { const s = ' + from + '(a, b, c); s.' + tag + ' = [a, b, c]; return s }\\n' }
  }
  if (url.endsWith('/esm/types/discriminatedUnion.js')) return patch('__du', 'discriminatedUnion', '__du')
  if (url.endsWith('/esm/lib/schemas.js')) return patch('__cek', 'collectExtraKeys', '__extras')
  return result
}`
register(`data:text/javascript,${encodeURIComponent(hook)}`)

const models = await import('@openrouter/sdk/models')
const operations = await import('@openrouter/sdk/models/operations')
const { SDK_METADATA } = await import('@openrouter/sdk/lib/config.js')

interface ZodLike {
  _zod: { def: Record<string, any>; optin?: string }
  __du?: [
    string,
    Record<string, ZodLike>,
    { unknownValue?: string; outputPropertyName?: string } | undefined,
  ]
  __extras?: [ZodLike, string, boolean]
}

type Renames = Record<string, string | null>

// Only these transform bodies are known. A new one needs a new table field.
const KNOWN_TRANSFORMS = new Set([
  '(v) => { return REMAP; }',
  '(v) => { return { ...v.additionalProperties, ...REMAP, }; }',
])

/** The remap mapping inside a `.transform((v) => remap$(v, {...}))`. */
function renamesOf(schema: ZodLike): Renames | undefined {
  const def = schema._zod.def
  if (def.type !== 'pipe' || schema.__extras) return undefined
  const fn = def.out._zod.def.transform
  if (!fn) return undefined
  const source = String(fn)
  const remapCall = /remap\$\(v, (\{[\s\S]*?\})\)/
  const shape = source.replace(remapCall, 'REMAP').replace(/\s+/g, ' ')
  if (!KNOWN_TRANSFORMS.has(shape))
    throw new Error(`Unknown transform: ${shape}`)
  const match = remapCall.exec(source)!
  // The mapping is an object literal: quote the bare keys, drop the trailing
  // comma, and read it as JSON.
  const text = match[1]!
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}$/, '}')
  return JSON.parse(text) as Renames
}

/** The key whose record the transform spreads into the output (`...v.key`). */
function spreadOf(schema: ZodLike) {
  const fn = schema._zod.def.out?._zod.def.transform
  return fn ? /\.\.\.v\.(\w+)/.exec(String(fn))?.[1] : undefined
}

function unwrap(schema: ZodLike): ZodLike {
  const def = schema._zod.def
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
      return unwrap(def.innerType)
    case 'lazy':
      return unwrap(def.getter())
    default:
      return schema
  }
}

function resolveObject(schema: ZodLike): ZodLike {
  const inner = unwrap(schema)
  const def = inner._zod.def
  if (def.type === 'pipe' && !inner.__extras) return resolveObject(def.in)
  return inner
}

/** The values a field allows, when it only allows fixed values. */
function literalValues(schema: ZodLike): Array<unknown> | undefined {
  const def = unwrap(schema)._zod.def
  if (def.type === 'literal') return [...def.values]
  if (def.type === 'enum') return Object.values(def.entries)
  if (def.type === 'union') {
    const values = (def.options as Array<ZodLike>).map(literalValues)
    return values.every(Boolean) ? values.flat() : undefined
  }
  return undefined
}

/**
 * The default of a field. `optional` and `nullable` pass `undefined` on to
 * an inner `default`, so look through them.
 */
function defaultOf(schema: ZodLike): { value: unknown } | undefined {
  const def = schema._zod.def
  if (def.type === 'default') return { value: def.defaultValue }
  if (def.type === 'optional' || def.type === 'nullable') {
    return defaultOf(def.innerType)
  }
  return undefined
}

/**
 * `p` for a primitive union option (it keeps the value as it is), `x` for an
 * option that takes any value, `undefined` for a structural option.
 */
function primitiveTag(schema: ZodLike) {
  const inner = unwrap(schema)
  if (inner.__du) return undefined
  const def = inner._zod.def
  switch (def.type) {
    case 'string':
    case 'number':
    case 'int':
    case 'boolean':
    case 'null':
    case 'literal':
    case 'enum':
    case 'bigint':
      return 'p'
    case 'any':
    case 'unknown':
    case 'custom':
      return 'x'
    case 'pipe': {
      // An open enum: `z.string().transform(unrecognized)`.
      const fn = def.out._zod.def.transform
      return fn && /unrecognized\(/.test(String(fn)) ? 'p' : undefined
    }
    default:
      return undefined
  }
}

/** Builds the tables of one API from its root schemas. */
function buildGroup(
  roots: Record<string, ZodLike>,
  validated: ReadonlyArray<string>,
) {
  const objects: Array<RemapObject | null> = [null]
  const memo = new Map<ZodLike, RemapNode>()

  function buildEntry(
    schema: ZodLike,
    renames: Renames | undefined,
    extrasKey?: string,
  ): RemapObject {
    const def = schema._zod.def
    if (def.type === 'pipe' && schema.__extras) {
      const [inner, key, optional] = schema.__extras
      if (!optional) throw new Error('collectExtraKeys must be optional')
      return buildEntry(inner, renames, key)
    }
    if (def.type === 'intersection') {
      const left = buildEntry(
        resolveObject(def.left),
        renamesOf(unwrap(def.left)),
      )
      const right = buildEntry(
        resolveObject(def.right),
        renamesOf(unwrap(def.right)),
      )
      const merged: RemapObject = { f: { ...left.f, ...right.f } }
      const m = { ...left.m, ...right.m }
      if (Object.keys(m).length) merged.m = m
      const q = [...new Set([...(left.q ?? []), ...(right.q ?? [])])]
      if (q.length) merged.q = q
      const l = { ...left.l, ...right.l }
      if (Object.keys(l).length) merged.l = l
      const d = { ...left.d, ...right.d }
      if (Object.keys(d).length) merged.d = d
      return merged
    }
    if (def.type !== 'object')
      throw new Error(`Expected an object, got ${def.type}`)
    if (def.catchall && !extrasKey)
      throw new Error('A catchall needs collectExtraKeys')
    const entry: RemapObject = { f: {} }
    for (const [key, field] of Object.entries<ZodLike>(def.shape)) {
      entry.f[key] = node(field)
      // Only renames that differ from the camelCase/snake_case rule are kept.
      const name = renames?.[key] === undefined ? key : renames[key]
      if (name !== autoName(key)) (entry.m ??= {})[key] = name
      if (field._zod.optin !== 'optional') (entry.q ??= []).push(key)
      const literals = literalValues(field)
      if (literals) (entry.l ??= {})[key] = literals
      const fallback = defaultOf(field)
      if (fallback) (entry.d ??= {})[key] = fallback.value
    }
    if (extrasKey) entry.x = extrasKey
    return entry
  }

  function node(schema: ZodLike): RemapNode {
    const inner = unwrap(schema)
    const cached = memo.get(inner)
    if (cached !== undefined) return cached
    const def = inner._zod.def
    if (primitiveTag(inner)) {
      memo.set(inner, 0)
      return 0
    }
    if (inner.__du) {
      const [prop, options, opts = {}] = inner.__du
      const byValue: Record<string, RemapNode> = {}
      const out: Array<unknown> = [4, prop, byValue]
      memo.set(inner, out)
      for (const [value, option] of Object.entries(options)) {
        byValue[value] = node(option)
      }
      if (opts.outputPropertyName || opts.unknownValue) {
        out.push(opts.outputPropertyName ?? 0, opts.unknownValue ?? 0)
      }
      return out
    }
    switch (def.type) {
      case 'object':
      case 'intersection':
      case 'pipe': {
        const renames = renamesOf(inner)
        if (def.type === 'pipe' && !inner.__extras && !renames) {
          throw new Error(`Unknown transform: ${def.out._zod.def.transform}`)
        }
        // Reserve the index first: lazy schemas can point back here.
        const index = objects.push(null) - 1
        memo.set(inner, index)
        const entry = buildEntry(
          renames ? resolveObject(def.in) : inner,
          renames,
        )
        const spread = renames ? spreadOf(inner) : undefined
        objects[index] = spread ? { ...entry, y: spread } : entry
        return index
      }
      case 'array':
      case 'record': {
        const out: Array<unknown> = [def.type === 'array' ? 1 : 2]
        memo.set(inner, out)
        const child = node(def.type === 'array' ? def.element : def.valueType)
        if (child === 0) {
          memo.set(inner, 0)
          return 0
        }
        out.push(child)
        return out
      }
      case 'union': {
        const out: Array<unknown> = [3]
        memo.set(inner, out)
        for (const option of def.options as Array<ZodLike>) {
          const tag = primitiveTag(option)
          // An `any` option takes every value, so the options after it never
          // run. A primitive option keeps the value, and no structural option
          // matches a primitive.
          if (tag === 'x') break
          if (tag === 'p') continue
          // A passthrough option (an array or record of primitives) gives the
          // same output as no match.
          const child = node(option)
          if (child !== 0) out.push(child)
        }
        if (out.length === 1) {
          memo.set(inner, 0)
          return 0
        }
        return out
      }
      default:
        throw new Error(`Unsupported schema type: ${def.type}`)
    }
  }

  const rootNodes: Record<string, RemapNode> = Object.fromEntries(
    Object.entries(roots).map(([name, schema]) => [name, node(schema)]),
  )

  /** Rewrites the object references in a node. */
  function mapRefs(value: RemapNode, fn: (index: number) => number): RemapNode {
    if (typeof value === 'number') return value === 0 ? 0 : fn(value)
    const [tag, ...rest] = value
    switch (tag) {
      case 1:
      case 2:
        return [tag, mapRefs(rest[0] as RemapNode, fn)]
      case 3:
        return [3, ...rest.map((option) => mapRefs(option as RemapNode, fn))]
      case 4:
        return [
          4,
          rest[0],
          Object.fromEntries(
            Object.entries(rest[1] as Record<string, RemapNode>).map(
              ([key, option]) => [key, mapRefs(option, fn)],
            ),
          ),
          ...rest.slice(2),
        ]
      default:
        throw new Error(`Unknown node tag ${String(tag)}`)
    }
  }

  function rewrite(fn: (index: number) => number) {
    for (const entry of objects) {
      if (!entry) continue
      for (const key of Object.keys(entry.f))
        entry.f[key] = mapRefs(entry.f[key]!, fn)
    }
    for (const key of Object.keys(rootNodes))
      rootNodes[key] = mapRefs(rootNodes[key]!, fn)
  }

  // Merge equal tables until nothing changes, then drop the unused ones.
  for (;;) {
    const first = new Map<string, number>()
    const same = new Map<number, number>()
    objects.forEach((entry, index) => {
      if (!entry) return
      const key = JSON.stringify(entry)
      const earlier = first.get(key)
      if (earlier === undefined) first.set(key, index)
      else same.set(index, earlier)
    })
    if (!same.size) break
    rewrite((index) => same.get(index) ?? index)
    for (const index of same.keys()) objects[index] = null
  }
  // `q` and `l` only serve `fits`, which runs on union options, JSON
  // results, and their children. Drop them everywhere else.
  const checked = new Set<number>()
  const markChecked = (value: RemapNode) => {
    if (typeof value === 'number') {
      if (value === 0 || checked.has(value)) return
      checked.add(value)
      for (const child of Object.values(objects[value]!.f)) markChecked(child)
      return
    }
    const [tag, ...rest] = value
    if (tag === 4) {
      for (const option of Object.values(
        rest[1] as Record<string, RemapNode>,
      )) {
        markChecked(option)
      }
    } else {
      for (const child of rest) markChecked(child as RemapNode)
    }
  }
  const findUnions = (value: RemapNode) => {
    if (typeof value === 'number') return
    if (value[0] === 3 || value[0] === 4) markChecked(value)
    else findUnions(value[1] as RemapNode)
  }
  for (const entry of objects) {
    if (entry) for (const child of Object.values(entry.f)) findUnions(child)
  }
  for (const root of Object.values(rootNodes)) findUnions(root)
  // JSON results are checked before they are renamed, as the SDK does.
  for (const name of validated) markChecked(rootNodes[name]!)
  objects.forEach((entry, index) => {
    if (!entry || checked.has(index)) return
    delete entry.q
    delete entry.l
  })

  const kept: Array<number> = []
  const newIndex = new Map<number, number>()
  objects.forEach((entry, index) => {
    if (entry) newIndex.set(index, kept.push(index))
  })
  rewrite((index) => newIndex.get(index)!)
  return { objects: [null, ...kept.map((index) => objects[index]!)], rootNodes }
}

const groups: Record<string, Record<string, unknown>> = {
  chat: {
    ChatRequest: models.ChatRequest$outboundSchema,
    ChatResult: models.ChatResult$inboundSchema,
    ChatStreamChunk: models.ChatStreamChunk$inboundSchema,
  },
  responses: {
    ResponsesRequest: models.ResponsesRequest$outboundSchema,
    OpenResponsesResult: models.OpenResponsesResult$inboundSchema,
    StreamEvents: models.StreamEvents$inboundSchema,
  },
  rerank: {
    RerankRequest: operations.CreateRerankRequestBody$outboundSchema,
    RerankResponse: operations.CreateRerankResponse$inboundSchema,
  },
  video: {
    VideoGenerationRequest: models.VideoGenerationRequest$outboundSchema,
    VideoGenerationResponse: models.VideoGenerationResponse$inboundSchema,
  },
}

/** The JSON results that `readJSON` checks. */
const VALIDATED = [
  'ChatResult',
  'OpenResponsesResult',
  'RerankResponse',
  'VideoGenerationResponse',
]

for (const [name, roots] of Object.entries(groups)) {
  // The SDK schemas are zod objects; this walk reads them through ZodLike.
  const { objects, rootNodes } = buildGroup(
    roots as Record<string, ZodLike>,
    VALIDATED.filter((root) => root in roots),
  )
  const lines = [
    `// Generated by scripts/gen-remap.ts from @openrouter/sdk ${SDK_METADATA.sdkVersion}. Do not edit.`,
    `import type { RemapNode, RemapObject } from '../remap'`,
    '',
    `export const OBJECTS: Array<RemapObject | null> = ${JSON.stringify(objects)}`,
    '',
    ...Object.entries(rootNodes).map(
      ([root, value]) =>
        `export const ${root}: RemapNode = ${JSON.stringify(value)}`,
    ),
    '',
  ]
  const target = fileURLToPath(
    new URL(`../src/client/tables/${name}.ts`, import.meta.url),
  )
  writeFileSync(target, lines.join('\n'))
  console.log(`Wrote ${objects.length - 1} object tables to ${target}`)
}
