/**
 * Issue triage with the LOCAL-PROCESS sandbox (runs on the host — no isolation).
 *
 * Prerequisites on your PATH: `git`, `node`, and the `claude` CLI (logged in, or
 * set ANTHROPIC_API_KEY). Run: `pnpm start:process`.
 */
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { runTriage } from './triage'

const apiKey = process.env.ANTHROPIC_API_KEY

runTriage({
  provider: localProcessSandbox(),
  providerLabel: 'process',
  // Host already has the tooling; nothing to install.
  setup: [],
  secrets: apiKey ? { ANTHROPIC_API_KEY: apiKey } : {},
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
