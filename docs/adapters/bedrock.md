---
title: Amazon Bedrock
id: bedrock-adapter
order: 7
description: "Use Amazon Bedrock in TanStack AI with @tanstack/ai-bedrock: Claude, Nova, Llama, Mistral, DeepSeek, and gpt-oss through the Converse API or the OpenAI-compatible APIs, with API-key or SigV4 auth."
keywords:
  - tanstack ai
  - amazon bedrock
  - aws
  - bedrock
  - converse api
  - openai compatible
  - chat completions
  - responses api
  - sigv4
  - claude
  - nova
  - llama
  - adapter
---

The Bedrock adapter calls Claude, Nova, Llama, Mistral, DeepSeek, and gpt-oss in your AWS account. It supports streaming, tools, reasoning, and embeddings.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-bedrock
vue: @tanstack/ai-bedrock
solid: @tanstack/ai-bedrock
svelte: @tanstack/ai-bedrock
preact: @tanstack/ai-bedrock
angular: @tanstack/ai-bedrock
vanilla: @tanstack/ai-bedrock
octane: @tanstack/ai-bedrock

<!-- ::end:tabs -->

You need no other package. `@aws-sdk/client-bedrock-runtime` is a direct dependency, and it does the SigV4 signing.

## 2. Set the credentials

Bedrock takes an API key or your AWS credentials. Pick one.

**API key.** Create a key in the AWS Console. See the [Bedrock API keys guide](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html). Then set one of these variables:

```bash
BEDROCK_API_KEY=your-bedrock-api-key
# or the legacy name:
AWS_BEARER_TOKEN_BEDROCK=your-bedrock-api-key
```

**SigV4 (AWS credential chain).** Use this for IAM roles, instance profiles, or `~/.aws/credentials`. With no API key in the environment, the adapter uses SigV4:

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_SESSION_TOKEN=...   # optional, for temporary credentials
```

With `auth: 'auto'` (the default), the adapter uses the first of these that it finds:

1. An explicit `apiKey` passed to the factory.
2. The `BEDROCK_API_KEY` environment variable.
3. The `AWS_BEARER_TOKEN_BEDROCK` environment variable.
4. SigV4 through the standard AWS credential chain.

Also enable access to the model in the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess). The models that you can use depend on your account and your region.

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: bedrockText("us.anthropic.claude-sonnet-4-5-20250929-v1:0", {
      region: "us-east-1",
    }),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

`bedrockText` uses the Converse API by default. Converse reaches the full chat catalog of Bedrock. For the other two APIs, see [Choose the API](#choose-the-api).

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
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

You now have a streaming chat on Bedrock. Client-side [tools](../tools/tools) work on all three APIs. Structured output and multimodal input (text, images, and documents) depend on the model.

## Embeddings

`bedrockEmbedding` calls the Titan and Cohere embedding models through `InvokeModel`:

```typescript
import { embed } from "@tanstack/ai";
import { bedrockEmbedding } from "@tanstack/ai-bedrock";

const result = await embed({
  adapter: bedrockEmbedding("amazon.titan-embed-text-v2:0"),
  input: ["a red guitar", "a blue drum kit"],
  dimensions: 512, // 256 | 512 | 1024
});

console.log(result.embeddings[0]?.vector);
```

Titan Multimodal embeds text and images, alone or joined into one vector. To join parts, nest them in an array (the same `Array<ContentPart>` shape as the `content` of a chat message). The outer array is the list of items, so this embeds one joined item:

```typescript
import { embed } from "@tanstack/ai";
import { bedrockEmbedding } from "@tanstack/ai-bedrock";

const productPhoto = "iVBORw0KGgo..."; // base64 image data

const result = await embed({
  adapter: bedrockEmbedding("amazon.titan-embed-image-v1"),
  input: [
    [
      { type: "text", content: "a red guitar" },
      {
        type: "image",
        source: {
          type: "data",
          value: productPhoto,
          mimeType: "image/png",
        },
      },
    ],
  ],
  dimensions: 1024, // 256 | 384 | 1024
});
```

Cohere Embed v3 on Bedrock is text only. It sends items in batches and requires `inputType`:

```typescript
import { embed } from "@tanstack/ai";
import { bedrockEmbedding } from "@tanstack/ai-bedrock";

