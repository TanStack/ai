---
title: Bring Your Own Key (BYOK)
id: byok
order: 9
description: "Let users supply provider API keys in the browser. defineByok stores them. useChat sends them as x-byok headers. Your relay reads them for one call."
keywords:
  - tanstack ai
  - byok
  - bring your own key
  - api key
  - defineByok
---

Your users have their own provider API keys. You want those keys to stay in the browser. Your relay must read a key for one call, then forget it.

`defineByok` stores the keys. Pass that store into `useChat`. The client sends keys as `x-byok-*` headers. The key never goes in the JSON body. Your relay reads the header (or an env key) and builds the adapter for that call.

Provider ids are open slugs (`openai`, `bedrock`, `my-llm`), not a fixed catalog. A slug is `[a-z][a-z0-9-]{0,63}`. The header is `x-byok-<slug>`.

## Store keys on the client

Create one `ByokClient` for the app. `defaultByokStorage()` uses a passkey when WebAuthn is available in a secure context. If it is not, keys stay in memory on that `ByokClient` instance (gone on reload). WebAuthn support is not the same as PRF — first save throws if the authenticator does not support the PRF extension.

```typescript
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";
import { openaiByok } from "@tanstack/ai-openai";
import { anthropicByok } from "@tanstack/ai-anthropic";

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [openaiByok, anthropicByok],
});
```

Each adapter exports a `{ id, label, env?, validate? }` object. `id` is the slug and is required. `env` is the env var **name** (or a list of names) — not a `process.env` read. This object is safe to import on the client. Pass those objects into `providers` so `byok.validate()` can hit the adapter's check URL.

If the server can fall back to an env key, tell the client. Then a send is not blocked when the browser has no key yet:

```typescript
import { byok } from "./byok";

byok.setServerCoverage(true);
```

See [`defineByok`](../api/ai-client#definebyok) for methods, the snapshot, and other storage.

## Send keys with `useChat`

Pass the same `byok` instance into `useChat`. The client stamps `x-byok-*` on each POST.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { byok } from "./byok";

export function Chat() {
  const { sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider: "openai", model: "gpt-5.5" },
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

`forwardedProps.provider` selects which key to send. You can also pass `byokProvider`. If no slug resolves, the send throws instead of attaching every stored key. Always set `byokProvider` or `forwardedProps.provider`.

Send is blocked until a key exists or you call `setServerCoverage`. Catch `ByokBlockedError` / `ByokMissingError` / `ByokUnresolvedProviderError` if you fire `sendMessage` without awaiting a save.

## Save a key

This library does not ship a dialog. Call `byok.update(provider, value)` from your own UI.

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
          .catch((caught) => {
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

`useByok(byok)` is the live snapshot. Use it to show the last four characters, a lock state, or `snapshot.prompt` when a send needs a key. Render `byok.storage.warning` and `snapshot.storageError` if they are set.

`update`, `prepare`, and `clear(provider)` already call `unlock()` when the ring is locked. A separate `byok.unlock()` is optional UX so you can show last-4 before a send.

## Sign in with OpenRouter

OpenRouter can mint a key via PKCE instead of a paste field. Import from `@tanstack/ai-openrouter/pkce`. The helper writes the key with `openrouterByok.id` — the slug is required and is always `openrouter`.

```tsx
import { useEffect } from "react";
import { openrouterByok } from "@tanstack/ai-openrouter";
import {
  completeOpenRouterPkceIntoByok,
  startOpenRouterPkceLogin,
} from "@tanstack/ai-openrouter/pkce";
import { byok } from "./byok";

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

Pass `openrouterByok` in `defineByok({ providers })`. The relay reads `x-byok-openrouter` with `getByokKey(request, openrouterByok)`.

## Read the key on the relay

Import `getByokKey` from `@tanstack/ai/byok/server` in your API route (or any server handler). It is not a TanStack Start server function, so it works without Start.

The header wins. If it is empty, `getByokKey` reads `provider.env` in order. If both are empty, return `byokMissing`. The client then sets `snapshot.prompt`.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createOpenaiChat, openaiByok } from "@tanstack/ai-openai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request);
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);

  const stream = chat({
    adapter: createOpenaiChat("gpt-5.5", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

Do not log the raw key. Use [`maskKey`](../api/ai#maskkey) or [`scrubSecrets`](../api/ai#scrubsecrets) if you write an error string.

The same `byok` instance works on generation hooks. For a `fetcher`, spread `options.headers` onto the POST. See [Generation Hooks](../media/generation-hooks#usegenerateaudio).
