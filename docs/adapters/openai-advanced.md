---
title: "OpenAI: Advanced"
id: openai-advanced
order: 1
description: "Advanced OpenAI setup in TanStack AI: Chat Completions, Azure OpenAI, Sign in with ChatGPT, prompt caching, compaction, every provider tool, and the API reference."
keywords:
  - tanstack ai
  - openai
  - azure openai
  - chat completions
  - responses api
  - sign in with chatgpt
  - prompt caching
  - provider tools
  - adapter
---

This page has the details of the OpenAI adapter. To get a first chat working, start at [OpenAI](./openai).

## Chat Completions API

`@tanstack/ai-openai` has two text adapters. They call different OpenAI endpoints:

| | `openaiText` (Responses) | `openaiChatCompletions` (Chat Completions) |
|---|---|---|
| Endpoint | `/v1/responses` | `/v1/chat/completions` |
| Reasoning summaries | Yes. With `reasoning` set, the summary text streams as `REASONING_*` events | No. `reasoning` goes out as `reasoning_effort`, and no text streams back |
| Wire format | OpenAI only | The older shape that many providers use (Grok, Groq, OpenRouter, many local model servers) |
| Structured output streaming | `text.format: { type: 'json_schema', strict: true }` + `stream: true` | `response_format: { type: 'json_schema', strict: true }` + `stream: true` |

