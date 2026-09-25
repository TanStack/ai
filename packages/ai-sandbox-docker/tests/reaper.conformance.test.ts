import { runReaperConformance } from '@tanstack/ai-sandbox/testkit'
import { dockerSandbox } from '../src/index'
import { dockerDaemonGate } from './docker-daemon'

// A missing daemon is not the provider being incapable of the sweeps, it is this
// environment lacking a daemon. It renders as a NAMED `unsupported` skip carrying the
// reason, never a silent `✓ 0ms` that reads as coverage. THIS matrix is the authority
// on the age gate below, so a run where it skipped has not covered that gate at all.
// See `./docker-daemon.ts`.
const gate = await dockerDaemonGate('reaper conformance (docker)')

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
  ...gate,
})