const result = await embed({
  adapter: bedrockEmbedding("cohere.embed-english-v3"),
  input: ["a red guitar", "a blue drum kit"],
  modelOptions: { inputType: "search_document" },
});
```

- Titan models have no batch API. A batch of N items runs as N `InvokeModel` calls, with a small limit on calls at the same time.
- Titan Multimodal does not fetch remote image URLs. Pass base64 data (or a `data:` URI).

See the [Embeddings guide](../embeddings.md).

## Models and options

### Choose the API

Bedrock has three chat APIs. Set `api` on the factory:

| `api` | Adapter name | Models | SDK |
|---|---|---|---|
| `'converse'` (default) | `bedrock-converse` | The full catalog: Claude, Nova, Llama, Mistral, DeepSeek, Cohere, AI21, gpt-oss, and more | `@aws-sdk/client-bedrock-runtime` |
| `'chat'` | `bedrock` | Open-weight models only: gpt-oss, DeepSeek V3.x, Gemma, Qwen, Mistral open models, GLM, and similar. No Claude, Nova, or Llama | `openai` (OpenAI-compatible Chat Completions) |
| `'responses'` | `bedrock-responses` | gpt-oss and Gemma 4. Mantle only | `openai` (OpenAI-compatible Responses) |

Use Converse unless you need the OpenAI wire format. For which models work with which API, see the [AWS API compatibility matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html). Samples for `'chat'` and `'responses'` are in [Advanced](#chat-completions-api).

### Reasoning

Set `reasoning` on `chat()`. What goes to Bedrock depends on the API:

- Converse (the default): only Claude gets thinking. A budget model gets `thinking` with a budget in `additionalModelRequestFields`, and `maxTokens` grows past the budget. `off` sends nothing.
- Chat Completions (`api: 'chat'`): `reasoning_effort`.
- Responses (`api: 'responses'`): `reasoning.effort`.

```typescript
import { chat } from "@tanstack/ai";
import { bedrockText } from "@tanstack/ai-bedrock";

const stream = chat({
  adapter: bedrockText("us.anthropic.claude-haiku-4-5-20251001-v1:0", {
    region: "us-east-1",
  }),
  messages: [{ role: "user", content: "Check this proof." }],
  threadId: "thread-1",
  reasoning: { level: "high", budgetTokens: 8000 },
});
```

The levels of each model:

- `us.anthropic.claude-haiku-4-5-*`, `us.anthropic.claude-sonnet-4-5-*`: `off`, `high`, with `budgetTokens`.
- `openai.gpt-oss-120b-1:0`, `openai.gpt-oss-20b-1:0`: `low`, `medium`, `high`.
- The `google.gemma-4` models: `off`, `high`.

The other models take no `reasoning`. `us.deepseek.r1-v1:0` always thinks, and has no levels. When a model thinks by default, such as DeepSeek R1 or gpt-oss, the adapter streams its thinking.

On Converse, structured output forces a tool, and Claude cannot think while a tool is forced. So the structured output call sends no thinking.

### Models

The package ships a catalog of confirmed model ids (`src/model-catalog.generated.ts`). The maintainer script `scripts/fetch-bedrock-models.ts` refreshes it with `ListFoundationModels`.

| Group | Model ids |
| --- | --- |
| Anthropic Claude | `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `us.anthropic.claude-3-7-sonnet-20250219-v1:0`, `us.anthropic.claude-3-5-sonnet-20241022-v2:0`, `us.anthropic.claude-3-5-haiku-20241022-v1:0` |
| Amazon Nova | `us.amazon.nova-pro-v1:0`, `us.amazon.nova-lite-v1:0`, `us.amazon.nova-micro-v1:0` |
| Meta Llama | `us.meta.llama4-maverick-17b-instruct-v1:0`, `us.meta.llama3-3-70b-instruct-v1:0` |
| Other chat | `openai.gpt-oss-120b-1:0`, `openai.gpt-oss-20b-1:0`, `us.mistral.pixtral-large-2502-v1:0`, `us.deepseek.r1-v1:0`, `google.gemma-4-31b`, `google.gemma-4-26b-a4b`, `google.gemma-4-e2b` |
| Embeddings | `amazon.titan-embed-text-v2:0`, `amazon.titan-embed-image-v1`, `cohere.embed-english-v3`, `cohere.embed-multilingual-v3` |

