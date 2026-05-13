import { applyPatchTool as baseApplyPatchTool } from '@tanstack/ai-openai-compatible'
import type { ProviderTool } from '@tanstack/ai'

export {
  type ApplyPatchToolConfig,
  type ApplyPatchTool,
  convertApplyPatchToolToAdapterFormat,
} from '@tanstack/ai-openai-compatible'

export type OpenAIApplyPatchTool = ProviderTool<'openai', 'apply_patch'>

/**
 * Creates a standard Tool from ApplyPatchTool parameters, branded as an
 * OpenAI provider tool.
 */
export function applyPatchTool(): OpenAIApplyPatchTool {
  return baseApplyPatchTool() as OpenAIApplyPatchTool
}
