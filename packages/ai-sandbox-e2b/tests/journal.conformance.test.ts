/**
 * Journal conformance for the E2B provider.
 *
 * NO `followUnsupported`: `killableProcesses` is `true`, so the follow cases RUN
 * with a key and name-skip without one. Flipping the capability to `false` fails
 * the always-running first case until this file declares it, so the declaration
 * cannot drift from the provider.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { e2bSandbox } from '../src/index'

// Auto-gate: these cases create real E2B sandboxes.
const apiKey = process.env.E2B_API_KEY

runJournalConformance({
  name: 'e2b',
  createHandle: async () => {
    const provider = e2bSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no E2B_API_KEY in the environment' } }),
})
