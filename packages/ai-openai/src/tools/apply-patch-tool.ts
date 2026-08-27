import { applyPatchTool as baseApplyPatchTool } from '@tanstack/openai-base'
import type { ProviderTool } from '@tanstack/ai'

export {
  type ApplyPatchToolConfig,
  type ApplyPatchTool,
  convertApplyPatchToolToAdapterFormat,
} from '@tanstack/openai-base'

export type OpenAIApplyPatchTool = ProviderTool<'openai', 'apply_patch'>

export function applyPatchTool(): OpenAIApplyPatchTool {
  return baseApplyPatchTool() as OpenAIApplyPatchTool
}
