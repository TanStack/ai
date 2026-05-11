import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type ApplyPatchToolConfig = OpenAI.Responses.ApplyPatchTool

/** @deprecated Renamed to `ApplyPatchToolConfig`. Will be removed in a future release. */
export type ApplyPatchTool = ApplyPatchToolConfig

/**
 * Converts a standard Tool to OpenAI ApplyPatchTool format
 */
export function convertApplyPatchToolToAdapterFormat(
  _tool: Tool,
): ApplyPatchToolConfig {
  return {
    type: 'apply_patch',
  }
}

/**
 * Creates a standard Tool from ApplyPatchTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function applyPatchTool(): Tool {
  return {
    name: 'apply_patch',
    description: 'Apply a patch to modify files',
    metadata: {},
  }
}
