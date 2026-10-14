import { Validator, initialBaseURI } from '@cfworker/json-schema'
import {
  StandardSchemaValidationError,
  convertSchemaToJsonSchema,
  isStandardSchema,
  validateWithStandardSchema,
} from './schema-converter'
import type { Schema, SchemaDraft } from '@cfworker/json-schema'
import type { JSONSchema, SchemaInput } from '../../../types'

const validators = new WeakMap<JSONSchema, Validator>()

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
function draftOf(schema: JSONSchema): SchemaDraft {
  const uri = typeof schema.$schema === 'string' ? schema.$schema : ''
  // Boolean bounds are numbers by now, and cfworker reads numeric bounds as
  // booleans in its draft-04 mode. Draft 7 checks the rest the same way.
  if (/draft-0[467]/.test(uri)) return '7'
  if (uri.includes('2019-09')) return '2019-09'
  return '2020-12'
}

function validatorFor(schema: JSONSchema | boolean) {
  if (typeof schema === 'boolean') return new Validator(schema)
  const cached = validators.get(schema)
  if (cached) return cached
  // The validator writes lookup data onto the schema it gets. A JSON copy
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
  const validator = new Validator(copy, draftOf(schema), false)
  validators.set(schema, validator)
  return validator
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

function receivedArgumentsText(received: unknown) {
  try {
    return JSON.stringify(received, null, 2) ?? String(received)
  } catch {
    return '[Arguments cannot be serialized as JSON]'
  }
}

function validateJsonInput(
  schema: JSONSchema | boolean,
  received: unknown,
  toolName: string,
) {
  let errors: string
  try {
    // Check the JSON form: a key set to `undefined` is the same as no key,
    // and an input with no JSON form (`undefined`) is `null`.
    const result = validatorFor(schema).validate(
      JSON.parse(JSON.stringify(received) ?? 'null'),
    )
    if (result.valid) return received
    const leaves = result.errors.filter(
      (error) => !WRAPPER_KEYWORDS.has(error.keyword),
    )
    const shown = leaves.length > 0 ? leaves : result.errors
    errors = shown
      .slice(0, MAX_ERRORS)
      .map((error) => `${error.instanceLocation}: ${error.error}`)
      .join(', ')
    if (shown.length > MAX_ERRORS) {
      errors += `, and ${shown.length - MAX_ERRORS} more`
    }
  } catch (error) {
    // A schema the validator cannot use, such as an unresolved `$ref`, or a
    // value with no JSON form. The first line is enough for the model.
    // Drop the validator base (in a browser, the page URL and its query).
    const message = error instanceof Error ? error.message : String(error)
    errors = message
      .split('\n', 1)
      .join('')
      .replaceAll(initialBaseURI.href, '')
      .replace(/ +Absolute URI "[^"]*"\.?/, '')
      .trim()
  }
  throw new Error(
    `Input validation failed for tool ${toolName}: ${errors}\nReceived arguments:\n${receivedArgumentsText(received)}`,
  )
}

/**
 * The final check of a tool input, just before the tool runs or the client
 * gets the call. A Standard Schema runs here (an async validator too), and
 * its output is the input, so transforms apply once. A JSON Schema (an MCP
 * tool, a plain JSON Schema tool) is checked with `@cfworker/json-schema`.
 * The error goes back to the model as the tool result.
 */
export async function validateToolInput(
  schema: SchemaInput | boolean | undefined,
  received: unknown,
  toolName: string,
): Promise<unknown> {
  if (schema === undefined) return received
  if (typeof schema === 'boolean') {
    return validateJsonInput(schema, received, toolName)
  }
  if (!isStandardSchema(schema)) {
    const jsonSchema = convertSchemaToJsonSchema(schema, { io: 'input' })
    return jsonSchema
      ? validateJsonInput(jsonSchema, received, toolName)
      : received
  }
  const validation = await validateWithStandardSchema<unknown>(schema, received)
  if (validation.success) return validation.data
  const error = new StandardSchemaValidationError(validation.issues)
  error.message = `Input validation failed for tool ${toolName}: ${error.message}\nReceived arguments:\n${receivedArgumentsText(received)}`
  throw error
}
