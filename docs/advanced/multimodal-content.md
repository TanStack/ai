---
title: Multimodal Content
id: multimodal-content
order: 4
description: "Send images, audio, video, and PDFs with the text of a message. Build the parts in the browser, and the adapter sends them to the model."
keywords:
  - tanstack ai
  - multimodal
  - vision
  - images
  - audio
  - video
  - documents
  - ContentPart
  - ImagePart
---

Your user wants to ask "what is wrong in this screenshot?" or "summarize this PDF". A plain text message cannot carry the file.

Make the `content` of the message an array of parts. One part holds the text, and the other parts hold the image, audio, video, or document.

## Quick setup

This setup lets a user pick an image and ask about it. It takes about 5 minutes.

### 1. Use a model that reads images

Your chat route does not change. Pick a model that takes image input:

```typescript
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

### 2. Send the image from the browser

Read the file as base64. Then send a text part and an image part together:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the file"));
        return;
      }
      // Remove the "data:image/png;base64," prefix.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AskAboutImage() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  async function send(file: File) {
    const base64 = await readAsBase64(file);
    await sendMessage({
      content: [
        { type: "text", content: "What is in this image?" },
        {
          type: "image",
          source: { type: "data", value: base64, mimeType: file.type },
        },
      ],
    });
  }

  return (
    <input
      type="file"
      accept="image/*"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void send(file);
      }}
    />
  );
}
```

Pick an image, and the model describes it in the chat.

## How it works

- `content` is a string or an array of parts. A string is the same as one text part.
- Each part has a `type`: `text`, `image`, `audio`, `video`, or `document`.
- Each media part has a `source` that says where the bytes are. See [Source types](#source-types).
- The adapter turns each part into the format of its provider.
- The types of `chat()` allow only the input types that the selected model supports.

## Advanced

### Content parts

The part types come from `@tanstack/ai`:

```typescript
import type { ImagePart, TextPart } from "@tanstack/ai";

const textPart: TextPart = {
  type: "text",
  content: "What do you see in this image?",
};

// Image from base64 data. `mimeType` is required for data sources.
const imagePart: ImagePart = {
  type: "image",
  source: {
    type: "data",
    value: "base64EncodedImageData...",
    mimeType: "image/jpeg",
  },
  metadata: {
    detail: "high", // OpenAI detail level
  },
};

// Image from a URL. `mimeType` is optional for URL sources.
const imageUrlPart: ImagePart = {
  type: "image",
  source: {
    type: "url",
    value: "https://example.com/image.jpg",
    mimeType: "image/jpeg",
  },
};
```

All the part types:

```typescript
import type {
  AudioPart,
  ContentPart,
  DocumentPart,
  ImagePart,
  TextPart,
  VideoPart,
} from "@tanstack/ai";

// Metadata types for each provider
import type { OpenAIImageMetadata } from "@tanstack/ai-openai";
import type { AnthropicImageMetadata } from "@tanstack/ai-anthropic";
import type { GeminiImageMetadata } from "@tanstack/ai-gemini";
```

On the server, you can build the same message in a `chat()` call:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "What is in this image?" },
        {
          type: "image",
          source: { type: "url", value: "https://example.com/photo.jpg" },
        },
      ],
    },
  ],
});
```

### Source types

Each media part has one of three sources.

#### Data (base64)

Use `type: 'data'` for inline base64 bytes. The `mimeType` field is required, so the provider gets the correct content type:

```typescript
import type { AudioPart, ImagePart } from "@tanstack/ai";

const imagePart: ImagePart = {
  type: "image",
  source: {
    type: "data",
    value: "iVBORw0KGgoAAAANSUhEUgAAAAUA...",
    mimeType: "image/png",
  },
};

const audioPart: AudioPart = {
  type: "audio",
  source: {
    type: "data",
    value: "base64AudioData...",
    mimeType: "audio/mp3",
  },
};
```

Data is good for small files, or when the file is not on a public URL.

#### URL

Use `type: 'url'` for a file at a URL. The `mimeType` field is optional, because the provider can often find the type from the URL or the response headers:

```typescript
import type { ImagePart } from "@tanstack/ai";

const imagePart: ImagePart = {
  type: "image",
  source: {
    type: "url",
    value: "https://example.com/image.jpg",
    mimeType: "image/jpeg",
  },
};
```

A URL is good for large files that are already online. Not all providers accept a URL for all input types. Read the provider docs.

#### File handle (Files API)

Use `type: 'file'` for a file that you uploaded one time with the [Files API](./files-api) of a provider. The provider keeps the bytes, and each request sends a small reference. The source holds the opaque handle and the provider that issued it: `{ type: 'file', value: 'file-...', provider: 'openai' }`.

```typescript
import { chat, fileSourceFromHandle, uploadFile } from "@tanstack/ai";
import { openaiFiles, openaiText } from "@tanstack/ai-openai";
import { pdfBase64 } from "./pdf-data";

// Upload one time.
const handle = await uploadFile({
  adapter: openaiFiles(),
  input: { data: pdfBase64, mimeType: "application/pdf" },
});

// Then use the handle in as many requests as you want.
const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "Summarize this document" },
        { type: "document", source: fileSourceFromHandle(handle) },
      ],
    },
  ],
});
```

What `fileSourceFromHandle(handle)` does:

- It builds the `{ type: 'file', value, provider }` source.
- It picks the handle URL for Gemini, fal, and Grok, and the opaque id for OpenAI and Anthropic.
- Each adapter maps `value` to the native field of the provider (`file_id`, `fileData.fileUri`, or a URL).

These cases throw an error:

- A handle that you send to a different provider.
- A handle that you send to an adapter with no Files API support. The adapter rejects it before it builds the request.
- A handle that you send to an endpoint that needs the bytes, such as image edits or Veo.

See [Files API](./files-api) to upload, get, and delete handles.

### Images in tool results

A tool can return an array of `ContentPart`. Use it to give the model a screenshot or a chart:

```typescript
import { toolDefinition } from "@tanstack/ai";
import type { ContentPart } from "@tanstack/ai";
import { z } from "zod";