- Use `openaiText` for reasoning summaries and the other Responses features.
- If you move from a provider with the Chat Completions shape, or share request code with other Chat Completions adapters, use `openaiChatCompletions`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiChatCompletions } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiChatCompletions("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});
```

With an explicit API key:

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChatCompletions } from "@tanstack/ai-openai";

const adapter = createOpenaiChatCompletions("gpt-6.1-sol", process.env.OPENAI_API_KEY!, {
  organization: "org-...", // optional
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});
```

Both adapters work with [Structured Outputs](../structured-outputs/overview), also with `stream: true`. Both take the same `modelOptions` (temperature, top_p, max_tokens, stop, and more) and [`reasoning`](./openai#reasoning). `openaiChatCompletions` cannot stream the thinking text.

## Azure OpenAI

Does your OpenAI model run as a deployment in Azure? Use `createAzureOpenaiText`. It calls the Azure Responses API and sends your key in the `api-key` header.

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createAzureOpenaiText } from "@tanstack/ai-openai";

export async function POST(request: Request) {
  const { messages, threadId } = await request.json();

  const stream = chat({
    adapter: createAzureOpenaiText("gpt-5.6", process.env.AZURE_OPENAI_API_KEY!, {
      resourceName: "my-resource",
      deploymentName: "production-chat",
    }),
    messages,
    threadId,
  });

  return toServerSentEventsResponse(stream);
}
```

- Azure gets `production-chat` as the model. Your code still uses `gpt-5.6`.
- The client does not change. It reads this route like any other chat route.
- `reasoning` takes the levels of the OpenAI model name, here `gpt-5.6`. A model name that is not an OpenAI model, such as a bare deployment name, takes no `reasoning`. See [Reasoning](./openai#reasoning).
- `createAzureOpenaiText` reads nothing from the environment. You pass the key, and you pass the endpoint as `resourceName` or `baseURL`.

To keep all of it in the environment, use `azureOpenaiText`. Like `openaiText`, it reads the key from the environment:

```sh
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_RESOURCE_NAME=my-resource
AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-5.6=production-chat
```

```typescript
import { azureOpenaiText } from "@tanstack/ai-openai";

const adapter = azureOpenaiText("gpt-5.6");
```

`azureOpenaiText` always reads the key from `AZURE_OPENAI_API_KEY`. If that variable is not set, it throws. For the other values, the config wins over the environment:

- **Endpoint:** `baseURL`, then `resourceName`, then `AZURE_OPENAI_BASE_URL`, then `AZURE_OPENAI_RESOURCE_NAME`. You must set one of them.
- **API version:** `apiVersion`, then `AZURE_OPENAI_API_VERSION`, then `v1`.
- **Deployment:** `deploymentName`, then `deploymentNameMap`, then `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, then the model name. A `deploymentNameMap` in the config replaces the environment map. The two maps do not merge.

An Azure resource URL always goes to the `/openai/v1` path. A proxy URL keeps its own path.

## Sign in with ChatGPT (BYOK)

Many of your users have a ChatGPT plan but no API key. Let them sign in with ChatGPT. The token bills their ChatGPT plan, not your account.

The helpers in `@tanstack/ai-openai/siwc` put the access token into the `openai` [BYOK](../advanced/byok) slot. Your relay reads it like a pasted key.

Before you start, know these limits:

- OpenAI allows this sign-in only for open-source and locally hosted apps. For a hosted app, fill in the [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/).
- OpenAI redirects only to `127.0.0.1`. Something must answer on that address. Vite listens on `::1` by default. The `ts-react-chat` example runs a small script on `127.0.0.1:3000` that redirects to `localhost:3000`.
- Keep the app on `localhost`, because passkey storage does not work on an IP address. The callback lands on `127.0.0.1`, then `completeChatGptSignIn` sends the browser back to `localhost`.
- The callback page must be at `/auth/callback`.

### 1. Add the sign-in button

Call `startChatGptSignIn` from a click. `agentName` is your app name. OpenAI shows it on the consent screen.

```tsx
import { startChatGptSignIn } from "@tanstack/ai-openai/siwc";

export function ChatGptButton() {
  return (
    <button
      type="button"
      onClick={() => {
        void startChatGptSignIn({ agentName: "My App" });
      }}
    >
      Continue with ChatGPT
    </button>
  );
}
```

### 2. Finish on `/auth/callback`

Render this component on the `/auth/callback` route. It exchanges the code when the page loads. Then the user clicks to save.

```tsx
import { useEffect, useRef, useState } from "react";
import {
  completeChatGptSignIn,
  saveChatGptSignIn,
} from "@tanstack/ai-openai/siwc";
import type { ChatGptSignIn } from "@tanstack/ai-openai/siwc";
import { byok } from "./byok";

export function ChatGptCallback() {
  const started = useRef(false);
  const [signIn, setSignIn] = useState<ChatGptSignIn | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // The code works one time. Strict Mode runs effects two times.
    if (started.current) return;
    started.current = true;
    completeChatGptSignIn().then(setSignIn, (caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Sign-in failed");
    });
  }, []);

  if (error) return <p>{error}</p>;
  if (!signIn) return <p>Finishing sign-in...</p>;
  return (
    <button
      type="button"
      onClick={() => {
        void saveChatGptSignIn(byok, signIn);
      }}
    >
      Save ChatGPT sign-in
    </button>
  );
}
```

The save needs a click, because passkey storage shows a browser prompt. The refresh token goes into a second keyring slot. No send attaches that slot, so the refresh token stays in the browser.

### 3. Refresh the token

The access token lasts one hour. Call `refreshChatGptSignIn` on a timer:

```tsx
import { useEffect } from "react";
import { refreshChatGptSignIn } from "@tanstack/ai-openai/siwc";
import { byok } from "./byok";

export function useChatGptRefresh() {
  useEffect(() => {
    const refresh = () => {
      refreshChatGptSignIn(byok).catch(console.error);
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, []);
}
```

The call does nothing until the token has less than five minutes left. If OpenAI rejects the refresh token, the call clears the sign-in. Then the user must sign in again.

### 4. Read the token on the relay

The relay code is the same as for a pasted key. Add `store: false`, because the ChatGPT route requires it.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);

  const stream = chat({
    adapter: createOpenaiChat("gpt-6-astra", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    modelOptions: { store: false },
  });
  return toServerSentEventsResponse(stream);
}
```

`store: false` also works with an API key. A ChatGPT token does not start with `sk-`. If you must send different options, use that test.

The ChatGPT route has these limits:

- Use a model that the ChatGPT plan of the user includes.
- Do not send `temperature`, `top_p`, `max_output_tokens`, `metadata`, or `previous_response_id`.
- Hosted tools do not work. This includes image generation, file search, code interpreter, computer use, and hosted MCP.
- Audio input and transcription do not work.

Click **Continue with ChatGPT**, approve, save, then send a message. The relay calls OpenAI on the ChatGPT plan of the user.

The `ts-react-chat` example has this flow in its key dialog.

## Configuration

```typescript
import { createOpenaiChat, type OpenAITextConfig } from "@tanstack/ai-openai";

