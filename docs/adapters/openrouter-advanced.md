---
title: "OpenRouter: Advanced"
id: openrouter-advanced
description: "Advanced OpenRouter setup in TanStack AI: retries, the Responses adapter, provider routing, prompt caching, tools with structured output, cost tracking, video, Sign in with OpenRouter, and the API reference."
keywords:
  - tanstack ai
  - openrouter
  - provider routing
  - retries
  - prompt caching
  - cost tracking
  - sign in with openrouter
  - adapter
---

This page has the details of the OpenRouter adapter. To get a first chat working, start at [OpenRouter](./openrouter).

## Configuration

```typescript
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText(
  "openai/gpt-6.1-sol",
  process.env.OPENROUTER_API_KEY!,
  {
    serverURL: "https://openrouter.ai/api/v1", // Optional
    httpReferer: "https://your-app.com", // Optional, for rankings
    appTitle: "Your App Name", // Optional, for rankings
  },
);
```

Need a header on each request, or a log of each model call? Both text adapters support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call). If you set an `httpClient`, each wrapped request still goes through it.

## Retry rate limits

A busy upstream provider can reply with HTTP 429. By default, the adapter retries only 5XX errors. To retry rate limits too, add `"429"` to `retryCodes`:

```typescript
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText(
  "openai/gpt-6.1-sol",
  process.env.OPENROUTER_API_KEY!,
  {
    retryConfig: {
      strategy: "backoff",
      backoff: {
        initialInterval: 500,
        maxInterval: 60000,
        exponent: 1.5,
        maxElapsedTime: 120000,
      },
      retryConnectionErrors: true,
    },
    retryCodes: ["429", "5XX"],
  },
);
```

- `retryCodes`: the HTTP status codes to retry. `"5XX"` matches every 5xx code.
- `retryConfig`: how long to wait between tries. If the response has a `Retry-After` header, the SDK waits that long.

Now a 429 waits, then retries, and the chat continues with the next response.

## Retry an error in the stream

Most provider errors come as an HTTP status, and the SDK retries them as shown above. But OpenRouter can send status 200 first. Then a provider error comes as an error chunk in the stream, and the SDK cannot retry it.

To retry that error, pass `retry` to `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";

const adapter = createOpenRouterText(
  "openai/gpt-6.1-sol",
  process.env.OPENROUTER_API_KEY!,
  { retryCodes: ["429", "5XX"] },
);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  retry: { maxRetries: 3 },
});
```

When `chat()` retries:

- Only for an error code in `retryCodes`. The default is 5XX only, so add `"429"` to retry a rate limit.
- Only when the call streamed no output yet. An error after part of the answer reaches you as a `RUN_ERROR`.
- Not when `retryConfig` has `strategy: "none"`.
- Only with the Chat Completions adapter (`openRouterText`). The Responses adapter does not do this.

