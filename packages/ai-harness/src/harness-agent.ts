import { defineAgent } from '@tanstack/ai'
import { harnessChildOf } from './agents'
import { harnessText } from './harness-text'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'

/**
 * Use a whole harness as a child agent: put it in `subagents.agents` and the
 * main model can call it as a tool, with its own tools, plugins, and history.
 *
 * In a harness session, the child is a session of `harness` on the thread
 * `${rootThreadId}/agent/${subagentRunId}`, in the log of the root thread.
 * It runs for the user of the run that starts it, with the keys of that
 * user. Its model calls count in the usage and the budget of that run, and
 * the snapshot of the session lists its waits. An answer there goes to the
 * child. Its events go to the run that starts it. It closes when the run
 * ends. `host` is not used there.
 *
 * Outside a harness session (a plain `chat()`), the child runs on `host`,
 * else on a memory host that the agent makes on its first run, as
 * `harnessText` does.
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
  {
    host,
    name,
    description,
  }: { host?: HarnessHost; name?: string; description?: string } = {},
) {
  let adapter: AnyTextAdapter | undefined
  return defineAgent({
    // Tool names allow letters, digits, `_`, and `-`.
    name: name ?? harness.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
    description:
      description ?? harness.description ?? `The ${harness.name} harness`,
    run: (ctx) => {
      const child = harnessChildOf(ctx.harness)
      if (child) return child(harness, ctx)
      adapter ??= harnessText(harness, host ? { host } : {})
      return ctx.chat({ adapter })
    },
  })
}
