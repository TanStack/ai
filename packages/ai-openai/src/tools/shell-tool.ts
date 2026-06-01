import { shellTool as baseShellTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'

export {
  type ShellToolConfig,
  type ShellTool,
  convertShellToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIShellTool = ProviderTool<'openai', 'shell'>

/**
 * Creates a standard Tool from ShellTool parameters, branded as an OpenAI provider tool.
 */
export function shellTool(): OpenAIShellTool {
  return baseShellTool() as OpenAIShellTool
}
