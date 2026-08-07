import {
  canonicalInterruptJson,
  digestInterruptJson,
} from '../../../interrupt-serialization'
import { isStandardJSONSchema, isStandardSchema } from './schema-converter'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { JSONSchema, SchemaInput } from '../../../types'
import type { ApprovalSchemaConfig } from './tool-definition'

export interface NormalizedSchemaInput {
  source: SchemaInput
  validator?: StandardSchemaV1
  jsonSchema?: JSONSchema
}

export interface NormalizedApprovalSchema {
  branches: {
    approve: NormalizedSchemaInput | null
    reject: NormalizedSchemaInput | null
  }
  responseSchema: JSONSchema
  responseSchemaHash: string
  approvalSchemaHash: string
}

const jsonSchemaKeywords = new Set([
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'oneOf',
  'anyOf',
  'allOf',
  'enum',
  'const',
  'format',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  )
}

function isRawJsonSchema(value: unknown): value is JSONSchema {
  return (
    isPlainRecord(value) &&
    Object.keys(value).some((key) => jsonSchemaKeywords.has(key))
  )
}

function isSchemaInput(value: unknown): value is SchemaInput {
  return (
    isStandardSchema(value) ||
    isStandardJSONSchema(value) ||
    isRawJsonSchema(value)
  )
}

function isApprovalBranchMap(
  value: unknown,
): value is { approve?: SchemaInput; reject?: SchemaInput } {
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((key) => key === 'approve' || key === 'reject') &&
    keys.every((key) => isSchemaInput(value[key]))
  )
}

function toJsonSchema(value: Record<string, unknown>): JSONSchema {
  const result: JSONSchema = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = item
  }
  return result
}

function schemaToWire(schema: SchemaInput): NormalizedSchemaInput {
  if (isStandardSchema(schema)) {
    const jsonSchema = isStandardJSONSchema(schema)
      ? toJsonSchema(
          schema['~standard'].jsonSchema.input({
            target: 'draft-2020-12',
          }),
        )
      : undefined
    return {
      source: schema,
      validator: schema,
      ...(jsonSchema !== undefined && { jsonSchema }),
    }
  }
  if (isRawJsonSchema(schema)) {
    // The library does not compile or validate raw JSON Schema; it is carried
    // on the wire and hashed as-is. Validation is the application's job.
    return { source: schema, jsonSchema: schema }
  }
  throw new TypeError('Expected a supported SchemaInput.')
}

function decisionEnvelope(input: {
  approved: boolean
  payload: NormalizedSchemaInput | null
  inputSchema: NormalizedSchemaInput | null
}): JSONSchema {
  const properties: Record<string, JSONSchema> = {
    approved: { const: input.approved },
  }
  const required = ['approved']
  if (input.approved && input.inputSchema) {
    properties['editedArgs'] = input.inputSchema.jsonSchema ?? {}
  }
  if (input.payload) {
    properties['payload'] = input.payload.jsonSchema ?? {}
    required.push('payload')
  }
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

export function normalizeApprovalSchema(
  approvalSchema: ApprovalSchemaConfig | undefined,
  inputSchema?: SchemaInput,
): NormalizedApprovalSchema {
  const normalizedInput =
    inputSchema === undefined ? null : schemaToWire(inputSchema)
  let approve: NormalizedSchemaInput | null = null
  let reject: NormalizedSchemaInput | null = null

  if (approvalSchema !== undefined) {
    if (isStandardSchema(approvalSchema) || isRawJsonSchema(approvalSchema)) {
      approve = schemaToWire(approvalSchema)
      reject = approve
    } else if (isApprovalBranchMap(approvalSchema)) {
      approve =
        approvalSchema.approve === undefined
          ? null
          : schemaToWire(approvalSchema.approve)
      reject =
        approvalSchema.reject === undefined
          ? null
          : schemaToWire(approvalSchema.reject)
    } else {
      throw new TypeError(
        'approvalSchema must be a SchemaInput or a nonempty map containing approve or reject.',
      )
    }
  }

  const responseSchema: JSONSchema = {
    oneOf: [
      decisionEnvelope({
        approved: true,
        payload: approve,
        inputSchema: normalizedInput,
      }),
      decisionEnvelope({
        approved: false,
        payload: reject,
        inputSchema: null,
      }),
    ],
  }
  const responseCanonical = canonicalInterruptJson(responseSchema)
  const approvalCanonical = canonicalInterruptJson({
    approve: approve?.jsonSchema ?? null,
    reject: reject?.jsonSchema ?? null,
  })

  return {
    branches: { approve, reject },
    responseSchema,
    responseSchemaHash: digestInterruptJson(responseCanonical),
    approvalSchemaHash: digestInterruptJson(approvalCanonical),
  }
}

export function hashSchemaInput(schema: SchemaInput | undefined): string {
  if (schema === undefined) return digestInterruptJson('undefined')
  const normalized = schemaToWire(schema)
  const identity = normalized.jsonSchema ?? {
    standardValidator: 'unserialized',
  }
  return digestInterruptJson(canonicalInterruptJson(identity))
}
