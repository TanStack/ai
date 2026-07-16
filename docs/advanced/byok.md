---
title: Bring Your Own Key (BYOK)
id: byok
order: 9
description: "Let users supply their own provider API keys with @tanstack/ai-byok — client-side keyring, per-request headers, and stateless server relays that never persist or log keys."
keywords:
  - tanstack ai
  - byok
  - bring your own key
  - api key
  - passkey
  - client-side keys
  - x-byok
  - getByokKey
  - withByok
---

`@tanstack/ai-byok` is a bring-your-own-key toolkit for TanStack AI. Users paste their own provider API keys in the browser; the library attaches them **per request in a header**, and your server relay reads them **for that one call** without ever persisting or logging them.

This page covers the security model, a full React + server relay setup, storage tiers, the missing-key flow, and how BYOK works with both [connection adapters](../chat/connection-adapters) and the `fetcher` transport.

## First principle: never be a custodian

- **Keys live client-side.** The browser is the system of record.
- **The server is a stateless pass-through.** It reads the key from the incoming request header, hands it to the TanStack AI adapter for one call, and never writes it to a database, cache, log, or observability stream.
- **No central endpoint.** Server helpers are trivially self-hostable — there is no hardcoded relay URL baked into the package.

Keys travel in the `x-byok-<provider>` header — **never** the request body or message history — so they stay out of persisted conversations and the AG-UI event stream.

## Installation

```bash
npm install @tanstack/ai-byok
```

React bindings ship in the same package:

```bash
# peer dependency — already present in most TanStack AI React apps
npm install react
```

## Package layout

| Entry | What it contains |
| --- | --- |
| `@tanstack/ai-byok` | Provider registry, `byokHeaders`, `withByok` / `byokFetch`, `byokFetcher`, storage (`memoryStorage`, `passkeyStorage`), `validateKey` |
| `@tanstack/ai-byok/server` | `getByokKey`, `byokMissing`, `scrubSecrets` / `maskKey` |
| `@tanstack/ai-byok/react` | `<ByokProvider>`, `useByok()`, `<ByokKeyManager>` |

See the [API reference](../api/ai-byok) for every export.

## Supported providers

The toolkit understands these provider ids (used in the keyring map and header names):

| Provider id | Label | Client-side validation |
| --- | --- | --- |
| `openai` | OpenAI | Yes |
| `anthropic` | Anthropic | Yes |
| `gemini` | Google Gemini | Yes |
| `openrouter` | OpenRouter | Yes |
| `groq` | Groq | Yes |
| `grok` | xAI Grok | Yes |
| `mistral` | Mistral | Yes |
| `elevenlabs` | ElevenLabs | Yes |
| `fal` | fal.ai | No browser-reachable endpoint |
| `ollama` | Ollama | Local — no API key |

Header name for a provider: `x-byok-<provider>` (for example `x-byok-openai`).

## Quick start (React + SSE relay)

### 1. Wrap the app with a keyring

```tsx
import { useEffect, useState } from "react";
import {
  ByokProvider,
  isPasskeyStorageSupported,
  memoryStorage,
  passkeyStorage,
} from "@tanstack/ai-byok/react";

function App({ children }: { children: React.ReactNode }) {
  const [storage, setStorage] = useState<ReturnType<typeof memoryStorage> | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    async function pick() {
      const platformAuth =
        isPasskeyStorageSupported() &&
        (await globalThis.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable().catch(
          () => false,
        ));
      if (active) {
        setStorage(platformAuth ? passkeyStorage() : memoryStorage());
      }
    }
    void pick();
    return () => {
      active = false;
    };
  }, []);

  if (!storage) return null;
  return <ByokProvider storage={storage}>{children}</ByokProvider>;
}
```

`storage` is chosen once when the provider mounts and cannot be changed later. Default to `memoryStorage()` (session-only, nothing persisted). Opt into `passkeyStorage()` where a platform authenticator is available.

### 2. Attach keys to the chat connection

```tsx
import { useRef, useCallback } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { useByok, withByok } from "@tanstack/ai-byok/react";

function Chat() {
  const { keys, status, unlock } = useByok();
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const handleMissingKey = useCallback(
    (provider: string) => {
      if (status[provider as keyof typeof status]?.state === "locked") {
        void unlock();
      } else {
        openKeyDialog(provider);
      }
    },
    [status, unlock],
  );

  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents(
      "/api/chat",
      withByok(() => keysRef.current, { onMissingKey: handleMissingKey }),
    ),
  });

  return (/* ... */);
}
```

`withByok` returns a function that produces fresh connection options on every request: BYOK headers merged on top of any static headers, plus an optional missing-key-aware `fetchClient`.

Use a ref for `keys` so the getter always reads the latest keyring without recreating the connection adapter.

