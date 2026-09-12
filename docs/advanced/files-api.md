---
title: Files API
id: files-api
description: "Upload media once and reference it by a provider-issued handle with TanStack AI's tree-shakeable files adapters (OpenAI, Anthropic, Gemini, Grok, fal)."
keywords:
  - tanstack ai
  - files api
  - file upload
  - file_id
  - fileData
  - public url
  - multimodal
---

Provider **Files / storage APIs** let you upload a media asset once and reference it later by a lightweight handle, instead of re-sending base64 (or relying on the provider to re-fetch a public URL) on every request. That means large or reused inputs are uploaded a single time — lower latency and bandwidth, no re-buffering of base64 on memory-constrained runtimes (e.g. Cloudflare Workers) — plus access to provider-side file lifecycle (TTL, deletion).

TanStack AI exposes this as a tree-shakeable **`files` adapter** per provider, paired with a `{ type: 'file' }` [content source](./multimodal-content.md#file-handle-files-api) you drop into a message.

## Files adapters

Each provider with a native surface has a factory: `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, `grokFiles()`, and `falFiles()`. They read the same API-key env var as the provider's other adapters. To pass a key explicitly, use the `create*Files(apiKey)` variants (`createOpenaiFiles`, `createAnthropicFiles`, `createGeminiFiles`, `createGrokFiles`). `falFiles(config)` takes its key in the config object.

```typescript
import { createOpenaiFiles, openaiFiles } from '@tanstack/ai-openai'
import { geminiFiles } from '@tanstack/ai-gemini'
import { anthropicFiles } from '@tanstack/ai-anthropic'
import { falFiles } from '@tanstack/ai-fal'
import { grokFiles } from '@tanstack/ai-grok'

const files = openaiFiles() // reads OPENAI_API_KEY
const filesWithKey = createOpenaiFiles('sk-your-key') // explicit key
```

### uploadFile

Drive an adapter with the `uploadFile()` activity function. It accepts a `Blob` (memory-efficient — preferred for large assets) or `{ data, mimeType }` where `data` is base64, and returns a `FileHandle`:

```typescript
import { uploadFile } from '@tanstack/ai'
import { openaiFiles } from '@tanstack/ai-openai'
import { pdfBase64 } from './pdf-data'

const handle = await uploadFile({
  adapter: openaiFiles(),
  input: { data: pdfBase64, mimeType: 'application/pdf' },
})
// handle: { id, provider, uri?, mimeType?, sizeBytes?, expiresAt?, filename? }
```

- `id` — the provider handle used for `get` / `delete` (OpenAI/Anthropic `file_id`, Gemini file resource name, fal storage URL).
- `uri`: the handle's URL form when the provider exposes one (Gemini file URI, fal storage URL, Grok public URL). It is `undefined` for OpenAI and Anthropic, whose handles are opaque ids.
- `expiresAt` — epoch milliseconds, when the provider schedules the handle to expire.

> **Runtime note (Gemini upload).** `geminiFiles().upload()` uses `@google/genai`'s
> resumable upload, which sets an explicit `Content-Length` header on a `Blob`-body
> request. Some server runtimes reject that with `fetch failed` /
> `InvalidArgumentError: invalid content-length header`. On **TanStack Start / Nitro**
> this fails on older Nitro (observed on `nitro@3.0.1-alpha.2`) and works on current
> Nitro (verified on `nitro@3.0.260610-beta`) — upgrade Nitro if you hit it. Native
> Node (and the production `node-server` build) are unaffected. OpenAI, Anthropic, and
> fal uploads use different transports and don't exercise this path.

### getFile and deleteFile

Providers with a lifecycle API support `getFile()` and `deleteFile()`. Both accept the handle itself (preferred — the handle's provider type rejects a foreign provider's handle at compile time) or its raw `id`:

```typescript
import { deleteFile, getFile, uploadFile } from '@tanstack/ai'
import { openaiFiles } from '@tanstack/ai-openai'
import { pdfBase64 } from './pdf-data'

const files = openaiFiles()
const handle = await uploadFile({
  adapter: files,
  input: { data: pdfBase64, mimeType: 'application/pdf' },
})

const meta = await getFile({ adapter: files, id: handle })
await deleteFile({ adapter: files, id: handle })
```

> fal storage is **upload-only** — `falFiles()` defines no `get` / `delete`, and calling `getFile()` / `deleteFile()` with it throws a clear error.

### Grok (xAI): handles are public URLs

`grokFiles()` uploads to the xAI Files API, then mints a [public URL](https://docs.x.ai/developers/files/public-urls) for the stored object and uses that URL as the handle's reference.

xAI takes a `file_id` only on `input_file` (documents), and only on agentic-capable models. Its image path takes a URL. A public URL works for both, so one handle covers every modality on every chat model.

```typescript
import { uploadFile } from '@tanstack/ai'
import { grokFiles } from '@tanstack/ai-grok'
import { pngBase64 } from './image-data'

const handle = await uploadFile({
  // Omit `expiresAfter` for a URL that does not expire.
  adapter: grokFiles({ expiresAfter: 86_400 }),
  input: { data: pngBase64, mimeType: 'image/png' },
})
// handle.id  -> 'file_abc123'            (lifecycle)
// handle.uri -> 'https://files-cdn.x.ai/…' (wire reference)
```

xAI limits to know:

- 50 MiB per file, and PNG, JPEG, MP4, or PDF only.
- `expiresAfter` runs from 3600 seconds (one hour) to 2592000 (thirty days).
- Up to 1000 active public URLs per team.
- Minting is idempotent, so re-uploading the same file returns the same URL.

To stop a URL resolving without deleting the file, call `revokePublicUrl(handle.id)` on the adapter. `deleteFile()` removes the file itself.

## Referencing a handle in a message

Use `fileSourceFromHandle(handle)` to turn a `FileHandle` into a `{ type: 'file' }` content source. The source carries a **record of per-provider references** (`{ reference: { openai: 'file-abc' } }`). Each adapter reads only its own entry and maps it to its native wire field: OpenAI and Anthropic `file_id`, Gemini `fileData.fileUri`, fal storage URL, Grok public URL. Sending the source to a provider with no entry in the record throws a clear error, and adapters that can't consume file references at all are rejected before any mapping starts.

### Server: upload + reference

```typescript
import { chat, fileSourceFromHandle, uploadFile } from '@tanstack/ai'
import { anthropicFiles, anthropicText } from '@tanstack/ai-anthropic'

export async function askAboutPdf(pdfBase64: string, request: string) {
  // Upload once; reuse the handle across turns.
  const handle = await uploadFile({
    adapter: anthropicFiles(),
    input: { data: pdfBase64, mimeType: 'application/pdf' },
  })

  return chat({
    adapter: anthropicText('claude-sonnet-5'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', content: request },
          { type: 'document', source: fileSourceFromHandle(handle) },
        ],
      },
    ],
  })
}
```

### One source, several providers

Because `reference` is a record, the same bytes uploaded to two providers merge into **one** source that routes correctly to either — useful when a conversation may be replayed against different models:

```typescript
import { chat, fileSourceFromHandle, uploadFile } from '@tanstack/ai'
import { openaiFiles, openaiText } from '@tanstack/ai-openai'
import { geminiFiles } from '@tanstack/ai-gemini'
import { pdfBase64 } from './pdf-data'

