import { openAIProviderTool } from './openai-provider-tool'
import type { ApplyPatchTool as ApplyPatchToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { ApplyPatchToolConfig }

/** @deprecated Renamed to `ApplyPatchToolConfig`. Will be removed in a future release. */
export type ApplyPatchTool = ApplyPatchToolConfig

export function convertApplyPatchToolToAdapterFormat(
  _tool: Tool,
): ApplyPatchToolConfig {
  return {
    type: 'apply_patch',
  }
}

export function applyPatchTool(): Tool {
  return openAIProviderTool(
    {
      name: 'apply_patch',
      description: 'Apply a patch to modify files',
      metadata: {},
    },
    'apply_patch',
  )
}
