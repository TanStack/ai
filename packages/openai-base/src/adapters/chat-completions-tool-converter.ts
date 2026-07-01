import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  stripUnsupportedFormats,
} from '../utils/schema-converter'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import type { JSONSchema, Tool } from '@tanstack/ai'

/**
 * Chat Completions API tool format. The SDK's `ChatCompletionTool` is the
 * union `ChatCompletionFunctionTool | ChatCompletionCustomTool`; we only
 * emit the function variant here. Re-exported as our own alias so consumers
 * importing the converter's output don't have to reach into the SDK.
 */
export type ChatCompletionFunctionTool = Extract<
  ChatCompletionTool,
  { type: 'function' }
>

/**
 * Converts a standard Tool to OpenAI Chat Completions ChatCompletionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply OpenAI-compatible transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 *
 * This enables strict mode for tools whose schemas fit OpenAI's strict subset.
 *
 * Schemas using keywords outside that subset (`oneOf`/`allOf`/`not`/`$ref`/
 * `$defs` — common with MCP servers like Notion) can't be coerced to a
 * strict-valid shape, and `strict: true` would make the API reject the ENTIRE
 * request with a 400. Such tools are emitted with `strict: false` (their schema
 * passed through, only unsupported `format` keywords stripped) so they stay
 * callable.
 */
export function convertFunctionToolToChatCompletionsFormat(
  tool: Tool,
  schemaConverter: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any> = makeStructuredOutputCompatible,
): ChatCompletionFunctionTool {
  const inputSchema = (tool.inputSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  }) as JSONSchema

  // Schema outside OpenAI's strict subset: send non-strict so the tool still
  // works instead of 400-ing the whole request.
  if (!isStrictModeCompatible(inputSchema)) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: stripUnsupportedFormats(inputSchema),
        strict: false,
      },
    } satisfies ChatCompletionFunctionTool
  }

  // Shallow-copy the converter's result before mutating: a subclass-supplied
  // schemaConverter has no contract requirement to return a fresh object,
  // and a passthrough `(s) => s` would otherwise have its caller's schema
  // mutated by the `additionalProperties = false` assignment below.
  const jsonSchema = {
    ...schemaConverter(inputSchema, inputSchema.required || []),
  }
  jsonSchema.additionalProperties = false

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchema,
      strict: true,
    },
  } satisfies ChatCompletionFunctionTool
}

/**
 * Converts an array of standard Tools to Chat Completions format.
 * Chat Completions API primarily supports function tools.
 */
export function convertToolsToChatCompletionsFormat(
  tools: Array<Tool>,
  schemaConverter?: (
    schema: Record<string, any>,
    required: Array<string>,
  ) => Record<string, any>,
): Array<ChatCompletionFunctionTool> {
  return tools.map((tool) =>
    convertFunctionToolToChatCompletionsFormat(tool, schemaConverter),
  )
}
