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
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'shell',
    description: 'Execute shell commands',
    metadata: {},
  } as unknown as OpenAIShellTool
}
