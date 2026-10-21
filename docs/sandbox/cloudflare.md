---
title: Cloudflare (Edge, Advanced)
id: cloudflare
order: 11
description: "Run a coding-agent harness at the edge with @tanstack/ai-sandbox-cloudflare: the agent loop, the run log, and the sandbox container in one Worker deploy, with runs that survive a closed tab."
---

You want your coding agent at the edge: the agent loop, its run history, and the sandbox container in one Cloudflare deploy. You also want a run to keep going when the user closes the tab, without running your own stream servers.

`@tanstack/ai-sandbox-cloudflare` gives you both. `createCloudflareSandboxAgent` builds the Worker routes, a coordinator Durable Object that drives each run and keeps its log, and the container plumbing.

For the provider-neutral basics (workspace, tools, policy, lifecycle), start at the [Overview](./overview).

## Deploy an agent at the edge

1. Install the packages.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
vue: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
solid: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
svelte: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
preact: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
angular: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
octane: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod
vanilla: @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-cloudflare @tanstack/ai-sandbox-local-process @tanstack/ai-claude-code zod

<!-- ::end:tabs -->

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: wrangler
vue: wrangler
solid: wrangler
svelte: wrangler
preact: wrangler
angular: wrangler
octane: wrangler
vanilla: wrangler

<!-- ::end:tabs -->

2. Add a `Dockerfile` for the sandbox container. Start from the `cloudflare/sandbox` base image, and install your harness CLI. Match the image tag to the `@cloudflare/sandbox` version in your lockfile.

```dockerfile
FROM docker.io/cloudflare/sandbox:0.12.1

RUN npm install -g @anthropic-ai/claude-code --include=optional && claude --version
```

3. Declare the container and the two Durable Objects in `wrangler.jsonc`.

```jsonc
{
  "name": "edge-agent",
  "main": "src/worker.ts",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{ "class_name": "Sandbox", "image": "./Dockerfile", "max_instances": 5 }],
  "durable_objects": {
    "bindings": [
      // The coordinator that owns each run and its log.
      { "name": "RUN_COORDINATOR", "class_name": "RunCoordinator" },
      // The container host.
      { "name": "Sandbox", "class_name": "Sandbox" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RunCoordinator", "Sandbox"] }
  ],
  "vars": { "SANDBOX_TRANSPORT": "rpc" }
}
```

4. Create the agent. The package binds no API key, so declare the key your harness needs and pass it as a [workspace secret](./provisioning). This example uses `ANTHROPIC_API_KEY` for Claude Code. Grok Build uses `XAI_API_KEY`, and Codex uses `CODEX_API_KEY`.

```ts
// src/agent.ts
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'
import { createCloudflareSandboxAgent } from '@tanstack/ai-sandbox-cloudflare/agent'
import type { SandboxAgentEnv } from '@tanstack/ai-sandbox-cloudflare/agent'

export interface AppEnv extends SandboxAgentEnv {
  ANTHROPIC_API_KEY: string
}

export const agent = createCloudflareSandboxAgent<AppEnv>({
  adapter: () => claudeCodeText('claude-opus-4-8'),
  sandbox: (_input, env) =>
    defineSandbox({
      id: 'cf-edge-agent',
      provider: cloudflareSandbox({ binding: env.Sandbox }),
      workspace: defineWorkspace({
        // The image already has the CLI. Nothing to clone.
        source: { type: 'none' },
        secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
      }),
      // One sandbox per thread, so a follow-up run reuses the workspace.
      lifecycle: { reuse: 'thread' },
    }),
})
```

5. Export the Worker and the Durable Object classes, set the key, and deploy.

```ts
// src/worker.ts
import { agent } from './agent'

// The class names in wrangler.jsonc.
export const RunCoordinator = agent.Coordinator
export const Sandbox = agent.Sandbox

export default agent.worker
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

## Start a run from the client

`POST /runs` starts a run and returns `202 { runId }` at once. Then open a WebSocket on `/runs/<runId>/stream` to tail it.

```ts
export async function startRun(threadId: string, prompt: string) {
  const response = await fetch('/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('runId' in body) ||
    typeof body.runId !== 'string'
  ) {
    throw new Error('POST /runs returned no runId')
  }
  return body.runId
}

