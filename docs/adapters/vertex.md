---
title: Google Vertex AI
id: vertex-adapter
order: 4
description: "Run Gemini on Google Vertex AI with TanStack AI. Use regional endpoints and Google Cloud credentials via @tanstack/ai-vertex."
keywords:
  - tanstack ai
  - vertex
  - vertex ai
  - gemini
  - google cloud
  - regional
  - adapter
---

The Gemini Developer API has no regional endpoint. If you need EU data residency, CMEK, or VPC-SC, you have to run Gemini on Vertex AI.

`@tanstack/ai-vertex` is that path. It builds the existing Gemini adapters with Vertex auth. Request mapping, tools, and streaming stay the same.

Claude on Vertex is a different package. See [Anthropic Vertex](./anthropic#claude-on-vertex).

## Installation

```bash
npm install @tanstack/ai-vertex
```

## Basic usage

```typescript
import { chat } from "@tanstack/ai";
import { vertexText } from "@tanstack/ai-vertex";

const stream = chat({
  adapter: vertexText("gemini-3.7-flash", {
    project: "my-project",
    location: "europe-west1",
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

Reuse one auth object for every factory:

```typescript
import { vertexImage, vertexText } from "@tanstack/ai-vertex";

const auth = {
  project: "my-project",
  location: "europe-west1",
};

const text = vertexText("gemini-3.7-flash", auth);
const image = vertexImage("gemini-3.1-flash-image", auth);
```

## Authentication

Vertex factories accept every auth option `@google/genai` accepts. They do **not** read `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Those keys are AI Studio, not Vertex.

### Application Default Credentials

This is the usual Google Cloud path. Sign in with `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file.

Pass `project` and `location` on the factory, or set:

```bash
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=europe-west1
```

`GOOGLE_VERTEX_PROJECT` and `GOOGLE_VERTEX_LOCATION` are also accepted.

```typescript
import { vertexText } from "@tanstack/ai-vertex";

const adapter = vertexText("gemini-3.7-flash", {
  project: "my-project",
  location: "europe-west1",
});
```

### Service account fields

```typescript
import { vertexText } from "@tanstack/ai-vertex";

const adapter = vertexText("gemini-3.7-flash", {
  project: "my-project",
  location: "europe-west1",
  googleAuthOptions: {
    credentials: {
      client_email: "sa@my-project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    },
  },
});
```

### Express API key

Vertex express mode uses an API key and does not need project or location.

```typescript
import { vertexText } from "@tanstack/ai-vertex";

const adapter = vertexText("gemini-3.7-flash", {
  apiKey: "vertex-express-key",
});
```

Or set `GOOGLE_VERTEX_API_KEY`.

## Example: server and client

Keep Vertex credentials on the server. The browser only talks to your route.

Server:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { vertexText } from "@tanstack/ai-vertex";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: vertexText("gemini-3.7-flash", {
      project: "my-project",
      location: "europe-west1",
    }),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

Client:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = new FormData(form).get("text");
        if (typeof input === "string" && input.trim()) {
          sendMessage(input);
          form.reset();
        }
      }}
    >
      {messages.map((message) => (
        <div key={message.id}>
          {message.role}:{" "}
          {message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.content)
            .join("")}
        </div>
      ))}
      <input name="text" />
      <button type="submit">Send</button>
    </form>
  );
}
```

`useChat` does not know this is Vertex. It only consumes the SSE stream from your server.

## Other Gemini activities

Every factory uses the same auth object.

```typescript
import {
  vertexAudio,
  vertexEmbedding,
  vertexImage,
  vertexSpeech,
  vertexSummarize,
  vertexText,
  vertexVideo,
} from "@tanstack/ai-vertex";

const auth = { project: "my-project", location: "europe-west1" };

vertexText("gemini-3.7-flash", auth);
vertexSummarize("gemini-3.7-flash", auth);
vertexImage("gemini-3.1-flash-image", auth);
vertexEmbedding("gemini-embedding-001", auth);
vertexSpeech("gemini-3.1-flash-tts-preview", auth);
vertexAudio("lyria-3-pro-preview", auth);
vertexVideo("veo-3.1-generate-preview", auth);
```

Model ids and provider options are the same as `@tanstack/ai-gemini`. Vertex-only image options (for example `9:21`) are not unlocked in this release.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLOUD_PROJECT` | GCP project id |
| `GOOGLE_VERTEX_PROJECT` | Alias for the project id |
| `GOOGLE_CLOUD_LOCATION` | Region, for example `europe-west1` |
| `GOOGLE_VERTEX_LOCATION` | Alias for the region |
| `GOOGLE_VERTEX_API_KEY` | Vertex express API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service account JSON file |

## API reference

### `vertexText(model, config?)`

Creates a Gemini chat adapter on Vertex.

### `vertexSummarize(model, config?)`

Creates a Gemini summarize adapter on Vertex.

### `vertexImage(model, config?)`

Creates a Gemini image adapter on Vertex.

### `vertexEmbedding(model, config?)`

Creates a Gemini embedding adapter on Vertex.

### `vertexSpeech(model, config?)`

Creates a Gemini text-to-speech adapter on Vertex. Experimental.

### `vertexAudio(model, config?)`

Creates a Gemini Lyria audio adapter on Vertex. Experimental.

### `vertexVideo(model, config?)`

Creates a Gemini video adapter on Vertex. Experimental. `config.allowUrlFetch` is the same opt-in as the Gemini video adapter.

`config` accepts `project`, `location`, `apiKey`, `googleAuthOptions`, `httpOptions`, and the other `@google/genai` client fields. The factory always sets `vertexai: true`.

## Claude on Vertex

Use [`anthropicVertexText`](./anthropic#claude-on-vertex) from `@tanstack/ai-anthropic/vertex`.
