import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// The server and the browser both import this definition, like requestLogin.
export const handOffTool = toolDefinition({
  name: 'handOff',
  description:
    'Give the desktop to the user, and wait until the user is done. Call it when you are stuck and cannot continue alone: a captcha, a two-factor code, a page that you cannot use, or a choice that only the user can make. Then take a screenshot to see what the user did.',
  // The run stops. The live view lets the user use the desktop until they
  // click Done, which approves the call.
  needsApproval: true,
  inputSchema: z.object({
    reason: z
      .string()
      .describe('What the user must do, in one sentence. The user reads it.'),
  }),
})
