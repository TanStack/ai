// Surface B (server-function entry) — a TanStack Start server function whose
// body is sandboxed. See src/lib/sandbox-scenarios.ts for the shared snippets,
// and src/routes/api.sandbox-demo.ts for the plain HTTP-API version of the same
// thing. This is the non-streaming data-endpoint shape; a streaming chat route
// sandboxes its *tools* instead (see secure-chat-tools.ts).
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { SCENARIO_IDS, runScenario } from './sandbox-scenarios'

export const runSandboxDemo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      scenario: z.enum(SCENARIO_IDS),
      team: z.string().default('payments'),
    }),
  )
  .handler(async ({ data }) => runScenario(data.scenario, data.team))