`adapter.inputModalities` lists the input kinds of a model in the catalog. If this package does not know the model id, `bedrockText` and `createBedrockText` throw. `createBedrockChat`, `createBedrockResponsesText`, and `createBedrockConverse` return `undefined` for that id. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

### Configuration

`BedrockClientConfig` takes these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `api` | `'converse' \| 'chat' \| 'responses'` | `'converse'` | The Bedrock API to use |
| `region` | `string` | `'us-east-1'` | AWS region (for example `'us-west-2'`) |
| `auth` | `'apikey' \| 'sigv4' \| 'auto'` | `'auto'` | Authentication mode |
| `apiKey` | `string` | none | Explicit API key (wins over the environment variables) |
| `baseURL` | `string` | none | Replaces the computed base URL |
| `defaultHeaders` | `Record<string, string>` | none | Headers sent with every request |
| `endpoint` | `'runtime' \| 'mantle'` | `'runtime'` | The Bedrock endpoint (Chat Completions only) |

About `endpoint`:

- It applies only when `api: 'chat'`.
- `runtime` (`bedrock-runtime`) hosts the broad open-weight catalog. `mantle` is the other choice.
- On mantle, the adapter reads the path from the Bedrock API compatibility config: `/openai/v1` for Gemma 4, `/v1` for other models. An explicit `baseURL` still wins.
- The Responses API always uses mantle.

With an explicit API key:

```typescript
import { createBedrockText } from "@tanstack/ai-bedrock";

const adapter = createBedrockText(
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "your-bedrock-api-key",
  { region: "us-west-2" },
);
```

### Behind a proxy

Send every request through a gateway, such as Cloudflare AI Gateway or a corporate proxy, with `baseURL` and `defaultHeaders`. These two option names are the same on every TanStack AI adapter, so one gateway config works for all of them.

```typescript
import { createBedrockText } from "@tanstack/ai-bedrock";

const adapter = createBedrockText("us.amazon.nova-pro-v1:0", process.env.BEDROCK_API_KEY!, {
  baseURL: "https://gateway.example.com/aws-bedrock",
  defaultHeaders: { "cf-aig-authorization": `Bearer ${process.env.GATEWAY_TOKEN}` },
});
```

- All three Bedrock APIs accept these options. On the Converse API, the adapter adds the headers before SigV4 signing, so a signed request still includes them.
- Need more than a fixed header, such as a log of each model call? The Chat Completions API (`api: 'chat'`) and the Responses API (`api: 'responses'`) support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call). The Converse API ignores it, because the AWS SDK does not send its requests through `fetch`.

### Prompt caching

`chat()` adds cache points for Claude models by default: one after the system prompt, and one at the end of the last user message. Pass `promptCache: 'long'` for the 1-hour cache, or `promptCache: 'none'` to turn it off. Other models get no automatic cache point. For the cost, see [Prompt Caching](../advanced/prompt-caching).

To pick the places yourself, add a `cachePoint`. One cache point of your own turns the automatic ones off for that request. Later requests can read matching tokens at the lower cache rate. Bedrock bills cache misses at the standard input rate.

Explicit prompt caching depends on the model. Use `cachePoint` only with a model that AWS lists as supporting it. The minimum checkpoint size and the TTL options also change by model.

Set `metadata.cachePoint` on the item that ends the stable part of your prompt. The adapter puts a `cachePoint` block right after it:

```typescript
import { bedrockText } from "@tanstack/ai-bedrock";
import { chat } from "@tanstack/ai";

const stream = chat({
  adapter: bedrockText("us.anthropic.claude-sonnet-4-5-20250929-v1:0", {
    region: "us-east-1",
  }),
  systemPrompts: [
    {
      content: "Long, stable instructions...",
      metadata: { cachePoint: { type: "default" } },
    },
  ],
  messages: [
    // An older turn. Its cachePoint was removed when the new turn was added.
    { role: "user", content: "Summarize the report." },
    { role: "assistant", content: "The report says..." },
    {
      role: "user",
      content: [
        {
          type: "text",
          content: "What changed since yesterday?",
          // Only the newest message has a checkpoint.
          // It caches the conversation up to here for the next round.
          metadata: { cachePoint: { type: "default" } },
        },
      ],
    },
  ],
  threadId: "thread-1",
});
```

