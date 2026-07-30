import Dockerode from 'dockerode'
import { runReaperConformance } from '@tanstack/ai-sandbox/testkit'
import { dockerSandbox } from '../src/index'

// Auto-gate: only run when a Docker daemon is reachable, mirroring
// takeover.conformance.test.ts's gate. A missing daemon is not the provider
// being incapable of the sweeps — it is this environment lacking a daemon — so
// the case renders as a NAMED `unsupported` skip carrying the reason, visible in
// the reporter, never a silent `✓ 0ms` that reads as coverage.
let dockerAvailable = false
try {
  await new Dockerode().ping()
  dockerAvailable = true
} catch {
  // no daemon — the suite below declares `unsupported` and skips loudly.
}

/**
 * BusyBox 1.37, and that is the point. `find -newermt` and `find -printf` are
 * *unrecognised* here (exit 1, empty stdout), which is the trap
 * `journalMtimeListCommand`'s `stat -c '%Y %n'` self-witness exists to make
 * impossible. This matrix — not the git-bash one — is the authority on the age
 * gate's portability.
 */
const IMAGE = 'alpine:3'

runReaperConformance({
  name: 'docker',
  createHandle: async () => {
    const provider = dockerSandbox({ image: IMAGE })
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(dockerAvailable
    ? {}
    : { unsupported: { reason: 'no Docker daemon reachable' } }),
})
