/**
 * Journal conformance for the Runta provider.
 *
 * NO `followUnsupported`: `RUNTA_CAPS.killableProcesses` is `true`, so
 * `journalReadStrategy` answers `'follow'` and the two follow cases RUN as soon
 * as `RUNTA_TOKEN` is present. Without a token they render as a NAMED skip
 * carrying the reason rather than a silent pass. If the capability is ever
 * flipped to `false`, the always-running first case fails until
 * `followUnsupported` is declared here.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { runtaSandbox } from '../src/index'

// Auto-gate: these cases create real, billed Runta runtimes. `runtaSandbox`
// throws at construction without a key, so the provider is only built inside
// `createHandle`, which the suite never calls while `unsupported` is declared.
const apiKey = process.env.RUNTA_TOKEN

runJournalConformance({
  name: 'runta',
  createHandle: async () => {
    const provider = runtaSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no RUNTA_TOKEN in the environment' } }),
})
