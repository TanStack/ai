---
title: Deploy a harness
id: harness-deploy
order: 9
description: "Run a harness in your server, as a worker process, on another machine, or as a single executable."
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
| A worker process | `buildHarness`, then `artifactText(dir)` as the model of a `chat()` call. |
| Another machine | `runCli(harness)` with `--serve` there, then `harnessText({ url, token })` here. |
| A single executable | `buildHarness({ compile })` with Bun. |

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

On the other machine, serve the harness with the CLI. It prints a token unless you set one:

```bash
HARNESS_TOKEN=your-token npx tsx cli.ts --serve --host 0.0.0.0
```

Here, use it as a model:

```ts group=harness-deploy
import { harnessText } from '@tanstack/ai-harness'

const remote = harnessText({ url: 'http://build-box:8787', token: 'your-token' })
```

The remote session keeps the conversation, so each call sends only the new message.

## Ship a single executable

Point `compile.entry` at a file that calls `runCli`:

```ts group=harness-deploy
await buildHarness({
  entry: './src/studio.ts',
  export: 'studio',
  outDir: './dist/studio',
  compile: { entry: './src/cli.ts', outfile: './dist/studio-cli', target: 'bun-linux-x64' },
})
```

Bun can build for another platform with `target`, for example `bun-darwin-arm64` or `bun-windows-x64`.

## What you have now

- The same harness in your server, in a worker process, on another machine, or as a binary.