### 3. Build a stateless server relay

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { getByokKey, byokMissing } from "@tanstack/ai-byok/server";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const apiKey = getByokKey(request, "openai");
  if (!apiKey) return byokMissing("openai");

  const stream = chat({
    adapter: createOpenaiChat("gpt-5.2", apiKey),
    messages,
  });
  return toServerSentEventsResponse(stream);
}
```

`getByokKey` reads the header only — never the body. It returns `null` when absent and must not be wrapped in anything that attaches the value to a logger context.

When neither a server env key nor a BYOK header is present, return `byokMissing(provider)` so the client can prompt for the right key instead of surfacing a generic provider error.

### 4. Optional: drop-in settings UI

```tsx
import { ByokKeyManager } from "@tanstack/ai-byok/react";

function Settings() {
  return <ByokKeyManager providers={["openai", "anthropic", "gemini"]} />;
}
```

`ByokKeyManager` is write-only from the UI's perspective: once saved, only the last four characters are ever shown.

## Missing-key flow

When the relay has no env key and the request carried no BYOK header, return a typed 401:

```typescript
import { byokMissing } from "@tanstack/ai-byok/server";

return byokMissing("openai");
// → 401 { error: { type: "byok_missing", provider: "openai", message: "..." } }
```

On the client, `withByok` / `byokFetch` detect this response and invoke `onMissingKey(provider)` as a side channel — the SSE error path only exposes the HTTP status, not the JSON body.

Typical UI response:

1. If the provider's key is **saved but locked** (passkey storage after a refresh) → call `unlock()`.
2. Otherwise → open a key-entry dialog for that provider.

## Storage tiers

Pass one `KeyringStorage` to `<ByokProvider>`. Built-in strategies:

### `defaultByokStorage()` (recommended)

Passkey-encrypted storage when supported; session memory otherwise. **All keys** — pasted or OpenRouter PKCE — use the same tier and survive refresh behind a biometric unlock.

```tsx
import { ByokProvider, defaultByokStorage } from "@tanstack/ai-byok/react";

<ByokProvider storage={defaultByokStorage()}>
  <App />
</ByokProvider>
```

OpenRouter enforces PKCE key expiry server-side based on what the user chose at sign-in.

### `memoryStorage()` (default alone)

Session-only. All keys live in React state and vanish on refresh. Zero at-rest liability. Used when `<ByokProvider>` has no `storage` prop, or as the `defaultByokStorage()` fallback when passkeys are unavailable.

### `passkeyStorage()`

Encrypted at rest in IndexedDB (AES-256-GCM), with the encryption key derived from a passkey's WebAuthn **PRF** output via HKDF. Decryption happens entirely client-side with a biometric or PIN tap — no server, no custodian.

Feature-detect with `isPasskeyStorageSupported()` and fall back to `memoryStorage()`. PRF support is solid on Android and Apple platform authenticators; it can be patchy on Firefox and with roaming keys on Safari.

**Honest scope:** passkey storage protects against at-rest theft (stolen device, storage-dumping extensions, backups). It does **not** defeat live in-page XSS — an attacker running JavaScript in the origin after the user unlocks can read decrypted keys from memory. `<ByokKeyManager>` surfaces this caveat while passkey storage is active.

`passkeyStorage` is **unlockable**: `<ByokProvider>` does not decrypt on mount. After a refresh, `peek()` reads unencrypted `provider → last-4` metadata so the UI can show saved keys as **locked** before the user taps unlock. Call `unlock()` (or save a key, which runs the registration ceremony on first use) to decrypt.

Supply your own `KeyringStorage` implementation for custom strategies (for example a team-specific HSM workflow).

## Fetcher transport

`withByok` targets [connection adapters](../chat/connection-adapters) (`fetchServerSentEvents`, `fetchHttpStream`, etc.). For the **`fetcher`** transport — used by `useGeneration` (image, audio, video, speech, transcribe) and `useChat({ fetcher })` — use `byokFetcher`:

```typescript
import { byokFetcher } from "@tanstack/ai-byok";

// Fetch-based fetcher
useGenerateAudio({
  fetcher: byokFetcher(
    () => keysRef.current,
    (input, { headers, fetch, signal }) =>
      fetch("/api/generate/audio", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(input),
        signal,
      }),
    { onMissingKey: (provider) => openKeyDialog(provider) },
  ),
});

// TanStack Start server function — forward headers at the call site
useGenerateAudio({
  fetcher: byokFetcher(
    () => keysRef.current,
    (input, { headers }) => generateAudioFn({ data: input, headers }),
  ),
});
```

On the server, read the key the same way:

```typescript
import { getByokKey, byokMissing } from "@tanstack/ai-byok/server";
import { getRequest } from "@tanstack/react-start/server";

