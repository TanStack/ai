import { Compile } from 'typebox/compile'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  StandardSchemaValidationError,
  convertSchemaToJsonSchema,
  isStandardJSONSchema,
  isStandardSchema,
} from './schema-converter'
import type { JSONSchema, SchemaInput } from '../../../types'

const validators = new WeakMap<JSONSchema, ReturnType<typeof Compile>>()

function validatorFor(schema: JSONSchema | boolean) {
  if (typeof schema === 'boolean') return Compile(schema)
  const cached = validators.get(schema)
  if (cached) return cached
  const validator = Compile(schema)
  validators.set(schema, validator)
  return validator
}

function convertPrimitive(value: unknown, type: string) {
  switch (type) {
    case 'number':
    case 'integer': {
      if (value === null) return 0
      if (typeof value === 'boolean') return value ? 1 : 0
      if (typeof value !== 'string' || value.trim() === '') return value
      const number = Number(value)
      const valid =
        type === 'integer' ? Number.isInteger(number) : Number.isFinite(number)
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

function coerceArguments(value: unknown, root: JSONSchema) {
  const paths = new WeakMap<object, string>()
  const byPath = new Map<string, JSONSchema>()
  const checks = new WeakMap<JSONSchema, ReturnType<typeof Compile>>()
  const rootUri = 'urn:tanstack:tool-input'
  const referenceRoot = { ...root, $id: root.$id ?? rootUri }

  function indexSchema(schema: JSONSchema, path: string) {
    if (paths.has(schema)) return
    paths.set(schema, path)
    byPath.set(path, schema)
    const entries = Object.entries(schema)
    for (const [key, child] of entries) {
      if (
        key === 'const' ||
        key === 'enum' ||
        child === null ||
        typeof child !== 'object'
      )
        continue
      const childPath = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
      indexSchema(child, childPath)
    }
  }
  indexSchema(root, '')

  function check(schema: JSONSchema, candidate: unknown) {
    if (typeof schema === 'boolean') return schema
    let validator = checks.get(schema)
    if (!validator) {
      const path = paths.get(schema)
      validator = Compile(
        { [rootUri]: referenceRoot },
        { $ref: `${rootUri}#${path ?? ''}` },
      )
      checks.set(schema, validator)
    }
    return validator.Check(candidate)
  }

  function coerceUnion(
    candidate: unknown,
    schemas: Array<JSONSchema>,
    seen: Set<JSONSchema>,
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
    schema: JSONSchema,
    candidate: unknown,
    seen = new Set<JSONSchema>(),
  ): Set<string> {
    if (typeof schema === 'boolean') return new Set()
    if (seen.has(schema)) return new Set()
    const nextSeen = new Set(seen).add(schema)
    const required = new Set(schema.required ?? [])
    const children = [...(schema.allOf ?? [])]
    if (schema.$ref?.startsWith('#')) {
      const target = byPath.get(decodeURIComponent(schema.$ref.slice(1)))
      if (target) children.push(target)
    }
    if (schema.if !== undefined) {
      const branch = check(schema.if, candidate) ? schema.then : schema.else
      if (branch) children.push(branch)
    }
    for (const child of children) {
      const keys = requiredKeys(child, candidate, nextSeen)
      for (const key of keys) required.add(key)
    }
    return required
  }

  function coerce(
    candidate: unknown,
    schema: JSONSchema,
    seen = new Set<JSONSchema>(),
    inheritedRequired = new Set<string>(),
  ): unknown {
    if (typeof schema === 'boolean') return candidate
    // A reference cycle at the same value cannot add another conversion.
    if (seen.has(schema)) return candidate
    const nextSeen = new Set(seen).add(schema)
    const required = requiredKeys(schema, candidate)
    for (const key of inheritedRequired) required.add(key)
    let next = candidate
    if (schema.$ref?.startsWith('#')) {
      const target = byPath.get(decodeURIComponent(schema.$ref.slice(1)))
      if (target) next = coerce(next, target, nextSeen, required)
    }
    const intersections = schema.allOf ?? []
    for (const nested of intersections)
      next = coerce(next, nested, nextSeen, required)
    if (schema.anyOf) next = coerceUnion(next, schema.anyOf, nextSeen, required)
    if (schema.oneOf) next = coerceUnion(next, schema.oneOf, nextSeen, required)

    const types =
      typeof schema.type === 'string' ? [schema.type] : (schema.type ?? [])
    if (!types.some((type) => matchesType(next, type))) {
      for (const type of types) {
        const converted = convertPrimitive(next, type)
        if (converted !== next) {
          next = converted
          break
        }
      }
    }

    if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      const object: { [key: string]: unknown } = Object.fromEntries(
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
          delete object[key]
        } else {
          object[key] = coerce(object[key], property)
        }
      }
      const patterns = Object.entries(schema.patternProperties ?? {})
      for (const [pattern, property] of patterns) {
        const expression = new RegExp(pattern)
        const keys = Object.keys(object)
        for (const key of keys) {
          if (expression.test(key)) {
            knownKeys.add(key)
            object[key] = coerce(object[key], property)
          }
        }
      }
      if (typeof schema.additionalProperties === 'object') {
        const entries = Object.entries(object)
        for (const [key, entry] of entries) {
          if (!knownKeys.has(key))
            object[key] = coerce(entry, schema.additionalProperties)
        }
      }
      next = object
    }
    if (Array.isArray(next)) {
      const tuple: Array<JSONSchema> | undefined =
        schema.prefixItems ??
        (Array.isArray(schema.items) ? schema.items : undefined)
      for (let index = 0; index < next.length; index++) {
        const item =
          tuple?.[index] ??
          (!Array.isArray(schema.items) ? schema.items : undefined)
        if (item && typeof item === 'object')
          next[index] = coerce(next[index], item)
      }
    }
    if (schema.if !== undefined) {
      const branch = check(schema.if, next) ? schema.then : schema.else
      if (branch) next = coerce(next, branch, nextSeen, required)
    }
    return next
  }
  return coerce(structuredClone(value), root)
}

function validateJsonInput(
  schema: JSONSchema | boolean,
  received: unknown,
  toolName: string,
) {
  const validator = validatorFor(schema)
  const converted =
    typeof schema === 'boolean'
      ? structuredClone(received)
      : coerceArguments(received, schema)
  if (validator.Check(converted)) return converted
  const errors = validator
    .Errors(converted)
    .map((error) => `${error.instancePath || 'root'}: ${error.message}`)
    .join(', ')
  throw new Error(
    `Input validation failed for tool ${toolName}: ${errors}\nReceived arguments:\n${receivedArgumentsText(received)}`,
  )
}

function receivedArgumentsText(received: unknown) {
  try {
    return JSON.stringify(received, null, 2) ?? String(received)
  } catch {
    return '[Arguments cannot be serialized as JSON]'
  }
}

function standardInputError(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  receivedArguments: string,
  toolName: string,
) {
  const error = new StandardSchemaValidationError(issues)
  error.message = `Input validation failed for tool ${toolName}: ${error.message}\nReceived arguments:\n${receivedArguments}`
  return error
}

/** Check final tool input. Raw JSON Schema arguments use a copy. */
export async function validateToolInput(
  schema: SchemaInput | boolean | undefined,
  received: unknown,
  toolName: string,
) {
  if (schema === undefined) {
    return received !== null && typeof received === 'object' ? received : {}
  }
  if (typeof schema === 'boolean')
    return validateJsonInput(schema, received, toolName)
  if (!isStandardSchema(schema)) {
    const jsonSchema = convertSchemaToJsonSchema(schema)
    return jsonSchema
      ? validateJsonInput(jsonSchema, received, toolName)
      : received
  }
  const first = await schema['~standard'].validate(received)
  if (!first.issues) return first.value
  const receivedArguments = receivedArgumentsText(received)
  if (!isStandardJSONSchema(schema))
    throw standardInputError(first.issues, receivedArguments, toolName)
  let jsonSchema: JSONSchema | undefined
  try {
    jsonSchema = convertSchemaToJsonSchema(schema, { io: 'input' })
  } catch {
    throw standardInputError(first.issues, receivedArguments, toolName)
  }
  if (!jsonSchema)
    throw standardInputError(first.issues, receivedArguments, toolName)
  let converted: unknown
  try {
    converted = validateJsonInput(jsonSchema, received, toolName)
  } catch {
    throw standardInputError(first.issues, receivedArguments, toolName)
  }
  const retried = await schema['~standard'].validate(converted)
  if (retried.issues)
    throw standardInputError(first.issues, receivedArguments, toolName)
  return retried.value
}