const config: Omit<OpenAITextConfig, "apiKey"> = {
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = createOpenaiChat("gpt-6.1-sol", process.env.OPENAI_API_KEY!, config);
```

Need a header on each request, or a log of each model call? The chat adapters of this package support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### Tools that cannot use strict mode

OpenAI holds tool arguments to the schema only when the tool goes out with `strict: true`. Some schemas cannot be strict, for example a schema that uses `$ref`, `z.any()`, or `z.record()`. The adapter sends these tools with `strict: false`, so the tool still works. The model can then return arguments that do not match the schema.

In development, the adapter logs a warning one time for each of these tools:

```txt
tool "lookup_user" sent with strict: false: schema uses $ref, which strict mode does not support
```

To get strict mode back, change the schema so that the reason goes away. If you accept a non-strict tool, turn the warning off in the adapter config:

```typescript
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat("gpt-6-astra", process.env.OPENAI_API_KEY!, {
  strictFallbackWarning: false,
});
```

The warning never runs when `NODE_ENV` is `production`. The same option works on every adapter built on the OpenAI API, for example Groq, Bedrock, and Vercel AI Gateway.

## Prompt caching

`chat()` sends `prompt_cache_key` by default, set to the `threadId` that you pass. OpenAI uses the key to send requests with the same start to the same cache. With `promptCache: 'long'`, it also asks for the long retention. See [Prompt Caching](../advanced/prompt-caching).

To use your own key, set it in `modelOptions`. Your value wins:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    prompt_cache_key: "acme-support",
  },
});
```

- On gpt-5.6 and later, `modelOptions.prompt_cache_options` wins over the automatic options.
- On earlier models, `modelOptions.prompt_cache_retention` wins over the automatic retention.
- `openaiChatCompletions` sends the key only to `api.openai.com` and its regional hosts (such as `eu.api.openai.com`), unless you pass `promptCache: 'long'`.

### Tools and prompts added during a conversation

On some models, a tool or a system prompt that you add between model calls goes into the conversation. The cached start stays the same. These models are `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-astra`, `gpt-6-luna`, and `gpt-6-sol`.

What `openaiText` sends on these models:

- `tools` and `instructions` keep the tools and the system prompts of the first call.
- An added tool goes into `input` as `{ type: "additional_tools", role: "developer", tools: [...] }`.
- An added system prompt goes into `input` as a `developer` message, at its place in the conversation.
- With a provider tool such as `webSearchTool()`, `tools` is the full list for that request.

The channels are on by default with the API of OpenAI. A custom `baseURL`, a custom `fetch`, or `OPENAI_BASE_URL` turns them off. Set `midConversationChannels` to choose:

```typescript
import { openaiText } from "@tanstack/ai-openai";

export const fullLists = openaiText("gpt-6-astra", { midConversationChannels: false });

export const throughProxy = openaiText("gpt-6-astra", {
  baseURL: "https://llm-proxy.example.com/v1",
  midConversationChannels: true,
});
```

If that endpoint sends the request on to OpenAI without changes, set `true`. See [Mid-Conversation Changes](../advanced/mid-conversation-changes).

## Native compaction

OpenAI can compact a long conversation on its side, with `POST /responses/compact`. The Responses adapters (`openaiText` and `createOpenaiChat`) have a `compact` method for it. Turn it on with the `native` option of `withCompaction`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { withCompaction } from "@tanstack/ai-compaction";

const adapter = openaiText("gpt-6.1-sol");

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  middleware: [withCompaction({ maxTokens: 100_000, native: adapter })],
});
```

- The result holds your user messages and one encrypted `compaction` item.
- The adapter sends that item back without changes on each later request to the same model.
- `openaiChatCompletions` has no `compact` method, so `withCompaction` uses its `strategy`.

See [Let the provider compact](../advanced/compaction#let-the-provider-compact).

## Answers on the next request

OpenAI gives each answer item an `id` and a `phase`: `commentary` for text before a tool call, and `final_answer` for the answer. The Responses adapters (`openaiText` and `createOpenaiChat`) keep both in the assistant message, in `metadata.tanstack.responseItems`.

When the same model gets that message again, for example on the next turn, the adapter sends each item back with its `id` and `phase`. Another model gets the plain text.

## Transcription options

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("whisper-1"),
  audio: audioFile,
  responseFormat: "verbose_json",
  prompt: "Technical terms: API, SDK",
  threadId: "thread-1",
  modelOptions: {
    temperature: 0,
    timestamp_granularities: ["word", "segment"],
  },
});

console.log(result.text);
```

### Speaker diarization