The wait is the `initialInterval` of `retryConfig` (default 500 ms). It is the same for each try and does not grow. See [Let `chat()` retry for you](../chat/stream-events#let-chat-retry-for-you).

## Chat Completions vs Responses (beta)

OpenRouter has two OpenAI-compatible wire formats. The package has one adapter for each:

| Adapter | Endpoint | Status | When to use |
| --- | --- | --- | --- |
| `openRouterText` | `/v1/chat/completions` | Stable | The default for almost everything. The most models and tools. |
| `openRouterResponsesText` | `/v1/responses` | Beta | The OpenAI Responses request and response shape, with more multi-turn state on OpenAI-style models. |

The wire format is how your app talks to OpenRouter. It does not limit which provider answers. Both adapters work with any model that OpenRouter has (`anthropic/...`, `google/...`, `meta-llama/...`, and more).

```typescript
import { chat } from "@tanstack/ai";
import { openRouterResponsesText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterResponsesText("anthropic/claude-sonnet-5.5"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

Limits of the Responses adapter while it is in beta:

- Function tools work. The OpenRouter server tools (web search, web fetch) do not. For those, use `openRouterText`.
- The Chat Completions endpoint covers more providers and features. If you are not sure, use `openRouterText`.

## Provider preferences

`modelOptions.provider` sets which upstream providers can serve the request, and in which order. The adapter sends it to OpenRouter as it is. This sample pins two providers and turns off fallbacks:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("meta-llama/llama-4-maverick"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    provider: {
      order: ["groq", "together"], // provider slugs, in priority order
      allowFallbacks: false, // fail instead of routing elsewhere
    },
  },
});
```

Provider slugs are the lowercase ids on the model pages of OpenRouter, for example `"anthropic"`, `"openai"`, or `"groq"`.

Fields that limit which providers can serve the request:

- `only` and `ignore`: an allow list or a deny list of provider slugs. OpenRouter merges them with the provider settings of your account for this request.
- `requireParameters`: send the request only to providers that support every parameter in it. Without it, OpenRouter sends each provider only the parameters it supports, and drops the rest with no error. So a `responseFormat` or a sampling option can be ignored.
- `quantizations`: only providers that serve the model at the given quantization levels, for example `"fp8"` or `"int4"`.
- `dataCollection`: `"deny"` uses only providers that do not collect user data.
- `zdr`: `true` uses only zero-data-retention endpoints.

Fields that set the order and the price:

- `sort`: `"price"`, `"throughput"`, or `"latency"`, or an object with `by` and `partition`. It applies when `order` is not set. It turns off load balancing.
- `maxPrice`: the highest price you accept. It takes `prompt` and `completion` in USD for each million tokens. It also takes `request` (price for each request) and `image` (price for each image) where a provider has them. OpenRouter skips providers above the limit.

> [!NOTE]
> If you stream with `requireParameters: true`, also set `modelOptions.streamOptions: { includeUsage: false }`. Otherwise the adapter sends `stream_options`, and OpenRouter returns a 404 for providers that do not support that parameter.

## Model variants

`variant` adds the `:variant` suffix of OpenRouter to the model id. The adapter does not send it in the request body:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("deepseek/deepseek-v4-pro"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    variant: "free", // requests deepseek/deepseek-v4-pro:free
  },
});
```

The values are `"free"`, `"nitro"`, `"online"`, `"exacto"`, `"extended"`, and `"thinking"`. The OpenRouter catalog sets which variants a model has.

## Plugins

`plugins` turns on the request plugins of OpenRouter. Each entry has an `id`, plus the options of that plugin:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

const stream = chat({
  adapter: openRouterText("openai/gpt-6-astra"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    plugins: [{ id: "web", maxResults: 5 }],
  },
});
```

Plugin ids include `web`, `file-parser`, `response-healing`, `moderation`, and `auto-router`. For the options of each plugin, see the OpenRouter documentation. Web fetch is a server tool (`openrouter:web_fetch`), not a plugin. For web search and fetch as tools that the model can call, see [Provider tools](#provider-tools).

## Session and metadata

The adapter sends these fields to OpenRouter with no change:

- `user`: a unique id for the user.
- `sessionId`: the sticky routing key. Requests with the same `sessionId` go to the same provider, which gives more prompt-cache hits. OpenRouter also groups them for observability.
- `metadata`: up to 16 key-value pairs.

## Prompt caching

By default, `chat()` sets `sessionId` to the cache key, which is the `threadId` that you pass. So one conversation stays on one provider and reads its cache.

- `anthropic/*` models also get cache markers on the system message, the last tool, and the last message.
- `promptCache: 'long'` asks for the 1-hour cache.
- `promptCache: 'none'` sends nothing.

Your own `modelOptions.sessionId` wins. If you add a cache marker of your own, the adapter adds no automatic markers to that request. See [Prompt Caching](../advanced/prompt-caching).

## JSON mode

Some OpenRouter models reject strict JSON schema. For these models, `chat({ outputSchema })` sends `json_object` and adds your schema to the system prompt.

To send JSON mode to any other model, set `modelOptions.responseFormat`:

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const person = await chat({
  adapter: openRouterText("openai/gpt-5.6-sol"),
  messages: [{ role: "user", content: "Return Ada Lovelace, age 36." }],
  modelOptions: { responseFormat: { type: "json_object" } },
  outputSchema: z.object({ name: z.string(), age: z.number() }),
});
```

Read [When strict JSON schema is rejected](../structured-outputs/overview.md#when-strict-json-schema-is-rejected).

## Tools and structured output in one call

You can pass both `tools` and `outputSchema` on one `chat()` call. For some upstream models, OpenRouter returns the typed object in that same streaming request. Then the engine does not make a second call to get the final object.

The rules:

- This happens only when every model that can get the request is in `OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
- Each model sync makes this set from the OpenRouter catalog. It holds every chat model whose `supported_parameters` include `structured_outputs`, `tools`, and `tool_choice`. Examples are Claude 4.5 and later, Gemini 2.5 and later, GPT-4o and later, Grok 4, DeepSeek V3 and later, and Llama 3.1 and later.
- A model that OpenRouter does not flag, such as `anthropic/claude-opus-4.1`, uses two calls.
- If a fallback in `modelOptions.models` is not in the set, OpenRouter uses two calls.
- Routing suffixes such as `:nitro` do not change the result.

Import the set from `@tanstack/ai-openrouter/model-meta` to check a model before you send:

```typescript
import { OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS } from "@tanstack/ai-openrouter/model-meta";

console.log(OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.has("openai/gpt-5.5")); // true
```

Both text adapters attach the schema on this path. The server with the Chat Completions adapter:

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny", location };
});

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openai/gpt-5.5"),
    messages,
    tools: [getWeather],
    outputSchema: AnswerSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

