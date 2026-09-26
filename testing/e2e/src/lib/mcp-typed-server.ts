import { toolDefinition } from '@tanstack/ai'
import {
  OAuthError,
  OAuthErrorCode,
  createMCPServer,
  promptDefinition,
} from '@tanstack/ai-mcp/server'
import { z } from 'zod'

/**
 * A `createMCPServer` server behind a bearer token.
 *
 * - The tokens `alice` and `bob` are valid. Each token is its own subject.
 * - `forecast` has a string output schema.
 * - `build_report` has `execution: 'task'`. A spec 2025 client polls
 *   `tasks/get` for it. Spec 2026 has no tasks, so it runs inline there.
 */
const forecast = toolDefinition({
  name: 'forecast',
  description: 'The forecast for a city',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.string(),
}).server(async ({ city }) => `Sunny in ${city}`)

const buildReport = toolDefinition({
  name: 'build_report',
  description: 'Build a report in the background',
  inputSchema: z.object({}),
  execution: 'task',
}).server(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return 'Report ready'
})

const tripBrief = promptDefinition({
  name: 'trip_brief',
  description: 'A short trip brief for a city',
  argsSchema: z.object({ city: z.string() }),
}).render(async ({ city }) => [
  { role: 'user', content: `Plan one day in ${city}.` },
])

export const typedServer = createMCPServer({
  name: 'typed-weather',
  version: '1.0.0',
  tools: [forecast, buildReport],
  prompts: [tripBrief],
  auth: {
    verifier: {
      async verifyAccessToken(token) {
        if (token !== 'alice' && token !== 'bob') {
          throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token')
        }
        return {
          token,
          clientId: 'e2e',
          scopes: ['mcp'],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          extra: { sub: token },
        }
      },
    },
  },
})