Use `gpt-4o-transcribe-diarize` for a transcript with speaker labels:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { meetingAudioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("gpt-4o-transcribe-diarize"),
  audio: meetingAudioFile,
  modelOptions: {
    known_speaker_names: ["agent", "customer"],
    known_speaker_references: [
      "data:audio/wav;base64,...",
      "data:audio/wav;base64,...",
    ],
  },
  threadId: "thread-1",
});

for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.start, segment.end, segment.text);
}
```

- With no response format, the request uses `response_format: "diarized_json"` and `chunking_strategy: "auto"`.
- A top-level `responseFormat` of `"json"` or `"text"` gives no speaker segments.
- Pass `known_speaker_names` and `known_speaker_references` together: up to 4 each, with the same length.
- OpenAI does not support `prompt`, `include`, or `timestamp_granularities` with diarized transcription.

## Provider tools

OpenAI has tools of its own, next to the function tools that you define. Import them from `@tanstack/ai-openai/tools` and pass them into `chat({ tools: [...] })`.

For the concept, a comparison table, and type gating, see [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

The model runs a web search and returns grounded results with citations. Pass a `WebSearchToolConfig` object (typed from the OpenAI SDK).

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { webSearchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  threadId: "thread-1",
  tools: [webSearchTool({ type: "web_search" })],
});
```

**Supported models:** GPT-4o, GPT-5, and the models that use the Responses API. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `webSearchPreviewTool`

The preview version of web search. It has more options to set the search context size and the user location.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { webSearchPreviewTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Latest news about TypeScript" }],
  threadId: "thread-1",
  tools: [
    webSearchPreviewTool({
      type: "web_search_preview_2025_03_11",
      search_context_size: "high",
    }),
  ],
});
```

**Supported models:** GPT-4o and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

When the model uses hosted web search:

- The assistant tool-call part has `metadata.providerExecuted: true` and the normalized `metadata.sources` array.
- The raw search call and URL citations of OpenAI stay under `metadata.openai`.
- The agent loop does not run this call in your app. The adapter sends the raw response items back on the next turn.

### `fileSearchTool`

Searches OpenAI vector stores that you filled before. The model gets the matching document chunks. Give the `vector_store_ids` to search. You can set `max_num_results` (1 to 50) to limit the results.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { fileSearchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "What does the handbook say about PTO?" }],
  threadId: "thread-1",
  tools: [
    fileSearchTool({
      type: "file_search",
      vector_store_ids: ["vs_abc123"],
      max_num_results: 5,
    }),
  ],
});
```

**Supported models:** GPT-4o and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `imageGenerationTool`

The model makes images during a conversation with DALL-E or GPT-Image. Set quality, size, and style in the config object.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { imageGenerationTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Draw a logo for my app" }],
  threadId: "thread-1",
  tools: [
    imageGenerationTool({
      quality: "high",
      size: "1024x1024",
    }),
  ],
});
```

**Supported models:** GPT-5 and the models that can use GPT-Image. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `codeInterpreterTool`

Gives the model a sandbox that runs Python. The `container` field sets the environment. Pass the full `CodeInterpreterToolConfig` object.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { codeInterpreterTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Analyse this CSV and plot a chart" }],
  threadId: "thread-1",
  tools: [
    codeInterpreterTool({ type: "code_interpreter", container: { type: "auto" } }),
  ],
});
```

**Supported models:** GPT-4o and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `mcpTool`

Connects the model to a remote MCP (Model Context Protocol) server. The model can call all tools of that server. Give `server_url` or `connector_id`, not both.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { mcpTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "List my GitHub issues" }],
  threadId: "thread-1",
  tools: [
    mcpTool({
      server_url: "https://mcp.example.com",
      server_label: "github",
    }),
  ],
});
```

**Supported models:** GPT-4o and later. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `computerUseTool`

The model can look at a screen and use the mouse and the keyboard. Your app runs each action and sends back a screenshot. `createComputerUse` from `@tanstack/ai-computer-use` does this on a Playwright browser or an E2B desktop. Each thread gets its own machine:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { createComputerUse } from "@tanstack/ai-computer-use";
import { playwrightComputer } from "@tanstack/ai-computer-playwright";

declare const threadId: string;

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: "https://tanstack.com" }),
});

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Find the TanStack AI docs" }],
  threadId,
  tools: computerUse.tools,
  middleware: [computerUse.middleware],
  interrupts: [computerUse.interrupt],
});
```

