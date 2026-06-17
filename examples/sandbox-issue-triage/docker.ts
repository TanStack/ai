/**
 * Issue triage with the DOCKER sandbox (isolated container).
 *
 * Prerequisites: a running Docker daemon and ANTHROPIC_API_KEY. The base image
 * (`node:22` by default; override with SANDBOX_IMAGE) already ships git + node;
 * we install the `claude` CLI during setup. Run: `pnpm start:docker`.
 */
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { runTriage } from './triage'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY to run the Docker triage example.')
  process.exit(1)
}

runTriage({
  provider: dockerSandbox({ image: process.env.SANDBOX_IMAGE ?? 'node:22' }),
  providerLabel: 'docker',
  setup: ['npm install -g @anthropic-ai/claude-code'],
  secrets: { ANTHROPIC_API_KEY: apiKey },
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
