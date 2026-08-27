import {
  brandAnthropicProviderTool,
  getAnthropicProviderToolMetadata,
} from './anthropic-provider-tool'
import type {
  BetaCodeExecutionTool20250522,
  BetaCodeExecutionTool20250825,
} from '@anthropic-ai/sdk/resources/beta'
import { SkillLimitError } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type CodeExecutionToolConfig =
  | BetaCodeExecutionTool20250522
  | BetaCodeExecutionTool20250825

/** @deprecated Renamed to `CodeExecutionToolConfig`. Will be removed in a future release. */
export type CodeExecutionTool = CodeExecutionToolConfig

/**
 * A hosted/managed Anthropic Skill reference. Lifted by the text adapter into
 * the top-level `container.skills` request param (NOT serialized into the
 * `tools[]` entry). Requires the `code_execution` tool to be enabled.
 */
export interface AnthropicContainerSkill {
  /** 1–64 characters. */
  skill_id: string
  type: 'anthropic' | 'custom'
  /** Skill version, or `'latest'` (default) when omitted. */
  version?: string
}

export interface CodeExecutionToolOptions {
  /** Hosted skills to load into the code-execution container (max 8). */
  skills?: Array<AnthropicContainerSkill>
}

interface CodeExecutionToolMetadata {
  config: CodeExecutionToolConfig
  /** Hosted skills to load into the code-execution container (max 8). */
  skills?: Array<AnthropicContainerSkill>
}

export type AnthropicCodeExecutionTool = ProviderTool<
  'anthropic',
  'code_execution'
>

export function convertCodeExecutionToolToAdapterFormat(
  tool: Tool,
): CodeExecutionToolConfig {
  return readCodeExecutionConfig(tool) as CodeExecutionToolConfig
}

/**
 * Reads the SDK tool config attached to a `code_execution` tool, if any.
 * Used by the text adapter to select the version-aware code-execution beta.
 */
export function readCodeExecutionConfig(
  tool: Tool,
): CodeExecutionToolConfig | undefined {
  return (
    getAnthropicProviderToolMetadata(tool) as
      | CodeExecutionToolMetadata
      | undefined
  )?.config
}

/**
 * Reads the hosted skills attached to a `code_execution` tool, if any.
 * Used by the text adapter to build the top-level `container.skills` param.
 */
export function readCodeExecutionSkills(
  tool: Tool,
): Array<AnthropicContainerSkill> | undefined {
  return (
    getAnthropicProviderToolMetadata(tool) as
      | CodeExecutionToolMetadata
      | undefined
  )?.skills
}

export function codeExecutionTool(
  config: CodeExecutionToolConfig,
  options: CodeExecutionToolOptions = {},
): AnthropicCodeExecutionTool {
  const { skills } = options
  if (skills) {
    if (skills.length > 8) {
      throw new SkillLimitError({
        provider: 'anthropic',
        path: 'native',
        limit: 'code_execution supports at most 8 skills per request',
        allowed: 8,
        actual: skills.length,
        offending: skills.map((s) => s.skill_id),
      })
    }
    for (const skill of skills) {
      const skillIdOutOfRange =
        skill.skill_id.length < 1 || skill.skill_id.length > 64
      if (skillIdOutOfRange) {
        throw new Error('skill_id must be between 1 and 64 characters.')
      }
    }
  }
  const metadata: CodeExecutionToolMetadata = {
    config,
    ...(skills && { skills }),
  }
  return brandAnthropicProviderTool<AnthropicCodeExecutionTool>(
    {
      name: 'code_execution',
      description: '',
      metadata,
    },
    'code_execution',
  )
}