const apiKey = getByokKey(getRequest(), "elevenlabs");
if (!apiKey) return byokMissing("elevenlabs");
```

`onMissingKey` fires only when `byokFetcher` owns the `fetch` call. Server-function fetchers surface a missing key as a thrown error instead.

## OpenRouter PKCE sign-in

OpenRouter supports one-click login via [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth). The user signs in at OpenRouter (choosing key expiry and limits on OpenRouter's screen); your app receives a user-controlled API key and stores it in the keyring like any other BYOK key.

### React hook

```tsx
import { useOpenRouterPkce } from "@tanstack/ai-byok/react";

function App() {
  const { login, completing, error } = useOpenRouterPkce();
  // On return from OpenRouter (?code=…), exchanges the code and calls
  // setKey("openrouter", key) automatically.

  return (
    <button type="button" onClick={() => void login()} disabled={completing}>
      Sign in with OpenRouter
    </button>
  );
}
```

`callbackUrl` defaults to `origin + pathname` of the current page. Override it when your OAuth return route differs.

`<ByokKeyManager>` shows a **Sign in with OpenRouter** button on the OpenRouter row when no key is set (and completes the callback when `openrouter` is in `providers`).

### Lower-level client API

```typescript
import {
  startOpenRouterPkceLogin,
  completeOpenRouterPkceFromUrl,
} from "@tanstack/ai-byok";

// Redirect the browser to OpenRouter (stores PKCE verifier in sessionStorage)
await startOpenRouterPkceLogin({
  callbackUrl: "https://myapp.com/chat",
});

// On the callback page, after OpenRouter appends ?code=…
const key = await completeOpenRouterPkceFromUrl();
if (key) await setKey("openrouter", key);
```

S256 PKCE is used by default. Localhost callbacks are supported on any port for local dev.

## Key validation

`validateKey(provider, key)` pings the provider's cheapest authenticated endpoint (usually a models list) before the user hits a wall mid-stream.

Returns:

- `'valid'` — provider accepted the key
- `'invalid'` — 401/403 from the provider
- `'unsupported'` — no browser-reachable validation endpoint for this provider

Throws on network/CORS failures or unexpected HTTP status rather than guessing. Some providers block browser origins entirely; a thrown `TypeError` ("Failed to fetch") is the honest signal.

In React, `useByok().validateKey(provider)` records the outcome in `status[provider]` and never throws — failures become `{ state: 'error', message }`.

## Server logging and errors

The server helpers never log key material. Relay authors are responsible for keeping keys out of their own logs and error responses:

- Use `scrubSecrets(input, [apiKey])` before logging strings that may have interpolated a key (provider SDK error messages, URLs, stack traces).
- Use `maskKey(key)` when you need a display-safe representation (last four characters only).
- Never echo a full key back to the client in an error payload.

## Env keys vs BYOK keys

A common pattern (see the `ts-react-chat` example) keeps **server env keys** as the default and lets BYOK override per request:

```typescript
function byokAdapter(
  provider: ProviderId,
  model: string,
  byok: (model: string, apiKey: string) => AnyTextAdapter,
  env: (model: string) => AnyTextAdapter,
): AnyTextAdapter {
  const key = getByokKey(request, provider);
  return key ? byok(model, key) : env(model);
}
```

Before starting an expensive stream, check whether the selected provider can run at all:

```typescript
const hasByokKey = Boolean(getByokKey(request, "openai"));
const hasEnvKey = Boolean(process.env.OPENAI_API_KEY);
if (!hasByokKey && !hasEnvKey) return byokMissing("openai");
```

On the client, a server function can report which providers have env keys (booleans only — never the values) so the UI can warn before the user picks a model they cannot run.

## Lower-level client API

When you do not need React bindings:

```typescript
import { byokHeaders, byokFetch } from "@tanstack/ai-byok";

const headers = byokHeaders({ openai: "sk-...", gemini: "..." });
// → { "x-byok-openai": "sk-...", "x-byok-gemini": "..." }

const fetch = byokFetch((provider) => openKeyDialog(provider));
```

Empty or absent keys are skipped — only providers with a non-empty key get a header.

## Example

The `examples/ts-react-chat` app integrates BYOK into the main chat page: a key icon opens a per-provider dialog, `withByok` attaches headers on every SSE request, and `/api/tanchat` prefers the BYOK header over env-configured adapters. E2E coverage lives in `testing/e2e/tests/byok.spec.ts`.

## Related

- [Connection Adapters](../chat/connection-adapters) — transports `withByok` plugs into
- [@tanstack/ai-byok API](../api/ai-byok) — full export reference
- [Debug Logging](./debug-logging) — keep custom middleware from logging secrets