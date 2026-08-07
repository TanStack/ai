---
title: Workspace
id: workspace
order: 4
description: "Describe source repo, package manager, setup commands, and scripts for the sandbox working tree."
---

If you need to define **what the agent boots into** → use `defineWorkspace()`.

Secrets, skills, MCP → [Provisioning](./provisioning). Runs inside whichever [provider](./providers) you chose.

```ts
import { createSecrets, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
  packageManager: 'pnpm',
  setup: ['corepack enable', 'pnpm install'],
  scripts: { test: 'pnpm test', build: 'pnpm build' },
  secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
})
```

| Field | Sets |
| --- | --- |
| `source` | Working tree origin (git, local, or empty) |
| `packageManager` | `npm` / `pnpm` / `yarn` / `bun` / `auto` (default) |
| `setup` | Bootstrap commands (serial array or serial/parallel groups) |
| `scripts` | Named commands for agent + [policy](./policy) |
| `secrets` | Env secrets — [Provisioning](./provisioning) |

Also takes `skills`, `plugins`, `instructions` → [Provisioning](./provisioning).

## Source

```ts
import { defineWorkspace, githubRepo, gitSource } from '@tanstack/ai-sandbox'

defineWorkspace({ source: githubRepo({ repo: 'owner/repo', ref: 'main' }) })
defineWorkspace({ source: gitSource({ url: 'https://git.example.com/owner/repo.git' }) })
defineWorkspace({ source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' } })
defineWorkspace({ source: { type: 'local', path: '/abs/path/to/repo' } })
defineWorkspace({ source: { type: 'none' } })
```

`githubRepo` expands `owner/repo` → `https://github.com/owner/repo.git`; full URLs pass through.

### Clone depth

Default: shallow single-branch (`--depth 1 --single-branch`).

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({ source: githubRepo({ repo: 'owner/app' }) }) // depth 1
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 10 }) })
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 'full' }) })
```

## Package manager

`'auto'` detects from lockfile after source lands. Pin explicitly when you must not infer.

## Setup

Runs once at bootstrap. Array = all serial:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ['corepack enable', 'pnpm install'],
})
```

Callback form uses a **persistent shell** (cwd/env carry over). `parallel` waits before the next serial step:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ({ serial, parallel }) => {
    serial('corepack enable')
    serial('pnpm install')
    parallel(['pnpm build', 'pnpm typecheck'])
    serial('echo bootstrap done')
  },
})
```

Snapshot after setup when the provider supports it → [Lifecycle](./lifecycle).

### Installing an agent CLI

Steps run via `sh -c`; non-zero exit fails bootstrap. Optional native binaries can make `npm install -g` exit `0` while the CLI is broken — **verify the binary**:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

const install = 'npm install -g @openai/codex --include=optional && codex --version'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: [`${install} || { ${install} ; }`],
})
```

Keep each command self-contained. Do not splice one command into another (`` `${cmd} || sudo ${cmd}` ``) — a subshell-leading installer breaks parse with `syntax error: unexpected "("`.

## Scripts

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  scripts: {
    test: 'pnpm test',
    build: 'pnpm build',
    typecheck: 'pnpm test:types',
  },
})
```

Named commands give [Policy](./policy) stable allow/ask/deny targets.
