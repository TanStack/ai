import { codeInterpreterTool as baseCodeInterpreterTool } from '@tanstack/openai-base'
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

export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): OpenAICodeInterpreterTool {
  return baseCodeInterpreterTool(container) as OpenAICodeInterpreterTool
}
