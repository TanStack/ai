/**
 * Journal conformance for the boxd provider.
 *
 * NO `followUnsupported`: `killableProcesses` is `true`, so the follow cases
 * RUN with a key and name-skip without one. Flipping the capability to `false`
 * fails the always-running first case until this file declares it, so the
 * declaration cannot drift from the provider.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { boxdSandbox } from '../src/index'

// Auto-gate: these cases create real machines in the key's org.
const apiKey = process.env.BOXD_API_KEY

runJournalConformance({
  name: 'boxd',
  createHandle: async () => {
    const provider = boxdSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no BOXD_API_KEY in the environment' } }),
})