The server with the Responses adapter has the same `tools` and `outputSchema`:

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
import { openRouterResponsesText } from "@tanstack/ai-openrouter";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny", location };
});

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterResponsesText("openai/gpt-5.5"),
    messages,
    tools: [getWeather],
    outputSchema: AnswerSchema,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

The client does not change. `useChat({ outputSchema })` still reads `partial` and `final`:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { z } from "zod";

const AnswerSchema = z.object({
  summary: z.string(),
  location: z.string(),
});

export function useAnswer() {
  const { sendMessage, partial, final } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    outputSchema: AnswerSchema,
  });

  return { sendMessage, partial, final };
}
```

See [Structured Outputs with tools](../structured-outputs/with-tools) for the event order, and [Middleware](../advanced/middleware) for how the `structuredOutput` phase works on this path.

To try this in a browser, run `examples/ts-react-chat` and open `/generations/openrouter-combined`. The page shows the tool call, the typed object, and the call counts of the adapter. `structuredOutputStream` must stay at 0.

## Provider tools

OpenRouter runs web search and web fetch for any chat model. Import the tools from `@tanstack/ai-openrouter/tools`. For how provider tools compare across adapters, see [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

`webSearchTool` adds web search to any OpenRouter chat model. It takes the `WebSearchConfig` of OpenRouter:

- `engine`: `auto`, `native`, `exa`, `firecrawl`, `parallel`, or `perplexity`.
- `maxResults` and `maxTotalResults`: the number of results.
- `allowedDomains` and `excludedDomains`: which sites can be in the results.
- `searchContextSize` and `userLocation`: more control of the search.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webSearchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-6.1-sol"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  tools: [
    webSearchTool({
      engine: "exa",
      maxResults: 5,
      allowedDomains: ["arxiv.org", "openai.com"],
    }),
  ],
});
```

Supported models: all OpenRouter chat models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `webFetchTool`

`webFetchTool` lets any OpenRouter chat model read the full content of a URL that the model picks. It takes the `WebFetchServerToolConfig` of OpenRouter:

