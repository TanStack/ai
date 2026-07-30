/**
 * Journal conformance for the Sprites provider.
 *
 * This file exists because Sprites' `killableProcesses` had NO conformance
 * coverage while docker and local-process did — and both of those turned out to be
 * declaring the capability falsely once they were measured. Sprites is the one
 * provider here whose kill is a real SERVER-side call rather than a client-side
 * detach (`POST /exec/<sessionId>/kill`), so the declaration is left at `true` —
 * but "left at true" is only defensible with a way to falsify it, which is what
 * this registration is.
 *
 * NO `followUnsupported`: `SPRITES_CAPS.killableProcesses` is `true`, so
 * `journalReadStrategy` answers `'follow'` and the two follow cases RUN as soon as
 * `SPRITES_API_KEY` is present. Without a key they render as a NAMED skip carrying
 * the reason rather than a silent pass. If the capability is ever flipped to
 * `false`, the always-running first case fails until `followUnsupported` is
 * declared here — the declaration cannot drift from the provider.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { spritesSandbox } from '../src/index'

// Auto-gate: these cases create real, billed Sprites. `spritesSandbox` throws at
// construction without a key, so the provider is only built inside
// `createHandle`, which the suite never calls while `unsupported` is declared.
const apiKey = process.env.SPRITES_API_KEY

runJournalConformance({
  name: 'sprites',
  createHandle: async () => {
    const provider = spritesSandbox(apiKey !== undefined ? { apiKey } : {})
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no SPRITES_API_KEY in the environment' } }),
})
