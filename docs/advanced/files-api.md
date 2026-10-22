---
title: Files API
id: files-api
description: "Upload a PDF, image, or other file to the provider one time, then put a small handle in each message. Works with OpenAI, Anthropic, Gemini, Grok, and fal."
keywords:
  - tanstack ai
  - files api
  - file upload
  - file_id
  - fileData
  - public url
  - multimodal
---

The files API uploads a file once and sends the file id on later turns. Each request then skips a fresh base64 upload of the same PDF.

## Quick setup

This setup uploads a PDF to Anthropic and asks Claude about it. It takes about 10 minutes. Set `ANTHROPIC_API_KEY` on the server first.

### 1. Add an upload route

The upload needs the provider key, so it runs on the server. `uploadFile` takes a `Blob` and returns a `FileHandle`:

```typescript
// api/upload.ts
import { uploadFile } from "@tanstack/ai";
import { anthropicFiles } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const form = await request.formData();
  const [file] = form.getAll("file");
  if (!(file instanceof Blob)) {
    return new Response("Missing file", { status: 400 });
  }

  const handle = await uploadFile({ adapter: anthropicFiles(), input: file });
  return Response.json(handle);
}
```

### 2. Keep the handle in the browser and send it

Store the handle that the upload route returns. Then put it in the message with `fileSourceFromHandle`. Import it from `@tanstack/ai/client`, because that entry does not load server code:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { fileSourceFromHandle } from "@tanstack/ai/client";
import type { FileHandle } from "@tanstack/ai/client";

export function AskAboutPdf() {
  const [handle, setHandle] = useState<FileHandle | null>(null);
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  async function upload(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body });
    const uploaded: FileHandle = await response.json();
    setHandle(uploaded);
  }

  return (
    <>
      <input
        type="file"
        accept="application/pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={!handle}
        onClick={() => {
          if (!handle) return;
          void sendMessage({
            content: [
              { type: "text", content: "Summarize this PDF" },
              { type: "document", source: fileSourceFromHandle(handle) },
            ],
          });
        }}
      >
        Ask
      </button>
    </>
  );
}
```

### 3. Use the same provider in the chat route

The file part arrives in the messages. Use a text adapter from the provider that issued the handle:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { anthropicText } from "@tanstack/ai-anthropic";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: anthropicText("claude-sonnet-5-5"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

Pick a PDF, click **Ask**, and Claude answers about it. Ask again with the same handle, and no bytes go up a second time.

## How it works

1. `uploadFile` sends the bytes to the provider and returns a `FileHandle`.
2. `fileSourceFromHandle(handle)` turns the handle into a `{ type: 'file' }` [content source](./multimodal-content#file-handle-files-api).
3. The adapter maps that source to the field of its provider, for example `file_id` on Anthropic.
4. A handle works only with the provider that issued it. If you send it to another provider, the adapter throws before any request goes out.

## Advanced

### Files adapters

Each provider with a Files API has a factory:

| Provider | Factory | Key from |
| --- | --- | --- |
| OpenAI | `openaiFiles()` or `createOpenaiFiles(apiKey)` | `OPENAI_API_KEY`, or the argument |
| Anthropic | `anthropicFiles()` or `createAnthropicFiles(apiKey)` | `ANTHROPIC_API_KEY`, or the argument |
| Gemini | `geminiFiles()` or `createGeminiFiles(apiKey)` | the same env as the Gemini adapters, or the argument |
| Grok (xAI) | `grokFiles()` or `createGrokFiles(apiKey)` | the same env as the Grok adapters, or the argument |
| fal | `falFiles(config)` | the config object |

For a Bearer token, use `createAnthropicFiles(token, { auth: 'bearer' })`. See [Bearer and OAuth tokens](../adapters/anthropic-advanced#bearer-and-oauth-tokens).

```typescript
import { createOpenaiFiles, openaiFiles } from "@tanstack/ai-openai";

const files = openaiFiles(); // reads OPENAI_API_KEY
const filesWithKey = createOpenaiFiles("sk-your-key");
```

### Upload input

`uploadFile` accepts one of these:

- A `Blob`. This uses less memory, so it is better for large files.
- `{ data, mimeType, filename? }`, where `data` is base64.

```typescript
import { uploadFile } from "@tanstack/ai";
import { openaiFiles } from "@tanstack/ai-openai";
import { pdfBase64 } from "./pdf-data";

const handle = await uploadFile({
  adapter: openaiFiles(),
  input: { data: pdfBase64, mimeType: "application/pdf" },
});
// handle: { id, provider, uri?, mimeType?, sizeBytes?, expiresAt?, filename? }
```

The fields of the handle:

- `id`: the provider handle for `get` and `delete`. This is the OpenAI or Anthropic `file_id`, the Gemini file resource name, or the fal storage URL.
- `uri`: the URL form of the handle, when the provider has one (Gemini file URI, fal storage URL, Grok public URL). It is `undefined` for OpenAI and Anthropic, because their handles are opaque ids.
- `expiresAt`: epoch milliseconds, when the provider plans to expire the handle.

### getFile and deleteFile

Providers with a lifecycle API support `getFile()` and `deleteFile()`. Both take the handle or its raw `id`. If you can, pass the handle. Its provider type rejects a handle from another provider at compile time.

```typescript
import { deleteFile, getFile, uploadFile } from "@tanstack/ai";
import { openaiFiles } from "@tanstack/ai-openai";
import { pdfBase64 } from "./pdf-data";

