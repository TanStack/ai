import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Isomorphic tool DEFINITION shared by the server and the browser.
 *
 * The server attaches the implementation with `.server(...)`; the client passes
 * this same definition to `useChat({ tools })`. Sharing one definition means the
 * approval interrupt's schema hashes match on both sides, so the browser can
 * bind the pending approval and resolve it. `needsApproval` pauses the run for a
 * human yes/no before the tool runs — persisted by `withPersistence`, so the
 * pending decision survives a reload.
 */
export const sendEmailTool = toolDefinition({
  name: 'sendEmail',
  description:
    'Send an email on the user’s behalf. Pauses for the user to approve.',
  needsApproval: true,
  inputSchema: z.object({
    to: z.string().describe('Recipient email address'),
    subject: z.string(),
    body: z.string(),
  }),
  outputSchema: z.object({ messageId: z.string(), to: z.string() }),
})