const input = { data: pdfBase64, mimeType: 'application/pdf' }
const openaiHandle = await uploadFile({ adapter: openaiFiles(), input })
const geminiHandle = await uploadFile({ adapter: geminiFiles(), input })

// reference: { openai: 'file-…', gemini: 'https://…/files/…' }
const source = fileSourceFromHandle(openaiHandle, geminiHandle)

chat({
  adapter: openaiText('gpt-5.5'), // or a gemini adapter — same message works
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', content: 'Summarize this document' },
        { type: 'document', source },
      ],
    },
  ],
})
```

### Client: reuse a handle across requests

Upload needs the provider key, so it happens on the server. The browser holds the handle it gets back and sends that handle with each turn.

Send the handle in your own request body, not in the message content. The chat wire format carries `data` and `url` sources only, so a `{ type: 'file' }` source cannot cross it. Build the source on the server instead.

1. Store the handle the upload endpoint returned. Keep `{ id, provider, uri, mimeType }`.
2. Put that handle in the request body, next to the messages.
3. On the server, call `fileSourceFromHandle` and add the part to the message.

In the browser, pass the handle through the `body` option:

```tsx
import { useChat } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import type { FileHandle } from '@tanstack/ai/client'

// `handle` came from your upload endpoint and is stored client-side.
function AskAboutFile({ handle }: { handle: FileHandle }) {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <button
      onClick={() => sendMessage('Describe this', { body: { handle } })}
      type="button"
    >
      Ask
    </button>
  )
}
```

On the server, attach the file part before the run starts:

```typescript
import { chat, fileSourceFromHandle } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import type { FileHandle, ModelMessage } from '@tanstack/ai'

export function runTurn(messages: Array<ModelMessage>, handle: FileHandle) {
  const last = messages[messages.length - 1]
  if (last?.role === 'user' && Array.isArray(last.content)) {
    last.content.push({ type: 'image', source: fileSourceFromHandle(handle) })
  }

  return chat({ adapter: openaiText('gpt-5.5'), messages })
}
```

> A `file` source sent through the chat wire throws with a clear error. It is never dropped and never sent as a URL. Support for handles in the wire format is tracked in [ag-ui#2639](https://github.com/ag-ui-protocol/ag-ui/issues/2639).

## Provider support

| Provider | Adapter | Handle referenced as | Lifecycle |
| --- | --- | --- | --- |
| OpenAI | `openaiFiles()` | Responses `input_image` / `input_file` `file_id` | `get`, `delete` |
| Anthropic | `anthropicFiles()` | `file_id` message source (sends the `files-api-2025-04-14` beta) | `get`, `delete` |
| Gemini | `geminiFiles()` | `fileData.fileUri` (the handle URI) | `get`, `delete` |
| fal | `falFiles()` | storage URL (used like any URL) | upload-only |
| Grok (xAI) | `grokFiles()` | public URL (used like any URL) | `get`, `delete` |

Gemini and fal handles are URLs, so they also round-trip through a plain `{ type: 'url' }` source; OpenAI and Anthropic handles are opaque ids that require the `{ type: 'file' }` source.

### Providers and endpoints that can't consume references

Adapters that can consume file references declare a `supportsFileSources` capability; for everyone else (Groq, Bedrock, Mistral, OpenRouter, Ollama, BytePlus, Cohere, and any adapter written before this feature existed) `chat()` / `generateImage()` / `generateVideo()` / `embed()` reject `{ type: 'file' }` sources **before any request is built**, so a reference can never be silently mis-mapped onto a URL or data field.

Some endpoints on supporting providers also have no "reference an uploaded handle" option — OpenAI's `images/edits` and Sora `input_reference`, and Gemini's Veo, need the actual bytes (or, for Veo, a `gs://` URI). The OpenAI **Chat Completions** image path also references images only by URL/data URI, not `file_id` — use the Responses adapter (`openaiText`) for `file_id` images. These throw a clear endpoint-specific error.
