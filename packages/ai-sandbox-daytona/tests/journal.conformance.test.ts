/**
 * Journal conformance for the Daytona provider.
 *
 * This file exists because Daytona's `killableProcesses` had NO conformance
 * coverage while docker and local-process did — and both of those turned out to
 * be declaring the capability falsely once they were measured. Registering the
 * shared suite here means the claim is falsifiable rather than asserted: with
 * `DAYTONA_API_KEY` present it runs against a real cloud sandbox, and without one
 * it renders as a NAMED skip carrying the reason instead of a silent pass.
 *
 * `followUnsupported` is declared because `DAYTONA_CAPS.killableProcesses` is
 * `false`, so `journalReadStrategy` answers `'poll'` for these handles. That
 * declaration is itself checked against a live handle by the always-running first
 * case, so flipping the capability without revisiting this file fails the suite
 * rather than quietly dropping coverage.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { daytonaSandbox } from '../src/index'

// Auto-gate: these cases create real, billed cloud sandboxes.
const apiKey = process.env.DAYTONA_API_KEY

runJournalConformance({
  name: 'daytona',
  createHandle: async () => {
    const provider = daytonaSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  followUnsupported: {
    reason:
      'killableProcesses is false — kill() only aborts the client-side poll loop and deleteSession is not documented to terminate a running command',
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no DAYTONA_API_KEY in the environment' } }),
})