The adapter sends the `computer` tool to OpenAI as its native computer tool.

- For the setup, the threads, and how to close the machines, see [Computer use](../computer-use/computer-use.md).
- For the approval of OpenAI safety checks, see [Safety checks](../computer-use/safety-checks.md).
- For your own machine, see [Custom driver](../computer-use/custom-driver.md).

#### The raw tool

`computerUseTool` from `@tanstack/ai-openai/tools` is the native tool with no `execute`. Use it when your app runs the actions itself:

```typescript
import { computerUseTool } from "@tanstack/ai-openai/tools";

const computer = computerUseTool({ type: "computer" });
```

Add an `execute` that runs the actions and returns a screenshot as an image part. The input of each call has two fields:

- `actions`: the actions to run, in order, as OpenAI sends them. For example `[{ type: "click", button: "left", x: 120, y: 340 }, { type: "type", text: "ada@example.com" }]`.
- `pending_safety_checks`: the safety checks that OpenAI attached to the actions.

The adapter sends the first image of the result back as the screenshot. When the call does not fail, the adapter also tells OpenAI that the safety checks are accepted. When the call fails, they stay unaccepted.

The `computer-use-preview` model takes the older tool type. Give it the display size and the environment. Each call then has one `action` field in place of `actions`:

```typescript
import { computerUseTool } from "@tanstack/ai-openai/tools";

const previewTool = computerUseTool({
  type: "computer_use_preview",
  display_width: 1024,
  display_height: 768,
  environment: "browser",
});
```

**Supported models:** `type: "computer"` works with the models that list computer use, for example `gpt-6.1-sol`. `type: "computer_use_preview"` works with `computer-use-preview`. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `localShellTool`

The model returns a `local_shell` tool call. Your app runs the command. Then your app sends the output back on the next request. `localShellTool()` takes no arguments. Add it to `tools`.

Match `toolCallName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`. `input.command` is the command. `input.env` is the environment variables.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { localShellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Run the test suite and summarise failures" }],
  threadId: "thread-1",
  tools: [localShellTool()],
});

let localShellCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolCallName === "local_shell") {
    localShellCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === localShellCallId) {
    console.log(chunk.input);
  }
}
```

Send the command output as the tool result. Use `{ output: string }`, or a string. The next request sends `local_shell_call_output`.

**Supported models:** GPT-5.x and other models that can act as agents. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `shellTool`

`shellTool()` gives the model a shell. A container environment runs on OpenAI. A local environment runs in your app.

If your app must run the commands, pass `environment: { type: "local" }`. Then:

- Match `toolCallName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`.
- `input.commands` is the command list.
- `input.timeout_ms` is the time limit.
- `input.max_output_length` is the output limit.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { shellTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Count lines in all JS files" }],
  threadId: "thread-1",
  tools: [shellTool({ environment: { type: "local" } })],
});

let shellCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolCallName === "shell") {
    shellCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === shellCallId) {
    console.log(chunk.input);
  }
}
```

Return one result for each command:

```typescript
const shellResult = {
  output: [
    {
      stdout: "12\n",
      stderr: "",
      outcome: { type: "exit" as const, exit_code: 0 },
    },
  ],
};
```

- `outcome.type` is `"exit"` or `"timeout"`. The next request sends `shell_call_output`.
- If the same response has no `shell_call_output`, a shell call with no environment comes back to your app.
- A container environment does not come back as a tool call. Pass `environment` to attach that container and hosted skills.

**Supported models:** GPT-5.x and other models that can act as agents. Responses API only: Chat Completions does not support the shell tool. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

#### Attaching hosted skills

Pass `environment.skills` to load skill bundles that the provider manages into the container of the shell (Responses API only).

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { shellTool } from "@tanstack/ai-openai/tools";

