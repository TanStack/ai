import type { ToolConfiguration, ToolChoice } from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'

export interface ConverseToolInput {
  name: string
  description?: string
  inputSchema: unknown
}

export type ToolChoiceInput =
  | 'auto'
  | 'required'
  | 'none'
  | { type: 'tool'; name: string }

export function toToolConfig(
  tools: ConverseToolInput[],
  choice: ToolChoiceInput | undefined,
): ToolConfiguration | undefined {
  if (!tools.length) return undefined
  const toolChoice = mapChoice(choice)
  return {
    tools: tools.map((t) => ({
      toolSpec: {
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        inputSchema: { json: t.inputSchema as DocumentType },
      },
    })),
    ...(toolChoice ? { toolChoice } : {}),
  }
}

function mapChoice(choice: ToolChoiceInput | undefined): ToolChoice | undefined {
  if (!choice || choice === 'auto') return { auto: {} }
  if (choice === 'required') return { any: {} }
  if (choice === 'none') return undefined
  return { tool: { name: choice.name } }
}
