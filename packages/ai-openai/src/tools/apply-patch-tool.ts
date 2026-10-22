import { applyPatchTool as baseApplyPatchTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'

export {
  type ApplyPatchToolConfig,
  convertApplyPatchToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIApplyPatchTool = ProviderTool<'openai', 'apply_patch'>

/**
 * Creates a standard Tool from ApplyPatchToolConfig parameters, branded as an
 * OpenAI provider tool.
 */
export function applyPatchTool(): OpenAIApplyPatchTool {
  return baseApplyPatchTool() as OpenAIApplyPatchTool
}