export async function POST(request: Request) {
  const { messages, threadId } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-6.1-sol"),
    messages,
    threadId,
    tools: [
      shellTool({
        environment: {
          type: "container_auto",
          skills: [
            { type: "skill_reference", skill_id: "skill_abc", version: "2" },
          ],
        },
      }),
    ],
  });

  return toServerSentEventsResponse(stream);
}
```

For the skill shape, the `version` string format, and the Anthropic equivalent, see [Provider Skills](../tools/provider-skills.md).

### `applyPatchTool`

The model returns an `apply_patch` tool call. Your app applies the diff. Then your app sends the result back. `applyPatchTool()` takes no arguments. Add it to `tools`.

Match `toolCallName` on `TOOL_CALL_START`. Read `input` on the `TOOL_CALL_END` with the same `toolCallId`:

- `input.operation` is one file change.
- `operation.type` is `create_file`, `update_file`, or `delete_file`.
- `operation.path` is the file path.
- `create_file` and `update_file` also include `operation.diff`.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { applyPatchTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Fix the import paths in src/index.ts" }],
  threadId: "thread-1",
  tools: [applyPatchTool()],
});

let patchCallId: string | undefined;
for await (const chunk of stream) {
  if (chunk.type === "TOOL_CALL_START" && chunk.toolCallName === "apply_patch") {
    patchCallId = chunk.toolCallId;
  }
  if (chunk.type === "TOOL_CALL_END" && chunk.toolCallId === patchCallId) {
    console.log(chunk.input);
  }
}
```

Send this object as the tool result. The next request sends `apply_patch_call_output`.

```typescript
const patchResult = {
  status: "completed" as const,
  output: "Updated src/index.ts",
};
```

- If the patch fails, set `status` to `"failed"`. Put the error text in `output`.
- Keep `applyPatchTool()` in `tools` on the next request.
- A turn with only a patch has no text. With `chat({ stream: false })`, `text` is empty. Read the `apply_patch` tool call from `chunks` with the same checks as the loop above.

**Supported models:** GPT-5.x and other models that can act as agents. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `customTool`

Defines a custom Responses API tool with an explicit name, description, and format. If none of the other tool types fits, use it. `customTool` returns a plain `Tool`, so every chat model accepts it.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { customTool } from "@tanstack/ai-openai/tools";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Look up order #1234" }],
  threadId: "thread-1",
  tools: [
    customTool({
      type: "custom",
      name: "lookup_order",
      description: "Look up the status of a customer order by order ID",
    }),
  ],
});
```

**Supported models:** all Responses API models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

## API reference

Each factory pair has the same shape. The short factory (`openaiText`, `openaiImage`, and the others) reads `OPENAI_API_KEY` from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `openaiText(model, config?)` / `createOpenaiChat(model, apiKey, config?)` | Text adapter on the Responses API (`/v1/responses`) |
| `openaiChatCompletions(model, config?)` / `createOpenaiChatCompletions(model, apiKey, config?)` | Text adapter on `/v1/chat/completions`. See [Chat Completions API](#chat-completions-api) |
| `azureOpenaiText(model, config?)` / `createAzureOpenaiText(model, apiKey, config)` | Text adapter on Azure. See [Azure OpenAI](#azure-openai) |
| `openaiSummarize(model, config?)` / `createOpenaiSummarize(model, apiKey, config?)` | Summarization adapter |
| `openaiImage(model, config?)` / `createOpenaiImage(model, apiKey, config?)` | Image adapter (DALL-E, gpt-image) |
| `openaiSpeech(model, config?)` / `createOpenaiSpeech(model, apiKey, config?)` | Text-to-speech adapter |
| `openaiTranscription(model, config?)` / `createOpenaiTranscription(model, apiKey, config?)` | Transcription adapter (Whisper, GPT-4o transcription, and GPT-4o diarized transcription) |
| `openaiEmbedding(model, config?)` / `createOpenaiEmbedding(model, apiKey, config?)` | Embedding adapter |
| `openaiVideo(model, config?)` / `createOpenaiVideo(model, apiKey, config?)` | Video adapter (Sora). Experimental |
| `openaiDecider(model, config?)` / `createOpenaiDecider(model, apiKey, config?)` | Evaluate adapter for `decide()`. See [Evaluate](./openai#evaluate) |
| `openaiFiles` / `createOpenaiFiles` | Files API adapter. See [Files API](../advanced/files-api) |
| `openaiRealtime(...)` / `openaiRealtimeToken(...)` | Realtime voice adapters. See [Realtime Voice Chat](../media/realtime-chat) |

Text adapter config:

- `config.organization`: the organization ID. Optional.
- `config.baseURL`: a custom base URL. Optional.
- `config.strictFallbackWarning`: set `false` to turn off the [strict mode warning](#tools-that-cannot-use-strict-mode).
- `config.midConversationChannels`: see [Tools and prompts added during a conversation](#tools-and-prompts-added-during-a-conversation).

`adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).