// Pass the last `seq` you saw to resume after a drop. -1 replays from the start.
export function tailRun(threadId: string, runId: string, lastSeq = -1) {
  const url = new URL(`/runs/${runId}/stream`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('threadId', threadId)
  url.searchParams.set('lastSeq', String(lastSeq))

  const socket = new WebSocket(url)
  socket.addEventListener('message', (message) => {
    // `{ seq, chunk }` per event, then one `{ type: 'status', record }`.
    console.log(JSON.parse(String(message.data)))
  })
  return socket
}
```

Call `startRun`, then `tailRun`. Close the tab in the middle, open it again, and tail with your last `seq`: the run kept going.

## How it works

- **The Worker only routes.** `POST /runs` goes to the coordinator Durable Object for that `threadId`, which registers the run and returns. The Worker does not wait for the agent.
- **The coordinator drives the run.** It runs `chat()` with your adapter. The agent CLI runs in the container. Your `chat()` tools reach the agent through an MCP bridge on the coordinator's own `fetch` handler.
- **Every chunk goes to a run log** in Durable Object storage, under a growing `seq`. Clients tail that log from a cursor. A refresh, a dropped WebSocket, or a coordinator that hibernates between chunks never touches the sandbox.
- **The container is reached over the network**, through callback URLs that the coordinator derives from the request host. A `*.workers.dev` deploy needs no config.

This is the default **DO-drives** model. In the **co-located** model, the agent loop runs inside the container instead. See [Cloudflare Edge Details](./cloudflare-advanced#co-located-mode).

## Durable runs at the edge

Cloudflare is the **log-first tier** of the [durable runs](./durable-runs#the-two-tiers) protocol. The coordinator's run log is the durable copy. A closed tab or dropped WebSocket only detaches the tail: the coordinator keeps driving, and the log keeps filling.

Two rules matter in production:

- **Stop must destroy the container.** `cloudflareSandbox` declares `killableProcesses: false`: no signal crosses the Workers RPC boundary. So the only cancel that stops the agent is to destroy the container. A run marked `aborted` without the destroy keeps working, and billing, behind a UI that says "stopped". See [what cancel means on a provider that cannot kill](./takeover#what-cancel-means-on-a-provider-that-cannot-kill).
- **The run log survives, the container does not.** If the container stops, the agent dies mid-run, like anywhere else. The log keeps everything emitted up to that point.

> [!WARNING]
> The Sandbox container class has a `sleepAfter` idle timeout. A detached run that is quiet (nobody connected, the agent thinking) can look idle, and an idle container sleeps. The run then "dies for no reason", while the log keeps its prefix. Set `sleepAfter` well above your longest quiet stretch before you rely on detached runs.

### Stall watchdog

`createCloudflareSandboxAgent` sets one stall policy for the whole app. `stallTimeoutMs` applies to every run, in both `do-drives` (the default) and `colocated` mode:

| Value | Behavior |
| --- | --- |
| Omitted | A run with no persisted activity for `300000` ms (five minutes) is stalled. |
| Positive safe integer | Use that many milliseconds as the limit. |
| `false` | No stall detection. |

To allow ten quiet minutes, add one line next to `adapter` in `src/agent.ts`:

```diff
 export const agent = createCloudflareSandboxAgent<AppEnv>({
   adapter: () => claudeCodeText('claude-opus-4-8'),
+  stallTimeoutMs: 10 * 60_000,
   sandbox: (_input, env) =>
```

How it decides:

- **The alarm checks every 30 seconds**, or every `stallTimeoutMs` when that is shorter. So detection can lag the limit by up to one check.
- **Activity resets the clock.** Persisted run events do. Authenticated `/_bridge` and `/tool-exec` callbacks do too, when they arrive and when they complete. Unknown-run and unauthorized requests do not.
- **Set the limit above your longest quiet period.** A native operation that emits no event and makes no callback is invisible to the watchdog.
- **An in-flight authenticated callback is protected.** A callback that never completes can leave an orphaned `running` record. So can `false`.

On a stall, the watchdog marks the run log `failed`. It does not promise to kill the agent process or the container. Use provider lifecycle controls and the [reaper](./reaping) for cleanup.

## Go deeper

For the co-located model, live previews, callback hosts, the run log internals, and what edge durability does not cover, see [Cloudflare Edge Details](./cloudflare-advanced).
