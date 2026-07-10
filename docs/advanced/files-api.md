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

Each provider with a native surface has a factory: `openaiFiles()`, `anthropicFiles()`, `geminiFiles()`, and `falFiles()`. They read the same API-key env var as the provider's other adapters, or accept an explicit key.

```typescript
import { openaiFiles } from '@tanstack/ai-openai'
import { geminiFiles } from '@tanstack/ai-gemini'
import { anthropicFiles } from '@tanstack/ai-anthropic'
import { falFiles } from '@tanstack/ai-fal'

const files = openaiFiles() // reads OPENAI_API_KEY
```

### upload

`upload()` accepts a `Blob` (memory-efficient — preferred for large assets) or `{ data, mimeType }` where `data` is base64. It returns a `FileHandle`:

```typescript
const handle = await openaiFiles().upload({
  data: pdfBase64,
  mimeType: 'application/pdf',
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

### get and delete

Providers with a lifecycle API expose `get()` and `delete()`:

```typescript
const meta = await openaiFiles().get(handle.id)
await openaiFiles().delete(handle.id)
```

> fal storage is **upload-only** — `falFiles()` has no `get` / `delete`, and calling them throws a clear error.

## Referencing a handle in a message

Use `fileSourceFromHandle(handle)` to turn a `FileHandle` into a `{ type: 'file' }` content source. Each adapter maps it to the provider's native reference (OpenAI/Anthropic `file_id`, Gemini `fileData.fileUri`, fal storage URL). A handle only works with the provider that issued it — passing it elsewhere throws.

### Server: upload + reference

```typescript
import { chat, fileSourceFromHandle } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { anthropicFiles } from '@tanstack/ai-anthropic'

export async function askAboutPdf(pdfBase64: string, request: string) {
  // Upload once; reuse the handle across turns.
  const handle = await anthropicFiles().upload({
    data: pdfBase64,
    mimeType: 'application/pdf',
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

### Client: reuse a handle across requests

Upload happens server-side (it needs the provider key), so the client works with the returned handle. Persist `{ id, provider, uri, mimeType }` and rebuild the source on each turn:

```typescript
import { fileSourceFromHandle } from '@tanstack/ai'
import type { FileHandle } from '@tanstack/ai'

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

### Endpoints that require raw bytes

Some endpoints have no "reference an uploaded handle" option — OpenAI's `images/edits` and Sora `input_reference`, and Gemini's Veo, need the actual bytes (or, for Veo, a `gs://` URI). The OpenAI **Chat Completions** image path also references images only by URL/data URI, not `file_id` — use the Responses adapter (`openaiText`) for `file_id` images. Passing a `{ type: 'file' }` source to any of these throws a clear error rather than silently mis-mapping.
