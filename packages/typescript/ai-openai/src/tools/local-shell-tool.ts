import type { ProviderTool } from '@tanstack/ai'

export {
  type LocalShellToolConfig,
  type LocalShellTool,
  convertLocalShellToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAILocalShellTool = ProviderTool<'openai', 'local_shell'>

/**
 * Creates a standard Tool from LocalShellTool parameters, branded as an
 * OpenAI provider tool.
 */
export function localShellTool(): OpenAILocalShellTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'local_shell',
    description: 'Execute local shell commands',
    metadata: {},
  } as unknown as OpenAILocalShellTool
}
