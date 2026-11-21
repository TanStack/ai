// The demo scenario bodies, shared by BOTH entry points:
//   - the server function  (src/lib/sandbox-demo.ts)
//   - the HTTP API route    (src/routes/api.sandbox-demo.ts)
//
// One snippet does real work; the other three each try to "go off the rails"
// and get stopped by a different guardrail.
import { DEFAULT_LIMITS, runSandboxed } from './sandbox'
import type { SandboxRun } from './sandbox'
import type { Facades } from '@tanstack/ai-mcp-sandbox'

export const SCENARIO_IDS = ['ok', 'loop', 'fetch', 'budget'] as const
export type Scenario = (typeof SCENARIO_IDS)[number]

// The only thing any snippet can touch. Blast radius = exactly this facade.
const facades: Facades = {
  'db.metrics': {
    description: 'Read canned team metrics',
    execute: async (args) => {
      const team = (args as { team?: unknown }).team
      return { team, p95: 123, errorRate: 0.004, requests: 98213 }
    },
  },
}

// Each value is a raw endpoint body; `input` holds the validated args.
const SNIPPETS: Record<Scenario, string> = {
  // Real work: read the allowlisted backend and shape a response.
  ok: `
    const m = await host.db.metrics({ team: input.team })
    return { team: m.team, p95: m.p95, errorRate: m.errorRate }
  `,
  // Runaway compute → interrupted at the wall-clock deadline (2s).
  loop: `while (true) {}`,
  // Tries the cloud metadata endpoint → there is no fetch in the isolate, so
  // the reference throws. The snippet has no network at all.
  fetch: `return await fetch('http://169.254.169.254/latest/meta-data/')`,
  // Hammers the host facade → stopped at the injected-call budget (5).
  budget: `
    for (let i = 0; i < 100; i++) await host.db.metrics({ team: input.team })
    return 'unreachable'
  `,
}

/** Run one scenario in the isolate. Returns a structured outcome, never throws. */
export function runScenario(
  scenario: Scenario,
  team: string,
): Promise<SandboxRun> {
  return runSandboxed({
    snippet: SNIPPETS[scenario],
    input: { team },
    facades,
    limits: DEFAULT_LIMITS,
  })
}
