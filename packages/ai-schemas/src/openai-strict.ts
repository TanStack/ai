/**
 * Convert a self-contained JSON Schema into one accepted by OpenAI's
 * structured-outputs **strict mode** (`response_format.json_schema` with
 * `strict: true`).
 *
 * OpenAI strict mode requires: every property in `required`; all "optional"
 * fields modelled as nullable; `additionalProperties: false` on every object;
 * `anyOf` instead of `oneOf`; and a small allowlist of recognised keywords.
 * This helper applies those transforms recursively to a deep-clone of the
 * input.
 *
 * Designed to pair with the schemas exported from
 * `@tanstack/ai-schemas/schemas/{provider}`, which already bundle their `$ref`
 * closure under `$defs` and use `#/$defs/...` refs.
 *
 * @example
 * ```ts
 * import { toOpenAIStrict } from "@tanstack/ai-schemas/openai-strict"
 * import { Veo3InputSchema } from "@tanstack/ai-schemas/schemas/fal-video"
 *
 * await openai.chat.completions.create({
 *   model: "gpt-5",
 *   messages: [...],
 *   response_format: {
 *     type: "json_schema",
 *     json_schema: { name: "veo3_input", schema: toOpenAIStrict(Veo3InputSchema), strict: true },
 *   },
 * })
 * ```
 */

type JsonSchema = Readonly<Record<string, unknown>>

const STRICT_ALLOWED_KEYS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'anyOf',
  '$ref',
  '$defs',
  'enum',
  'const',
  'description',
  'title',
])

export function toOpenAIStrict<T extends JsonSchema>(schema: T): JsonSchema {
  return transform(schema) as JsonSchema
}

const SCHEMA_MAP_KEYS = new Set(['properties', '$defs'])
const LITERAL_ARRAY_KEYS = new Set(['required', 'enum'])

function transform(node: unknown): unknown {
  if (typeof node !== 'object' || node === null) return node
  if (Array.isArray(node)) return node.map(transform)

  const input = node as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (key === 'oneOf') {
      out.anyOf = transform(value)
      continue
    }
    if (!STRICT_ALLOWED_KEYS.has(key)) continue
    if (
      SCHEMA_MAP_KEYS.has(key) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const mapped: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        mapped[k] = transform(v)
      }
      out[key] = mapped
      continue
    }
    if (LITERAL_ARRAY_KEYS.has(key)) {
      out[key] = value
      continue
    }
    out[key] = transform(value)
  }

  if (
    out.type === 'object' &&
    out.properties &&
    typeof out.properties === 'object' &&
    !Array.isArray(out.properties)
  ) {
    const properties = out.properties as Record<string, unknown>
    const originallyRequired = new Set(
      Array.isArray(out.required) ? (out.required as Array<string>) : [],
    )
    const newProperties: Record<string, unknown> = {}
    const newRequired: Array<string> = []

    for (const [propName, propSchema] of Object.entries(properties)) {
      newRequired.push(propName)
      newProperties[propName] = originallyRequired.has(propName)
        ? propSchema
        : makeNullable(propSchema)
    }
    out.properties = newProperties
    out.required = newRequired
    out.additionalProperties = false
  }

  return out
}

function makeNullable(schema: unknown): unknown {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { anyOf: [schema, { type: 'null' }] }
  }
  const s = schema as Record<string, unknown>

  if (Array.isArray(s.type) && (s.type as Array<string>).includes('null')) {
    return s
  }
  if (
    Array.isArray(s.anyOf) &&
    (s.anyOf as Array<{ type?: string }>).some((v) => v.type === 'null')
  ) {
    return s
  }

  if (typeof s.$ref === 'string' || 'const' in s || Array.isArray(s.enum)) {
    return { anyOf: [s, { type: 'null' }] }
  }

  if (typeof s.type === 'string') {
    return { ...s, type: [s.type, 'null'] }
  }

  if (Array.isArray(s.anyOf)) {
    return { ...s, anyOf: [...(s.anyOf as Array<unknown>), { type: 'null' }] }
  }

  return { anyOf: [s, { type: 'null' }] }
}
