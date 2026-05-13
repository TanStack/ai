import { localShellTool as baseLocalShellTool } from '@tanstack/openai-compatible'
import type { ProviderTool } from '@tanstack/ai'

export {
  type LocalShellToolConfig,
  type LocalShellTool,
  convertLocalShellToolToAdapterFormat,
} from '@tanstack/openai-compatible'

export type OpenAILocalShellTool = ProviderTool<'openai', 'local_shell'>

/**
 * Creates a standard Tool from LocalShellTool parameters, branded as an
 * OpenAI provider tool.
 */
export function localShellTool(): OpenAILocalShellTool {
  return baseLocalShellTool() as OpenAILocalShellTool
}
