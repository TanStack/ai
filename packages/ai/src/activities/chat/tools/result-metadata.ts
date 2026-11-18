import { appMetadata } from '../../../utilities/merge-metadata'
import { errorMessage } from '../../../utilities/errors'
import { isStandardSchema, parseWithStandardSchema } from './schema-converter'
import type { AnyTool } from '../../../types'

/**
 * Collect the result metadata that one tool call sets.
 *
 * `set` merges the top-level keys. A later key replaces an earlier key.
 * A key set to `undefined` is removed. The reserved `tanstack` key is dropped.
 * `get` returns `undefined` when no key is left.
 */
export function createResultMetadataCollector() {
  let current: Record<string, unknown> | undefined
  return {
    set(value: Record<string, unknown>) {
      const entries = Object.entries({ ...current, ...value })
      current = appMetadata(
        Object.fromEntries(entries.filter(([, entry]) => entry !== undefined)),
      )
    },
    get() {
      return current
    },
  }
}

function reasonOf(error: unknown) {
  return errorMessage(error) ?? String(error)
}

/**
 * Check the result metadata of a tool call before it leaves the engine.
 *
 * Returns a plain JSON copy of `value`. When the tool has a Standard Schema
 * `resultMetadataSchema`, returns the parsed value. A JSON Schema is not
 * checked at runtime, the same as `outputSchema`.
 *
 * Throws an `Error` when the value cannot become JSON or the schema check fails.
 */
export function finalizeResultMetadata(
  tool: AnyTool,
  value: Record<string, unknown> | undefined,
) {
  if (value === undefined) return undefined
  let json: Record<string, unknown>
  try {
    json = JSON.parse(JSON.stringify(value))
  } catch (error) {
    throw new Error(
      `Result metadata for tool ${tool.name} is not JSON: ${reasonOf(error)}`,
    )
  }
  if (!isStandardSchema(tool.resultMetadataSchema)) return json
  try {
    return parseWithStandardSchema<Record<string, unknown>>(
      tool.resultMetadataSchema,
      json,
    )
  } catch (error) {
    throw new Error(
      `Result metadata validation failed for tool ${tool.name}: ${reasonOf(error)}`,
    )
  }
}
