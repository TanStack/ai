import {
  isStrictModeCompatible,
  makeStructuredOutputCompatible,
  stripUnsupportedFormats,
} from '../utils/schema-converter'
import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import type { JSONSchema, Tool } from '@tanstack/ai'

export type ChatCompletionFunctionTool = Extract<
  ChatCompletionTool,
  { type: 'function' }
>

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
