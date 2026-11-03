import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// The server and the browser both import this definition. The server gives
// it the code (`src/harness.ts`). The browser gets the typed approval card.
export const requestLoginTool = toolDefinition({
  name: 'requestLogin',
  description:
    'Ask the user to sign in to a site. The user types the username and password in a form that you never see, and the server fills the sign-in form in the browser. Call it when a page asks for a password. Pass the address of the sign-in page.',
  // The run stops until the user answers the login card. The answer is only
  // "yes", so the harness log and the persistence keep no secret.
  needsApproval: true,
  inputSchema: z.object({
    site: z
      .url({ protocol: /^https?$/ })
      .describe(
        'The address of the sign-in page, for example https://example.com/login',
      ),
  }),
})
