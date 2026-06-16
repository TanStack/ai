# Sandbox coding-agent demo

Runs **Claude Code inside a sandbox** to fix a bug, end-to-end, through the
public `chat()` API. Use this to manually verify the sandbox layer locally.

It bootstraps a tiny git repo with a deliberate bug in `add.js`
(`add(a, b)` returns `a - b`), asks Claude Code to fix it, streams the agent's
output, and prints the resulting `git diff`.

## Prerequisites

1. **Build the workspace packages first** (examples consume built `dist`):

   ```bash
   # from the repo root
   pnpm install
   pnpm --filter "@tanstack/ai-sandbox..." --filter "@tanstack/ai-claude-code..." --filter "@tanstack/ai" build
   # (or simply: pnpm build:all)
   ```

2. An **Anthropic API key**: `export ANTHROPIC_API_KEY=sk-ant-...`

## Run it — Docker (isolated, recommended)

Needs a running Docker daemon. The container image needs `git` + `node`
(default `node:22`); the demo installs the `claude` CLI during bootstrap.

```bash
cd examples/sandbox-coding-agent
pnpm start
```

Override the image (must have git + node):

```bash
SANDBOX_IMAGE=node:22 pnpm start
```

> First run pulls the image and `npm install -g @anthropic-ai/claude-code`, so
> it takes a minute. Subsequent runs on the same `threadId` reuse the container.

## Run it — local process (no Docker)

Runs the agent directly on your host (no isolation — dev only). Requires the
`claude` CLI, `git`, and `node` on your `PATH`. A local `claude` login works in
place of `ANTHROPIC_API_KEY`.

```bash
cd examples/sandbox-coding-agent
SANDBOX=local pnpm start
```

## What you should see

- Streamed reasoning/text from Claude Code as it inspects and edits `add.js`.
- `↳ [tool] …` lines as the agent uses its native tools (Read/Edit/Bash).
- A final `===== git diff =====` block showing `- return a - b` → `+ return a + b`.
- `✅ done`.

## How it works

```ts
const sandbox = defineSandbox({
  id: 'coding-agent-demo',
  provider: dockerSandbox({ image: 'node:22' }), // or localProcessSandbox()
  workspace: defineWorkspace({
    source: { type: 'none' },
    setup: ['npm install -g @anthropic-ai/claude-code' /* scaffold repo */],
    secrets: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
  }),
  lifecycle: { reuse: 'thread' },
})

chat({
  threadId,
  adapter: claudeCodeText('sonnet'), // declares requires:[SandboxCapability]
  messages: [{ role: 'user', content: 'Fix the bug in add.js' }],
  middleware: [withSandbox(sandbox)],
})
```

`withSandbox` resumes-or-creates the sandbox and bootstraps the workspace; the
`claudeCodeText` adapter spawns `claude -p --output-format stream-json` **inside**
the sandbox, streams its events back as AG-UI chunks, and emits a `file.changed`
event with the diff.
