import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * A simple client-side tool that returns the current time.
 * Demonstrates how client tools work with `injectChat` in Angular.
 * Wire into injectChat via `tools: clientTools(getTimeTool)` on the client side.
 * On the server, pass the same tool definition (without execute) inside `chat({ tools })`.
 */
export const getTimeTool = toolDefinition({
  name: 'getTime',
  description: 'Returns the current local time as an ISO string.',
  inputSchema: z.object({}),
  outputSchema: z.object({ time: z.string() }),
}).client(() => ({
  time: new Date().toISOString(),
}))
