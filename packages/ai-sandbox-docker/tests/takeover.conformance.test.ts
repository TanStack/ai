import Dockerode from 'dockerode'
import { runTakeoverConformance } from '@tanstack/ai-sandbox/testkit'
import { dockerSandbox } from '../src/index'

// Auto-gate: only run when a Docker daemon is reachable, mirroring
// journal.conformance.test.ts's gate. A missing daemon is not the provider being
// incapable of takeover — it is this environment lacking a daemon — so the case
// renders as a NAMED `unsupported` skip carrying the reason, visible in the
// reporter, never a silent `✓ 0ms` that reads as coverage.
let dockerAvailable = false
try {
  await new Dockerode().ping()
  dockerAvailable = true
} catch {
  // no daemon — the suite below declares `unsupported` and skips loudly.
}

const IMAGE = 'alpine:3'

runTakeoverConformance({
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
