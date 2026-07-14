import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { ErrorObject } from 'ajv'
import type { JSONSchema } from '../../../types'

export interface JsonSchemaValidationIssue {
  keyword: string
  message: string
  path: ReadonlyArray<string | number>
}

export class JsonSchemaCompilationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'JsonSchemaCompilationError'
  }
}

const draft202012 = 'https://json-schema.org/draft/2020-12/schema'

function decodePointer(pointer: string): Array<string> {
  if (pointer === '') return []
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function issuePath(error: ErrorObject): Array<string> {
  const path = decodePointer(error.instancePath)
  if (error.keyword === 'required') {
    path.push(String(error.params['missingProperty']))
  }
  if (error.keyword === 'additionalProperties') {
    path.push(String(error.params['additionalProperty']))
  }
  return path
}

function assertSupportedSchemaTree(
  schema: unknown,
): asserts schema is JSONSchema {
  const active = new WeakSet<object>()

  const visit = (value: unknown): void => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return
      throw new JsonSchemaCompilationError(
        'Schema values must be JSON-compatible.',
      )
    }
    if (typeof value !== 'object') {
      throw new JsonSchemaCompilationError(
        'Schema values must be JSON-compatible.',
      )
    }
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new JsonSchemaCompilationError(
        'Schema nodes must be plain JSON objects.',
      )
    }
    if (active.has(value)) {
      throw new JsonSchemaCompilationError(
        'Schema values must not contain cycles.',
      )
    }

    active.add(value)
    if (Array.isArray(value)) {
      value.forEach(visit)
      active.delete(value)
      return
    }

    const record = value as Record<string, unknown>
    if (
      typeof record['$schema'] === 'string' &&
      record['$schema'] !== draft202012
    ) {
      throw new JsonSchemaCompilationError('Only Draft 2020-12 is supported.')
    }
    if (typeof record['$ref'] === 'string' && !record['$ref'].startsWith('#')) {
      throw new JsonSchemaCompilationError(
        'Only document-local $ref values are supported.',
      )
    }
    Object.values(record).forEach(visit)
    active.delete(value)
  }

  visit(schema)
}

export function compileJsonSchema202012(
  schema: unknown,
): (value: unknown) => ReadonlyArray<JsonSchemaValidationIssue> {
  assertSupportedSchemaTree(schema)
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
    validateFormats: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  })
  addFormats(ajv, { mode: 'full' })

  let validate
  try {
    validate = ajv.compile(schema)
  } catch (cause) {
    throw new JsonSchemaCompilationError('Invalid Draft 2020-12 schema.', {
      cause,
    })
  }

  return (value) => {
    if (validate(value)) return []
    return (validate.errors ?? []).map((error) => ({
      keyword: error.keyword,
      message: error.message ?? 'Schema validation failed.',
      path: issuePath(error),
    }))
  }
}