- `engine`: `auto` (the default), `native`, `openrouter`, `exa`, `firecrawl`, or `parallel`.
- `maxContentTokens`: how much page content the model gets.
- `maxUses`: how many fetches the model can make in one request.
- `allowedDomains` and `blockedDomains`: which URLs the model can fetch.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webFetchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-6.1-sol"),
  messages: [
    { role: "user", content: "Summarize https://example.com/article" },
  ],
  tools: [
    webFetchTool({
      engine: "openrouter",
      maxContentTokens: 4000,
      allowedDomains: ["example.com"],
    }),
  ],
});
```

> [!NOTE]
> The `native` engine uses the fetch of the upstream provider, for example the Anthropic `web_fetch` on Claude models. Native fetch is not the same on each provider, so it can ignore `allowedDomains` and `blockedDomains`. For the same behavior on all models, use `openrouter`, `exa`, or `firecrawl`.

Supported models: all OpenRouter chat models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

## Cost tracking

OpenRouter reports the real cost of each request in the streamed response. The adapter puts it on the last `RUN_FINISHED` event:

- `usage.cost`: the cost of the request.
- `usage.costDetails`: the breakdown of that cost from OpenRouter.

TanStack AI does not calculate this cost from token counts. It comes from OpenRouter, so it includes routing, fallback providers, BYOK, and cached-token prices. For the meaning and units of the fields, see [Usage Accounting](https://openrouter.ai/docs/use-cases/usage-accounting) in the OpenRouter docs.

```typescript ignore
import { chat, type RunFinishedEvent, type StreamChunk } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";

function isRunFinished(chunk: StreamChunk): chunk is RunFinishedEvent {
  return "finishReason" in chunk;
}

