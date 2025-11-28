import type OpenAI from 'openai'
import { z } from 'zod'
import type { Tool } from '@tanstack/ai'

export type ApplyPatchTool = OpenAI.Responses.ApplyPatchTool

/**
 * Converts a standard Tool to OpenAI ApplyPatchTool format
 */
export function convertApplyPatchToolToAdapterFormat(
  _tool: Tool,
): ApplyPatchTool {
  return {
    type: 'apply_patch',
  }
}

/**
 * Creates a standard Tool from ApplyPatchTool parameters
 */
export function applyPatchTool(): Tool {
  return {
    name: 'apply_patch',
    description: 'Apply a patch to modify files',
    inputSchema: z.object({}),
    metadata: {},
  }
}
