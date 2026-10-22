---
title: OpenAI
id: openai-adapter
order: 1
description: "Use OpenAI models in TanStack AI with @tanstack/ai-openai: GPT chat, gpt-image images, speech, Whisper transcription, embeddings, and Sora video."
keywords:
  - tanstack ai
  - openai
  - gpt-4o
  - gpt-5
  - dall-e
  - whisper
  - openai tts
  - adapter
  - chatgpt
---

The OpenAI adapter calls GPT for chat, and it calls image, speech, transcription, embedding, and video models from the same package.

Does your provider speak the OpenAI API, for example DeepSeek, Kimi, or a local vLLM server? Use the [OpenAI-Compatible adapter](./openai-compatible).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
OPENAI_API_KEY=sk-...
```

`openaiText` and the other short factories read `OPENAI_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat("gpt-6.1-sol", process.env.OPENAI_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
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

You now have a streaming GPT chat. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Images

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const result = await generateImage({
  adapter: openaiImage("gpt-image-2.5-flare"),
  prompt: "A futuristic cityscape at sunset",
  threadId: "thread-1",
  numberOfImages: 1,
  size: "1024x1024",
  modelOptions: {
    quality: "high",
  },
});

console.log(result.images);
```

`quality` takes `low`, `medium`, `high`, or `auto`. The `gpt-image-2.5` models also take `xhigh` and `max`. See [Image Generation](../media/image-generation).

## Speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { openaiSpeech } from "@tanstack/ai-openai";

const result = await generateSpeech({
  adapter: openaiSpeech("tts-1"),
  text: "Hello, welcome to TanStack AI!",
  threadId: "thread-1",
  voice: "alloy",
  format: "mp3",
});

// result.audio holds base64-encoded audio
console.log(result.format); // "mp3"
```

- Voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `fable`, `nova`, `onyx`, `sage`, `shimmer`, `verse`.
- `modelOptions.instructions` sets how the voice speaks. It does not work with `tts-1` or `tts-1-hd`.

See [Text-to-Speech](../media/text-to-speech).

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: openaiTranscription("whisper-1"),
  audio: audioFile, // File object or base64 string
  language: "en",
  threadId: "thread-1",
});

console.log(result.text);
```

For speaker labels, use `gpt-4o-transcribe-diarize`. See [Speaker diarization](./openai-advanced#speaker-diarization).

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-small"),
  input: ["a red guitar", "a blue drum kit"],
});

console.log(result.embeddings[0]?.vector);
console.log(result.usage?.promptTokens);
```

Both models (`text-embedding-3-small` and `text-embedding-3-large`) take the top-level `dimensions` option to make the vectors shorter:

```typescript
import { embed } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const result = await embed({
  adapter: openaiEmbedding("text-embedding-3-large"),
  input: "a red guitar",
  dimensions: 1024,
});
```

