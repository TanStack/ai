import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const clientContextToolDefinition = toolDefinition({
  name: 'get_client_context',
  description: 'Get context that is only available in the browser',
  inputSchema: z.object({}),
  outputSchema: z.object({ context: z.string() }),
})
