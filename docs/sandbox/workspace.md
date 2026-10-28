---
title: Workspace
id: workspace
order: 4
description: "Describe what the agent sees inside the sandbox: the source repo, the package manager, the setup commands, and named scripts, in one portable definition."
---

The workspace clones your repo and installs dependencies before the agent starts. The same setup runs on each provider and each agent.

`defineWorkspace()` describes the working tree once. Each harness adapter converts it to its own format, and it runs in any [provider](./providers).

## Define a workspace

Pass a workspace to `defineSandbox`:

```ts
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    // Where the code comes from.
    source: githubRepo({ repo: 'owner/repo', ref: 'main' }),
    // Detected from the lockfile when you omit it.
    packageManager: 'pnpm',
    // Runs once, during bootstrap.
    setup: ['corepack enable', 'pnpm install'],
    // Named commands the agent can run.
    scripts: { test: 'pnpm test', build: 'pnpm build' },
    // Put into the sandbox env at create and resume. Never saved.
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
})
```

| Field | What it sets |
| --- | --- |
| `source` | Where the code comes from: a git repo, a local path, or nothing. |
| `packageManager` | `npm`, `pnpm`, `yarn`, `bun`, or `auto`. The default is `auto`. |
| `setup` | Commands that run once during bootstrap. |
| `scripts` | Named commands that the agent and the user can run by name. |
| `secrets` | Typed secret refs injected into the env. See [Provisioning](./provisioning). |

`defineWorkspace()` also takes `skills`, `plugins`, and `instructions`. Those are on [Provisioning](./provisioning).

## Source

`source` has five shapes:

```ts
import { defineWorkspace, githubRepo, gitSource } from '@tanstack/ai-sandbox'

// A GitHub repo (owner/repo or a full URL).
defineWorkspace({ source: githubRepo({ repo: 'owner/repo', ref: 'main' }) })

// Any git URL.
defineWorkspace({ source: gitSource({ url: 'https://git.example.com/owner/repo.git' }) })

// The same as gitSource, as a plain object.
defineWorkspace({ source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' } })

// A directory on the host (for example, the local-process dev loop).
defineWorkspace({ source: { type: 'local', path: '/abs/path/to/repo' } })

// No code: the agent starts in an empty workspace.
defineWorkspace({ source: { type: 'none' } })
```

`githubRepo` is a short form of `gitSource`:

- A short `owner/repo` becomes `https://github.com/owner/repo.git`.
- A full URL stays as it is.

Both make a `{ type: 'git' }` source, so you can also write that object yourself.

### Shallow clone by default

`githubRepo` and `gitSource` make a shallow single-branch clone (`--depth 1 --single-branch`), so cold starts stay fast. Pass `depth` for more history:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

// Shallow clone (depth 1). This is the default.
defineWorkspace({ source: githubRepo({ repo: 'owner/app' }) })

// The last 10 commits.
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 10 }) })

// Full history. No depth flag.
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 'full' }) })
```

## Package manager

`packageManager` is `'npm'`, `'pnpm'`, `'yarn'`, `'bun'`, or `'auto'`. The default `'auto'` reads the lockfile after the source lands. To pin the choice, set a value.

## Setup

`setup` turns a fresh clone into an installed repo. It runs once, during bootstrap. The simplest form is an array. Each step runs after the one before it:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ['corepack enable', 'pnpm install'],
})
```

To run some steps at the same time, pass a callback:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ({ serial, parallel }) => {
    // These run in order. cwd and env carry over.
    serial('corepack enable')
    serial('pnpm install')
    // These two start at the same time, with the same cwd and env.
    parallel(['pnpm build', 'pnpm typecheck'])
    // This waits for both parallel steps.
    serial('echo bootstrap done')
  },
})
```

The callback runs on one persistent shell. A `cd` or an `export` in a serial step is visible to the next step.

> [!NOTE]
> When the provider supports snapshots, bootstrap saves the result after `setup`, so later runs skip it. See [Lifecycle & Snapshots](./lifecycle).

## Scripts

`scripts` maps names to commands. The agent and the user can run a command by its name:

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

Named scripts also give [Policy](./policy) stable names to allow, ask about, or deny.

## Advanced

### Installing an agent CLI

Every setup step runs through `sh -c`. A step with a non-zero exit code fails the bootstrap.

When a step installs a harness CLI globally, run the CLI at the end of the step. The agent CLIs (`@openai/codex`, `@anthropic-ai/claude-code`, and more) ship their native binary as a platform-specific **optional** dependency. npm treats optional dependencies as best effort:

1. A download of the binary fails.
2. `npm install -g` still exits `0`.
3. The CLI fails later, during the run, with `Missing optional dependency`.

If the step runs the CLI, that failure happens at bootstrap, where you see it:

```ts
import { defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

const install = 'npm install -g @openai/codex --include=optional && codex --version'

defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  // Retry once: this failure is usually a short download problem.
  setup: [`${install} || { ${install} ; }`],
})
```

Keep each command self-contained. Do not build a step by putting one command inside another (`` `${cmd} || sudo ${cmd}` ``). A command that starts with a subshell, such as the Grok CLI installer `(curl ... || curl ...) | bash`, is not a valid argument to another command. `sh` then fails to parse it with `syntax error: unexpected "("` (exit `2`) and runs nothing.

### Non-root providers

Some providers run as a non-root user:

- Installs inside the workspace, such as `pnpm install`, do not need `sudo`.
- System or global package installs on those providers need `sudo -n` in `setup`.

See [Providers (Advanced)](./providers-advanced) for which providers do this, and [Policy](./policy) so that you do not deny `sudo` there.