See the [Embeddings guide](../embeddings.md).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const result = await summarize({
  adapter: openaiSummarize("gpt-5-mini"),
  text: "Your long text to summarize...",
  threadId: "thread-1",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Video

`openaiVideo` makes Sora videos with `sora-2` and `sora-2-pro`. Video generation is experimental. See [Video Generation](../media/video-generation).

## Realtime voice

`openaiRealtime` and `openaiRealtimeToken` run a live voice chat. See [Realtime Voice Chat](../media/realtime-chat).

## Files

`openaiFiles` uploads media to the OpenAI Files API, so a message can point to the file. See [Files API](../advanced/files-api).

## Evaluate

Sometimes you need an answer that your code can branch on, not chat text: a queue name, an urgency level, or a yes or no. Use `openaiDecider` with `decide()` to ask typed questions about one shared `state`. The adapter calls the OpenAI Decisions API (`/v1/decisions`):

```typescript
import { decide, choice, score, boolean } from "@tanstack/ai";
import { openaiDecider } from "@tanstack/ai-openai";

const ticket = {
  subject: "Charged twice for the same invoice",
  body: "Please refund the extra payment.",
};

const result = await decide({
  adapter: openaiDecider("gpt-6-luna"),
  state: ticket,
  questions: {
    queue: choice({
      instructions: "Which team should handle this ticket?",
      options: {
        billing: "Payments, invoices, refunds",
        tech: "Bugs, outages, integrations",
        sales: "Pricing, upgrades, new accounts",
      },
    }),
    urgency: score({
      instructions: "How urgent is this ticket?",
      levels: ["low", "medium", "high"],
    }),
    refund: boolean({
      instructions: "Is the customer asking for a refund?",
    }),
  },
});

console.log(result.queue.value); // "billing"
console.log(result.urgency.value); // "medium"
console.log(result.refund.value); // true
console.log(result.meta.usage);
```

`openaiDecider` reads `OPENAI_API_KEY`. To pass a key yourself, use `createOpenaiDecider("gpt-6-luna", "sk-...")`.

- `gpt-6-luna` is the only Decisions model.
- An object `state` goes to OpenAI as JSON text.
- If OpenAI refuses to answer a question, `decide()` throws an error with the name of that question.
- `boolean()` questions work. The adapter adds the meaning of true and false to the instructions.

See the [Evaluate guide](../evaluate/evaluate) for the question helpers, the result shape, abort, and middleware.

## Provider tools

OpenAI runs some tools itself, such as web search and a code sandbox. Import them from `@tanstack/ai-openai/tools` and add them to `tools`:

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

Tools that OpenAI runs:

- `webSearchTool` and `webSearchPreviewTool`: search the web, with citations.
- `fileSearchTool`: search your OpenAI vector stores.
- `imageGenerationTool`: make images inside the chat.
- `codeInterpreterTool`: run Python in a sandbox.
- `mcpTool`: connect a remote MCP server.

Tools that your app runs when the model asks:

- `localShellTool` and `shellTool`: run shell commands.
- `applyPatchTool`: apply a file diff.
- `computerUseTool`: control a virtual desktop.
- `customTool`: a Responses API tool with your own name and format.

Each tool, with a full sample, is on [OpenAI: Advanced](./openai-advanced#provider-tools). For which models take which tool, see [Provider Tools](../tools/provider-tools.md).

## Models and options

### Model options

Provider options go in `modelOptions`. This includes the sampling options `temperature`, `top_p`, and `max_output_tokens`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-4.1"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    temperature: 0.7,
    max_output_tokens: 1000,
    top_p: 0.9,
  },
});
```

- OpenAI rejects `temperature` and `top_p` on the reasoning models. `openaiText` drops the two options for these model ids:
  - The `o` models (`o1`, `o3`, `o4-mini`, and so on).
  - Every id that starts with `gpt-5`, except ids that end in `-chat-latest`.
  - `codex-mini-latest`.
- With `openaiChatCompletions`, the token limit is `max_tokens`.
- Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Want GPT to think harder, or not at all? Set `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-6.1-sol"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: "xhigh",
});
```

What goes to OpenAI:

- `openaiText` and `azureOpenaiText`: `reasoning: { effort, summary: "auto" }`. The summary text streams as thinking parts. `summary: false` drops the summary.
- `openaiChatCompletions`: `reasoning_effort`. No thinking text streams back.
- `off` sends `effort: "none"` on the models that can stop thinking.

The levels of each model:

| Model | Levels |
| --- | --- |
| `gpt-6.1-sol`, `gpt-6.1-sol-pro`, `gpt-6-astra`, `gpt-6-astra-pro` | `low` to `max` |
| `gpt-6-sol`, `gpt-6-luna`, the `gpt-5.6` models, and their `-pro` versions | `off`, `low` to `max` |
| `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4-image-2`, `gpt-5.2` | `off`, `low` to `xhigh` |
| `gpt-5.5-pro`, `gpt-5.2-pro` | `medium`, `high`, `xhigh` |
| `gpt-5.1` | `off`, `low`, `medium`, `high` |
| `gpt-5`, `gpt-5-mini`, `gpt-5-nano` | `minimal` to `high` |
| `gpt-chat-latest`, the `o` models, and the `codex` models | `low`, `medium`, `high` |
| `gpt-5.2-chat-latest` | `medium` |
| `gpt-5-pro` | `high` |

The other models, such as `gpt-4.1` and `gpt-4o`, take no `reasoning`. See [Reasoning](../chat/reasoning).

### Models

Newest first. The package exports the full lists, for example `OPENAI_CHAT_MODELS`.

| Activity | Factory | Models |
| --- | --- | --- |
| Chat | `openaiText` | `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6`, `gpt-5.5`, `gpt-4.1`, `gpt-4o`, the `o` models, and more |
| Images | `openaiImage` | `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `gpt-image-2`, `gpt-image-1`, `gpt-image-1-mini`, `dall-e-3`, `dall-e-2` |
| Speech | `openaiSpeech` | `tts-1`, `tts-1-hd`, `gpt-4o-audio-preview` |
| Transcription | `openaiTranscription` | `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize` |
| Embeddings | `openaiEmbedding` | `text-embedding-3-small`, `text-embedding-3-large` |
| Video | `openaiVideo` | `sora-2`, `sora-2-pro` |
| Evaluate | `openaiDecider` | `gpt-6-luna` |

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

These topics are on [OpenAI: Advanced](./openai-advanced):

- The Chat Completions API (`openaiChatCompletions`) and Azure OpenAI.
- Sign in with ChatGPT, so users pay with their ChatGPT plan.
- Prompt caching, native compaction, and tools added during a conversation.
- Every provider tool, with a full sample.
- The configuration options and the API reference.
