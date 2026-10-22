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
- `user` is the user of the editor, for example `serveAcp({ host, harness: assistant, user: { id: 'ada' } })`. Every session opens as that user, so `/connect` saves keys for them. On a host with [`access`](./access), `user` is required.
- The prompts of a session run one after another, in the order that the editor sent them. A prompt with a large file keeps its place while the file uploads. The harness `busy` setting does not apply.
- The agent holds a session only while a prompt runs or waits. An idle session closes after the host `lifecycle.closeIdleSessionsAfterMs`, and the next prompt opens it again.
- `version` is the version that `initialize` reports. Default: `'0.0.0'`.
- `cwd` is the working directory that the session list shows for each session. Default: `process.cwd()`.
- Use a persistent store instead of `memoryPersistence()` if a session must stay after the process stops.

## 3. Add the agent to the editor

Give the editor the command that runs the script, for example `node agent.js`. The editor then sends prompts, and the harness streams the answer back.

## What the editor gets

- The text and the reasoning of the main agent. Text from child agents stays out of the main message.
- Each tool call, of the main agent and of child agents, as a tool call update.
- Each [wait](./waits) of a turn, by its kind (see [Waits in the editor](#waits-in-the-editor)).
- Cancel stops the running turn, also while the editor asks for an answer. A turn that fails ends with the `error` stop reason and the message.
- Image blocks, audio blocks, and embedded files of a prompt go to the media store of the session. A file that the harness refuses fails the prompt with an invalid params error. See [Send and show media](./media).

## Waits in the editor

The agent sends each wait to the editor by its kind:

| Kind | What the editor shows |
| --- | --- |
| `approval` | A permission request with the id of the real tool call. **Allow always** shows only for an approval of `permissions()`, because its answer schema takes `always`. |
| `question`, `human` | A form elicitation of the answer schema. |
| `sign-in` | A URL elicitation with the sign-in page. |
| `client-tool` | Nothing. The editor cannot run it, so the agent cancels it. |

- The editor must declare form and URL elicitation in `initialize`. If it does not, the agent cancels that wait, and the model continues without the answer.
- A question that a tool asks while it runs (`step.ask`, an MCP server) is a form elicitation too. An answer that does not fit the schema asks again.
- If the editor cancels the prompt while it asks, the turn stops. Its waits stay open until the next prompt.

## Open an old session

The editor lists the sessions of the harness, newest first. The user picks one, and the next prompt continues that thread.

- The list shows the top-level sessions of the harness that `user` can list. Sessions of child agents stay out.
- The list comes from the session index of the host. Use a persistent store, so that the list keeps the sessions after the process stops.
- A session id that the session index does not know, or that `user` cannot read, fails with a not found error.

## Known limits

- ACP v2 is still a draft, so this API is experimental.
- A client tool call, and a wait that the editor did not declare it can show, are cancelled. The model then continues without the answer.
- Each session in the list shows the same working directory: the `cwd` of the agent. If the editor asks for the sessions of another directory, the list is empty.
- An old session opens without its earlier messages. The editor shows only the new turns. The model still gets the full thread.
- A resource link in a prompt is only named. The harness does not read it. The model can open it with its own tools.

## Use your own stream

`serveAcp` uses stdin and stdout when you pass no `stream`. To use another transport, pass an ACP `Stream`, or call `createAcpAgent({ host, harness })` and connect the app yourself:

```ts group=harness-acp
import { createAcpAgent } from '@tanstack/ai-acp/agent'

export const app = createAcpAgent({ host, harness: assistant })
```

One agent app serves one connection. It reads the editor capabilities from that connection, and a second connection to it fails with an error. To serve more editors, for example over HTTP, make one app for each connection. With the `AcpServer` of `@agentclientprotocol/sdk/experimental/server`, pass `createAgent: () => createAcpAgent({ host, harness: assistant })`.

## What you have now

- Your harness as an agent in any ACP v2 editor.
- Approvals, questions, and sign-ins in the editor, and cancel, media, and old sessions.
