---
title: Deploy a harness
id: harness-deploy
order: 6
description: "Run a harness in your server, on background workers, as a worker process, on another machine, or as a single executable."
keywords:
  - tanstack ai
  - harness
  - deploy
  - build
  - worker
---

Your harness works on your laptop. Now it needs to run next to your API, in its own process, on a different machine, or as a CLI your team can download. You pick the place. The harness definition stays the same.

| Place | How |
|---|---|
| Your server | `createHarnessHost` and `createHarnessHandler` in your routes. No build step. |
| Background workers | `createHarnessWorker` on a host that shares the log store. See [Run background work on workers](./workers). |
| A worker process | `buildHarness`, then `artifactText(dir)` as the model of a `chat()` call. |
| Another machine | `createHarnessHandler` there, then `harnessText({ url, token })` here. |
| A single executable | `buildHarness({ compile })` with Bun. |

## Run more than one server

Give every server the same log store. Then any server can take a request for any thread:

- One server owns a thread at a time. An input that reaches another server waits in the log for the owner. See [One host drives a thread](./durable-sessions#one-host-drives-a-thread).
- A [worker](./workers) runs the threads that no server has open: submitted inputs, schedules, and the work that a deploy cut.
- Set the same `media: { secret }` on the handler of each server, so each server checks the media URLs of the others. See [Serve the session over HTTP](./connect#serve-the-session-over-http).
- Stop each server with `host.close({ recoverable: true })`. A worker takes its cut work at once. See [Stop a host for a deploy](./durable-sessions#stop-a-host-for-a-deploy).
- If your agents use the [coding tools](./coding-tools) on the disk of a server, set `ownership: { hostId }` on each host. Then a thread stays on the server that has its folder. See [Move a thread to another server](./coding-workspaces#5-move-a-thread-to-another-server).

## Build a worker artifact

`buildHarness` bundles the harness with Bun and writes a manifest next to it. Install [Bun](https://bun.sh) on the build machine.

```ts group=harness-deploy
import { artifactText, buildHarness } from '@tanstack/ai-harness/build'

const { manifest } = await buildHarness({
  entry: './src/studio.ts',
  export: 'studio',
  outDir: './dist/studio',
})
console.log(manifest.name, manifest.digest)
```

- `dist/studio/harness.js` starts the harness as a worker. It reads session frames on stdin and writes them on stdout.
- `dist/studio/harness.manifest.json` names the harness, its agents and plugins, what it needs (file system, processes, network), and the sha256 digest of the bundle.

The build imports your entry in a child process to read the harness name, agents, and plugins. Importing a module runs its code.

## Run the artifact as a model

`artifactText` starts one worker process per outer thread and checks the digest first. A changed bundle is refused.

```ts group=harness-deploy
import { chat } from '@tanstack/ai'

const model = await artifactText('./dist/studio')
const stream = chat({
  adapter: model,
  messages: [{ role: 'user', content: 'Plan the launch post.' }],
  threadId: 'thread-1',
})
// When you are done with the workers:
model.dispose()
```

The worker keeps the conversation of its thread between calls. Workers get the environment of the process that starts them, so they can read your provider keys.

## Use a harness on another machine

On the other machine, serve the harness with `createHarnessHandler`. Check the bearer token in `identify` of the host `access`. See [Serve the session over HTTP](./connect#serve-the-session-over-http).

Here, use it as a model:

```ts group=harness-deploy
import { harnessText } from '@tanstack/ai-harness'

const remote = harnessText({ url: 'http://build-box:8787', token: 'your-token' })
```

The remote session keeps the conversation, so each call sends only the new message.

## Ship a single executable

Point `compile.entry` at the file that starts your app, for example a server or a command-line tool that imports the harness:

```ts group=harness-deploy
await buildHarness({
  entry: './src/studio.ts',
  export: 'studio',
  outDir: './dist/studio',
  compile: { entry: './src/main.ts', outfile: './dist/studio-app', target: 'bun-linux-x64' },
})
```

Bun can build for another platform with `target`, for example `bun-darwin-arm64` or `bun-windows-x64`.

## What you have now

- The same harness in your server, on background workers, in a worker process, on another machine, or as a binary.
