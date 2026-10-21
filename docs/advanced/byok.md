---
title: Bring Your Own Key (BYOK)
id: byok
order: 9
description: "Let users bring their own API key, so you do not pay for their model calls. The key stays in the browser and goes to your server on a header for one call."
keywords:
  - tanstack ai
  - byok
  - bring your own key
  - api key
  - defineByok
---

You do not want to pay the provider bill for every user of your app. And you do not want to store their API keys in your database.

With BYOK, each user pastes their own key. The key stays in the browser. Each send puts it on an `x-byok-*` header, and your server uses it for that one call.

## Quick setup

This setup takes about 10 minutes. You need a chat that already works with `useChat`.

### 1. Create a store

Import BYOK from the `/byok` subpath of your framework package. Vue, Solid, Svelte, Preact, Angular, Octane, and Remix have the same subpath.

```typescript group=byok
import { defineByok, defaultByokStorage } from "@tanstack/ai-react/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
});
```

If the browser supports passkeys, `defaultByokStorage()` keeps the key encrypted with a passkey. If not, the key stays in memory for this tab only.

### 2. Save a key from your UI

Call `byok.update("openai", value)` from your own form. The library does not ship a dialog. `useByok(byok)` gives you the status of each saved key.

```tsx
import { useState } from "react";
import { useByok } from "@tanstack/ai-react";
import { byok } from "./byok";

export function KeyForm() {
  const snapshot = useByok(byok);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const status = snapshot.status.openai;
  const last4 = status && "masked" in status ? status.masked : "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const next = value.trim();
        if (!next) return;
        void byok
          .update("openai", next)
          .then(() => {
            setValue("");
            setError("");
          })
          .catch((caught: unknown) => {
            setError(
              caught instanceof Error ? caught.message : "Could not save key",
            );
          });
      }}
    >
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={last4 ? `Saved ${last4}` : "Paste a key"}
      />
      <button type="submit" disabled={!value.trim()}>
        Save
      </button>
      {error ? <p>{error}</p> : null}
    </form>
  );
}
```

The `ts-react-chat` example has a key-icon popup that you can copy.

### 3. Send the key with `useChat`

Pass the same store to `useChat`. Set `forwardedProps.provider` to `"openai"`, so the client sends only that key:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { byok } from "./byok";

export function Chat() {
  const { sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider: "openai" },
  });

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => {
        void sendMessage("Hello");
      }}
    >
      Send
    </button>
  );
}
```

### 4. Read the key on the server

Read the header with `getByokKey`, then build the adapter with that key:

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
    adapter: createOpenaiChat("gpt-6.1-sol", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

Import `openaiByok` from `@tanstack/ai-openai/byok`. That file is safe in the browser. The main entry of the adapter loads the provider SDK.

> [!WARNING]
> Do not log the raw key. Use [`maskKey`](../api/ai#maskkey) on error strings.

Paste a key, send a message, and your server calls OpenAI with the key of the user.

## How it works

1. `defineByok` keeps the keys in the browser, encrypted when the browser has passkeys.
2. On each send, the client reads the key for `forwardedProps.provider`. It puts the key on the `x-byok-<id>` header, never in the JSON body.
3. `getByokKey` reads that header. If the header is empty, it reads the env var of the provider, here `OPENAI_API_KEY`.
4. If both are empty, `byokMissing` returns a 401.

Your server uses the key for one call, then forgets it.

## Advanced

### Passkey prompts

Passkey storage runs a WebAuthn prompt to save a key and to unlock it. Some browsers (Safari, Dia) show that prompt only right after a click.

- Call `byok.update()`, `byok.unlock()`, or `byok.prepare()` directly in the click handler, before you `await` other work.
- If the unlock runs deep in a send flow, the prompt does not appear. The call throws with a "needs a fresh user action" message.
- This activation check applies to existing keyrings. The first registration can need a second PRF prompt, and the browser handles it.
- Passkey storage accepts 32-byte PRF arrays from password managers such as 1Password. It converts them to binary data and the encryption key does not change.

### Send rules

- If `forwardedProps.provider` is not set, the send throws. The client does not attach every stored key.
- The built-in fetch and XHR adapters copy the headers onto the POST. If you write a custom `connect`, copy `runContext.headers` yourself. See [Custom Transports](../transports/custom#request-scoped-adapters).
- If one credential has several values, read them together with [`getByokKeys`](../api/ai#getbyokkeys).

### Pick the model before the key shows up

You want to set up your models in one place, for example a list that users pick from. But the key comes in only with each request. Wrap the adapter in `keyedAdapter`, and the route builds it when the key comes in.

1. Define the model once on the server:

```typescript group=keyed
import { keyedAdapter } from "@tanstack/ai/byok";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";

