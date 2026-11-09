/**
 * Journal conformance for the Tangle provider.
 *
 * NO `followUnsupported`: `killableProcesses` is `true`, so the follow cases RUN
 * with a key and name-skip without one. Flipping the capability to `false` fails
 * the always-running first case until this file declares it, so the declaration
 * cannot drift from the provider.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { tangleSandbox } from '../src/index'

// Auto-gate: these cases create real Tangle sandboxes.
const apiKey = process.env.TANGLE_API_KEY

runJournalConformance({
  name: 'tangle',
  createHandle: async () => {
    const provider = tangleSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no TANGLE_API_KEY in the environment' } }),
})
