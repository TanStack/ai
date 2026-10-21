---
title: Harness Auth
id: sandbox-auth
description: "Pick host login or an API key for a coding-agent harness. The same local-process sandbox can run on your laptop or on a CI runner."
---

Your laptop already has `grok login`, `claude login`, or `codex login`. A GitHub runner has no browser login, only an API key. Both can use `localProcessSandbox()`, so the sandbox type cannot tell the agent how to sign in.

You tell it with `authMode` on the harness adapter:

- `'api-key'` (default): inject the key and use it. Use this in Docker, in a cloud sandbox, on a CI runner, or on any machine with no CLI login.
- `'host'`: use the CLI login on the machine. Do not inject an API key into that process.

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

`scrubEnv` removes keys that the host process inherited. If the CLI sees `XAI_API_KEY`, it can use that key and not your login.

## What each harness reads

| Adapter | `authMode: 'api-key'` (default) | `authMode: 'host'` |
| --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `XAI_API_KEY` | `grok login` |
| [Claude Code](../adapters/claude-code) | `ANTHROPIC_API_KEY` | `claude login` |
| [Codex](../adapters/codex) | `CODEX_API_KEY` | `codex login` |
| [ACP-Compatible](../adapters/acp-compatible) | Set `authMethodId` (for Grok, `xai.api_key`). | Skips ACP `authenticate`. |

OpenCode reads `OPENAI_API_KEY` from the process env. It has no `authMode` flag.

## Let the user pick (client and server)

The React chat example has this choice on `/repo-report`. The client sends `authMode`. The server builds the adapter with that value.

Client:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Report() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/sandbox-repo-report'),
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

  const stream = chat({
    adapter: grokBuildText('composer-2.5', { authMode }),
    messages: [{ role: 'user', content: 'Report on this repo' }],
    stream: true,
    middleware: [withSandbox(sandbox)],
  })

  return toServerSentEventsResponse(stream)
}
```

The server accepts only `'host'` or `'api-key'`. Any other value falls back to `'api-key'`.

To pick the agent, see [Harnesses](./harnesses). For `scrubEnv` and other local-process options, see [Providers (Advanced)](./providers-advanced#local-process).
