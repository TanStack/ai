import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ApplyPatchToolConfig = OpenAI.Responses.ApplyPatchTool

/** @deprecated Renamed to `ApplyPatchToolConfig`. Will be removed in a future release. */
export type ApplyPatchTool = ApplyPatchToolConfig

export type OpenAIApplyPatchTool = ProviderTool<'openai', 'apply_patch'>

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
 * Creates a standard Tool from ApplyPatchTool parameters
 */
export function applyPatchTool(): OpenAIApplyPatchTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'apply_patch',
    description: 'Apply a patch to modify files',
    metadata: {},
  } as unknown as OpenAIApplyPatchTool
}
