/**
 * Register Blaxel's process-lifecycle claims with the shared conformance suite.
 * The live cases are credential-gated because they create billed sandboxes.
 */
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { blaxelSandbox } from '../src/index'

const apiKey = process.env.BL_API_KEY
const workspace = process.env.BL_WORKSPACE
const credentialsAvailable = Boolean(apiKey && workspace)

runJournalConformance({
  name: 'blaxel',
  createHandle: async () => {
    const provider = blaxelSandbox({ apiKey, workspace })
    const handle = await provider.create({})
    return { handle, dispose: () => handle.destroy() }
  },
  followUnsupported: {
    reason:
      'killableProcesses is false until a live Blaxel measurement proves kill() terminates the shell and its child process group',
  },
  ...(credentialsAvailable
    ? {}
    : {
        unsupported: {
          reason: 'no BL_API_KEY and BL_WORKSPACE in the environment',
        },
      }),
})
