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

/**
 * The draft named by `$schema`. Default: 2020-12. With no `$schema`, a
 * boolean `exclusiveMinimum` or `exclusiveMaximum` is draft-04.
 */
function draftOf(schema: JSONSchema, json: string): SchemaDraft {
  const uri = typeof schema.$schema === 'string' ? schema.$schema : ''
  if (uri.includes('draft-04')) return '4'
  if (uri.includes('draft-06') || uri.includes('draft-07')) return '7'
  if (uri.includes('2019-09')) return '2019-09'
  if (!uri && /"exclusiveM(?:in|ax)imum":(?:true|false)/.test(json)) return '4'
  return '2020-12'
}

function validatorFor(schema: JSONSchema | boolean) {
  if (typeof schema === 'boolean') return new Validator(schema)
  const cached = validators.get(schema)
  if (cached) return cached
  // The validator writes lookup data onto the schema it gets. A JSON copy
  // keeps the tool's own schema, which also goes to the provider, unchanged.
  // `format` is an annotation, as in 2019-09 and later: a tool that declares
  // `format: 'uri'` still gets a plain path.
  const json = JSON.stringify(schema)
  const copy: Schema = JSON.parse(json, (key, value) =>
    key === 'format' && typeof value === 'string' ? undefined : value,
  )
  const validator = new Validator(copy, draftOf(schema, json), false)
  validators.set(schema, validator)
  return validator
}

/** Errors that only say that a nested check failed. The nested error says why. */
const WRAPPER_KEYWORDS = new Set([
  'properties',
  'patternProperties',
  'items',
  'prefixItems',
  '$ref',
  'allOf',
])

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
    // Check the JSON form: a key set to `undefined` is the same as no key.
    const result = validatorFor(schema).validate(
      JSON.parse(JSON.stringify(received)),
    )
    if (result.valid) return received
    const leaves = result.errors.filter(
      (error) => !WRAPPER_KEYWORDS.has(error.keyword),
    )
    errors = (leaves.length > 0 ? leaves : result.errors)
      .map((error) => `${error.instanceLocation}: ${error.error}`)
      .join(', ')
  } catch (error) {
    // A schema the validator cannot use, such as an unresolved `$ref`, or a
    // value with no JSON form. The first line is enough for the model.
    // Drop the validator base (in a browser, the page URL and its query).
    const message = error instanceof Error ? error.message : String(error)
    errors = message
      .split('\n')[0]
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