const files = openaiFiles();
const handle = await uploadFile({
  adapter: files,
  input: { data: pdfBase64, mimeType: "application/pdf" },
});

const meta = await getFile({ adapter: files, id: handle });
await deleteFile({ adapter: files, id: handle });
```

fal storage is upload-only. `falFiles()` has no `get` or `delete`, so `getFile()` and `deleteFile()` throw with it.

### Grok (xAI): handles are public URLs

`grokFiles()` uploads to the xAI Files API. Then it mints a [public URL](https://docs.x.ai/developers/files/public-urls) for the file and uses that URL as the reference of the handle.

xAI takes a `file_id` only on `input_file` (documents), and only on agentic models. Its image path takes a URL. A public URL works for both, so one handle works for every input type on every chat model.

```typescript
import { uploadFile } from "@tanstack/ai";
import { grokFiles } from "@tanstack/ai-grok";
import { pngBase64 } from "./image-data";

const handle = await uploadFile({
  // Omit `expiresAfter` for a URL that does not expire.
  adapter: grokFiles({ expiresAfter: 86_400 }),
  input: { data: pngBase64, mimeType: "image/png" },
});
// handle.id  -> 'file_abc123'              (lifecycle)
// handle.uri -> 'https://files-cdn.x.ai/...' (sent in the request)
```

xAI limits:

- 50 MiB for each file. PNG, JPEG, MP4, or PDF only.
- `expiresAfter` is from 3600 seconds (one hour) to 2592000 (thirty days).
- Up to 1000 active public URLs for each team.
- Minting is idempotent. If you upload the same file again, you get the same URL.

To stop a URL without deleting the file, call `revokePublicUrl(handle.id)` on the adapter. `deleteFile()` deletes the file itself.

`getFile()` mints the public URL to put it on the handle. After you revoke a URL, do not call `getFile()` for that file, or the file gets a public URL again.

### The file source

`fileSourceFromHandle(handle)` returns this shape. You can also write it yourself:

```typescript
import type { ContentPartFileSource } from "@tanstack/ai";

const source: ContentPartFileSource = {
  type: "file",
  value: "file-abc",
  provider: "openai",
};
```

- `value` is the handle exactly as the provider issued it. Treat it as opaque. `fileSourceFromHandle` uses `uri` when the handle has one, and `id` if not.
- `provider` names the adapter that issued it.

You can also upload and send in one server function:

```typescript
import { chat, fileSourceFromHandle, uploadFile } from "@tanstack/ai";
import { anthropicFiles, anthropicText } from "@tanstack/ai-anthropic";

export async function askAboutPdf(
  pdfBase64: string,
  request: string,
  threadId: string,
) {
  // Upload one time. Use the handle again on later turns.
  const handle = await uploadFile({
    adapter: anthropicFiles(),
    input: { data: pdfBase64, mimeType: "application/pdf" },
  });

  return chat({
    adapter: anthropicText("claude-sonnet-5-5"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", content: request },
          { type: "document", source: fileSourceFromHandle(handle) },
        ],
      },
    ],
    threadId,
  });
}
```

### Provider support

| Provider | Adapter | Handle sent as | Lifecycle |
| --- | --- | --- | --- |
| OpenAI | `openaiFiles()` | Responses `input_image` / `input_file` `file_id` | `get`, `delete` |
| Anthropic | `anthropicFiles()` | `file_id` message source (sends the `files-api-2025-04-14` beta) | `get`, `delete` |
| Gemini | `geminiFiles()` | `fileData.fileUri` (the handle URI) | `get`, `delete` |
| fal | `falFiles()` | storage URL (used like any URL) | upload-only |
| Grok (xAI) | `grokFiles()` | public URL (used like any URL) | `get`, `delete` |

Gemini and fal handles are URLs, so they also work in a plain `{ type: 'url' }` source. OpenAI and Anthropic handles are opaque ids, so they need the `{ type: 'file' }` source.

### Providers and endpoints that cannot use a handle

Adapters that can use file handles declare a `supportsFileSources` capability. For all other adapters, `chat()`, `generateImage()`, `generateVideo()`, and `embed()` reject a `{ type: 'file' }` source before they build a request. This applies to:

- Groq, Bedrock, Mistral, OpenRouter, Ollama, BytePlus, and Cohere.
- Any adapter that does not declare `supportsFileSources`.

So a handle never goes out by mistake as a URL or as data.

Some endpoints of supported providers also need the bytes, and throw an error for that endpoint:

- OpenAI `images/edits` and the Sora `input_reference` need the bytes.
- Gemini Veo needs the bytes or a `gs://` URI.
- The image path of OpenAI **Chat Completions** takes only a URL or a data URI. Use the Responses adapter (`openaiText`) for `file_id` images.

### Gemini upload on some server runtimes

`geminiFiles().upload()` uses the resumable upload of `@google/genai`. It sets a `Content-Length` header on a request with a `Blob` body. Some server runtimes reject that header with `fetch failed` or `InvalidArgumentError: invalid content-length header`.

- On TanStack Start or Nitro, older Nitro fails (seen on `nitro@3.0.1-alpha.2`). Current Nitro works (tested on `nitro@3.0.260610-beta`). If you get this error, upgrade Nitro.
- Native Node and the production `node-server` build work.
- OpenAI, Anthropic, and fal uploads use a different transport and do not hit this error.