const getScreenshot = toolDefinition({
  name: "get_screenshot",
  description: "Get a screenshot of the page",
  inputSchema: z.object({}),
}).server(async (): Promise<Array<ContentPart>> => [
  { type: "text", content: "Page screenshot" },
  {
    type: "image",
    source: { type: "data", value: "iVBORw0KGgo...", mimeType: "image/png" },
  },
]);
```

The adapter sends the image in the form that its API accepts:

- **Responses APIs** (`openaiText`, `openRouterResponsesText`): the image stays in the tool output.
- **Chat Completions APIs** (`openRouterText`, `openaiChatCompletions`, and the other Chat Completions adapters built on `@tanstack/openai-base`): a tool message holds text only. The text goes in the tool message. The images go in one user message after the tool results. If a result has only images, its tool text is `(see attached image)`.

Some more rules:

- If these adapters know that the model has no image input, they do not send the images.
- An adapter that does not know the input types of the model sends the images. A result with only images then has the text `(image omitted: this model has no image input)`.
- The Chat Completions adapters and `openRouterResponsesText` send only the text and the images of a result that has images. They do not send audio, video, or documents from it.
- When an adapter sends an image from a tool result, a `file` source is an error, except on `openaiText`. Use a `data` or `url` source.

### Provider support

| Provider | Adapter | Input besides text |
| --- | --- | --- |
| OpenAI | `openaiText` | Image on `gpt-6.1-sol` and most new models. Image and PDF document on `gpt-5.5`. Audio on `gpt-4o-audio`. |
| Anthropic | `anthropicText` | Image and PDF document on all Claude models, for example `claude-sonnet-5-5`. |
| Gemini | `geminiText` | Image, audio, video, and document, for example on `gemini-3.8-flash`. |
| Ollama | `ollamaText` | Image on vision models, such as `llama3.2-vision`. Support changes by model. |

For the full list of each model, read `supports.input` in the `model-meta.ts` file of the adapter package.

`ollamaText(model)` reads the host from the `OLLAMA_HOST` environment variable. The default is `http://localhost:11434`.

#### OpenAI image detail and PDF filename

OpenAI reads two metadata fields:

- `detail` on an image: `'auto'`, `'low'`, or `'high'`.
- `filename` on a document. The API needs a filename with inline data. The default is `document.pdf`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { imageBase64, pdfBase64 } from "./data";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "Does the chart match the report?" },
        {
          type: "image",
          source: { type: "data", value: imageBase64, mimeType: "image/jpeg" },
          metadata: { detail: "high" },
        },
        {
          type: "document",
          source: { type: "data", value: pdfBase64, mimeType: "application/pdf" },
          metadata: { filename: "report.pdf" },
        },
      ],
    },
  ],
});
```

### Send any file type from the browser

This input accepts images, audio, video, and PDFs. It picks the part type from the MIME type of the file. It uses `readAsBase64` from the [quick setup](#2-send-the-image-from-the-browser):

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { readAsBase64 } from "./read-as-base64";

export function ChatWithFileUpload() {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  async function handleFileUpload(file: File) {
    const base64 = await readAsBase64(file);

    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";

    await sendMessage({
      content: [
        { type: "text", content: `Please analyze this ${type}` },
        {
          type,
          source: { type: "data", value: base64, mimeType: file.type },
        },
      ],
    });
  }

  return (
    <input
      type="file"
      accept="image/*,audio/*,video/*,.pdf"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void handleFileUpload(file);
      }}
    />
  );
}
```

The model on the server must accept each type that you allow here.

### Message ID and per-message props

`sendMessage` takes a string or a `MultimodalContent` object. These examples use `ChatClient` from `@tanstack/ai-client`. The `sendMessage` of `useChat` takes the same first argument. For per-message props, it takes `{ body }` as the second argument.

Give the message your own ID:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
});

await client.sendMessage({
  content: "Hello!",
  id: "custom-message-id-123",
});
```

The second argument adds `forwardedProps` for that one request. They are shallow-merged with the base `forwardedProps` of the client, and the values of the message win:

```typescript
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

const client = new ChatClient({
  connection: fetchServerSentEvents("/api/chat"),
  forwardedProps: { model: "gpt-6.1-sol" },
});

await client.sendMessage("Analyze this complex problem", {
  temperature: 0.2,
});
```

### Validate messages from a request

`request.json()` returns `any`. TanStack AI does not ship a runtime message validator. Define a schema with a Standard Schema library (Zod, Valibot, ArkType, and more), and parse the body before you give it to `chat()`:

```typescript ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

const ContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({
    type: z.literal("image"),
    source: z.object({ type: z.enum(["url", "data"]), value: z.string() }),
  }),
]);

const MessageSchema = z.object({
  // `ModelMessage.role` is 'user' | 'assistant' | 'tool'. There is no
  // 'system' role. Pass system instructions with the `systemPrompts`
  // option of `chat()`.
  role: z.enum(["user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
});

const BodySchema = z.object({ messages: z.array(MessageSchema) });

// In an API route handler
const { messages } = BodySchema.parse(await request.json());

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages,
});
```

The types of `chat()` still limit anything that you add at the call site to the input types of the selected model.
