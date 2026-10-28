import { dereference, initialBaseURI, validate } from '@cfworker/json-schema'
import {
  StandardSchemaValidationError,
  convertSchemaToJsonSchema,
  isStandardJSONSchema,
  isStandardSchema,
  validateWithStandardSchema,
} from './schema-converter'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Schema, SchemaDraft } from '@cfworker/json-schema'
import type { JSONSchema, SchemaInput } from '../../../types'

/** A JSON Schema ready for `validate`: the copy, its draft, its `$ref` lookup. */
interface CompiledSchema {
  schema: Schema | boolean
  draft: SchemaDraft
  lookup: Record<string, Schema | boolean>
}

/** A JSON Schema object: typed, or as JSON gives it. */
type AnySchema = JSONSchema | Record<string, unknown>

const compiled = new WeakMap<object, CompiledSchema>()

/** Keywords whose value is data, not a schema. */
const DATA_KEYWORDS = new Set([
  'const',
  'enum',
  'default',
  'examples',
  'example',
])

/** Keywords whose value maps names to schemas. */
const SCHEMA_MAP_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
  'dependencies',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Draft-04 and OpenAPI 3.0 write these bounds as booleans. */
const BOOLEAN_BOUNDS = [
  ['exclusiveMinimum', 'minimum'],
  ['exclusiveMaximum', 'maximum'],
] as const

/** Keywords that can reject `null` even when `type` allows it. */
const NULL_REJECTING_KEYWORDS = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not']

/** Keywords that name a schema. They stay on a wrapped schema. */
const NAMING_KEYWORDS = new Set(['$id', 'id', '$schema', '$anchor'])

/** A key as a JSON Pointer token, URI-encoded as cfworker stores paths. */
function pointerToken(key: string) {
  return encodeURI(key.replaceAll('~', '~0').replaceAll('/', '~1'))
}

/** Calls `visit` on each schema in `node`, inner schemas first. */
function eachSchema(
  node: unknown,
  path: string,
  visit: (schema: Record<string, unknown>, path: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => eachSchema(item, `${path}/${index}`, visit))
    return
  }
  if (!isRecord(node)) return
  for (const [key, value] of Object.entries(node)) {
    if (DATA_KEYWORDS.has(key)) continue
    const keyPath = `${path}/${pointerToken(key)}`
    if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      for (const [name, schema] of Object.entries(value)) {
        eachSchema(schema, `${keyPath}/${pointerToken(name)}`, visit)
      }
    } else {
      eachSchema(value, keyPath, visit)
    }
  }
  visit(node, path)
}

/**
 * Make one schema of the JSON copy ready for the validator, in place:
 * - `format` goes away. It is an annotation, as in 2019-09 and later: a tool
 *   that declares `format: 'uri'` still gets a plain path.
 * - A boolean bound (`exclusiveMinimum: true`, draft-04 and OpenAPI 3.0)
 *   becomes the number form, so it works in every draft.
 * - OpenAPI 3.0 `nullable: true` lets the value be `null`: `null` joins
 *   `type` and `enum`. A schema with a `$ref`, `allOf`, `anyOf`, `oneOf`, or
 *   `not` becomes `{ if: { type: 'null' }, else: schema }`, and its path goes
 *   in `wrapped`. A failed `else` is an `if` error, which the error text
 *   leaves out, so the model never reads "Expected null".
 */
function prepareSchema(
  schema: Record<string, unknown>,
  path: string,
  wrapped: Array<string>,
) {
  if (typeof schema.format === 'string') delete schema.format
  for (const [bound, limit] of BOOLEAN_BOUNDS) {
    if (typeof schema[bound] !== 'boolean') continue
    if (schema[bound] && typeof schema[limit] === 'number') {
      schema[bound] = schema[limit]
      delete schema[limit]
    } else {
      delete schema[bound]
    }
  }
  if (schema.nullable !== true) return
  if (schema.type !== undefined) {
    schema.type = [...new Set([schema.type, 'null'].flat())]
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) {
    schema.enum.push(null)
  }
  if (!NULL_REJECTING_KEYWORDS.some((key) => key in schema)) return
  const inner: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (NAMING_KEYWORDS.has(key)) continue
    inner[key] = value
    delete schema[key]
  }
  schema.if = { type: 'null' }
  schema.else = inner
  wrapped.push(path)
}

/** Any base works. A ref resolves as a URL, as cfworker reads it. */
const REF_BASE = 'https://ref.invalid/'

/** A `$ref` into a wrapped schema, moved to where that schema went. */
function movedRef(ref: string, wrappedPath: string) {
  if (!ref.startsWith('#')) return ref
  const target = new URL(ref, REF_BASE).href
  const from = new URL(wrappedPath, REF_BASE).href
  return target.startsWith(`${from}/`)
    ? `${from}/else${target.slice(from.length)}`.slice(REF_BASE.length)
    : ref
}

