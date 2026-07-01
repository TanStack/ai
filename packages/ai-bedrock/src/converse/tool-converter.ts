import type {
  ToolChoice,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime'
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
  tools: Array<ConverseToolInput>,
  choice: ToolChoiceInput | undefined,
): ToolConfiguration | undefined {
  if (!tools.length) return undefined
  // `none` means "don't call tools" — omit the tool config entirely, since
  // Bedrock treats a present tool config with no `toolChoice` as auto.
  if (choice === 'none') return undefined
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

function mapChoice(
  choice: ToolChoiceInput | undefined,
): ToolChoice | undefined {
  if (!choice || choice === 'auto') return { auto: {} }
  if (choice === 'required') return { any: {} }
  // `none` is handled earlier in toToolConfig (omits the tool config); this
  // branch keeps the string union narrowed so `choice.name` type-checks.
  if (choice === 'none') return undefined
  return { tool: { name: choice.name } }
}
