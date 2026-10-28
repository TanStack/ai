import { undoNullWidening } from '@tanstack/ai-utils'
import {
  isStrictModeCompatible,
  makeStructuredOutputCompatibleWithMap,
} from './schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { NullWideningMap } from '@tanstack/ai-utils'
import type { StructuredOutputCompatibility } from './schema-converter'

type ToolInputNormalizer = (toolName: string, input: unknown) => unknown

type SchemaConverterWithMap = (
  schema: Record<string, any>,
  originalRequired?: Array<string>,
) => StructuredOutputCompatibility

/**
 * Build the inverse transform for the strict tool schemas sent in one request.
 * Pass the same converter the request used so subclass schema tweaks stay
 * aligned with undo. Non-strict tools are excluded because they were not
 * null-widened on the wire.
 */
export function createToolInputNormalizer(
  tools: Array<Tool> | undefined,
  convertSchema: SchemaConverterWithMap = makeStructuredOutputCompatibleWithMap,
): ToolInputNormalizer {
  const maps = new Map<string, NullWideningMap>()
  const seenNames = new Set<string>()
  const ambiguousNames = new Set<string>()

  for (const tool of tools ?? []) {
    if (ambiguousNames.has(tool.name)) continue
    if (seenNames.has(tool.name)) {
      maps.delete(tool.name)
      ambiguousNames.add(tool.name)
      continue
    }
    seenNames.add(tool.name)

    const inputSchema = (tool.inputSchema ?? {
      type: 'object',
      properties: {},
      required: [],
    }) as JSONSchema
    if (!isStrictModeCompatible(inputSchema)) continue

    const { nullWideningMap } = convertSchema(
      inputSchema,
      inputSchema.required || [],
    )
    if (nullWideningMap) maps.set(tool.name, nullWideningMap)
  }

  return (toolName, input) => undoNullWidening(input, maps.get(toolName))
}
