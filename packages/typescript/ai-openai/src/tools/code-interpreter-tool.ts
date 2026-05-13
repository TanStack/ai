import { codeInterpreterTool as baseCodeInterpreterTool } from '@tanstack/ai-openai-compatible'
import type { ProviderTool } from '@tanstack/ai'
import type { CodeInterpreterToolConfig } from '@tanstack/ai-openai-compatible'

export {
  type CodeInterpreterToolConfig,
  type CodeInterpreterTool,
  convertCodeInterpreterToolToAdapterFormat,
} from '@tanstack/ai-openai-compatible'

export type OpenAICodeInterpreterTool = ProviderTool<
  'openai',
  'code_interpreter'
>

/**
 * Creates a standard Tool from CodeInterpreterTool parameters, branded as an
 * OpenAI provider tool. Delegates construction to the base factory and brands
 * the result via a phantom-typed `ProviderTool` cast.
 */
export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): OpenAICodeInterpreterTool {
  return baseCodeInterpreterTool(container) as OpenAICodeInterpreterTool
}
