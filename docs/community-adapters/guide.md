---
title: "Community Adapters Guide"
slug: /community-adapters/guide
order: 1
description: "Build, publish, and list a community adapter for TanStack AI: a minimal text adapter, then model metadata, typed options, reasoning, and BYOK."
keywords:
  - tanstack ai
  - community adapters
  - build adapter
  - custom adapter
  - provider integration
  - adapter authoring
  - contribute
---

You run an AI service, or you want one in TanStack AI, and no adapter exists for it. A community adapter is an npm package that maps the API of the service to the TanStack AI adapter interface. Then users call your service with `chat()`, `generateImage()`, and the other functions.

You build, publish, and maintain the adapter. The TanStack AI core team does not.

## 1. Create the package

Create an npm package, for example `@acme/tanstack-ai-adapter`. Add `@tanstack/ai` as a peer dependency, so your adapter uses the same copy as the app.

For reference, read the [adapters in the TanStack AI repository](https://github.com/tanstack/ai/tree/main/packages). The [OpenAI adapter](https://github.com/tanstack/ai/tree/main/packages/ai-openai) has the most features.

## 2. Write a minimal text adapter

A text adapter extends `BaseTextAdapter` and implements two methods:

- `chatStream()`: calls your service and yields AG-UI events.
- `structuredOutput()`: returns JSON for a schema.

This sample calls a JSON API that returns the whole answer at once:

```typescript
// src/index.ts
import { EventType } from "@tanstack/ai";
import { BaseTextAdapter } from "@tanstack/ai/adapters";
import type {
  AdapterYieldChunk,
  DefaultMessageMetadataByModality,
  ModelMessage,
  Modality,
  TextOptions,
} from "@tanstack/ai";
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from "@tanstack/ai/adapters";

export const ACME_MODELS = ["acme-small", "acme-large"] as const;
export type AcmeModel = (typeof ACME_MODELS)[number];

type AcmeOptions = Record<string, never>;

async function callAcme(
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<string> {
  const response = await fetch("https://api.acme.example/v1/chat", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const json: unknown = await response.json();
  if (
    typeof json === "object" &&
    json !== null &&
    "text" in json &&
    typeof json.text === "string"
  ) {
    return json.text;
  }
  throw new Error(`Acme returned no text (status ${response.status})`);
}

function toAcmeMessages(messages: Array<ModelMessage>) {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === "string" ? message.content : "",
  }));
}

export class AcmeTextAdapter<TModel extends AcmeModel> extends BaseTextAdapter<
  TModel,
  AcmeOptions,
  ReadonlyArray<Modality>,
  DefaultMessageMetadataByModality
> {
  readonly name = "acme";
  private readonly apiKey: string;

  constructor(model: TModel, apiKey: string) {
    super({}, model);
    this.apiKey = apiKey;
  }

  async *chatStream(
    options: TextOptions<AcmeOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const runId = options.runId ?? this.generateId();
    const threadId = options.threadId ?? this.generateId();
    const messageId = this.generateId();

    yield { type: EventType.RUN_STARTED, runId, threadId, timestamp: Date.now() };

    const text = await callAcme(
      this.apiKey,
      { model: this.model, messages: toAcmeMessages(options.messages) },
      options.abortController?.signal,
    );

    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
      timestamp: Date.now(),
    };
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: text,
      timestamp: Date.now(),
    };
    yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: Date.now() };
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: "stop",
      timestamp: Date.now(),
    };
  }

  async structuredOutput(
    options: StructuredOutputOptions<AcmeOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const rawText = await callAcme(
      this.apiKey,
      {
        model: this.model,
        messages: toAcmeMessages(options.chatOptions.messages),
        schema: options.outputSchema,
      },
      options.chatOptions.abortController?.signal,
    );
    const data: unknown = JSON.parse(rawText);
    return { data, rawText };
  }
}

export function acmeText<TModel extends AcmeModel>(
  model: TModel,
  apiKey: string = process.env.ACME_API_KEY ?? "",
) {
  return new AcmeTextAdapter(model, apiKey);
}
```

## 3. Call it with `chat()`

```typescript
// src/demo.ts
import { chat } from "@tanstack/ai";
import { acmeText } from "./index";

const stream = chat({
  adapter: acmeText("acme-large"),
  messages: [{ role: "user", content: "Hello!" }],
});

for await (const chunk of stream) {
  if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    process.stdout.write(chunk.delta);
  }
}
```

The answer of your service prints in the terminal. Your adapter now works with `chat()`, `useChat`, and the rest of TanStack AI.

## How it works

- `chat()` calls `chatStream()` with the messages, tools, and options of the call.
- `chatStream()` yields AG-UI events in order: `RUN_STARTED`, then `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, and `TEXT_MESSAGE_END`, then `RUN_FINISHED`.
- If your service streams, yield one `TEXT_MESSAGE_CONTENT` for each piece. For tool calls, yield `TOOL_CALL_START`, `TOOL_CALL_ARGS`, and `TOOL_CALL_END`.
- When a call sets `outputSchema`, `chat()` calls `structuredOutput()` with the JSON Schema.

The minimal adapter skips tools, system prompts, and images. A full adapter maps them the same way. For a full example, see the [OpenAI text adapter](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/adapters/text.ts).

Adapters are split by capability. Implement only what your service supports:

- Text (chat)
- Image
- Embeddings
- Video

## Publish and list your adapter

1. Publish the package to npm.
2. Add a page for your adapter to [`docs/community-adapters`](https://github.com/TanStack/ai/tree/main/docs/community-adapters) in the TanStack AI repository.
3. Run `pnpm run sync-docs-config` in the root of the monorepo. This puts your page in the docs navigation.
4. Open a [pull request](https://github.com/TanStack/ai/pulls) with the page and the generated changes.

## Maintain your adapter

You are responsible for the adapter after you publish it:

- Follow API changes of your service.
- Stay compatible with new TanStack AI releases.
- Answer issues and feedback from users.
- Update your docs page when features change. Open a follow-up pull request for it.

## Advanced

These steps make your adapter type-safe per model, like the built-in adapters.

### Model metadata

Model metadata describes what each model can do. TanStack AI uses it for compatibility checks and feature selection. For each model, define at least:

- The model name and id.
- The input and output modalities.
- The features, for example streaming, tools, and structured output.
- The price, if you know it.
- Notes and limits that are special to your service.

For a concrete example, see the [OpenAI model metadata](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/model-meta.ts).

### Model lists per capability

Group the models by what they support, in exported arrays. Put a model in an array only when it fully supports that capability:

```typescript ignore
export const OPENAI_CHAT_MODELS = [
  // Frontier models
  GPT5_2.name,
  GPT5_2_PRO.name,
  GPT5_2_CHAT.name,
  GPT5_1.name,
  GPT5_1_CODEX.name,
  GPT5.name,
  GPT5_MINI.name,
  GPT5_NANO.name,
  GPT5_PRO.name,
  GPT5_CODEX.name,
  // ...other models
] as const
export const OPENAI_IMAGE_MODELS = [
  GPT_IMAGE_1.name,
  GPT_IMAGE_1_MINI.name,
  DALL_E_3.name,
  DALL_E_2.name,
] as const

export const OPENAI_VIDEO_MODELS = [SORA2.name, SORA2_PRO.name] as const
```

### Option fragments

Models take different options. Build the options from small reusable fragments, not one copy per model:

- Base options that every model takes.
- Feature fragments that you combine for each model.

Based on the [OpenAI options](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/text/text-provider-options.ts):

```typescript
export interface OpenAIBaseOptions {
  // base options that every chat model supports
}

// Feature fragments that can be stitched per-model

/**
 * Tools options for models.
 */
export interface OpenAIToolsOptions {
  //...
}

/**
 * Structured output options for models.
 */
export interface OpenAIStructuredOutputOptions {
  //...
}
```

There is no single correct split. Match the features of your service.

### Typed options per model

Type the options by model name, so users see only the options of the selected model. A model gets only the fragments it supports:

```typescript ignore
export type OpenAIChatModelProviderOptionsByName = {
  [GPT5_2.name]: OpenAIBaseOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
  [GPT5_2_CHAT.name]: OpenAIBaseOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
  // ... repeat for each model
}
```

### Input modalities per model

Define the input kinds (text, images, audio) of each model, so invalid input is a type error:

```typescript ignore
export type OpenAIModelInputModalitiesByName = {
  [GPT5_2.name]: typeof GPT5_2.supports.input
  [GPT5_2_PRO.name]: typeof GPT5_2_PRO.supports.input
  [GPT5_2_CHAT.name]: typeof GPT5_2_CHAT.supports.input
  //  ... repeat for each model
}
```

To also set `inputModalities` at run time, see [Set inputModalities in your own adapter](../advanced/extend-adapter-advanced#set-inputmodalities-in-your-own-adapter).

### Reasoning levels

Does your service have a thinking model? Users set it with `chat({ reasoning })`, and the types take only the levels of the selected model. Put a `reasoning` field on the metadata of each model, then build two maps from it:

```typescript ignore
import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

const EFFORT_NONE_LOW_TO_XHIGH = {
  levels: { off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
  budget: false,
} as const

const GPT5_2 = {
  name: 'gpt-5.2',
  // ...supports, pricing
  reasoning: EFFORT_NONE_LOW_TO_XHIGH,
} as const

// One object lists each model once.
const OPENAI_REASONING = {
  [GPT5_2.name]: GPT5_2.reasoning,
}

// The levels per model, for the types.
export type OpenAIModelReasoningByName = {
  [K in keyof typeof OPENAI_REASONING]: ModelReasoningCapability<
    (typeof OPENAI_REASONING)[K]
  >
}

// The same data at run time.
export const OPENAI_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  OPENAI_REASONING
```

- `levels` lists only the levels that the model has, with the value your service takes for each. A level that is not in the list is not supported.
- `budget` is `true` when the model takes a thinking token budget.
- Many models share the same levels. Define each shape once, and point each model at it.
- A model that does not reason gets no `reasoning` field.

Then send `options.reasoning` as the thinking field of your service. Pass `OpenAIModelReasoningByName[TModel]` as the last type parameter of the adapter class, so `chat({ reasoning })` is typed. See [Add reasoning to your adapter](../advanced/extend-adapter-advanced#add-reasoning-to-your-adapter).

### Prompt cache and mid-conversation changes

`chat()` also passes two optional fields to a text adapter. Your adapter works without them, but they make repeated requests cheaper:

- `options.promptCache`: map it to the cache fields of your service. See [Send the prompt cache](../advanced/extend-adapter-advanced#send-the-prompt-cache).
- `options.midConversationChanges`: send added tools and prompts inside the conversation. See [Send mid-conversation changes](../advanced/extend-adapter-advanced#send-mid-conversation-changes).

### Keep history valid across models

A user can switch to your adapter in the middle of a thread. The history then holds signatures and tool call IDs from another provider, and your API rejects them.

1. Name the source of your text adapter. `chat()` records it on each answer as `metadata.tanstack.source`:
   - `name`: the adapter name.
   - `provider`: optional. Defaults to `name`.
   - `api`: optional, the wire API. Defaults to the adapter kind.
2. Before you build the request, run the history through `transformMessagesForReplay`. Pass your source and a rule for tool call IDs:

```typescript
import { hashToolCallId, transformMessagesForReplay } from '@tanstack/ai/adapter-internals'
import type { ModelMessage } from '@tanstack/ai'

export function prepareMessages(messages: ReadonlyArray<ModelMessage>, model: string) {
  const { messages: replay } = transformMessagesForReplay(
    messages,
    { provider: 'example-provider', api: 'example-messages', model },
    (id, { attempt }) => {
      const clean = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
      return attempt === 0 ? clean : `${clean.slice(0, 40)}_${hashToolCallId(id)}_${attempt}`
    },
  )
  return replay
}
```

For history from another source, the helper:

- Drops signatures and redacted thinking. Turns readable thinking into text.
- Calls your ID rule for each tool call, and gives each result the new ID of its call. If the new ID is taken, it calls the rule again with a higher `attempt`.

`chat()` already drops failed answers and adds `No result provided` for unanswered tool calls before it calls your adapter. Your saved history does not change.

### Export a BYOK provider

Can users paste an API key for your adapter? Then export a `defineByokProvider` object from a `/byok` subpath (`@scope/ai-acme/byok`):

```typescript
import { defineByokProvider } from "@tanstack/ai/byok";

export const acmeByok = defineByokProvider({
  id: "acme",
  label: "Acme",
  env: "ACME_API_KEY",
});
```

- Do not export it from the main entry of the package. That pulls your provider SDK into the browser.
- `id` is required. It is the slug in the `x-byok-<id>` header.
- `env` is the **name** of the environment variable that your adapter already reads. Put only names here, because the client imports this object.

Apps import `{ acmeByok } from "@scope/ai-acme/byok"`. A relay calls `getByokKey(request, acmeByok)` from `@tanstack/ai/byok/server` to read the `x-byok-acme` header.