/** The draft named by `$schema`, else 2020-12. */
function draftOf(schema: AnySchema): SchemaDraft {
  const uri = typeof schema.$schema === 'string' ? schema.$schema : ''
  // Boolean bounds are numbers by now, and cfworker reads numeric bounds as
  // booleans in its draft-04 mode. Draft 7 checks the rest the same way.
  if (/draft-0[467]/.test(uri)) return '7'
  if (uri.includes('2019-09')) return '2019-09'
  return '2020-12'
}

function compile(schema: AnySchema | boolean): CompiledSchema {
  if (typeof schema === 'boolean') {
    return { schema, draft: '2020-12', lookup: dereference(schema) }
  }
  const cached = compiled.get(schema)
  if (cached) return cached
  // `dereference` writes lookup data onto the schema it gets. A JSON copy
  // keeps the tool's own schema, which also goes to the provider, unchanged.
  const copy: Schema = JSON.parse(JSON.stringify(schema))
  const wrapped: Array<string> = []
  eachSchema(copy, '#', (node, path) => prepareSchema(node, path, wrapped))
  // Inner schemas were wrapped first, so their moves apply first.
  // ponytail: refs are read as paths from the root. An absolute ref, and a
  // ref inside a nullable schema with its own `$id`, are not moved.
  if (wrapped.length > 0) {
    eachSchema(copy, '#', (node) => {
      if (typeof node.$ref === 'string') {
        node.$ref = wrapped.reduce(movedRef, node.$ref)
      }
    })
  }
  const result = {
    schema: copy,
    draft: draftOf(schema),
    lookup: dereference(copy),
  }
  compiled.set(schema, result)
  return result
}

const DECIMAL = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/

function convertPrimitive(value: unknown, type: string) {
  switch (type) {
    case 'number':
    case 'integer': {
      if (value === null) return 0
      if (typeof value === 'boolean') return value ? 1 : 0
      // Decimal text only: no hex, and no integer past the safe range.
      if (typeof value !== 'string' || !DECIMAL.test(value)) return value
      const number = Number(value)
      const valid =
        type === 'integer'
          ? Number.isSafeInteger(number)
          : Number.isFinite(number)
      return valid ? number : value
    }
    case 'boolean':
      if (value === null || value === 'false' || value === 0) return false
      if (value === 'true' || value === 1) return true
      return value
    case 'string':
      if (value === null) return ''
      return typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : value
    case 'null':
      return value === '' || value === 0 || value === false ? null : value
    default:
      return value
  }
}

function matchesType(value: unknown, type: string) {
  switch (type) {
    case 'null':
      return value === null
    case 'array':
      return Array.isArray(value)
    case 'object':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      )
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    default:
      return typeof value === type
  }
}

/**
 * Repair common model mistakes against the schema before the check: `"5"`
 * for 5, `"true"` for true, `null` for an optional field. It walks unions,
 * `$ref`, `if`/`then`/`else`, tuples, and pattern and additional properties.
 * A value that cannot be repaired stays as it is, so the check reports it.
 */
