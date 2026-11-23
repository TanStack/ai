import { defineAgent } from '@tanstack/ai'
import { harnessChildOf } from './agents'
import { harnessText } from './harness-text'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'

/**
 * Use a whole harness as a child agent, with its own tools, plugins, and
 * history. It works in two places:
 *
 * - In `subagents.agents`: the main model calls it as a tool.
 * - In `agents`, with `routing`: it is a root agent that answers turns of
 *   the thread. It keeps one child session per agent across turns, on the
 *   thread `${rootThreadId}/agent/${name}`. Each turn sends it the latest
 *   user message, after what happened in the thread since its last turn.
 *   Its model gets the `handoff` tool of the outer turn, so it can hand
 *   back. A tool of the child can call `ctx.context.run.handoff`. The child
 *   harness cannot have its own `routing`: that turn fails.
 *
 * In a harness session, the child is a session of `harness` in the log of
 * the root thread. As a tool, its thread is
 * `${rootThreadId}/agent/${subagentRunId}`, one per call.
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
 *
 * defineHarness({
 *   name: 'acme/front-desk',
 *   adapter,
 *   agents: [harnessAgent(billing, { name: 'billing' })],
 *   routing: { router: () => 'billing' },
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
