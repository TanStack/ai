# @tanstack/ai-sandbox

Provider-agnostic sandbox layer for [TanStack AI](https://tanstack.com/ai). Run coding-agent harness adapters (Grok Build, Claude Code, Codex, OpenCode, Gemini CLI) **inside** an isolated environment with a real filesystem, shell, and cloned repo — and stream their work back through `chat()`.

```typescript
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test', build: 'pnpm build' },
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
})

const stream = chat({
  threadId: 'my-thread',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Fix the failing test.' }],
  middleware: [withSandbox(sandbox)],
})
```

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-grok-build
```

Pick a **provider** package for where the sandbox runs:

| Package                              | Use when                               |
| ------------------------------------ | -------------------------------------- |
| `@tanstack/ai-sandbox-local-process` | Dev loop on your host (no isolation)   |
| `@tanstack/ai-sandbox-docker`        | Isolated containers, snapshots, resume |
| `@tanstack/ai-sandbox-cloudflare`    | Cloudflare Workers + Containers        |
| `@tanstack/ai-sandbox-vercel`        | Vercel Sandbox                         |
| `@tanstack/ai-sandbox-daytona`       | Daytona dev environments               |

**Harness adapters** are separate packages. The default path is **Grok Build** (`@tanstack/ai-grok-build`); others include `@tanstack/ai-claude-code`, `@tanstack/ai-codex`, and `@tanstack/ai-opencode`. All require `withSandbox(...)` middleware — `chat()` fails fast without it.

## Three moving parts

| Part                | What it is                                               | How you configure it                                              |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| **Provider**        | Isolation primitive — host, container, cloud VM          | `dockerSandbox()`, `localProcessSandbox()`, …                     |
| **Workspace**       | What the agent boots into — repo, setup, secrets, skills | `defineWorkspace({ … })`                                          |
| **Harness adapter** | Which agent CLI runs and how output is translated        | `grokBuildText()` (default), `claudeCodeText()`, `codexText()`, … |

`defineSandbox()` binds provider + workspace (+ optional policy, lifecycle, hooks). `withSandbox(definition)` is the `chat()` middleware that creates or resumes the sandbox for each run.

## Core APIs

### Workspace

Describe the working tree once, portably:

```typescript
defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }), // shallow clone by default
  setup: ({ serial, parallel }) => {
    serial('pnpm install')
    parallel(['pnpm build', 'pnpm typecheck'])
  },
  scripts: { test: 'pnpm test' }, // surfaced in AGENTS.md; policy aliases
  instructions: 'Run tests before proposing changes.',
  skills: [
    gitSkill({ repo: 'owner/skills', secret: secrets.GH }),
    mcpSkill('api', {
      url: 'https://mcp.example.com',
      headers: { Authorization: bearer(secrets.TOKEN) },
    }),
    fileSkill({ path: '.hints.md', content: '# Hints\nPrefer pnpm.' }),
  ],
  plugins: ['@anthropic/plugin-foo'], // Claude Code only; other harnesses warn+skip
  secrets: createSecrets({ GH: process.env.GH_TOKEN ?? '' }),
})
```

Skills and plugins are **projected** into each harness's native format at run time (`.grok/config.toml`, `.mcp.json`, `.codex/config.toml`, `opencode.json`, …). Bootstrap writes `AGENTS.md` and clones `gitSkill` repos; harness adapters handle the rest.

### Policy

Guard what the agent may run:

```typescript
const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'git diff'],
    ask: ['pnpm install'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

defineSandbox({ id: 'agent', provider, workspace, policy })
```

Precedence is `deny` > `ask` > `allow`. Each harness adapter maps policy onto its native permission system (coarse flags for Grok Build/Codex; full interactive `approval-requested` on Claude Code).

### Lifecycle

```typescript
lifecycle: {
  reuse: 'thread',           // resume one sandbox per threadId
  snapshot: 'after-setup',   // skip bootstrap on subsequent runs (when provider supports it)
  keepAlive: '30m',
  destroyOnComplete: false,
}
```

### Secrets

Use `createSecrets()` so values stay behind opaque `SecretRef` tokens — never written to snapshots, the sandbox store, or event logs:

```typescript
const secrets = createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' })
// secrets.XAI_API_KEY is a ref, not the string
```

### Host tool bridge

`chat()` server tools can be bridged into the in-sandbox agent over MCP. The agent calls `mcp__tanstack__<tool>`; execution runs back on the host where your closures, DB, and secrets live.

## Run flow

```text
chat({ adapter: grokBuildText(), middleware: [withSandbox(sandbox)] })
  │
  ├─ withSandbox.setup     → resume → restore snapshot → create + bootstrap
  ├─ adapter.chatStream    → spawn `grok` (or other harness CLI) inside sandbox; stream AG-UI chunks
  └─ withSandbox.onFinish  → snapshot / destroy per lifecycle
```

## Subpath exports

| Import                       | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `@tanstack/ai-sandbox`       | Core sandbox APIs                                     |
| `@tanstack/ai-sandbox/ngrok` | Optional ngrok tunnel helper for remote tool bridging |

## Verification

From the repo root:

```bash
node scripts/sandbox-live-smoke.mjs
```

Runs core unit tests offline; auto-runs Docker provider tests when a daemon is reachable.

## Documentation

Full guides on [tanstack.com/ai](https://tanstack.com/ai/latest/docs/sandbox/overview):

- [Quick Start](https://tanstack.com/ai/latest/docs/sandbox/quick-start) — Grok Build in Docker
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers)
- [Workspace](https://tanstack.com/ai/latest/docs/sandbox/workspace)
- [Provisioning](https://tanstack.com/ai/latest/docs/sandbox/provisioning) (skills, MCP, plugins)
- [Policy](https://tanstack.com/ai/latest/docs/sandbox/policy)
- [Tools](https://tanstack.com/ai/latest/docs/sandbox/tools) (host tool bridge)
- [Lifecycle & snapshots](https://tanstack.com/ai/latest/docs/sandbox/lifecycle)

## Examples

| Example                         | What it demonstrates                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `examples/sandbox-web`          | Build-and-preview with harness × provider matrix (Grok default in UI) |
| `examples/sandbox-cloudflare`   | Edge deploy with live preview URL                                     |

## When to use a sandbox

Use a sandbox when the agent needs to **act on a real codebase** — run commands, edit files, clone repos, start dev servers. For read-only Q&A over code you already have in context, a normal `chat()` with server tools is enough.

Persistence (durable `SandboxStore` / `LockStore`, event-log replay) is out of scope for v1 but every seam is persistence-ready via optional capabilities.