function coerceArguments(value: unknown, root: CompiledSchema) {
  const { draft, lookup } = root

  function check(schema: Schema | boolean, candidate: unknown) {
    if (typeof schema === 'boolean') return schema
    return validate(candidate, schema, draft, lookup).valid
  }

  function refTarget(schema: Schema) {
    const uri = schema.__absolute_ref__
    const target = uri === undefined ? undefined : lookup[uri]
    return typeof target === 'object' ? target : undefined
  }

  function coerceUnion(
    candidate: unknown,
    schemas: Array<Schema>,
    seen: Set<Schema>,
    required: Set<string>,
  ) {
    if (schemas.some((schema) => check(schema, candidate))) return candidate
    for (const schema of schemas) {
      const converted = coerce(
        structuredClone(candidate),
        schema,
        seen,
        required,
      )
      if (check(schema, converted)) return converted
    }
    return candidate
  }

  function requiredKeys(
    schema: Schema | boolean,
    candidate: unknown,
    seen = new Set<Schema>(),
  ): Set<string> {
    if (typeof schema === 'boolean' || seen.has(schema)) return new Set()
    const nextSeen = new Set(seen).add(schema)
    const required = new Set(
      Array.isArray(schema.required) ? schema.required : [],
    )
    const children: Array<Schema | boolean> = [...(schema.allOf ?? [])]
    const target = refTarget(schema)
    if (target) children.push(target)
    if (schema.if !== undefined) {
      const branch = check(schema.if, candidate) ? schema.then : schema.else
      if (branch) children.push(branch)
    }
    for (const child of children) {
      for (const key of requiredKeys(child, candidate, nextSeen)) {
        required.add(key)
      }
    }
    return required
  }

  function coerce(
    candidate: unknown,
    schema: Schema | boolean,
    seen = new Set<Schema>(),
    inheritedRequired = new Set<string>(),
  ): unknown {
    if (typeof schema === 'boolean') return candidate
    // A reference cycle at the same value cannot add another conversion.
    if (seen.has(schema)) return candidate
    const nextSeen = new Set(seen).add(schema)
    const required = requiredKeys(schema, candidate)
    for (const key of inheritedRequired) required.add(key)
    let next = candidate
    const target = refTarget(schema)
    if (target) next = coerce(next, target, nextSeen, required)
    for (const nested of schema.allOf ?? []) {
      next = coerce(next, nested, nextSeen, required)
    }
    if (schema.anyOf) next = coerceUnion(next, schema.anyOf, nextSeen, required)
    if (schema.oneOf) next = coerceUnion(next, schema.oneOf, nextSeen, required)

    const types =
      typeof schema.type === 'string' ? [schema.type] : (schema.type ?? [])
    if (!types.some((type) => matchesType(next, type))) {
      // `null` last: `0` for `['null', 'string']` is `"0"`, not `null`.
      const order: Array<string> = types.filter((type) => type !== 'null')
      if (types.includes('null')) order.push('null')
      for (const type of order) {
        const converted = convertPrimitive(next, type)
        if (converted !== next) {
          next = converted
          break
        }
      }
    }

    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      // Own keys only, `__proto__` included.
      const object: Record<string, unknown> = Object.fromEntries(
        Object.entries(next),
      )
      const properties = Object.entries(schema.properties ?? {})
      const knownKeys = new Set(properties.map(([key]) => key))
      for (const [key, property] of properties) {
        if (!Object.hasOwn(object, key)) continue
        if (
          object[key] === null &&
          !required.has(key) &&
          !check(property, null)
        ) {
          // A strict-mode provider sends `null` for an optional field.
          delete object[key]
        } else {
          object[key] = coerce(object[key], property)
        }
      }
      for (const [pattern, property] of Object.entries(
        schema.patternProperties ?? {},
      )) {
        const expression = new RegExp(pattern, 'u')
        for (const key of Object.keys(object)) {
          if (!expression.test(key)) continue
          knownKeys.add(key)
          object[key] = coerce(object[key], property)
        }
      }
      const additional = schema.additionalProperties
      if (typeof additional === 'object') {
        for (const [key, entry] of Object.entries(object)) {
          if (!knownKeys.has(key)) object[key] = coerce(entry, additional)
        }
      }
      next = object
    }
    if (Array.isArray(next)) {
      const tuple =
        schema.prefixItems ??
        (Array.isArray(schema.items) ? schema.items : undefined)
      const rest = Array.isArray(schema.items) ? undefined : schema.items
      next = next.map((item: unknown, index) => {
        const itemSchema = tuple?.[index] ?? rest
        return itemSchema === undefined ? item : coerce(item, itemSchema)
      })
    }
    if (schema.if !== undefined) {
      const branch = check(schema.if, next) ? schema.then : schema.else
      if (branch) next = coerce(next, branch, nextSeen, required)
    }
    return next
  }

  return coerce(value, root.schema)
}

/** Errors that only say that a nested check failed. The nested error says why. */
const WRAPPER_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  'items',
  'prefixItems',
  'additionalItems',
  'unevaluatedItems',
  '$ref',
  '$recursiveRef',
  'allOf',
  // "Instance does not match "then" schema." (or "else")
  'if',
])

/** More errors than this are counted, not listed. */
const MAX_ERRORS = 10

/**
 * Check `value` against the JSON Schema `schema` with `@cfworker/json-schema`,
 * as a tool input is checked, with no repair. Every keyword that the
 * validator knows is checked. `format` is an annotation only. The result has
 * the Standard Schema shape: `{ value }` when it fits, else `{ issues }`.
 *
 * @example
 * ```ts
 * const result = validateJsonSchema({ type: 'string', pattern: '^a' }, 'b')
 * if (result.issues) console.log(result.issues.map((issue) => issue.message))
 * ```
 */
export function validateJsonSchema(
  schema: AnySchema | boolean,
  value: unknown,
): StandardSchemaV1.Result<unknown> {
  const result = jsonInputIssues(schema, value, false)
  return 'issues' in result
    ? { issues: result.issues.map((message) => ({ message })) }
    : result
}

function validateJsonInput(
  schema: JSONSchema | boolean,
  received: unknown,
  toolName: string,
  repair: boolean,
) {
  const result = jsonInputIssues(schema, received, repair)
  if (!('issues' in result)) return result.value
  const { issues } = result
  let errors = issues.slice(0, MAX_ERRORS).join(', ')
  if (issues.length > MAX_ERRORS) {
    errors += `, and ${issues.length - MAX_ERRORS} more`
  }
  throw new Error(`Input validation failed for tool ${toolName}: ${errors}`)
}

