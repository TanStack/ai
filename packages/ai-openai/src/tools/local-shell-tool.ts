import { localShellTool as baseLocalShellTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'

export {
  type LocalShellToolConfig,
  convertLocalShellToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAILocalShellTool = ProviderTool<'openai', 'local_shell'>

/**
 * Creates a standard Tool from LocalShellToolConfig parameters, branded as an
 * OpenAI provider tool.
 */
export function localShellTool(): OpenAILocalShellTool {
  return baseLocalShellTool() as OpenAILocalShellTool
}
