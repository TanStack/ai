import { makeGrokStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type OpenAI from 'openai'

/**
 * Responses-API function tool shape (flat, no nested `function` object).
 * The Grok text adapter targets `/v1/responses`, which uses this format.
 */
export type FunctionTool = OpenAI.Responses.FunctionTool

/**
 * Converts a standard Tool to a Grok Responses-API function tool.
 *
 * Tool schemas arrive as JSON Schema (already converted in the ai layer).
 * We apply Grok-specific transformations for strict mode:
 * - All properties moved into the `required` array
 * - Optional fields become nullable
 * - `additionalProperties: false`
 *
 * Strict mode is always on so the model returns clean, validated arguments.
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  const jsonSchema = makeGrokStructuredOutputCompatible(
    inputSchema,
    inputSchema.required || [],
  )

  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema,
    strict: true,
  } satisfies FunctionTool
}
