---
title: Files API
id: files-api
description: "Upload media once and reference it by a provider-issued handle with TanStack AI's tree-shakeable files adapters (OpenAI, Anthropic, Gemini, fal)."
keywords:
  - tanstack ai
  - files api
  - file upload
  - file_id
  - fileData
  - multimodal
---

Provider **Files / storage APIs** let you upload a media asset once and reference it later by a lightweight handle, instead of re-sending base64 (or relying on the provider to re-fetch a public URL) on every request. That means large or reused inputs are uploaded a single time — lower latency and bandwidth, no re-buffering of base64 on memory-constrained runtimes (e.g. Cloudflare Workers) — plus access to provider-side file lifecycle (TTL, deletion).

TanStack AI exposes this as a tree-shakeable **`files` adapter** per provider, paired with a `{ type: 'file' }` [content source](./multimodal-content.md#file-handle-files-api) you drop into a message.

## Files adapters

Each provider with a native surface has a factory: `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, and `falFiles()`. They read the same API-key env var as the provider's other adapters; to pass a key explicitly, use the `create*Files(apiKey)` variants (`createOpenaiFiles`, `createAnthropicFiles`, `createGeminiFiles`) — `falFiles(config)` takes its key in the config object.

```typescript
import { createOpenaiFiles, openaiFiles } from '@tanstack/ai-openai'
import { geminiFiles } from '@tanstack/ai-gemini'
import { anthropicFiles } from '@tanstack/ai-anthropic'
import { falFiles } from '@tanstack/ai-fal'

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
- `uri` — the handle's URL form when the provider exposes one (Gemini file URI, fal storage URL); `undefined` for OpenAI/Anthropic, whose handles are opaque ids.
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

## Referencing a handle in a message

Use `fileSourceFromHandle(handle)` to turn a `FileHandle` into a `{ type: 'file' }` content source. The source carries a **record of per-provider references** — `{ reference: { openai: 'file-abc' } }` — and each adapter reads only its own entry, mapping it to its native wire field (OpenAI/Anthropic `file_id`, Gemini `fileData.fileUri`, fal storage URL). Sending the source to a provider with no entry in the record throws a clear error, and adapters that can't consume file references at all are rejected before any mapping starts.

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

Upload happens server-side (it needs the provider key), so the client works with the returned handle. Persist `{ id, provider, uri, mimeType }` and rebuild the source on each turn. `fileSourceFromHandle` and `FileHandle` are exported from the browser-safe `@tanstack/ai/client` entry, so this doesn't pull the server bundle into the client:

```typescript
import { fileSourceFromHandle } from '@tanstack/ai/client'
import type { FileHandle } from '@tanstack/ai/client'

// `handle` was returned by your server's upload endpoint and stored client-side.
function imageMessage(handle: FileHandle, prompt: string) {
  return {
    role: 'user' as const,
    content: [
      { type: 'text' as const, content: prompt },
      { type: 'image' as const, source: fileSourceFromHandle(handle) },
    ],
  }
}
```

## Provider support

| Provider | Adapter | Handle referenced as | Lifecycle |
| --- | --- | --- | --- |
| OpenAI | `openaiFiles()` | Responses `input_image` / `input_file` `file_id` | `get`, `delete` |
| Anthropic | `anthropicFiles()` | `file_id` message source (sends the `files-api-2025-04-14` beta) | `get`, `delete` |
| Gemini | `geminiFiles()` | `fileData.fileUri` (the handle URI) | `get`, `delete` |
| fal | `falFiles()` | storage URL (used like any URL) | upload-only |

Gemini and fal handles are URLs, so they also round-trip through a plain `{ type: 'url' }` source; OpenAI and Anthropic handles are opaque ids that require the `{ type: 'file' }` source.

### Providers and endpoints that can't consume references

Adapters that can consume file references declare a `supportsFileSources` capability; for everyone else — Grok, Groq, Bedrock, Mistral, OpenRouter, Ollama, BytePlus, and any adapter written before this feature existed — `chat()` / `generateImage()` / `generateVideo()` reject `{ type: 'file' }` sources **before any request is built**, so a reference can never be silently mis-mapped onto a URL or data field.

Some endpoints on supporting providers also have no "reference an uploaded handle" option — OpenAI's `images/edits` and Sora `input_reference`, and Gemini's Veo, need the actual bytes (or, for Veo, a `gs://` URI). The OpenAI **Chat Completions** image path also references images only by URL/data URI, not `file_id` — use the Responses adapter (`openaiText`) for `file_id` images. These throw a clear endpoint-specific error.
