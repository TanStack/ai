import { defineAgent } from '@tanstack/ai'
import { harnessText } from './harness-text'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'

/**
 * Use a whole harness as a child agent: put it in `subagents.agents` and the
 * main model can call it as a tool, with its own tools, plugins, and history.
 *
 * @example
 * ```ts
 * defineHarness({
 *   name: 'acme/lead',
 *   adapter,
 *   subagents: { agents: [harnessAgent(reviewer)] },
 * })
 * ```
 */
export function harnessAgent(
  harness: AnyHarness,
  options: { host?: HarnessHost; name?: string; description?: string } = {},
) {
  const adapter = harnessText(
    harness,
    options.host ? { host: options.host } : {},
  )
  return defineAgent({
    // Tool names allow letters, digits, `_`, and `-`.
    name: options.name ?? harness.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
    description:
      options.description ??
      harness.description ??
      `The ${harness.name} harness`,
    run: (ctx) => ctx.chat({ adapter }),
  })
}
