import { CliError } from '../core/exit-codes'
import type * as CodeModeModule from '@tanstack/ai-code-mode'
import type * as IsolateNodeModule from '@tanstack/ai-isolate-node'

export interface CodeModeWiring {
  tool: unknown
  systemPrompt: string
}

/**
 * Wire up Code Mode: wrap the supplied tools (discovered from `--mcp` servers)
 * in a sandboxed `execute_typescript` tool plus its system prompt, using the
 * Node isolate driver. Code Mode requires at least one tool to orchestrate, so
 * `--code-mode` must be combined with `--mcp`.
 *
 * `@tanstack/ai-code-mode` and `@tanstack/ai-isolate-node` are imported lazily.
 */
export async function buildCodeMode(
  tools: Array<unknown>,
): Promise<CodeModeWiring> {
  if (tools.length === 0) {
    throw new CliError(
      'USAGE',
      '--code-mode needs tools to orchestrate. Combine it with one or more --mcp servers.',
    )
  }

  let codeMode: typeof CodeModeModule
  let isolate: typeof IsolateNodeModule
  try {
    codeMode = await import('@tanstack/ai-code-mode')
    isolate = await import('@tanstack/ai-isolate-node')
  } catch (cause) {
    throw new CliError(
      'PROVIDER_NOT_INSTALLED',
      '--code-mode requires @tanstack/ai-code-mode and @tanstack/ai-isolate-node.',
      {
        detail: {
          packages: ['@tanstack/ai-code-mode', '@tanstack/ai-isolate-node'],
        },
        cause,
      },
    )
  }

  const { tool, systemPrompt } = codeMode.createCodeMode({
    driver: isolate.createNodeIsolateDriver(),
    tools: tools as never,
  })
  return { tool, systemPrompt }
}
