import type { ProviderTool } from '@tanstack/ai'

export {
  type ApplyPatchToolConfig,
  type ApplyPatchTool,
  convertApplyPatchToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIApplyPatchTool = ProviderTool<'openai', 'apply_patch'>

/**
 * Creates a standard Tool from ApplyPatchTool parameters, branded as an
 * OpenAI provider tool.
 */
export function applyPatchTool(): OpenAIApplyPatchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'apply_patch',
    description: 'Apply a patch to modify files',
    metadata: {},
  } as unknown as OpenAIApplyPatchTool
}
