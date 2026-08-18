---
title: Harness Auth
id: sandbox-auth
description: "Pick host login or an API key for a coding-agent harness. The same local-process sandbox can be your laptop or a CI runner."
---

Your laptop already has `grok login`, `claude login`, or `codex login`. A GitHub
runner has no browser login. It only has an API key. Both can use
`localProcessSandbox()`.

Set `authMode` on the adapter. The sandbox type does not pick the credentials.

- `'host'`: use the CLI login on the machine. Do not inject an API key into
  that process.
- `'api-key'`: inject the key and use it. This is the mode for CI.

Pass `authMode` in one of two places:

- Adapter factory: `grokBuildText('composer-2.5', { authMode: 'host' })`
- One call: `chat({ modelOptions: { authMode: 'host' } })`

## Host login

Use this when the machine already ran `grok login`, `claude login`, or
`codex login`.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { defineSandbox, defineWorkspace, withSandbox } from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { messages, threadId } from './chat-context'

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
  threadId,
  adapter: grokBuildText('composer-2.5', { authMode: 'host' }),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

`scrubEnv` removes keys the host process inherited. If the CLI sees
`XAI_API_KEY`, it can prefer that key over your login.

## API key

Use this on a runner or any machine that has no CLI login.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { messages, threadId } from './chat-context'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
})

const stream = chat({
  threadId,
  adapter: grokBuildText('composer-2.5', { authMode: 'api-key' }),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Each harness

| Adapter | `authMode: 'host'` | `authMode: 'api-key'` |
| --- | --- | --- |
| [Grok Build](../adapters/grok-build) | `grok login` | `XAI_API_KEY` |
| [Claude Code](../adapters/claude-code) | `claude login` | `ANTHROPIC_API_KEY` |
| [Codex](../adapters/codex) | `codex login` | `CODEX_API_KEY` |
| [ACP-Compatible](../adapters/acp-compatible) | skip ACP `authenticate` | set `authMethodId` (for Grok, `xai.api_key`) |

OpenCode still reads `OPENAI_API_KEY` from the process env. It has no `authMode`
flag.

## Client and server

The React chat example exposes the same choice on `/repo-report`. The client
sends `authMode`. The server builds the adapter with that value.

Client:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function Report() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/sandbox-repo-report'),
    forwardedProps: { authMode: 'host' },
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
    'authMode' in forwarded && forwarded.authMode === 'api-key'
      ? 'api-key'
      : 'host'

  const stream = chat({
    adapter: grokBuildText('composer-2.5', { authMode }),
    messages: [{ role: 'user', content: 'Report on this repo' }],
    stream: true,
    middleware: [withSandbox(sandbox)],
  })

  return toServerSentEventsResponse(stream)
}
```

See [Harnesses](./harnesses) for which adapter to pick, and [Providers](./providers)
for `scrubEnv` on local-process.
