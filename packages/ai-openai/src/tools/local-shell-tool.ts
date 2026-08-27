import { localShellTool as baseLocalShellTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'

export {
  type LocalShellToolConfig,
  type LocalShellTool,
  convertLocalShellToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAILocalShellTool = ProviderTool<'openai', 'local_shell'>

export function localShellTool(): OpenAILocalShellTool {
  return baseLocalShellTool() as OpenAILocalShellTool
}
