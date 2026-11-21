---
title: Artifacts
id: generative-ui-artifacts
order: 2
description: "Give the model the create_artifact tools with a chat middleware, then render the stored artifact inline in the conversation. Covers the server store and builder, and the client renderer."
keywords:
  - tanstack ai
  - generative ui
  - generativeUiArtifacts
  - create_artifact
  - FrameArtifactStore
  - makeReactBuilder
  - FrameArtifactRenderer
---

You want the model to build a working UI during the chat, not only describe one. The model needs tools to create and store a UI, and your app needs to render what it made. This page wires both halves.

## Server: give the model the tools

Add the `generativeUiArtifacts` middleware to your `chat()` call. It injects four server-run tools the model can use mid-conversation: `create_artifact`, `revise_artifact`, `list_artifacts`, and `read_artifact`.

The middleware needs three things from you:

- **`store`** — where artifacts live. Use the in-memory store to start, or a blob-backed store to persist them.
- **`builder`** — turns a `react-tsx` source into a bundle. An `html-fragment` needs no build.
- **`registry`** — the modules a `react-tsx` artifact may import. `REFERENCE_REGISTRY` is a ready set.

```ts ignore
// src/routes/api.chat.ts  (TanStack Start)
import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { REFERENCE_REGISTRY, makeReactBuilder } from '@tanstack/ai-generative-ui'
import {
  generativeUiArtifacts,
  createInMemoryFrameArtifactStore,
} from '@tanstack/ai-generative-ui/artifacts'
import { transformWithEsbuild } from 'vite'

const store = createInMemoryFrameArtifactStore()

// Build a react-tsx source to ESM. Imports stay bare for the host import map.
const builder = makeReactBuilder(async ({ source }) => {
  const out = await transformWithEsbuild(source, 'artifact.tsx', {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    format: 'esm',
  })
  return { code: out.code }
})

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json()

        const stream = chat({
          adapter: openaiText('gpt-5.5'),
          messages,
          middleware: [
            generativeUiArtifacts({ store, builder, registry: REFERENCE_REGISTRY }),
          ],
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

On a successful create or revise, the middleware emits a `genui:artifact` custom event that carries the pinned `{ artifactId, revision }`. The client uses that pin to render the frame. A build failure comes back as the tool result, so the model reads the compiler errors and tries again inside the same run.

### Persist artifacts

The in-memory store is gone on restart. For real storage, back it with a `BlobStore` from `@tanstack/ai-persistence`:

```ts
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createBlobArtifactStore } from '@tanstack/ai-generative-ui/artifacts'

const store = createBlobArtifactStore(memoryPersistence().stores.blobs)
```

Swap the blob store for an S3, filesystem, or database implementation with no other change.

## Client: render the artifact inline

The client listens for the `genui:artifact` event to learn the pin, then renders the frame with `FrameArtifactRenderer`. The renderer mounts a sandboxed iframe and asks your host for the artifact's shell document by URL.

```tsx ignore
import { useState } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { FrameArtifactRenderer, type ArtifactPin } from '@tanstack/ai-generative-ui'

const sandboxUrl = (pin: ArtifactPin, instanceId: string) =>
  `/sandbox/${pin.artifactId}/${pin.revision}?i=${encodeURIComponent(instanceId)}`

export function Chat() {
  // toolCallId -> pin, filled by the genui:artifact event.
  const [pins, setPins] = useState<Record<string, ArtifactPin>>({})

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    onCustomEvent: (type, data, ctx) => {
      if (type === 'genui:artifact' && ctx.toolCallId && data?.pin) {
        setPins((p) => ({ ...p, [ctx.toolCallId]: data.pin }))
      }
    },
  })

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((part, i) => {
            if (part.type === 'text') return <p key={i}>{part.content}</p>
            if (part.type === 'tool-call' && pins[part.id]) {
              return (
                <FrameArtifactRenderer
                  key={i}
                  pin={pins[part.id]}
                  sandboxUrl={sandboxUrl}
                />
              )
            }
            return null
          })}
        </div>
      ))}
    </div>
  )
}
```

### Serve the sandbox shell

`FrameArtifactRenderer` loads the artifact from the `sandboxUrl` you give it. Your host serves that URL. The host reads the record from the same `store`, builds the shell document with `buildShellDocument`, and returns it with a strict content security policy.

The shell, the import map, and the theme are host code. The model never writes them. This serving layer is host-specific, so the [`examples/generative-ui`](https://github.com/TanStack/ai/tree/main/examples/generative-ui) app shows a complete `/sandbox/:id/:rev` route, the runtime modules, and a dedicated sandbox origin.

Next: make a view update on its own with [live data](./live-data).
