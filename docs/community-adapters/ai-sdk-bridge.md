---
title: AI SDK Bridge
id: ai-sdk-bridge-adapter
order: 7
description: "Use Vercel AI SDK provider packages (@ai-sdk/* and community providers) as TanStack AI adapters for chat, embeddings, transcription, speech, image and rerank, through the AI SDK Bridge community adapter."
keywords:
  - tanstack ai
  - ai sdk
  - vercel ai sdk
  - provider bridge
  - migration
  - community adapter
---

The AI SDK Bridge community adapter wraps a Vercel AI SDK provider model as a TanStack AI adapter. Use it for a provider that has no TanStack adapter yet, or to keep your provider setup while you move an AI SDK app to TanStack AI. It reads the AI SDK provider spec v2, v3 and v4 (AI SDK 5, 6 and 7 providers). Amjad Iqbal maintains it.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
vue: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
solid: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
svelte: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
preact: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
angular: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
vanilla: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek
octane: @amjadiqbal/tanstack-ai-sdk-bridge @ai-sdk/deepseek

<!-- ::end:tabs -->

Install the AI SDK provider package you want. DeepSeek is the example here.

## 2. Chat

The provider reads its API key the way the AI SDK documents, here `DEEPSEEK_API_KEY`:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { aiSdkText } from "@amjadiqbal/tanstack-ai-sdk-bridge";
import { deepseek } from "@ai-sdk/deepseek";

export async function POST(request: Request) {
  const { messages, threadId } = await request.json();
  const stream = chat({
    adapter: aiSdkText(deepseek("deepseek-chat")),
    messages,
    threadId,
    modelOptions: { temperature: 0.3 },
  });
  return toServerSentEventsResponse(stream);
}
```

Tools, `outputSchema`, `reasoning` and `abortController` work as with any text adapter. `modelOptions` takes the AI SDK call settings (`temperature`, `maxOutputTokens`, `providerOptions`, `headers`, and so on).

## 3. Other activities

| Activity | Adapter | AI SDK model |
|---|---|---|
| `embed()` | `aiSdkEmbedding(openai.embedding("text-embedding-3-small"))` | embedding model |
| `generateTranscription()` | `aiSdkTranscription(openai.transcription("whisper-1"))` | transcription model |
| `generateSpeech()` | `aiSdkSpeech(openai.speech("gpt-4o-mini-tts"))` | speech model |
| `generateImage()` | `aiSdkImage(openai.image("gpt-image-1"))` | image model |
| `rerank()` | `aiSdkRerank(cohere.reranking("rerank-v3.5"))` | reranking model |

## Limits

- Provider-executed tools (a provider's own web search and the like) are not forwarded.
- Reasoning signatures are not sent back in later turns.
- `chat({ wrapFetch })` is not applied: pass `fetch` to the provider factory.

See the [README](https://github.com/amjadiqbal/tanstack-ai-sdk-bridge#readme) for the tested providers and the full option list.
