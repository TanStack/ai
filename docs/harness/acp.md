---
title: Use a harness from an editor (ACP)
id: harness-acp
order: 6
description: "Serve a harness as an ACP v2 agent, so an editor such as Zed can start it as a process and talk to it over stdio."
keywords:
  - tanstack ai
  - harness
  - ACP
  - agent client protocol
  - editor
---

Your users want your agent in their editor. Editors such as Zed start an agent as a process and talk the Agent Client Protocol (ACP) over stdin and stdout. `serveAcp` makes your harness an ACP v2 agent.

## 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-acp
vue: @tanstack/ai-acp
solid: @tanstack/ai-acp
svelte: @tanstack/ai-acp
preact: @tanstack/ai-acp
angular: @tanstack/ai-acp
octane: @tanstack/ai-acp
vanilla: @tanstack/ai-acp

<!-- ::end:tabs -->

## 2. Serve the harness

Make a script that the editor starts:

```ts group=harness-acp
import { serveAcp } from '@tanstack/ai-acp/agent'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

serveAcp({ host, harness: assistant, version: '1.0.0' })
```

- Each ACP session is one harness session. The ACP session id is the thread id.
- `version` is the version that `initialize` reports. Default: `'0.0.0'`.
- `cwd` is the working directory that the session list shows for each session. Default: `process.cwd()`.
- Use a persistent store instead of `memoryPersistence()` if a session must stay after the process stops.

## 3. Add the agent to the editor

Give the editor the command that runs the script, for example `node agent.js`. The editor then sends prompts, and the harness streams the answer back.

## What the editor gets

- The text and the reasoning of the main agent. Text from child agents stays out of the main message.
- Each tool call, of the main agent and of child agents, as a tool call update.
- Tool approvals as permission requests. The user picks **Allow** or **Reject**, and the turn continues.
- Cancel stops the running turn. A turn that fails ends with the `error` stop reason and the message.
- Image blocks, audio blocks, and embedded files of a prompt go to the media store of the session. A file that the harness refuses fails the prompt with an invalid params error. See [Send and show media](./media).

## Open an old session

The editor lists the sessions of the harness, newest first. The user picks one, and the next prompt continues that thread.

- The list shows the top-level sessions of the harness. Sessions of child agents stay out.
- The list comes from the session index of the host. Use a persistent store, so that the list keeps the sessions after the process stops.

## Known limits

- ACP v2 is still a draft, so this API is experimental.
- The editor shows tool approvals only. A turn that asks the user a question, or that needs a sign-in, stops and waits, because the editor cannot answer it.
- Each session in the list shows the same working directory: the `cwd` of the agent. If the editor asks for the sessions of another directory, the list is empty.
- An old session opens without its earlier messages. The editor shows only the new turns. The model still gets the full thread.
- A resource link in a prompt is only named. The harness does not read it. The model can open it with its own tools.

## Use your own stream

`serveAcp` uses stdin and stdout when you pass no `stream`. To use another transport, pass an ACP `Stream`, or call `createAcpAgent({ host, harness })` and connect the app yourself:

```ts group=harness-acp
import { createAcpAgent } from '@tanstack/ai-acp/agent'

export const app = createAcpAgent({ host, harness: assistant })
```

## What you have now

- Your harness as an agent in any ACP v2 editor.
- Tool approvals, cancel, media, and old sessions from the editor.
