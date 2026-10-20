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
- If your agents use the [coding tools](./coding-tools) on the disk of a server, set `ownership: { hostId }` on each host. Then a thread stays on the server that has its folder, while that server sends heartbeats. Use an id that stays the same after a restart, like the pod name of a StatefulSet, and keep a restart shorter than `ownership.expiresAfterMs`. See [Move a thread to another server](./coding-workspaces#5-move-a-thread-to-another-server).

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

On the other machine, serve the harness with `createHarnessHandler`. Check the bearer token in `getUser` of the host `access`. See [Serve the session over HTTP](./connect#serve-the-session-over-http).

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

## Trace runs and report operations

A turn is slow or fails on one of your servers, and you cannot see which run or which server. Give the host a tracer and an `onOperation` listener. The host then writes a span for each run, and tells your listener when each run starts and ends.

Pass an OpenTelemetry tracer as it is. Install `@opentelemetry/api` in your app first. It is an optional peer dependency of the harness.

```ts
import { trace } from '@opentelemetry/api'
import { createHarnessHost } from '@tanstack/ai-harness'

const host = createHarnessHost({
  observability: {
    tracer: trace.getTracer('support-app'),
    onOperation: ({ phase, operation }) => {
      if (phase !== 'settled') return
      console.log(operation.kind, operation.status, operation.durationMs)
      console.log('tokens', operation.usage?.totalTokens)
    },
  },
})
```

The host writes these spans:

| Span | When |
|---|---|
| `harness.operation` | For each turn, agent run, and command that this host runs. A child agent run on the same host is a child span of the run that started it. |
| `harness.recovery` | This host takes the work of a host that stopped. |
| `harness.wait` | A wait for a person ends. The span starts at the time that the wait opened, also when another host opened it. |
| `harness.transfer` | `host.transfer` moves a conversation. |

Each span has `harness.thread_id`, and `harness.tenant_id` for a tenant. A `harness.operation` span also has `harness.run_id`, `harness.parent_run_id`, `harness.operation.kind`, `harness.agent`, and `harness.operation.status`.

`onOperation` gets one `started` report and one `settled` report for each operation:

- Only the host that runs the operation calls it. A server that only passed the input on reports nothing.
- A `settled` report has `status`, `durationMs`, and `usage`. The usage counts the model calls of the run, of its child runs, and of plugins in the run.
- A failed operation has `error`, with its `message`, and its `code` when it has one.
- If your listener throws, the host sends a `harness.plugin.warning` event and goes on.

Without `observability`, the host writes no spans and does no work for them.

### Join a turn to the trace of your app

Send the `traceparent` of your current span with the message:

```ts
import { context, propagation } from '@opentelemetry/api'
import { createHarnessClient } from '@tanstack/ai-harness/client'

const client = createHarnessClient({ url: '/api/harness', threadId: 'thread-1' })

const carrier: Record<string, string> = {}
propagation.inject(context.active(), carrier)
const traceparent = carrier.traceparent
await client.send('Where is my order?', traceparent ? { traceparent } : {})
```

The client sends it as the `traceparent` header. The `harness.operation` span of the turn gets a link to your span, on the server that runs the turn. To send it from another language, see [Traces](./protocol#traces).

## Known limits

Check these before you run many servers or long threads.

Across servers and restarts:

- A [`harnessAgent`](./subagents#call-a-harness-as-a-child) child waits only in memory. Its parent run waits on the same host. Another host, or a crash, does not resume it. After a crash, the next owner of the log ends the waits of the child.
- A [log snapshot](./durable-sessions#keep-a-long-log-fast-to-open) holds the full fold of the thread, so it grows with the thread. To keep the log small, drop the old records with [`keepLogRecords: 'since-snapshot'`](./lifecycle#drop-the-records-before-a-snapshot).
- `host.resumePending` opens the threads that it takes one at a time. A `GET run` by run id looks through the open sessions one at a time too.

Users and plugins:

- With an [OAuth MCP server](./mcp#3-sign-in-to-an-oauth-server), the MCP SDK sends its own refresh request for each session. Only the save of the new token is single-flight, so two sessions can use a rotating refresh token at the same time.
- Plugin tools do not reach background agents. The `question` tool works only in a turn of the lead agent.

## What you have now

- The same harness in your server, on background workers, in a worker process, on another machine, or as a binary.
- A span and a report for each run, linked to the trace of your app.
