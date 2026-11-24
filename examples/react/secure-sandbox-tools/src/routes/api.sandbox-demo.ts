// Surface B (HTTP-API entry) — the same sandboxed scenarios as the server
// function (src/lib/sandbox-demo.ts), exposed as a plain POST endpoint you can
// curl or call from any client:
//
//   curl -X POST http://localhost:3100/api/sandbox-demo \
//     -H 'content-type: application/json' -d '{"scenario":"loop"}'
//
// → { "ok": false, "kind": "limit", "error": "Code execution timed out", ... }
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SCENARIO_IDS, runScenario } from '@/lib/sandbox-scenarios'

const bodySchema = z.object({
  scenario: z.enum(SCENARIO_IDS),
  team: z.string().default('payments'),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/sandbox-demo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body
        try {
          body = bodySchema.parse(await request.json())
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Bad request' },
            400,
          )
        }
        // A blocked run is a normal 200 with ok:false. The demo facades are
        // canned, so the raw error is safe to return here.
        return json(await runScenario(body.scenario, body.team))
      },
    },
  },
})
