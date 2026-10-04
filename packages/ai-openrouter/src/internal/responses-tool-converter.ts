import { undoNullWidening } from '@tanstack/ai-utils'
import { makeStructuredOutputCompatible } from './schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { NullWideningMap } from '@tanstack/ai-utils'

/**
 * Responses API function tool format.
 *
 * Matches OpenRouter's `ResponsesRequestToolFunction` shape exactly:
 *   { type: 'function', name: string, description?: string, parameters: object, strict?: boolean }
 */
export interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string | null
  parameters: Record<string, any> | null
  strict: boolean | null
}

/**
 * Converts a standard Tool to the Responses API FunctionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply OpenAI-compatible transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for all tools automatically.
 */
export function convertFunctionToolToResponsesFormat(
  tool: Tool,
  schemaConverter: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any> = makeStructuredOutputCompatible,
): ResponsesFunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  // Shallow-copy the converter's result before mutating — a subclass-supplied
  // schemaConverter has no contract requirement to return a fresh object;
  // mutating in place could corrupt the caller's tool definition.
  const jsonSchema = {
    ...schemaConverter(inputSchema, inputSchema.required || []),
  }
  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true,
  }
}

function allowsNull(schema: JSONSchema | undefined): boolean {
  if (!schema || typeof schema !== 'object') return false
  if (schema.type === 'null') return true
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true
  if (Array.isArray(schema.enum) && schema.enum.includes(null)) return true
  return Array.isArray(schema.anyOf) && schema.anyOf.some(allowsNull)
}

/**
 * Diff the original tool schema against the strict wire schema and mark every
 * position where the converter added `null`. Diffing the actual wire schema
 * keeps the map aligned with a subclass-supplied `schemaConverter`. A field
 * that already allowed `null` (`.nullable()`, `.nullish()`) is not marked, so
 * its `null` survives.
 */
function diffNullWidening(
  original: JSONSchema | undefined,
  wire: JSONSchema | undefined,
): NullWideningMap | undefined {
  if (!original || !wire || typeof original !== 'object') return undefined
  const map: NullWideningMap = {}
  if (allowsNull(wire) && !allowsNull(original)) map.widened = true

  if (original.properties && wire.properties) {
    const properties: Record<string, NullWideningMap> = {}
    for (const key of Object.keys(wire.properties)) {
      const child = diffNullWidening(
        original.properties[key],
        wire.properties[key],
      )
      if (child) properties[key] = child
    }
    if (Object.keys(properties).length > 0) map.properties = properties
  }

  if (
    original.items &&
    wire.items &&
    !Array.isArray(original.items) &&
    !Array.isArray(wire.items)
  ) {
    const items = diffNullWidening(original.items, wire.items)
    if (items) map.items = items
  }

  // A `.nullable()` object reaches the wire as `anyOf: [object, null]`, and
  // the converter widens inside the object variant. Descend into that one
  // variant. A union of several shapes is ambiguous, so it is left alone.
  const nonNullVariants = (schema: JSONSchema) =>
    (schema.anyOf ?? []).filter((variant) => variant.type !== 'null')
  const originalVariants = nonNullVariants(original)
  const wireVariants = nonNullVariants(wire)
  if (originalVariants.length === 1 && wireVariants.length === 1) {
    const inner = diffNullWidening(originalVariants[0], wireVariants[0])
    if (inner?.properties) map.properties = inner.properties
    if (inner?.items) map.items = inner.items
  }

  return Object.keys(map).length > 0 ? map : undefined
}

/**
 * Build the inverse of the strict null-widening applied to the tools of one
 * request. Strict tools reach the model with every optional field promoted to
 * required + nullable, so the model sends `null` for an omitted optional. The
 * returned function strips exactly those synthesized nulls, so the engine
 * validates the input against the original schema and `execute` sees the
 * field as absent. Pass the same converter the request used.
 */
export function createToolInputNormalizer(
  tools: Array<Tool> | undefined,
  schemaConverter?: Parameters<typeof convertFunctionToolToResponsesFormat>[1],
): (toolName: string, input: unknown) => unknown {
  const maps = new Map<string, NullWideningMap>()
  for (const tool of tools ?? []) {
    const map = diffNullWidening(
      tool.inputSchema,
      convertFunctionToolToResponsesFormat(tool, schemaConverter).parameters ??
        undefined,
    )
    if (map) maps.set(tool.name, map)
  }
  return (toolName, input) => undoNullWidening(input, maps.get(toolName))
}
