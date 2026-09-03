---
title: Bring Your Own Key (BYOK)
id: byok
order: 9
description: "Let users bring their own API key so you do not pay for their model calls. The key stays in the browser."
keywords:
  - tanstack ai
  - byok
  - bring your own key
  - api key
  - defineByok
---

You do not want to pay for provider credits for every user. Let them bring their own API key.

The key stays in the browser, so you do not have to worry about storing user keys on the server.

Your relay uses it for one call, then forgets it. Each send puts it on an `x-byok-*` header, not in the JSON body.

Do these four steps:

1. Create a store with `defineByok`.
2. Save a key from your UI with `byok.update`.
3. Pass the same store into `useChat`.
4. Read the key on the relay with `getByokKey`.

## 1. Create a store

```typescript group=byok
import { defineByok, defaultByokStorage } from "@tanstack/ai-client/byok";

export const byok = defineByok({
  storage: defaultByokStorage(),
});
```

If the browser supports passkeys, `defaultByokStorage()` uses a passkey. If not, keys stay in memory for this tab only.

## 2. Save a key

Call `byok.update("openai", value)` from your own UI. The library does not ship a dialog.

`useByok(byok)` gives the status for saved keys.

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

The `ts-react-chat` example has a key-icon popup you can copy.

## 3. Send with `useChat`

Pass the same store. Set `forwardedProps.provider` to `"openai"`. The client then sends only that key.

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

If no provider is set, the send throws. The client does not attach every stored key.

Built-in fetch and XHR adapters copy the headers onto the POST.

If you write a custom `connect`, copy `runContext.headers` yourself. See [Connection Adapters](../chat/connection-adapters).

## 4. Read the key on the relay

Use this in any API route.

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

Import `openaiByok` from `@tanstack/ai-openai/byok`, not from the adapter main entry. The `/byok` file is safe in the browser. The main entry pulls in the provider SDK.

The header wins. If the header is empty, `getByokKey` reads `OPENAI_API_KEY` from the environment. If both are empty, `byokMissing` returns a 401. If one credential is made of several values, read them together with [`getByokKeys`](../api/ai#getbyokkeys).

CAUTION: Do not log the raw key. Use [`maskKey`](../api/ai#maskkey) on error strings.

You can paste a key, send a message, and the relay calls OpenAI with that key.

## If the relay already has an env key

By default, a send with no browser key does not POST. If your relay has env keys, call `byok.setServerCoverage(true)`:

```typescript group=byok
byok.setServerCoverage(true);
```

Then a send with no pasted key still POSTs. The relay uses the env key. If that is also empty, the relay returns `byokMissing` (401). The client sets `snapshot.prompt`.

## Image, audio, and OpenRouter

For other cases:

- Image and audio POSTs use the same store. See [Generation Hooks](../media/generation-hooks#usegenerateaudio).
- OpenRouter can mint a key with OAuth. See [Sign in with OpenRouter](../adapters/openrouter#sign-in-with-openrouter-byok).
- Lovable uses `lovableByok` from `@tanstack/ai-lovable/byok`. See [Lovable AI Gateway](../adapters/lovable#bring-your-own-key).
- Cloudflare uses `cloudflareByok` and `cloudflareAccountByok` from `@tanstack/ai-cloudflare/byok` (token plus account id). Return both ids from `byokProvider` so the relay sends both headers: `byokProvider: () => ['cloudflare-account', 'cloudflare']`. See [Cloudflare](../adapters/cloudflare#bring-your-own-key).
