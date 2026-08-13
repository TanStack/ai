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
 * Converts a standard Tool to OpenAI ShellTool format, preserving any
 * `environment` (container config + skills) stored in metadata.
 */
export function convertShellToolToAdapterFormat(tool: Tool): ShellToolConfig {
  const metadata = (tool.metadata ?? {}) as ShellToolFactoryConfig
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
  return {
    name: 'shell',
    description: 'Execute shell commands',
    metadata: {
      ...(config.environment !== undefined && {
        environment: config.environment,
      }),
    },
  }
}
