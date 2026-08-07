---
title: Workspace
id: workspace
order: 4
description: "Describe what the agent sees inside the sandbox: source repo, package manager, setup commands, and named scripts, in one portable definition."
---

The workspace is what the agent boots into: a cloned, installed repo with the
commands you want it to run. `defineWorkspace()` describes that working tree
once. Each harness adapter projects it into its own native format,
and it runs inside whichever [provider](./providers) you chose. This page covers
the working tree itself: `source`, `packageManager`, `setup`, and `scripts`.
Secrets, skills, and MCP servers live on [Provisioning](./provisioning).

```ts
import { createSecrets, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  // Where the working tree comes from.
  source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
  // Package manager (auto-detected from the lockfile when omitted).
  packageManager: 'pnpm',
  // Commands run once during bootstrap.
  setup: ['corepack enable', 'pnpm install'],
  // Named commands the agent can run.
  scripts: { test: 'pnpm test', build: 'pnpm build' },
  // Injected into the sandbox env at create/resume, never persisted.
  secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
})
```

The fields:

| Field            | What it sets                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `source`         | Where the working tree comes from (git repo, local path, or nothing).     |
| `packageManager` | `npm` / `pnpm` / `yarn` / `bun` / `auto`. Defaults to `auto`.              |
| `setup`          | Commands run once during bootstrap (serial array or serial/parallel groups). |
| `scripts`        | Named commands the agent and user can invoke by name.                     |
| `secrets`        | Typed secret refs injected into the env. See [Provisioning](./provisioning). |

> `defineWorkspace()` also takes `skills`, `plugins`, and `instructions` for
> provisioning the agent environment. Those are covered on
> [Provisioning](./provisioning) rather than duplicated here.

## Source

`source` is where the working tree comes from. Five shapes:

```ts
import { defineWorkspace, githubRepo, gitSource } from '@tanstack/ai-sandbox'

// Shorthand for a GitHub repo (owner/repo or a full URL).
defineWorkspace({ source: githubRepo({ repo: 'owner/repo', ref: 'main' }) })

// Any git URL.
defineWorkspace({ source: gitSource({ url: 'https://git.example.com/owner/repo.git' }) })

// The same as gitSource, written out as a plain object.
defineWorkspace({ source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' } })

// An existing directory on the host (e.g. local-process dev loop).
defineWorkspace({ source: { type: 'local', path: '/abs/path/to/repo' } })

// No working tree: the agent starts in an empty workspace.
defineWorkspace({ source: { type: 'none' } })
```

`githubRepo` is a convenience wrapper over `gitSource`: a short `owner/repo`
expands to `https://github.com/owner/repo.git`, while a full URL is used as-is.
Both produce a `{ type: 'git' }` source, so you can also write that object
literal directly when you want full control.

### Shallow clone by default

`githubRepo` and `gitSource` default to a shallow single-branch clone
(`--depth 1 --single-branch`) so cold starts stay fast. Pass a `depth` number
for a specific history depth, or `'full'` to fetch everything:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

// Shallow clone (depth 1) is the default.
defineWorkspace({ source: githubRepo({ repo: 'owner/app' }) })

// Explicit depth: fetches the last 10 commits.
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 10 }) })

// Full history: disables the depth flag entirely.
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 'full' }) })
```

## Package manager

`packageManager` is `'npm'`, `'pnpm'`, `'yarn'`, `'bun'`, or `'auto'`. It
defaults to `'auto'`, which detects the manager from the lockfile after the
source lands. Set it explicitly when you want to pin the choice rather than
infer it.

## Setup

`setup` runs once during bootstrap to turn a freshly cloned repo into an
installed one. It accepts either a plain string array (every step runs serially) or
a builder callback that records serial and parallel groups.

The simplest form is the array, equivalent to all-serial:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ['corepack enable', 'pnpm install'],
})
```

The callback runs over a **persistent shell**: the working directory and
environment carry over between steps, so a `cd` or `export` in a serial step is
visible to the next one. Use `parallel([...])` to launch independent commands
concurrently. They inherit the shell's cwd and env, and the next serial step
waits for all of them to finish:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ({ serial, parallel }) => {
    // Runs in order on the persistent shell; cwd/env carry over.
    serial('corepack enable')
    serial('pnpm install')
    // Both commands launch concurrently, inheriting cwd + env from the shell.
    parallel(['pnpm build', 'pnpm typecheck'])
    // Runs after both parallel steps complete.
    serial('echo bootstrap done')
  },
})
```

> When the provider supports snapshots, bootstrap caches the result after
> `setup` so subsequent runs skip it. See
> [Lifecycle &amp; snapshots](./lifecycle).

### Installing an agent CLI

Every step runs through `sh -c`, and a step fails the bootstrap when its exit
code is non-zero. When a step installs a harness CLI globally, make it verify the
CLI before it returns. The agent CLIs (`@openai/codex`,
`@anthropic-ai/claude-code`, …) ship their native binary as a platform-specific
**optional** dependency, and npm treats optional dependencies as best-effort: a
failed download is not an install error, so `npm install -g` exits `0` and leaves
a CLI that dies later with `Missing optional dependency`. Running the CLI turns
that into a loud bootstrap failure instead of a broken run:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

const install = 'npm install -g @openai/codex --include=optional && codex --version'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  // Retry once: the failure above is usually a transient download.
  setup: [`${install} || { ${install} ; }`],
})
```

Keep each command self-contained. Do not build a step by splicing one command
into another (`` `${cmd} || sudo ${cmd}` ``): a command that starts with a
subshell (like the Grok CLI installer, `(curl … || curl …) | bash`) is not a
valid argument to another command, and `sh` then fails at parse time with
`syntax error: unexpected "("` (exit `2`) without running anything.

## Scripts

`scripts` is a map of named commands the agent and user can invoke by name,
without restating the full command line each time:

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

These are surfaced as named commands rather than freeform shell, which also
gives [Policy](./policy) a stable name to allow, ask about, or deny.
