/**
 * Journal conformance for the Upstash Box provider.
 *
 * NO `followUnsupported`: `killableProcesses` is `true`, so the follow cases RUN
 * with a key and name-skip without one. Flipping the capability to `false` fails
 * the always-running first case until this file declares it, so the declaration
 * cannot drift from the provider.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { upstashBoxSandbox } from '../src/index'

// Auto-gate: these cases create real, billed boxes.
const apiKey = process.env.UPSTASH_BOX_API_KEY

runJournalConformance({
  name: 'upstash-box',
  createHandle: async () => {
    const provider = upstashBoxSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no UPSTASH_BOX_API_KEY in the environment' } }),
})