Keep one message checkpoint, on the newest message. Before you send the next turn, remove `cachePoint` from the older message and add it to the new message. The metadata stays in the message history. If you do not remove it, the checkpoints add up, and the request can go over the Bedrock limit of four.

Tools take the same metadata. To cache the tool definitions, pass `metadata: { cachePoint: { type: 'default' } }` to `toolDefinition()` for the last tool in the list.

- Bedrock accepts up to four checkpoints in one request.
- Add `ttl: '1h'` to keep an entry for one hour. The default is 5 minutes, and a read starts the timer again.
- Bedrock reads tool checkpoints first, then system prompt checkpoints, then message checkpoints. If a request mixes both TTLs, put every `1h` checkpoint before the first `5m` checkpoint in that order.
- Bedrock ignores a checkpoint below the minimum size of the model. The request still succeeds, and nothing goes into the cache.

### Token usage

`onUsage` and `RUN_FINISHED.usage` report the counts of Bedrock as `promptTokens`, `completionTokens`, and `totalTokens`.

- `promptTokens` is the full input, cached tokens included.
- When a request reads or writes a prompt cache, the cache parts are also on `promptTokensDetails.cachedTokens` and `promptTokensDetails.cacheWriteTokens`.

To read these counts, see [Token usage](../chat/stream-events#token-usage).

### Chat Completions API

Set `api: 'chat'` to use the OpenAI-compatible Chat Completions endpoint of Bedrock. It returns a `bedrock` adapter. Only open-weight models are on this endpoint.

```typescript ignore
// ignore: iterating a chat() stream and reading chunk.type/chunk.delta needs the
// AG-UI base event fields, which come from @ag-ui/core. It's a transitive dep of
// @tanstack/ai, so kiira (resolving @tanstack/ai from source under the dist->src
// heuristic) can't follow it and those base fields drop off StreamChunk. The code
// is correct (the same pattern is used throughout ai-client); see
// getting-started/quick-start-server for the type-checked consumption shape.
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('openai.gpt-oss-20b-1:0', {
  region: 'us-east-1',
  api: 'chat',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'What is the capital of France?' }],
  threadId: 'thread-1',
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta ?? '')
}
```

### Responses API

Set `api: 'responses'` to use the OpenAI-compatible Responses API of Bedrock. It returns a `bedrock-responses` adapter. This API is mantle only.

- The Responses API is stateful. To continue a conversation on the server, pass `previous_response_id` and `store` in `modelOptions`.
- Reasoning deltas stream as thinking content. Models on mantle can still send the old event name `response.reasoning.delta`, which the OpenAI spec replaced with `response.reasoning_text.delta`. The adapter reads both names the same way.

```typescript ignore
// ignore: see the Chat Completions sample above. Iterating a chat() stream and
// reading chunk.type/chunk.delta needs @ag-ui/core base fields kiira can't
// resolve transitively through @tanstack/ai source.
import { bedrockText } from '@tanstack/ai-bedrock'
import { chat } from '@tanstack/ai'

const adapter = bedrockText('openai.gpt-oss-120b-1:0', {
  region: 'us-east-1',
  api: 'responses',
})

for await (const chunk of chat({
  adapter,
  messages: [{ role: 'user', content: 'Summarize the Bedrock pricing page.' }],
  threadId: 'thread-1',
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') process.stdout.write(chunk.delta ?? '')
}
```

### API reference

| Factory | Creates |
| --- | --- |
| `bedrockText(model, config?)` | Chat adapter with auth from the environment. Returns the adapter of the `api` that you pick |
| `createBedrockText(model, apiKey, config?)` | Chat adapter with an explicit API key. Skips the environment lookup |
| `bedrockEmbedding(model, config?)` / `createBedrockEmbedding(model, apiKey, config?)` | Embedding adapter for Titan and Cohere models |

`config` takes `api`, `region`, `auth`, `apiKey`, `baseURL`, `defaultHeaders`, and `endpoint`. See [Configuration](#configuration).

More from AWS:

- [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html): create and manage API keys.
- [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html): enable models in your account.
- [Converse API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html): the native Converse API docs.
