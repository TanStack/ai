/**
 * Journal conformance for the Vercel provider.
 *
 * This file exists because Vercel's `killableProcesses` had NO conformance
 * coverage while docker and local-process did — and both of those turned out to be
 * declaring the capability falsely once they were measured. Registering the shared
 * suite here means the claim is falsifiable rather than asserted: with Vercel
 * credentials present it runs against a real microVM, and without them it renders
 * as a NAMED skip carrying the reason instead of a silent pass.
 *
 * `followUnsupported` is declared because `VERCEL_CAPS.killableProcesses` is
 * `false`, so `journalReadStrategy` answers `'poll'` for these handles. That
 * declaration is itself checked against a live handle by the always-running first
 * case, so flipping the capability without revisiting this file fails the suite
 * rather than quietly dropping coverage.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { vercelSandbox } from '../src/index'

// Auto-gate: these cases create real, billed microVM sandboxes. Same gate as
// `vercel.test.ts`.
const hasCreds =
  !!(process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN) &&
  !!process.env.VERCEL_TEAM_ID &&
  !!process.env.VERCEL_PROJECT_ID

runJournalConformance({
  name: 'vercel',
  createHandle: async () => {
    const provider = vercelSandbox({})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  followUnsupported: {
    reason:
      'killableProcesses is false — the abort signal cannot reach a detached command once its start request resolved, and what Command.kill signals (process group vs. pid) is unmeasured',
  },
  ...(hasCreds
    ? {}
    : {
        unsupported: {
          reason:
            'no Vercel credentials (VERCEL_TOKEN/VERCEL_OIDC_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID) in the environment',
        },
      }),
})
