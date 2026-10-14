import {
  StandardSchemaValidationError,
  isStandardSchema,
  validateWithStandardSchema,
} from './schema-converter'
import type { SchemaInput } from '../../../types'

/**
 * The final check of a tool input, just before the tool runs or the client
 * gets the call. A Standard Schema runs here (an async validator too), and
 * its output is the input, so transforms apply once.
 */
export async function validateToolInput(
  schema: SchemaInput | undefined,
  received: unknown,
  toolName: string,
): Promise<unknown> {
  if (!isStandardSchema(schema)) return received
  const validation = await validateWithStandardSchema<unknown>(schema, received)
  if (validation.success) return validation.data
  const error = new StandardSchemaValidationError(validation.issues)
  error.message = `Input validation failed for tool ${toolName}: ${error.message}`
  throw error
}
