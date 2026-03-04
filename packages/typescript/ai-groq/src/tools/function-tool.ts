import { makeGroqStructuredOutputCompatible } from '../utils/schema-converter'
import type { JSONSchema, Tool } from '@tanstack/ai'
import type { ChatCompletionTool } from '../message-types'

export type FunctionTool = ChatCompletionTool

/**
 * Converts a standard Tool to Groq ChatCompletionTool format.
 *
 * Tool schemas are already converted to JSON Schema in the ai layer.
 * We apply Groq-specific transformations for strict mode:
 * - All properties in required array
 * - Optional fields made nullable
 * - additionalProperties: false
 */
export function convertFunctionToolToAdapterFormat(tool: Tool): FunctionTool {
    const inputSchema = (tool.inputSchema ?? {
        type: 'object',
        properties: {},
        required: [],
    }) as JSONSchema

    const jsonSchema = makeGroqStructuredOutputCompatible(
        inputSchema,
        inputSchema.required || [],
    )

    jsonSchema.additionalProperties = false

    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: jsonSchema,
            strict: true,
        },
    } satisfies FunctionTool
}
