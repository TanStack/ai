---
title: Your Own Cloudflare Container
id: cloudflare-container
order: 12
description: "Make a sandbox over the container that your own Durable Object starts with containerSandbox, and keep egress, secrets, and instance limits under your control."
---

`containerSandbox` makes a `SandboxHandle` over `ctx.container` of your own Durable Object. Your Durable Object starts the container and keeps egress, secrets, and instance limits. The provider only runs commands and moves files.

To let the package make the Worker, the Durable Objects, and the container for you, use [Cloudflare (Edge)](./cloudflare) instead.

Your Durable Object keeps these controls:

- **Start, stop, and destroy.** The provider never calls them.
- **Egress.** The provider sets no `enableInternet`, no outbound intercept, and no outbound handler.
- **Secrets and idle timeouts.** The provider sets none of them.
- **The image.** It needs no special server, only `sandbox-shim` (step 2).

## Run commands in your container

1. Install the packages. `@cloudflare/sandbox` must be version 1 or later.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
vue: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
solid: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
svelte: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
preact: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
angular: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
octane: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox
vanilla: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-harness @tanstack/ai-openai @cloudflare/sandbox

<!-- ::end:tabs -->

2. Declare the container and your Durable Object in `wrangler.jsonc`. The image must have `sandbox-shim` at `/usr/local/bin/sandbox-shim`, because `Files` runs it. The `cloudflare/sandbox` image has it. Match the image tag to your `@cloudflare/sandbox` version. See the [Cloudflare requirements](https://developers.cloudflare.com/sandbox/reference/#requirements).

```jsonc
{
  "name": "agent-worker",
  "main": "src/worker.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{ "class_name": "AgentContainer", "image": "./Dockerfile", "max_instances": 5 }],
  "durable_objects": {
    "bindings": [{ "name": "AGENT_CONTAINER", "class_name": "AgentContainer" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["AgentContainer"] }]
}
```

3. Start the container in your Durable Object, then make the handle. The container must run before you use the handle.

```ts
// src/agent-container.ts
import { Files } from '@cloudflare/sandbox'
import { containerSandbox } from '@tanstack/ai-sandbox-cloudflare/container'
import { DurableObject } from 'cloudflare:workers'

export class AgentContainer extends DurableObject<Env> {
  async sandbox() {
    const container = this.ctx.container
    if (!container) throw new Error('The container binding is not configured')
    // Your rules. This container has no internet.
    if (!container.running) container.start({ enableInternet: false })

    const provider = containerSandbox({
      container,
      files: new Files(container),
    })
    return provider.create({ id: this.ctx.id.toString() })
  }

  async hello() {
    const handle = await this.sandbox()
    const result = await handle.process.exec('uname -a')
    return result.stdout
  }
}
```

4. Export the Durable Object from your Worker, deploy, and call `hello()`. It returns the kernel line of your container.

```ts
// src/worker.ts
export { AgentContainer } from './agent-container'

export default {
  async fetch(_request, env) {
    const agent = env.AGENT_CONTAINER.getByName('user-123')
    return new Response(await agent.hello())
  },
} satisfies ExportedHandler<Env>
```

## Give the container to a coding agent

Pass the handle to `sandboxWorkspaceBackend`. The coding tools of the harness then run in your container, behind your egress rules.

```ts
// src/coder.ts
import { defineHarness } from '@tanstack/ai-harness'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export function coder(handle: SandboxHandle) {
  return defineHarness({
    name: 'acme/coder',
    adapter: openaiText('gpt-6.1-sol'),
    plugins: () => [
      workspaceTools({
        workspace: {
          bind: async () => ({
            ...sandboxWorkspaceBackend(handle),
            root: handle.workspaceRoot,
          }),
        },
      }),
    ],
  })
}
```

Leave `owned` off. Then a closed session does not destroy the sandbox, and your Durable Object decides when the container stops. To run the harness, see [Run the coding tools for many threads](../harness/coding-workspaces).

## What the provider does not do

- **Ports.** `handle.ports.connect` throws `UnsupportedCapabilityError`. Send requests to the container from your own Worker.
- **Container variables.** `handle.env.set` keeps the variables in the handle. Each command of that handle gets them. The container and a new handle do not.
- **Destroy.** `destroy` only calls your `onDestroy`. The container keeps running.
- **A different workspace folder.** The default is `/workspace`. Pass `workspaceRoot` to use another folder.

## Save the workspace to R2

Pass a `DirectoryBackup` as `backup`. Then `handle.snapshot(label)` saves the workspace to an R2 bucket. `provider.restoreSnapshot({ snapshotId })` writes it back into the current container.

1. Bind an R2 bucket in `wrangler.jsonc`:

```jsonc
{
  "r2_buckets": [{ "binding": "BACKUPS", "bucket_name": "agent-backups" }]
}
```

2. Export `DirectoryBackupGateway` from your Worker entry. The container sends its backup traffic to this gateway.

```ts
// src/worker.ts
export { DirectoryBackupGateway } from '@cloudflare/sandbox'
export { AgentContainer } from './agent-container'
```

3. Make the provider with `backup`. If your Durable Object calls `interceptAllOutboundHttp()`, call `backup.intercept()` first. Do it right after the start, before the catch-all.

```ts
// src/agent-container.ts
import { DirectoryBackup, Files } from '@cloudflare/sandbox'
import { containerSandbox } from '@tanstack/ai-sandbox-cloudflare/container'
import { DurableObject } from 'cloudflare:workers'

export class AgentContainer extends DurableObject<Env> {
  provider() {
    const container = this.ctx.container
    if (!container) throw new Error('The container binding is not configured')
    if (!container.running) container.start({ enableInternet: false })

    const backup = new DirectoryBackup(
      container,
      this.ctx.exports.DirectoryBackupGateway,
      { binding: 'BACKUPS' },
    )
    return containerSandbox({ container, files: new Files(container), backup })
  }

  async save(label: string) {
    const handle = await this.provider().create({ id: this.ctx.id.toString() })
    if (!handle.snapshot) throw new Error('The provider has no backup')
    const ref = await handle.snapshot(label)
    await this.ctx.storage.put('latestSnapshotId', ref.id)
    return ref.id
  }

  async restore() {
    const snapshotId = await this.ctx.storage.get('latestSnapshotId')
    if (typeof snapshotId !== 'string') return null
    const provider = this.provider()
    if (!provider.restoreSnapshot) throw new Error('The provider has no backup')
    return provider.restoreSnapshot({ snapshotId })
  }
}
```

The snapshot id is the backup record as a JSON string. Store it where you keep state, for example in Durable Object storage or in `latestSnapshotId` of your `SandboxInstanceStore`. `restoreSnapshot` throws when the id is not a backup record.

Take the snapshot at a time with no commands that write to the workspace. A file that changes during the backup is saved as it is at that moment.

A `DirectoryBackup` works only on Cloudflare. To keep checkpoints in your own store, and restore them on any provider, see [Checkpoint at Any Time](./portable-snapshots-checkpoints).

Call `save('after-tests')`, stop the container, then call `restore()`. The files of the workspace are back.
