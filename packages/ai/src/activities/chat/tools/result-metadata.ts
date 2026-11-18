import { appMetadata } from '../../../utilities/merge-metadata'
import { errorMessage } from '../../../utilities/errors'
import {
  StandardSchemaValidationError,
  isStandardSchema,
  validateWithStandardSchema,
} from './schema-converter'
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

/** A plain JSON copy of `value`. Throws when it cannot become JSON. */
function jsonCopy(toolName: string, value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    throw new Error(
      `Result metadata for tool ${toolName} is not JSON: ${reasonOf(error)}`,
    )
  }
}

/**
 * Check the result metadata of a tool call before it leaves the engine.
 *
 * Returns a plain JSON copy of `value` without the reserved `tanstack` key.
 * When the tool has a Standard Schema `resultMetadataSchema`, returns the
 * parsed value. A sync or an async schema works. A JSON Schema is not
 * checked at runtime, the same as `outputSchema`.
 *
 * Throws an `Error` when the value cannot become JSON or the schema check
 * fails. On a failed check the error has only the tool name, because the
 * model sees it. The details go to the server log.
 */
export async function finalizeResultMetadata(
  tool: AnyTool,
  value: Record<string, unknown> | undefined,
) {
  if (value === undefined) return undefined
  const json = jsonCopy(tool.name, value)
  if (!isStandardSchema(tool.resultMetadataSchema)) return appMetadata(json)
  let parsed: unknown
  try {
    const validation = await validateWithStandardSchema<unknown>(
      tool.resultMetadataSchema,
      json,
    )
    if (!validation.success) {
      throw new StandardSchemaValidationError(validation.issues)
    }
    parsed = validation.data
  } catch (error) {
    console.warn(
      `Result metadata validation failed for tool ${tool.name}: ${reasonOf(error)}`,
    )
    throw new Error(`Result metadata validation failed for tool ${tool.name}`)
  }
  // A schema transform can return a value that is not JSON, or that has
  // the reserved `tanstack` key again.
  return appMetadata(jsonCopy(tool.name, parsed))
}

/**
 * Check the result metadata of a middleware decision (`skip` or
 * `replaceResult`). Returns a plain JSON copy without the reserved
 * `tanstack` key. Metadata that cannot become JSON is dropped with a
 * warning, so the result stays.
 */
export function middlewareResultMetadata(
  toolName: string,
  value: Record<string, unknown> | undefined,
) {
  if (value === undefined) return undefined
  try {
    return appMetadata(jsonCopy(toolName, value))
  } catch (error) {
    console.warn(`Dropped middleware result metadata: ${reasonOf(error)}`)
    return undefined
  }
}