/** The input after the check (repaired when `repair`), or what is wrong with it. */
function jsonInputIssues(
  schema: AnySchema | boolean,
  received: unknown,
  repair: boolean,
): { value: unknown } | { issues: Array<string> } {
  try {
    // Check the JSON form: a key set to `undefined` is the same as no key,
    // and an input with no JSON form (`undefined`) is `null`.
    const json = JSON.stringify(received) ?? 'null'
    const value: unknown = JSON.parse(json)
    const root = compile(schema)
    const check = (candidate: unknown) =>
      validate(candidate, root.schema, root.draft, root.lookup, false)
    const result = check(value)
    if (result.valid) return { value: received }
    // Repair only an input that fails. The error reports the input as sent.
    if (repair) {
      let converted = value
      try {
        converted = coerceArguments(value, root)
      } catch {
        // A schema that cannot be used: the first check reports it.
      }
      if (JSON.stringify(converted) !== json && check(converted).valid) {
        return { value: converted }
      }
    }
    const leaves = result.errors.filter(
      (error) => !WRAPPER_KEYWORDS.has(error.keyword),
    )
    const shown = leaves.length > 0 ? leaves : result.errors
    return {
      issues: shown.map((error) => `${error.instanceLocation}: ${error.error}`),
    }
  } catch (error) {
    // A schema the validator cannot use, such as an unresolved `$ref`, or a
    // value with no JSON form. The first line is enough for the model.
    // Drop the validator base (in a browser, the page URL and its query).
    const message = error instanceof Error ? error.message : String(error)
    return {
      issues: [
        message
          .split('\n', 1)
          .join('')
          .replaceAll(initialBaseURI.href, '')
          .replace(/ +Absolute URI "[^"]*"\.?/, '')
          .trim(),
      ],
    }
  }
}

function standardInputError(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  toolName: string,
) {
  const error = new StandardSchemaValidationError(issues)
  error.message = `Input validation failed for tool ${toolName}: ${error.message}`
  return error
}

/**
 * How a failed tool input is repaired. `undefined`: the built-in repair.
 * `false`: no repair. A function: called instead of the built-in repair. It
 * returns the input to check again, or `undefined` to keep the error.
 */
export type ToolInputRepair =
  | false
  | ((input: unknown, error: Error) => unknown | Promise<unknown>)

/**
 * The final check of a tool input, just before the tool runs or the client
 * gets the call. A Standard Schema runs here (an async validator too), and
 * its output is the input, so transforms apply once. A JSON Schema (an MCP
 * tool, a plain JSON Schema tool) is checked with `@cfworker/json-schema`.
 * A failed input is repaired as `repair` says, then checked again. The error
 * of the first check goes back to the model as the tool result.
 */
export async function validateToolInput(
  schema: SchemaInput | boolean | undefined,
  received: unknown,
  toolName: string,
  repair?: ToolInputRepair,
): Promise<unknown> {
  try {
    return await checkToolInput(
      schema,
      received,
      toolName,
      repair === undefined,
    )
  } catch (error) {
    if (typeof repair !== 'function') throw error
    const repaired = await repair(
      received,
      error instanceof Error ? error : new Error(String(error)),
    )
    if (repaired === undefined) throw error
    try {
      return await checkToolInput(schema, repaired, toolName, false)
    } catch {
      throw error
    }
  }
}

async function checkToolInput(
  schema: SchemaInput | boolean | undefined,
  received: unknown,
  toolName: string,
  repair: boolean,
): Promise<unknown> {
  if (schema === undefined) return received
  if (typeof schema === 'boolean') {
    return validateJsonInput(schema, received, toolName, repair)
  }
  if (!isStandardSchema(schema)) {
    const jsonSchema = convertSchemaToJsonSchema(schema, { io: 'input' })
    return jsonSchema
      ? validateJsonInput(jsonSchema, received, toolName, repair)
      : received
  }
  const first = await validateWithStandardSchema<unknown>(schema, received)
  if (first.success) return first.data
  // The authored schema runs first. When it fails and it can export JSON
  // Schema, repair the input and run the authored schema again. A failure
  // reports the issues of the first run.
  const original = standardInputError(first.issues, toolName)
  if (!repair || !isStandardJSONSchema(schema)) throw original
  let converted: unknown
  try {
    const jsonSchema = convertSchemaToJsonSchema(schema, { io: 'input' })
    if (!jsonSchema) throw original
    converted = validateJsonInput(jsonSchema, received, toolName, true)
  } catch {
    throw original
  }
  // Nothing was repaired: a second run gives the same issues.
  if (converted === received) throw original
  const retried = await validateWithStandardSchema<unknown>(schema, converted)
  if (!retried.success) throw original
  return retried.data
}
