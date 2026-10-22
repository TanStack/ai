---
title: Quick Start
id: quick-start
order: 2
description: "Run a Grok Build coding agent inside a Docker sandbox, let it fix a bug in a cloned repo, and print the diff. About 10 minutes."
---

This guide runs a Grok Build agent in Docker. The agent clones a repo, fixes a bug, and the script prints the `git diff`.

You need:

- Docker, running.
- An `XAI_API_KEY`.
- A public GitHub repo with a bug. The samples use `owner/buggy-app`. Replace it with your repo.

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

- `@tanstack/ai`: the `chat()` pipeline.
- `@tanstack/ai-grok-build`: the Grok Build harness adapter.
- `@tanstack/ai-sandbox`: `defineSandbox`, `defineWorkspace`, and `withSandbox`.
- `@tanstack/ai-sandbox-docker`: the Docker provider. It runs the agent in a container.

## 2. Write the agent script

Save this as `fix-bug.mts`:

```ts
import { chat } from '@tanstack/ai'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    // Where the code comes from. A shallow clone by default.
    source: githubRepo({ repo: 'owner/buggy-app' }),
    packageManager: 'pnpm',
    // These commands run once, when the sandbox is new.
    setup: [GROK_CLI_INSTALL_COMMAND, 'corepack enable', 'pnpm install'],
    // Put into the sandbox env. Never saved to snapshots, stores, or logs.
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

const stream = chat({
  threadId: 'bug-fix-1',
  adapter: grokBuildText('grok-build'),
  messages: [
    { role: 'user', content: 'The tests fail. Find the bug and fix it.' },
  ],
  middleware: [withSandbox(repoSandbox)],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta)
  }
  if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    console.log('\n--- diff ---\n')
    console.log(chunk.value.diff)
  }
}
```

- `provider` is where the agent runs. Here it is a Docker container.
- `workspace` is what the agent sees: the cloned repo, the Grok CLI, and the installed dependencies.
- `lifecycle` keeps one sandbox per thread. It also takes a snapshot after setup, so only the first run pays for the clone and the install.
- `threadId` names the sandbox. The next run with the same `threadId` uses the same container.

## 3. Run it

```bash
XAI_API_KEY=your-key npx tsx fix-bug.mts
```

You see the agent's text as it works. When the run ends, you see the diff of every file it changed. The agent cloned the repo, found the bug, and edited the files, all inside the container.

## How it works

- `grokBuildText` declares that it needs a sandbox. `withSandbox(repoSandbox)` gives it one.
- `withSandbox` resumes the sandbox for `threadId`, or creates it and runs `setup`.
- The adapter starts `grok` inside the sandbox. Its events come back as normal `chat()` chunks.
- When the run ends, the Grok Build adapter sends a `file.changed` event with the `git diff` of the working tree.

To learn more about each piece:

- [Workspace](./workspace): package manager detection, parallel setup steps, and clone depth.
- [Events](./events): every event a harness run sends.
- [Lifecycle & Snapshots](./lifecycle): reuse and snapshots.

## No Docker? Run on your host

The local-process provider runs the agent directly on your host. It gives no isolation, but it is the fastest loop for development.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-sandbox-local-process
vue: @tanstack/ai-sandbox-local-process
solid: @tanstack/ai-sandbox-local-process
svelte: @tanstack/ai-sandbox-local-process
preact: @tanstack/ai-sandbox-local-process
angular: @tanstack/ai-sandbox-local-process
vanilla: @tanstack/ai-sandbox-local-process
octane: @tanstack/ai-sandbox-local-process

<!-- ::end:tabs -->

This sample uses the `grok login` on your machine, so the `grok` CLI must be installed on your host.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: localProcessSandbox({
    scrubEnv: ['XAI_API_KEY', 'GROK_API_KEY'],
  }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/buggy-app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: { reuse: 'thread' },
})

const stream = chat({
  adapter: grokBuildText('composer-2.5', { authMode: 'host' }),
  messages: [
    { role: 'user', content: 'The tests fail. Find the bug and fix it.' },
  ],
  threadId: 'thread-1',
  middleware: [withSandbox(repoSandbox)],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta)
}
```

- `authMode: 'host'` tells the adapter to use your `grok login`.
- `scrubEnv` removes API keys that the host process inherited. If those keys stay, they override the login.

On a CI runner there is no browser login. There, set `authMode: 'api-key'` and pass `XAI_API_KEY` as a workspace secret. See [Harness Auth](./auth).

## Want a microVM? Use Docker Sandboxes

`sbxSandbox()` runs the agent in a hypervisor microVM, not in a container.

1. Install Docker Sandboxes so that `sbx` is on your `PATH`:
   - macOS: `brew trust docker/tap`, then `brew install docker/tap/sbx`.
   - Windows: turn on HypervisorPlatform, then `winget install -h Docker.sbx`.
   - Debian or Ubuntu: `curl -fsSL https://get.docker.com | sudo REPO_ONLY=1 sh`, then `apt-get install docker-sbx`. Add your user to the `kvm` group.
2. Run `sbx login`.
3. Change `repoSandbox` in `fix-bug.mts`:

```ts
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { sbxSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: sbxSandbox({
    allowNetwork: ['*.npmjs.org', 'registry.npmjs.org'],
  }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/buggy-app' }),
    setup: ['pnpm install'],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread' },
})
```

`allowNetwork` lets `pnpm install` reach the npm registry. A known adapter such as `grok-build` also adds its model API host.

`sbxSandbox()` always clones a Git repo into the VM. It does not take snapshots. It resumes a sandbox by its name.

## Run a full example app

[`examples/sandbox-web`](https://github.com/TanStack/ai/tree/main/examples/sandbox-web) is a complete app. It is a "build me an app" agent (Claude Code on Docker) with runs that continue after a refresh. It scaffolds an app in the sandbox, starts the dev server, and streams back a live preview URL.

[`examples/sandbox-cloudflare`](https://github.com/TanStack/ai/tree/main/examples/sandbox-cloudflare) runs a coding agent at the edge. You pick Claude Code, Codex, or Grok Build for each run in the UI.

Next, pick one:

- Give the agent your own server tools (database lookups, secrets): [Tools](./tools).
- Limit what the agent can run: [Policy](./policy).
- Watch each file the agent touches: [Events](./events).
