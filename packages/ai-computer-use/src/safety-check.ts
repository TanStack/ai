import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

/** One OpenAI pending safety check on a computer call. */
export const safetyCheckSchema = z.object({
  id: z.string(),
  code: z.string().nullish(),
  message: z.string().nullish(),
})

/**
 * The interrupt that asks a person to approve a computer action with OpenAI
 * safety checks. The interrupt key is the tool call id.
 *
 * - Payload: `{ checks, action }`. `checks` are the pending safety checks.
 *   `action` is the action (or the list of actions) that waits.
 * - Response: `{ approved: boolean }`.
 *
 * Register it on the client with `useChat({ interrupts: [computerSafetyCheck] })`.
 * It is the same object as the `interrupt` from `createComputerUse`.
 */
export const computerSafetyCheck = defineInterrupt({
  id: 'computer-safety-check',
  payloadSchema: z.object({
    checks: z.array(safetyCheckSchema),
    action: z.unknown(),
  }),
  responseSchema: z.object({ approved: z.boolean() }),
})