export const gpt = keyedAdapter(openaiByok, (key) =>
  createOpenaiChat("gpt-6.1-sol", key),
);
```

2. Build it in the route with the key from the request:

```typescript group=keyed
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, gpt.provider);
  if (!apiKey) return byokMissing(gpt.provider);

  const stream = chat({
    adapter: gpt.create(apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

The client is the same as in step 3.

- `keyedAdapter` works for every adapter kind: text, image, speech, and the rest.
- Your list can mix plain and keyed adapters. `isKeyedAdapter(adapter)` tells you which ones need a key.

### More than one provider

Your users pick OpenAI or Anthropic, and each user brings a key. Put both providers in `keyedAdapters`. The map key is the provider id, so a key goes only to its own provider:

```typescript group=keyed-many
import { keyedAdapter, keyedAdapters } from "@tanstack/ai/byok";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { anthropicByok } from "@tanstack/ai-anthropic/byok";
import { createOpenaiChat } from "@tanstack/ai-openai";

export const models = keyedAdapters({
  openai: (key) => createOpenaiChat("gpt-6.1-sol", key),
  anthropic: keyedAdapter(anthropicByok, (key) =>
    createAnthropicChat("claude-sonnet-5-5", key),
  ),
});
```

In the route, `keyedAdapterFromRequest` builds the adapter of the provider that has a key:

```typescript group=keyed-many
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import {
  byokMissing,
  keyedAdapterFromRequest,
} from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const adapter = keyedAdapterFromRequest(request, models);
  if (!adapter) return byokMissing("openai");

  const stream = chat({
    adapter,
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

On the client, `forwardedProps.provider` picks the key that goes out:

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { byok } from "./byok";

export function Chat({ provider }: { provider: "openai" | "anthropic" }) {
  const { sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider },
  });

  return (
    <button type="button" onClick={() => void sendMessage("Hello")}>
      Send
    </button>
  );
}
```

How `keyedAdapterFromRequest` picks:

1. The key of the user wins. That is the `x-byok-<id>` header, checked in map order.
2. Then the env keys, in map order. Only entries made with a descriptor (like `anthropicByok`) have env names. A plain factory reads the header only.
3. If there is no key at all, you get `null`. Answer with `byokMissing`.

Some more rules:

- An entry like `anthropic: keyedAdapter(openaiByok, ...)` throws at startup, so a key cannot go to the wrong provider.
- The adapter that you get back is a union of your providers. If you need the exact model types, for example for `modelOptions`, call `models.openai.create(key)` yourself.

### If the server already has an env key

By default, a send with no browser key does not POST. If your server has env keys, call `byok.setServerCoverage(true)`:

```typescript group=byok
byok.setServerCoverage(true);
```

Then a send with no pasted key still POSTs, and the server uses the env key. If that key is also empty, the server returns `byokMissing` (401), and the client sets `snapshot.prompt`.

### Keys inside agents

Your [subagents](../chat/subagents) call models too, and those calls need the key of the user. Pass the key on `subagents.keys`. Each agent builds its adapter with `ctx.keys`.

1. Define the agent. Wrap its adapter in `keyedAdapter`, then build it with `ctx.keys.adapter`:

```typescript group=agent-keys
import { defineAgent, keyedAdapter } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";

const gpt = keyedAdapter(openaiByok, (key) =>
  createOpenaiChat("gpt-6.1-sol", key),
);

export const writer = defineAgent({
  name: "writer",
  description: "Writes a short draft",
  run: async (ctx) =>
    ctx.chat({
      adapter: await ctx.keys.adapter(gpt),
      messages: [{ role: "user", content: "Write a short draft." }],
      stream: false,
    }),
});
```

2. In the route, give `subagents.keys` a function. `getByokKey` reads the key that the client sends for each provider:

```typescript group=agent-keys
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);

  const stream = chat({
    adapter: gpt.create(apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    subagents: {
      agents: [writer],
      keys: (provider) => getByokKey(request, provider),
    },
  });
  return toServerSentEventsResponse(stream);
}
```

How `ctx.keys` finds a key:

- It calls the `subagents.keys` function with the provider of the adapter, here `openaiByok`. The function can read any store, for example your database.
- `subagents.keys` can also be an object by provider id, for example `{ openai: apiKey }`.
- If there is no key, it reads the env var of the provider, here `OPENAI_API_KEY`. If that var is empty too, the call throws `Missing OpenAI API key. Set OPENAI_API_KEY.`
- A child that calls `ctx.chat({ subagents })` passes the keys on to its own children. Keys that the child sets itself win for those providers.
- `ctx.keys.get(provider)` returns the key or `null`. `ctx.keys.require(provider)` throws when there is no key.

The writer now calls OpenAI with the key that the user pasted.

### Image, audio, and other providers

- Image and audio POSTs use the same store. See [Generation Hooks](../media/generation-hooks#usegenerateaudio).
- OpenAI users can sign in with ChatGPT and skip the key. See [Sign in with ChatGPT](../adapters/openai-advanced#sign-in-with-chatgpt-byok).
- OpenRouter can mint a key with OAuth. See [Sign in with OpenRouter](../adapters/openrouter-advanced#sign-in-with-openrouter-byok).
- Lovable uses `lovableByok` from `@tanstack/ai-lovable/byok`. See [Lovable AI Gateway](../adapters/lovable#bring-your-own-key).
- Cloudflare needs a token and an account id. `cloudflareByok` from `@tanstack/ai-cloudflare/byok` declares `cloudflareAccountByok` as a companion. Pass both to `defineByok({ providers })`, and a send for `cloudflare` carries both headers. See [Cloudflare](../adapters/cloudflare#bring-your-own-key).
