---
title: Harness Auth
id: sandbox-auth
description: "Pick host login or an API key for a coding-agent harness. The same local-process sandbox can run on your laptop or on a CI runner."
---

Pass credentials into `localProcessSandbox()` yourself. The sandbox type does not know whether the machine has `grok login` or only an API key.

You tell it with `authMode` on the harness adapter:

- `'api-key'` (default): inject the key and use it. Use this in Docker, in a cloud sandbox, on a CI runner, or on any machine with no CLI login.
- `'host'`: use the CLI login on the machine. Do not inject an API key into that process. Codex and Grok Build can also use this login in Docker and in a cloud sandbox.

You can set `authMode` in two places:

- On the adapter factory: `grokBuildText('composer-2.5', { authMode: 'host' })`.
- For one call: `chat({ modelOptions: { authMode: 'host' } })`.

## Use an API key

This is the default, so you can omit `authMode`. Pass the key as a workspace secret:

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

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
})

const stream = chat({
  threadId: 'thread-1',
  adapter: grokBuildText('composer-2.5'),
  messages: [{ role: 'user', content: 'Summarize this repo.' }],
  middleware: [withSandbox(sandbox)],
})
```

## Use the host login

If the machine already ran `grok login`, `claude login`, or `codex login`, use this setup:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { defineSandbox, defineWorkspace, withSandbox } from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: localProcessSandbox({
    scrubEnv: ['XAI_API_KEY', 'GROK_API_KEY'],
  }),
  workspace: defineWorkspace({
    source: { type: 'local', path: '/abs/path/to/repo' },
  }),
})

const stream = chat({
  threadId: 'thread-1',
  adapter: grokBuildText('composer-2.5', { authMode: 'host' }),
  messages: [{ role: 'user', content: 'Summarize this repo.' }],
  middleware: [withSandbox(sandbox)],
})
```

`scrubEnv` removes keys from the env of each command, for example a key that a workspace secret sets. If the CLI sees `XAI_API_KEY`, it can use that key and not your login. The keys of the host process do not reach the command.

With `authMode: 'host'`, the Codex and Grok Build adapters also remove the key variables from the CLI process:

- Codex: `CODEX_API_KEY` and `OPENAI_API_KEY`.
- Grok Build: `XAI_API_KEY` and `GROK_API_KEY`.

The command gets only a few variables of the host process. If your login or your network needs more, for example `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HTTPS_PROXY`, or `SSH_AUTH_SOCK`, name them in `passEnv`:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const provider = localProcessSandbox({
  passEnv: ['CODEX_HOME', 'HTTPS_PROXY'],
})
```

## Use the host login in Docker or a cloud sandbox

Your machine already has a Codex or Grok Build login, from `codex login`, `grok login`, or [`/connect` in a harness](../harness/plan-sign-in). Set `authMode: 'host'`, and the adapter lends that login to the sandbox for each run:

```ts
import { chat } from '@tanstack/ai'
import { codexText } from '@tanstack/ai-codex'
import { defineSandbox, defineWorkspace, githubRepo, withSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['npm install -g @openai/codex --include=optional && codex --version'],
  }),
})

const stream = chat({
  threadId: 'thread-1',
  adapter: codexText('gpt-6.1-sol', { authMode: 'host' }),
  messages: [{ role: 'user', content: 'Summarize this repo.' }],
  middleware: [withSandbox(sandbox)],
})
```

For each run, the adapter does this:

1. Before the run, it copies the login file of the machine into the home folder of the sandbox.
2. After the run, it reads the file back. If the CLI refreshed the token, it writes the new file to the machine. If you signed in again on the machine during the run, it keeps your new login.
3. Then it deletes the file from the sandbox. It does this also when the run fails or you abort it.

So a sandbox that stays alive, or a snapshot of it, does not keep the login. On a local-process sandbox, nothing is copied: the CLI reads the file of the machine.

Runs on the same sandbox share one copy. The last run to end deletes it.

A [durable run](./durable-runs) is different, because its agent can run on after the host stops:

- When the host stops reading before the agent ends, the login stays in the sandbox, so the agent can keep working.
- The host that attaches to the run uses that login, and deletes it when the run ends.
- If no host attaches, the login stays in the sandbox until the next run there ends.

The login files:

| Adapter | Login file on the machine |
| --- | --- |
| Codex | `$CODEX_HOME/auth.json`, or `~/.codex/auth.json`. The adapter reads `CODEX_HOME` of the server process. |
| Grok Build | `~/.grok/auth.json` |

If the file is missing, the run fails with `No Codex login on this machine. Run /connect:codex.` A Codex login in the OS keyring has no file, so it also fails. See [Codex logins in the OS keyring](../harness/plan-sign-in#codex-logins-in-the-os-keyring).

Run one sandbox at a time for each login. If two runs refresh the token at the same time, the last write wins, and the other copy can stop working.

## What each harness reads

| Adapter | `authMode: 'api-key'` (default) | `authMode: 'host'` |
| --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `XAI_API_KEY` | `grok login` |
| [Claude Code](../adapters/claude-code) | `ANTHROPIC_API_KEY` | `claude login` |
| [Codex](../adapters/codex) | `CODEX_API_KEY` | `codex login` |
| [ACP-Compatible](../adapters/acp-compatible) | Set `authMethodId` (for Grok, `xai.api_key`). | Skips ACP `authenticate`. |

OpenCode reads `OPENAI_API_KEY` from its env. It has no `authMode` flag. On local-process, the key of the host process does not reach it: set the key as a workspace secret or with `env.set`.

## Let the user pick (client and server)

The React chat example has this choice on `/repo-report`. The client sends `authMode`. The server builds the adapter with that value.

Client:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Report() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/sandbox-repo-report'),
    threadId: 'support-chat',
    forwardedProps: { authMode: 'api-key' },
  })

  return (
    <button type="button" onClick={() => sendMessage('Report on this repo')}>
      Run
    </button>
  )
}
```

Server:

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { sandbox } from './sandbox'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  const forwarded =
    typeof body === 'object' &&
    body !== null &&
    'forwardedProps' in body &&
    typeof body.forwardedProps === 'object' &&
    body.forwardedProps !== null
      ? body.forwardedProps
      : {}
  const authMode =
    'authMode' in forwarded && forwarded.authMode === 'host'
      ? 'host'
      : 'api-key'
  const threadId =
    typeof body === 'object' &&
    body !== null &&
    'threadId' in body &&
    typeof body.threadId === 'string'
      ? body.threadId
      : undefined
  if (!threadId) {
    return new Response('Send a threadId.', { status: 400 })
  }

  const stream = chat({
    adapter: grokBuildText('composer-2.5', { authMode }),
    messages: [{ role: 'user', content: 'Report on this repo' }],
    threadId,
    stream: true,
    middleware: [withSandbox(sandbox)],
  })

  return toServerSentEventsResponse(stream)
}
```

The server accepts only `'host'` or `'api-key'`. Any other value falls back to `'api-key'`.

To pick the agent, see [Harnesses](./harnesses). For `scrubEnv`, `passEnv`, and other local-process options, see [Providers (Advanced)](./providers-advanced#local-process).
