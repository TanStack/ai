import { isRecord } from './utils'

/** The JSON type of `value`, as JSON Schema names it. */
function typeOf(value: unknown) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  return typeof value
}

function hasType(value: unknown, type: unknown) {
  const actual = typeOf(value)
  // An integer is a number too.
  return type === actual || (type === 'number' && actual === 'integer')
}

const isSame = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * The problems of `value` against the JSON Schema `schema`. Empty: the value
 * fits. It checks the keywords that wait schemas use (`type`, `enum`,
 * `const`, `properties`, `required`, `additionalProperties: false`, `items`,
 * the length and size limits, `anyOf`, and `oneOf`). It ignores the others,
 * so an unknown keyword never refuses an answer.
 */
// ponytail: a subset of JSON Schema, for the answers of waits. Add a keyword when a wait schema needs it.
export function jsonSchemaIssues(
  schema: unknown,
  value: unknown,
  path = '',
): Array<string> {
  if (!isRecord(schema)) return []
  const at = path === '' ? 'The answer' : `The answer at ${path}`
  const issues: Array<string> = []
  const { type } = schema
  const types = Array.isArray(type) ? type : type === undefined ? [] : [type]
  if (types.length > 0 && !types.some((entry) => hasType(value, entry))) {
    return [`${at} must be ${types.join(' or ')}.`]
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((entry) => isSame(entry, value))
  ) {
    issues.push(`${at} must be one of ${JSON.stringify(schema.enum)}.`)
  }
  if ('const' in schema && !isSame(schema.const, value)) {
    issues.push(`${at} must be ${JSON.stringify(schema.const)}.`)
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      issues.push(`${at} needs ${schema.minLength} characters or more.`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      issues.push(`${at} has more than ${schema.maxLength} characters.`)
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      issues.push(`${at} must be ${schema.minimum} or more.`)
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      issues.push(`${at} must be ${schema.maximum} or less.`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      issues.push(`${at} needs ${schema.minItems} items or more.`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      issues.push(`${at} has more than ${schema.maxItems} items.`)
    const texts = value.map((item) => JSON.stringify(item))
    if (schema.uniqueItems === true && new Set(texts).size !== texts.length)
      issues.push(`${at} has an item twice.`)
    if (isRecord(schema.items)) {
      value.forEach((item, index) =>
        issues.push(...jsonSchemaIssues(schema.items, item, `${path}[${index}]`)),
      )
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required) ? schema.required : []
    for (const key of required) {
      if (typeof key === 'string' && !(key in value)) {
        issues.push(`${at} needs the field ${key}.`)
      }
    }
    for (const [key, field] of Object.entries(value)) {
      const name = path === '' ? key : `${path}.${key}`
      if (key in properties) {
        issues.push(...jsonSchemaIssues(properties[key], field, name))
      } else if (schema.additionalProperties === false) {
        issues.push(`${at} has the unknown field ${key}.`)
      }
    }
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const options = schema[keyword]
    if (!Array.isArray(options) || options.length === 0) continue
    const fits = options.filter(
      (option) => jsonSchemaIssues(option, value, path).length === 0,
    ).length
    const isFit = keyword === 'anyOf' ? fits > 0 : fits === 1
    if (!isFit) issues.push(`${at} does not fit the schema.`)
  }
  return issues
}

/**
 * A Standard Schema with a JSON Schema export, in the shape that
 * `defineInterrupt` takes. The package does not depend on
 * `@standard-schema/spec`, so this is the part of it that a wait needs.
 */
export interface JsonStandardSchema<T> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly types?: { readonly input: T; readonly output: T }
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: T; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<{ readonly message: string }> }
    readonly jsonSchema: {
      readonly input: (options: unknown) => Record<string, unknown>
      readonly output: (options: unknown) => Record<string, unknown>
    }
  }
}

/**
 * A plain JSON Schema as a Standard Schema with a JSON Schema export, so a
 * core interrupt can name it as its `responseSchema`. It checks values with
 * {@link jsonSchemaIssues}.
 */
export function standardJsonSchema<T = unknown>(
  json: Record<string, unknown>,
): JsonStandardSchema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'tanstack-harness',
      validate: (value) => {
        const issues = jsonSchemaIssues(json, value)
        // The checks above make it a `T`.
        return issues.length === 0
          ? { value: value as T }
          : { issues: issues.map((message) => ({ message })) }
      },
      jsonSchema: { input: () => json, output: () => json },
    },
  }
}
