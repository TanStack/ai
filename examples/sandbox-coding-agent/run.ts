/**
 * Local end-to-end demo: run Claude Code INSIDE a sandbox to fix a bug.
 *
 * What it does:
 *   1. Spins up a sandbox (Docker by default, or the local host process).
 *   2. Bootstraps a tiny git repo containing a deliberate bug in `add.js`
 *      (`add(a, b)` returns `a - b`).
 *   3. Runs `chat()` with the in-sandbox `claudeCodeText` harness adapter and
 *      asks it to fix the bug — Claude Code edits the file using its OWN native
 *      tools inside the sandbox.
 *   4. Streams the agent's text + tool activity, then prints the git diff it
 *      produced.
 *
 * Run it: see README.md. Requires ANTHROPIC_API_KEY (or a local `claude` login
 * for SANDBOX=local).
 */
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = process.env.ANTHROPIC_API_KEY
const useLocal = process.env.SANDBOX === 'local'

if (!apiKey && !useLocal) {
  console.error(
    'Set ANTHROPIC_API_KEY (or use SANDBOX=local with a local `claude` login).',
  )
  process.exit(1)
}

// Scaffold a tiny git repo with a deliberate bug in add.js.
const scaffold = [
  'git init -q',
  'git config user.email demo@example.com',
  'git config user.name tanstack-ai-demo',
  `printf 'export function add(a, b) {\\n  return a - b\\n}\\n' > add.js`,
  'git add -A',
  'git commit -q -m "initial (with bug)"',
]

const provider = useLocal
  ? // Runs on the host — needs `claude`, `git`, and `node` on your PATH.
    localProcessSandbox()
  : // Runs in an isolated Docker container. The image needs git + node; we
    // install the claude CLI during setup. Override with SANDBOX_IMAGE.
    dockerSandbox({ image: process.env.SANDBOX_IMAGE ?? 'node:22' })

const setup = useLocal
  ? scaffold
  : ['npm install -g @anthropic-ai/claude-code', ...scaffold]

const sandbox = defineSandbox({
  id: 'coding-agent-demo',
  provider,
  workspace: defineWorkspace({
    source: { type: 'none' },
    setup,
    // Injected into the sandbox env (never persisted to snapshots/logs).
    secrets: apiKey ? { ANTHROPIC_API_KEY: apiKey } : {},
  }),
  lifecycle: { reuse: 'thread' },
})

async function main(): Promise<void> {
  console.log(
    `\n▶ Sandbox: ${useLocal ? 'local-process (host)' : 'docker'} — bootstrapping + running Claude Code...\n`,
  )

  const stream = chat({
    threadId: `demo-${Date.now()}`,
    adapter: claudeCodeText('sonnet'),
    messages: [
      {
        role: 'user',
        content:
          'There is a bug in add.js: add(a, b) returns a - b instead of a + b. ' +
          'Fix it so it correctly adds the two numbers.',
      },
    ],
    middleware: [withSandbox(sandbox)],
  }) as AsyncIterable<StreamChunk>

  for await (const chunk of stream) {
    const c = chunk as Record<string, unknown> & { type: string }
    switch (c.type) {
      case 'TEXT_MESSAGE_CONTENT':
        process.stdout.write((c.delta as string) ?? '')
        break
      case 'TOOL_CALL_START':
        console.log(`\n  ↳ [tool] ${(c.toolCallName as string) ?? ''}`)
        break
      case 'CUSTOM':
        if (c.name === 'file.changed') {
          const value = c.value as { diff?: string }
          console.log('\n\n===== git diff =====\n' + (value.diff ?? '(none)'))
        }
        break
      case 'RUN_FINISHED':
        console.log('\n\n✅ done')
        break
      case 'RUN_ERROR':
        console.error('\n\n❌ error:', c.message)
        break
      default:
        break
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
