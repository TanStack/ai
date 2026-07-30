import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { dockerSandbox } from '../src/index'
import { dockerDaemonGate } from './docker-daemon'

// A missing daemon is not the provider being incapable of journaling — it is
// this environment lacking a daemon. Off CI that renders as a NAMED
// `unsupported` skip carrying the reason, never a silent pass; under
// `REQUIRE_DOCKER` it is a hard failure. See `./docker-daemon.ts` for why the
// distinction has to come from the environment.
const gate = await dockerDaemonGate('journal conformance (docker)')

const IMAGE = 'alpine:3'

runJournalConformance({
  name: 'docker',
  createHandle: async () => {
    const provider = dockerSandbox({ image: IMAGE })
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...gate,
})
