/**
 * Journal conformance for the Render provider.
 *
 * Registering the shared suite makes the process-lifecycle claims falsifiable:
 * with Render credentials it runs against a real sandbox, and without them it
 * renders as a NAMED skip carrying the reason instead of a silent pass.
 *
 * `killableProcesses` is `true`, so the follow and kill cases run in full: the
 * kill case starts a backgrounded grandchild and proves it stops writing after
 * `kill()`, which is the measurement behind the capability.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { renderSandbox } from '../src/index'

// Auto-gate: these cases create real, billed Render sandboxes.
const hasCreds =
  !!process.env.RENDER_API_KEY && !!process.env.RENDER_WORKSPACE_ID

runJournalConformance({
  name: 'render',
  createHandle: async () => {
    const handle = await renderSandbox({ timeoutSeconds: 1800 }).create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(hasCreds
    ? {}
    : {
        unsupported: {
          reason: 'no RENDER_API_KEY + RENDER_WORKSPACE_ID in the environment',
        },
      }),
})