for await (const chunk of chat({
  adapter: openRouterText("openai/gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (isRunFinished(chunk)) {
    console.log("cost:", chunk.usage?.cost);
    console.log("breakdown:", chunk.usage?.costDetails);
  }
}
```

- Middleware gets the same `usage`, with `cost` and `costDetails`, in the `onUsage` and `onFinish` hooks.
- If OpenRouter reports no cost, the fields are not there, and the stream completes as usual.
- Both `openRouterText` and `openRouterResponsesText` fill in the cost when OpenRouter returns it.

How usage works when a call fails:

- The `structuredOutputStream()` method of `openRouterText` puts the usage that it got on its last `RUN_ERROR` event. This covers parse failures, cut-off responses, empty responses, and SDK errors.
- When `chat()` uses this path, middleware `onChunk` gets the error event, also when the promise rejects.
- The `onUsage` hook reports successful calls. Each adapter call reports usage on one last event.
- A reported `completionTokensDetails.reasoningTokens` value of `0` stays zero. A missing count stays missing.
- An error before any usage arrives has no `usage` field. If the consumer stops reading the stream, it cannot get later events.

## Video generation

`openRouterVideo` uses the async video API of OpenRouter (`POST /api/v1/videos`). You get Seedance, Veo 3.1, Wan, Kling, and more with your one OpenRouter key. Video generation is experimental.

Like every TanStack AI video adapter, it creates a job, then you poll the job. OpenRouter returns the finished video as a stream, not a URL. Persistence stores the stream and sets `url`, so pass the same options to both calls.

The server:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { openRouterVideo } from "@tanstack/ai-openrouter";
import { withGenerationPersistence } from "@tanstack/ai-persistence";
import { persistence } from "./persistence";

const adapter = openRouterVideo("bytedance/seedance-2.5");

const hosting = {
  threadId: "videos",
  middleware: [
    withGenerationPersistence(persistence, {
      artifactUrl: (ref) => `/api/artifacts/${ref.artifactId}`,
    }),
  ],
};

const { jobId } = await generateVideo({
  adapter,
  ...hosting,
  prompt: [
    { type: "text", content: "Animate this product shot, slow push-in" },
    {
      type: "image",
      source: { type: "url", value: "https://your-cdn.com/product.png" },
      metadata: { role: "start_frame" },
    },
  ],
  size: "1280x720",
  // `duration` is typed per model. Snap raw seconds with adapter.snapDuration(),
  // or list the valid values with adapter.availableDurations().
  duration: 8,
});

let status = await getVideoJobStatus({ adapter, jobId, ...hosting });
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 5000));
  status = await getVideoJobStatus({ adapter, jobId, ...hosting });
}

// status.url is your artifact route.
// status.usage?.cost is the real cost that OpenRouter billed.
console.log(status.url, status.usage?.cost);
```

The client tracks the job with `useGenerateVideo`:

```tsx
import { useGenerateVideo, fetchServerSentEvents } from "@tanstack/ai-react";

export function VideoResult() {
  const { result } = useGenerateVideo({
    connection: fetchServerSentEvents("/api/generate/video"),
  });

  return result?.url ? <video src={result.url} controls /> : null;
}
```

The types check sizes, durations, and the options of each model (`resolution`, `aspectRatio`, `generateAudio`, `seed`, and more) against the video model metadata of OpenRouter. See [Video Generation](../media/video-generation.md) for the full lifecycle, streaming mode, and the image-to-video role table.

## Sign in with OpenRouter (BYOK)

OpenRouter can make an API key that the user owns, with [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth). Import the helpers from `@tanstack/ai-openrouter/pkce`. The key is stored under `openrouterByok.id` (`openrouter`) and sent as `x-byok-openrouter`.

On the client, start the login. When the user comes back, save the key into `defineByok`:

```tsx
import { useEffect } from "react";
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";
import {
  completeOpenRouterPkceIntoByok,
  startOpenRouterPkceLogin,
} from "@tanstack/ai-openrouter/pkce";

const byok = defineByok({
  storage: defaultByokStorage(),
});

export function OpenRouterSignIn() {
  useEffect(() => {
    void completeOpenRouterPkceIntoByok(byok);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        void startOpenRouterPkceLogin();
      }}
    >
      Sign in with OpenRouter
    </button>
  );
}
```

On the server, read the key with the same slug that the PKCE helper wrote:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { openrouterByok } from "@tanstack/ai-openrouter/byok";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, openrouterByok);
  if (!apiKey) return byokMissing(openrouterByok);

  const stream = chat({
    adapter: createOpenRouterText("openai/gpt-6.1-sol", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

See [Bring Your Own Key](../advanced/byok) for the keyring and passkey storage.

### Sign in from a CLI

A CLI or a desktop app has no web page for the redirect, so the user must copy a key by hand. `openrouterSignIn()` signs the user in with the browser and gives your app the key:

```typescript
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { openrouterSignIn } from "@tanstack/ai-openrouter/pkce";

const signIn = openrouterSignIn();
const apiKey = await signIn({
  open: (url) => console.log(`Open this URL to sign in: ${url}`),
});

const stream = chat({
  adapter: createOpenRouterText("openai/gpt-6.1-sol", apiKey),
  messages: [{ role: "user", content: "Hello!" }],
});
```

1. `signIn` starts a one-time listener on `127.0.0.1`, on a random port.
2. It calls `open` with the OpenRouter sign-in URL. Open that URL in the browser.
3. The user signs in and approves. The browser shows `You are signed in to OpenRouter. You can close this tab.`
4. `signIn` resolves with the API key, and the listener closes.

The sign-in uses PKCE and a random state. It stops after 10 minutes. To change the time, pass `openrouterSignIn({ timeoutMs })`. To cancel it, pass `signal` to `signIn`.

The listener runs on the computer of your app. So the sign-in works only when your app and the browser are on the same computer. In a hosted app, use the browser flow above.

## API reference

Each factory pair has the same shape. The short factory reads `OPENROUTER_API_KEY` from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `openRouterText(model, config?)` / `createOpenRouterText(model, apiKey, config?)` | Chat adapter (Chat Completions) |
| `openRouterResponsesText(model, config?)` / `createOpenRouterResponsesText(model, apiKey, config?)` | Chat adapter (Responses, beta) |
| `openRouterSummarize(model, config?)` / `createOpenRouterSummarize(model, apiKey, config?)` | Summarization adapter |
| `openRouterImage(model, config?)` / `createOpenRouterImage(model, apiKey, config?)` | Image adapter |
| `openRouterVideo(model, config?)` / `createOpenRouterVideo(model, apiKey, config?)` | Video adapter |
| `openRouterRerank(model, config?)` / `createOpenRouterRerank(model, apiKey, config?)` | Rerank adapter |
| `openRouterDecider(model, config?)` / `createOpenRouterDecider(model, apiKey, config?)` | Evaluate adapter |

The rerank adapter forwards the optional `httpReferer` and `appTitle` config fields as attribution headers, the same as the chat adapter.
