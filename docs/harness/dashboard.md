---
title: Self-host the dashboard
id: harness-dashboard
order: 16
description: "Watch and steer your harness sessions from a browser or a phone. Agents dial out to your dashboard server, so they need no open port."
keywords:
  - tanstack ai
  - harness
  - dashboard
  - mobile
  - relay
  - pairing
  - allowRemoteStart
---

Your agent runs on a laptop, a server, or a CI runner, and it stops to ask for approval while you are away from that terminal. The dashboard shows every connected session in a browser or on your phone. You approve tools, answer questions, and send prompts from there. Agents connect out to the dashboard, so they need no open port.

## 1. Start the dashboard

```bash
npx @tanstack/ai-dashboard --port 8790
```

It prints a sign-in link that holds the owner token. Set `DASHBOARD_OWNER_TOKEN` to keep the same token across restarts. Put the dashboard behind TLS when it is reachable from other machines.

## 2. Connect an agent

With the CLI, add `--dashboard`:

```bash
npx tsx cli.ts --dashboard http://127.0.0.1:8790
```

In your own host, call `connectDashboard`:

```ts group=harness-dashboard
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { connectDashboard } from '@tanstack/ai-dashboard/connect'
import { openaiText } from '@tanstack/ai-openai'

const studio = defineHarness({ name: 'acme/studio', adapter: openaiText('gpt-5.6') })
const host = createHarnessHost()

const connection = await connectDashboard({
  host,
  harness: studio,
  url: 'http://127.0.0.1:8790',
  threads: ['main'],
  onPairingCode: (code) => console.log(`Approve ${code} in the dashboard`),
  onToken: (token) => console.log(`Save this host token: ${token}`),
})
```

## 3. Pair it

The first time, the agent prints a pairing code. Approve the code in the dashboard under "Pairing requests". The agent gets a host token. Pass it as `token` (or `HARNESS_DASHBOARD_TOKEN` for the CLI) to skip pairing next time. Revoke a host in the dashboard to remove its access.

A saved token works while the same dashboard process runs. The dashboard keeps tokens in memory, so a restart makes them invalid. See [When the dashboard restarts](#when-the-dashboard-restarts).

## What you can do in the dashboard

- See hosts (online or offline) and sessions (running, waiting for you, idle).
- Read the messages and tool calls of a session as they stream.
- Approve or reject tool calls, and answer questions from plugins.
- Send a prompt, steer a running turn, or stop it.
- Open a thread on a host by its id. See [Open a thread](#open-a-thread).

Inputs for an offline host wait at the dashboard for 10 minutes and reach the host when it reconnects.

On a phone, open the dashboard and add it to the home screen. It works as an installed web app.

To show a session list and a live status in your own app, use the session index of the host. See [List, rename, and fork sessions](./sessions).

## Open a thread

The dashboard shows the threads in `threads`. To watch another thread, or to start a new one from your phone, open it by its id.

Set `allowRemoteStart: true` in `connectDashboard`:

```ts group=harness-dashboard
const remote = await connectDashboard({
  host,
  harness: studio,
  url: 'http://127.0.0.1:8790',
  threads: ['main'],
  allowRemoteStart: true,
  onPairingCode: (code) => console.log(`Approve ${code} in the dashboard`),
})
```

Then open the thread in the dashboard:

1. Find the host under "Hosts".
2. Type a thread id in the "Thread id" field.
3. Click "Open".

The thread view opens. For a new thread, send a prompt to start it. If the host is offline, the view shows "Queued: the host is offline." The host opens the thread if it reconnects within 10 minutes.

Know these limits:

- The form shows on every host. A host does not tell the dashboard if it allows remote start.
- The dashboard sends the open request to the host and does not wait for an answer. A host without `allowRemoteStart` ignores it. Then the host refuses the first input that you send, and the view shows "Refused: remote_start_disabled".
- A thread in `threads`, or a thread that you attach with `connection.attach(threadId)`, opens without `allowRemoteStart`.
- The CLI does not set `allowRemoteStart`. It opens only its own thread: the `--thread` value, `main` by default.

## When the dashboard restarts

The dashboard keeps host tokens in memory. After a restart, it refuses each saved token with a `401`. What the agent does next depends on `onPairingCode`:

- With `onPairingCode`, the agent pairs again. It calls `onPairingCode` with a new code. After you approve the code, it calls `onToken` with the new token.
- Without `onPairingCode`, the connection stops, and the agent calls `onError`.

If the agent starts with a refused token and has `onPairingCode`, `connectDashboard` waits until you approve the new code. The CLI sets `onPairingCode`, so it prints a new code, then a new token to save.

To stop and report the error, set `onError` and do not set `onPairingCode`:

```ts group=harness-dashboard
const savedToken = process.env.HARNESS_DASHBOARD_TOKEN
if (!savedToken) throw new Error('Set HARNESS_DASHBOARD_TOKEN first.')

const strict = await connectDashboard({
  host,
  harness: studio,
  url: 'http://127.0.0.1:8790',
  token: savedToken,
  onError: (error) => console.error(`Pair this host again: ${error.message}`),
})
```

`connection.token` always holds the current host token. It changes when the agent pairs again.

A revoked host also gets a `401`. If it has `onPairingCode`, it asks to pair again, and a new request shows under "Pairing requests". If you do not approve the request, the host does not connect. Each request expires after 10 minutes, and then the host asks again. To stop the requests, call `connection.close()` on that host, or stop the agent.

## What you have now

- Your sessions on any screen, with approvals and prompts a tap away.
- Threads that you open from the dashboard, on hosts that allow it.
- Agents that pair again after a dashboard restart, or that stop and report it.
