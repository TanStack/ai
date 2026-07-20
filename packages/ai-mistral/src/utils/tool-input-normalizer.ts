import { undoNullWidening } from '@tanstack/ai-utils'
import { makeMistralStructuredOutputCompatibleWithMap } from './schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { NullWideningMap } from '@tanstack/ai-utils'

export type ToolInputNormalizer = (toolName: string, input: unknown) => unknown

/** Build an inverse transform for the strict tool schemas sent in one request. */
export function createToolInputNormalizer(
  tools: Array<Tool> | undefined,
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
    const { nullWideningMap } = makeMistralStructuredOutputCompatibleWithMap(
      inputSchema,
      inputSchema.required || [],
    )
    if (nullWideningMap) maps.set(tool.name, nullWideningMap)
  }

  return (toolName, input) => undoNullWidening(input, maps.get(toolName))
}
