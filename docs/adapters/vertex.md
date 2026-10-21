---
title: Google Vertex AI
id: vertex-adapter
order: 4
description: "Run Gemini on Google Vertex AI with TanStack AI. Use regional endpoints and Google Cloud credentials with @tanstack/ai-vertex."
keywords:
  - tanstack ai
  - vertex
  - vertex ai
  - gemini
  - grok
  - xai
  - mistral
  - google cloud
  - regional
  - adapter
---

Need EU data residency, CMEK, or VPC-SC for Gemini? The Gemini Developer API has no regional endpoint, so you must run Gemini on Vertex AI.

`@tanstack/ai-vertex` gives you the Gemini adapters with Vertex auth. Request mapping, tools, and streaming stay the same as in [`@tanstack/ai-gemini`](./gemini).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-vertex
vue: @tanstack/ai-vertex
solid: @tanstack/ai-vertex
svelte: @tanstack/ai-vertex
preact: @tanstack/ai-vertex
angular: @tanstack/ai-vertex
vanilla: @tanstack/ai-vertex
octane: @tanstack/ai-vertex

<!-- ::end:tabs -->

## 2. Set the credentials

Vertex uses Google Cloud credentials. It does **not** read `GEMINI_API_KEY` or `GOOGLE_API_KEY`, because those keys are for AI Studio.

1. Sign in with `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file.
2. Set the project and the region:

```bash
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=europe-west1
```

You can also pass `project` and `location` on each factory, as in the next step. For a service account in code or an express API key, see [Authentication](#authentication).

## 3. Stream a chat from the server

Keep the Vertex credentials on the server. The browser only talks to your route.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { vertexText } from "@tanstack/ai-vertex";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: vertexText("gemini-3.7-flash", {
      project: "my-project",
      location: "europe-west1",
    }),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

## 4. Render the chat

`useChat` does not know that this is Vertex. It reads the stream from your route, the same as for every provider:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have Gemini on Vertex, in the region that you chose.

## Other Gemini activities

Each factory takes the same auth object:

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

- `vertexSpeech`, `vertexAudio`, and `vertexVideo` are experimental.
- `vertexText` ignores [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call), because the `@google/genai` SDK does not take a custom fetch.

## Models and options

The model ids and the provider options are the same as in [`@tanstack/ai-gemini`](./gemini#models-and-options). Image options that only Vertex has (for example `9:21`) do not work in this release.

## Advanced

### Authentication

Vertex factories accept every auth option that `@google/genai` accepts.

#### Application Default Credentials

This is the usual Google Cloud path. Sign in with `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file. Then pass `project` and `location` on the factory, or set them in the environment:

```typescript
import { vertexText } from "@tanstack/ai-vertex";

const adapter = vertexText("gemini-3.7-flash", {
  project: "my-project",
  location: "europe-west1",
});
```

#### Service account fields

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

#### Express API key

Vertex express mode uses an API key. It needs no project and no location.

```typescript
import { vertexText } from "@tanstack/ai-vertex";

const adapter = vertexText("gemini-3.7-flash", {
  apiKey: "vertex-express-key",
});
```

You can also set `GOOGLE_VERTEX_API_KEY`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLOUD_PROJECT` | GCP project id |
| `GOOGLE_VERTEX_PROJECT` | Alias for the project id |
| `GOOGLE_CLOUD_LOCATION` | Region, for example `europe-west1` |
| `GOOGLE_VERTEX_LOCATION` | Alias for the region |
| `GOOGLE_VERTEX_API_KEY` | Vertex express API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service account JSON file |

### Claude on Vertex

Use [`anthropicVertexText`](./anthropic-advanced#claude-on-vertex) from `@tanstack/ai-anthropic/vertex`.

### Grok on Vertex

Use [`grokVertexText`](./grok#grok-on-vertex) from `@tanstack/ai-grok/vertex`.

- Vertex Grok uses the OpenAI-compatible Responses endpoint.
- For summarize, use `grokVertexSummarize` from the same entry.
- The factory accepts only the Grok chat models in the Vertex catalog: `grok-4.3`, `grok-4.20-reasoning`, `grok-4.20-non-reasoning`, `grok-4.1-fast-reasoning`, and `grok-4.1-fast-non-reasoning`.

### Mistral on Vertex

Use [`mistralVertexText`](./mistral#mistral-on-vertex) from `@tanstack/ai-mistral/vertex`.

- Vertex Mistral uses the publisher `rawPredict` path.
- It is regional only: `us-central1` or `europe-west4`.
- The factory accepts only the Mistral chat models in the Vertex catalog: `mistral-medium-3`, `mistral-small-2503`, and `codestral-2`.

### API reference

| Factory | Creates |
| --- | --- |
| `vertexText(model, config?)` | Gemini chat adapter on Vertex |
| `vertexSummarize(model, config?)` | Gemini summarize adapter on Vertex |
| `vertexImage(model, config?)` | Gemini image adapter on Vertex |
| `vertexEmbedding(model, config?)` | Gemini embedding adapter on Vertex |
| `vertexSpeech(model, config?)` | Gemini text-to-speech adapter on Vertex. Experimental |
| `vertexAudio(model, config?)` | Gemini Lyria audio adapter on Vertex. Experimental |
| `vertexVideo(model, config?)` | Gemini video adapter on Vertex. Experimental. `config.allowUrlFetch` is the same opt-in as on the Gemini video adapter |

`config` accepts `project`, `location`, `apiKey`, `googleAuthOptions`, `httpOptions`, and the other `@google/genai` client fields. The factory always sets `vertexai: true`.
