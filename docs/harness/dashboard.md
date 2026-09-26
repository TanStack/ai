---
title: Self-host the dashboard
id: harness-dashboard
order: 10
description: "Watch and steer your harness sessions from a browser or a phone. Agents dial out to your dashboard server, so they need no open port."
keywords:
  - tanstack ai
  - harness
  - dashboard
  - mobile
  - relay
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

The first time, the agent prints a pairing code. Approve the code in the dashboard under "Pairing requests". The agent gets a host token. Pass it as `token` (or `HARNESS_DASHBOARD_TOKEN` for the CLI) to skip pairing next time. Revoke a host in the dashboard to cut it off.

## What you can do in the dashboard

- See hosts (online or offline) and sessions (running, waiting for you, idle).
- Read the messages and tool calls of a session as they stream.
- Approve or reject tool calls, and answer questions from plugins.
- Send a prompt, steer a running turn, or stop it.

Inputs for an offline host wait at the dashboard for 10 minutes and reach the host when it reconnects. Set `allowRemoteStart: true` in `connectDashboard` to let the dashboard open new sessions on the host.

On a phone, open the dashboard and add it to the home screen. It works as an installed web app.

## What you have now

- Your sessions on any screen, with approvals and prompts a tap away.
