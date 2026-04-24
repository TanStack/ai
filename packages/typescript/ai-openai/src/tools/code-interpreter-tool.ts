import type { ProviderTool } from '@tanstack/ai'
import type { CodeInterpreterToolConfig } from '@tanstack/openai-base'

export {
  type CodeInterpreterToolConfig,
  type CodeInterpreterTool,
  convertCodeInterpreterToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAICodeInterpreterTool = ProviderTool<
  'openai',
  'code_interpreter'
>

/**
 * Creates a standard Tool from CodeInterpreterTool parameters, branded as an
 * OpenAI provider tool.
 */
export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): OpenAICodeInterpreterTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'code_interpreter',
    description: 'Execute code in a sandboxed environment',
    metadata: {
      type: 'code_interpreter',
      container,
    },
  } as unknown as OpenAICodeInterpreterTool
}
