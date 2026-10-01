import { toolDefinition } from '@tanstack/ai'
import {
  OAuthError,
  OAuthErrorCode,
  createMCPServer,
  promptDefinition,
  resourceDefinition,
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

/**
 * A spec 2025 server for a host with many instances: no session store.
 *
 * - `notes://{noteId}` reads the template variable and the `tenant` from
 *   the `handle` context, and lists one concrete note.
 * - `show_note` links an MCP Apps view through `metadata._meta`.
 */
const note = resourceDefinition({
  name: 'note',
  mimeType: 'text/plain',
  uriTemplate: 'notes://{noteId}',
  list: async (ctx) => ({
    resources: [
      { uri: 'notes://1', name: `Note 1 for ${String(ctx.context.tenant)}` },
    ],
  }),
}).read(async (_uri, variables, ctx) => ({
  text: `note ${String(variables.noteId)} for ${String(ctx.context.tenant)}`,
}))

const showNote = toolDefinition({
  name: 'show_note',
  description: 'Show a note in a view',
  inputSchema: z.object({}),
  metadata: { _meta: { ui: { resourceUri: 'ui://notes/view' } } },
}).server(async () => 'shown')

export const statelessServer = createMCPServer({
  name: 'stateless-notes',
  version: '1.0.0',
  sessions: 'stateless',
  tools: [showNote],
  resources: [note],
})
