---
title: Bring Your Own Key (BYOK)
id: byok
order: 9
description: "Users paste provider API keys in the browser. defineByok stores them. useChat sends x-byok headers. Your relay reads a key for one call."
keywords:
  - tanstack ai
  - byok
  - bring your own key
  - api key
  - defineByok
---

Users bring their own provider API keys. Those keys stay in the browser. Your relay reads a key for one call, then forgets it.

1. **Define** one `ByokClient` for the app. Import provider descriptors from each adapter's `/byok` subpath — never from the adapter's main entry.
2. **Save** a key from your own UI with `byok.update(provider, value)`. The library does not ship a dialog; the `ts-react-chat` example has a key-icon popup you can copy.
3. **Send** by passing the same `byok` instance into `useChat` (or a generation hook). The client stamps `x-byok-<slug>` on the POST. The key is never in the JSON body.
4. **Relay** with `getByokKey(request, openaiByok)` from `@tanstack/ai/byok/server`. The header wins; otherwise it reads the env names on that descriptor. If both are empty, return `byokMissing`.

| Where | Import |
| --- | --- |
| Client store | `@tanstack/ai-client/byok` |
| Provider descriptor | `@tanstack/ai-openai/byok` (and the same `/byok` on every adapter) |
| Relay (`process.env`) | `@tanstack/ai/byok/server` |
| Authoring an adapter | `@tanstack/ai/byok` (`defineByokProvider`) |

`@tanstack/ai/byok/server` is a separate entry because `getByokKey` reads `process.env`. Adapter `/byok` files import `@tanstack/ai/byok` on the client; that barrel must not pull env access into the browser.

The slug is an open id (`openai`, `bedrock`, `my-llm`): `[a-z][a-z0-9-]{0,63}`. The header is `x-byok-<slug>`.

## 1. Define the store

```typescript group=byok
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { anthropicByok } from "@tanstack/ai-anthropic/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [openaiByok, anthropicByok],
});
```

Each `/byok` export is `{ id, label, env?, validate? }`. `id` is required. `env` is env var **names**, not `process.env` values. `validate` is the optional URL `byok.validate()` hits from the browser.

`defaultByokStorage()` uses a passkey when WebAuthn exists in a secure context. Otherwise keys live in memory on this `ByokClient` (gone on reload). WebAuthn is not the same as PRF — first save throws if the authenticator has no PRF. After a refresh, passkey keys are `locked` until `unlock()` (or until `update` / send, which already call `unlock()`).

### Env fallback on the relay

By default, `prepare` **blocks the send** if the browser has no key (`ByokBlockedError`, `snapshot.prompt`). If your relay has env keys, say so:

```typescript group=byok
byok.setServerCoverage(true);
```

Then a send with an empty keyring still POSTs. The relay uses env, or returns `byokMissing` (401), and the client sets `snapshot.prompt`.

## 2. Save a key

Call `byok.update(provider, value)` from your UI. `useByok(byok)` is the live snapshot (`status`, `locked`, `prompt`, `storageError`). Show `masked` (last four characters) with `"masked" in status`. Render `byok.storage.warning` and `snapshot.storageError` when they are set.

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

## 3. Send with `useChat`

Pass the same instance. Set `forwardedProps.provider` (or `byokProvider`) to the slug. If no slug resolves, the send **throws** — it does not attach every stored key.

```tsx
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { byok } from "./byok";

export function Chat() {
  const { sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    byok,
    forwardedProps: { provider: "openai", model: "gpt-5.6" },
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

Built-in fetch and XHR adapters copy `runContext.headers` onto POST. A custom `connect` / `stream()` / `rpcStream()` must do that itself, or the key never leaves the browser. See [Connection Adapters](../chat/connection-adapters).

Catch `ByokBlockedError` (no browser key, no coverage), `ByokMissingError` (relay 401), and `ByokUnresolvedProviderError` (no slug) if you fire `sendMessage` without awaiting a save.

## 4. Read the key on the relay

Use this in any API route. It is not a TanStack Start server function.

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
    adapter: createOpenaiChat("gpt-5.6", apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

Do not log the raw key. Use [`maskKey`](../api/ai#maskkey) or [`scrubSecrets`](../api/ai#scrubsecrets) on error strings.

The same `byok` instance works on generation hooks. For a `fetcher`, spread `options.headers` onto the POST. See [Generation Hooks](../media/generation-hooks#usegenerateaudio).

## OpenRouter PKCE

OpenRouter can mint a key instead of a paste field. Import from `@tanstack/ai-openrouter/pkce`. The helper writes `openrouterByok.id` (`openrouter`).

```tsx
import { useEffect } from "react";
import { openrouterByok } from "@tanstack/ai-openrouter/byok";
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
