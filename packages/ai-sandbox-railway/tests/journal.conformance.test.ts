/**
 * Journal conformance for the Railway provider.
 *
 * Registering the shared suite makes the process-lifecycle claims falsifiable:
 * with Railway credentials it runs against a real sandbox, and without them it
 * renders as a NAMED skip carrying the reason instead of a silent pass.
 *
 * `killableProcesses` is `true`, so the follow and kill cases run in full: the
 * kill case starts a backgrounded grandchild and proves it stops writing after
 * `kill()`, which is the measurement behind the capability.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { railwaySandbox } from '../src/index'

// Auto-gate: these cases create real, billed Railway sandboxes.
const token = process.env.RAILWAY_API_TOKEN ?? process.env.RAILWAY_TOKEN
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID

runJournalConformance({
  name: 'railway',
  createHandle: async () => {
    const provider = railwaySandbox({
      ...(environmentId !== undefined ? { environmentId } : {}),
      idleTimeoutMinutes: 10,
    })
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(token && environmentId
    ? {}
    : {
        unsupported: {
          reason:
            'no RAILWAY_API_TOKEN/RAILWAY_TOKEN + RAILWAY_ENVIRONMENT_ID in the environment',
        },
      }),
})
