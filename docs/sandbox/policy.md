---
title: Policy
id: policy
order: 7
description: "Allow, ask, or deny commands and capabilities the in-sandbox agent may run."
---

If you need guardrails on commands/capabilities → `defineSandboxPolicy()` and attach via `defineSandbox({ policy })`.

Portable once; each harness maps to native permissions. Guards workspace setup and bridged [tools](./tools).

```ts
import { defineSandboxPolicy, defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  policy,
})
```

## Decisions

| Decision | Meaning |
| --- | --- |
| `allow` | Run without interruption |
| `ask` | Pause; client answers approval request |
| `deny` | Block |

## Commands

Patterns match the command about to run. `*` globs work (`curl *`, `sudo *`). Prefer named [workspace scripts](./workspace) in `allow` for stable matches.

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
})
```

## Capabilities

Coarse backstop (file write, network) when a specific command is not listed:

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  capabilities: {
    fileWrite: 'allow',
    network: 'ask',
  },
})
```

## Precedence: deny > ask > allow

1. Any matching `deny` → blocked.
2. Else any matching `ask` → approval.
3. Else matching `allow` → run.
4. Else → `default`.

```ts
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['curl *'],
    deny: ['curl * internal.example.com*'], // deny wins
  },
  default: 'deny',
})
```

## Default

| Value | Posture |
| --- | --- |
| `'allow'` | Only explicit ask/deny gated (trusted dev) |
| `'ask'` | Unknown actions pause (good middle; treat as default if omitted) |
| `'deny'` | Only explicit allow runs (production / untrusted) |

## How `ask` surfaces

Agent hits an ask-gated action → harness pauses → approval request on the stream → client approve/reject → action proceeds or blocks. Use for “usually fine, sometimes dangerous” (`pnpm install`, `curl`).

## Harness mapping

Adapters map the same rules to native flags (Grok / Claude Code / Codex / …). Unsupported rule → **warn + skip**, not throw.

## Full attach example

```ts
import {
  defineSandboxPolicy,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
    ask: ['pnpm install', 'curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask',
})

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  policy,
})
```

## Next

[Providers](./providers) · [Workspace](./workspace) · [Tools](./tools) · [Lifecycle](./lifecycle)
