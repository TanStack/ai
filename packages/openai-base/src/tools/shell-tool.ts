import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { FunctionShellTool as ShellToolConfig } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

export type { ShellToolConfig }

/** @deprecated Renamed to `ShellToolConfig`. Will be removed in a future release. */
export type ShellTool = ShellToolConfig

/**
 * Config accepted by {@link shellTool}. `environment` mirrors the OpenAI
 * Responses API shell tool environment (e.g. `container_auto` + `skills`).
 * Typed via indexed access so it tracks the installed SDK without naming the
 * union members directly.
 */
export interface ShellToolFactoryConfig {
  environment?: NonNullable<ShellToolConfig['environment']>
}

/**
 * Validate skill references carried by a shell `environment`. Previously the
 * factory validated nothing, so a malformed `skill_id` surfaced as an unframed
 * provider 400. Only `skill_reference` entries carry a `skill_id`; inline and
 * local skills are shaped differently and left untouched.
 *
 * ponytail: OpenAI documents no client-checkable count cap for shell skills
 * (unlike Anthropic's 8), so we validate `skill_id` format only and do not
 * fabricate a `SkillLimitError` count limit. Add one here if OpenAI publishes a cap.
 */
function validateShellEnvironment(
  environment: ShellToolFactoryConfig['environment'],
): void {
  const skills =
    environment && 'skills' in environment ? environment.skills : undefined
  if (!skills) return
  for (const skill of skills) {
    if ('skill_id' in skill) {
      const id = skill.skill_id
      if (id.length < 1 || id.length > 64) {
        throw new Error('skill_id must be between 1 and 64 characters.')
      }
    }
  }
}

/**
 * Converts a standard Tool to OpenAI ShellTool format, preserving any
 * `environment` (container config + skills) stored in metadata.
 */
export function convertShellToolToAdapterFormat(tool: Tool): ShellToolConfig {
  const metadata = (getOpenAIProviderToolMetadata(tool) ??
    {}) as ShellToolFactoryConfig
  return {
    type: 'shell',
    ...(metadata.environment !== undefined && {
      environment: metadata.environment,
    }),
  }
}

/**
 * Creates a standard Tool from ShellTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function shellTool(config: ShellToolFactoryConfig = {}): Tool {
  validateShellEnvironment(config.environment)
  return openAIProviderTool(
    {
      name: 'shell',
      description: 'Execute shell commands',
      metadata: {
        ...(config.environment !== undefined && {
          environment: config.environment,
        }),
      },
    },
    'shell',
  )
}
