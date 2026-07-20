---
title: "@tanstack/ai-byok"
slug: /api/ai-byok
order: 9
description: "API reference for @tanstack/ai-byok — bring-your-own-key client keyring, per-request headers, React bindings, and stateless server helpers."
keywords:
  - tanstack ai
  - "@tanstack/ai-byok"
  - byok
  - api key
  - getByokKey
  - withByok
  - byokFetcher
  - api reference
---

Bring-your-own-key toolkit for TanStack AI. See the [BYOK guide](../advanced/byok) for architecture, security model, and end-to-end setup.

## Installation

```bash
npm install @tanstack/ai-byok
```

Subpath exports:

```typescript
// Stateless server helpers (no React dependency)
import { getByokKey, byokMissing } from "@tanstack/ai-byok/server";

// React bindings (requires react peer)
import { ByokProvider, useByok } from "@tanstack/ai-byok/react";

// OpenRouter OAuth PKCE (optional vendor add-on)
import { useOpenRouterPkce } from "@tanstack/ai-byok/openrouter/react";
```

## `@tanstack/ai-byok` (client)

Framework-agnostic client toolkit. No React or server dependencies.

### `byokHeaders(keys)`

Turns a keyring into per-provider request headers. Skips empty or absent keys.

```typescript
import { byokHeaders } from "@tanstack/ai-byok";

const headers = byokHeaders({ openai: "sk-live", anthropic: "" });
// → { "x-byok-openai": "sk-live" }
```

### `withByok(getKeys, options?)`

Builds BYOK connection options for fetch-based [connection adapters](../chat/connection-adapters). Returns a **function** that produces fresh options on every request.

```tsx
import { useRef } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { withByok } from "@tanstack/ai-byok";
import { openKeyDialog } from "./byok-ui";
import { customFetch } from "./fetch";

function Chat() {
  const keysRef = useRef({ openai: "sk-live" });
  const buildOptions = withByok(() => keysRef.current, {
    onMissingKey: (provider) => openKeyDialog(provider),
    headers: { "x-custom": "value" },
    fetchClient: customFetch,
  });

  useChat({
    connection: fetchServerSentEvents("/api/chat", buildOptions),
  });

  return null;
}
```

**`WithByokOptions`**

| Field | Type | Description |
| --- | --- | --- |
| `onMissingKey?` | `(provider: ProviderId) => void` | Called when the relay returns a `byokMissing` 401 |
| `headers?` | `Record<string, string>` | Extra headers merged under BYOK headers |
| `fetchClient?` | `typeof fetch` | Underlying fetch (defaults to global `fetch`) |

### `buildByokRequestContext(getKeys, options?, signal?)`

Shared header + fetch wiring used by `withByok` and `byokFetcher`. Returns `{ headers, fetch, signal? }`.

### `byokFetch(onMissingKey, fetchImpl?)`

Wraps `fetch` so a `byokMissing` 401 invokes `onMissingKey` with the provider id. The response is passed through unchanged.

### `byokFetcher(getKeys, handler, options?)`

The `fetcher` transport counterpart to `withByok`. Wraps a fetcher body so it receives BYOK `headers`, a missing-key-aware `fetch`, and the transport `signal`, read fresh on every call.

```tsx
import { useRef } from "react";
import { useGenerateAudio } from "@tanstack/ai-react";
import { byokFetcher } from "@tanstack/ai-byok";
import { openKeyDialog } from "./byok-ui";

function AudioPage() {
  const keysRef = useRef({ elevenlabs: "xi-key" });

  useGenerateAudio({
    fetcher: byokFetcher(
      () => keysRef.current,
      (input, { headers, fetch, signal }) =>
        fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(input),
          signal,
        }),
      { onMissingKey: (provider) => openKeyDialog(provider) },
    ),
  });

  return null;
}
```

**`ByokFetcherContext`**

| Field | Type | Description |
| --- | --- | --- |
| `headers` | `Record<string, string>` | Per-provider BYOK headers for this request |
| `fetch` | `typeof fetch` | Missing-key-aware fetch (identical to global when `onMissingKey` is unset) |
| `signal?` | `AbortSignal` | Abort signal forwarded from `stop()`, when provided |

### `isByokMissingBody(value)`

Type guard for a `byokMissing` response body parsed from JSON.

### Storage

#### `defaultByokStorage(options?)`

Recommended: passkey-encrypted storage when supported, otherwise session memory. All keys (pasted and OpenRouter PKCE) use the same tier.

#### `memoryStorage()`

Session-only — keys vanish on refresh, nothing persisted. Default when `<ByokProvider>` has no `storage` prop.

#### `passkeyStorage(options?)`

Passkey-encrypted persistence (WebAuthn PRF → HKDF → AES-256-GCM in IndexedDB). Unlockable — requires `unlock()` or a save before keys are usable after refresh.

**`PasskeyStorageOptions`**

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `rpName?` | `string` | `"BYOK"` | Relying-party name in the passkey prompt |
| `userName?` | `string` | `"byok-keyring"` | Username label on the created passkey |
| `rpId?` | `string` | current origin | Parent domain for cross-subdomain sharing |
| `dbName?` | `string` | `"byok"` | IndexedDB database name |

#### `isPasskeyStorageSupported()`

Returns whether WebAuthn is available. PRF support is confirmed only during registration — catch errors from `passkeyStorage()` and fall back to `memoryStorage()`.

### OpenRouter PKCE (`@tanstack/ai-byok/openrouter`)

| Export | Description |
| --- | --- |
| `generateCodeVerifier()` | Random URL-safe PKCE verifier |
| `createS256CodeChallenge(verifier)` | S256 code challenge (base64url SHA-256) |
| `buildOpenRouterAuthUrl(options)` | OpenRouter `/auth` redirect URL |
| `startOpenRouterPkceLogin(options)` | Store pending state and redirect |
| `exchangeOpenRouterCode(options)` | POST code → API key |
| `completeOpenRouterPkceFromUrl(options?)` | Read `?code=`, exchange, clean up |
| `defaultOpenRouterCallbackUrl()` | `origin + pathname` default |
| `storeOpenRouterPkcePending` / `load` / `clear` | Session-scoped PKCE state |

### `useOpenRouterPkce(options?)` (`@tanstack/ai-byok/openrouter/react`)

React hook (requires `<ByokProvider>`). Auto-completes when the URL contains `?code=` from OpenRouter (unless `autoComplete: false`).

| Option | Default | Description |
| --- | --- | --- |
| `callbackUrl?` | `origin + pathname` | OpenRouter redirect target |
| `autoComplete?` | `true` | Exchange code on mount |
| `useS256?` | `true` | S256 PKCE challenge |

Returns `{ login, completing, error, callbackUrl }`.

### `validateKey(provider, key)`

Pings the provider's validation endpoint. Returns `'valid' | 'invalid' | 'unsupported'`. Throws on network/CORS failure or unexpected HTTP status.

### Provider registry

| Export | Description |
| --- | --- |
| `BYOK_PROVIDERS` | Static metadata map (`id`, `label`, optional `validate` config) |
| `PROVIDER_IDS` | Runtime array of all provider ids |
| `BYOK_HEADER_PREFIX` | `"x-byok-"` |
| `byokHeaderName(provider)` | Full header name for a provider |
| `isProviderId(value)` | Type guard for `ProviderId` |

### Types

| Type | Description |
| --- | --- |
| `Keyring` | `Partial<Record<ProviderId, string>>` — in-memory key map |
| `ProviderId` | Union of registered provider ids |
| `KeyringStorage` | Pluggable persistence interface (`load`, `save`, `clear`, optional `peek`, `unlockable`) |
| `ValidationStatus` | `'valid' \| 'invalid' \| 'unsupported'` |
| `ByokMissingBody` | Typed JSON body from `byokMissing` |

## `@tanstack/ai-byok/server`

Stateless server helpers. No persistence, no logging of key values.

### `getByokKey(request, provider)`

Reads a provider's BYOK key from the incoming request header. Returns the key string or `null` when absent.

Accepts any object with a `Headers`-like `.get()` — works across Fetch-API runtimes (Workers, Deno, Bun, Node/undici).

```typescript
import { getByokKey } from "@tanstack/ai-byok/server";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, "openai");
  // ...
}
```

### `byokMissing(provider, init?)`

Returns a typed JSON 401 telling the client which provider key is missing. Carries no key material.

```typescript
import { byokMissing, getByokKey } from "@tanstack/ai-byok/server";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, "anthropic");
  if (!apiKey) return byokMissing("anthropic");
  // ...
}
```

### `preferByokAdapter(request, provider, model, factories)`

Prefer a per-request BYOK header key over a server env-configured adapter factory.

### `requireByokOrEnv(request, provider, envVarNames)`

Return a typed `byokMissing` response when neither a BYOK header nor any named env var is present. Returns `null` when the request may proceed.

### `scrubSecrets(input, secrets)`

Replaces every occurrence of each secret in `input` with its masked form. Use before logging or returning strings that may have interpolated a key.

### `maskKey(key)` / `lastFour(key)`

Display-safe key representations (last four characters only).

## `@tanstack/ai-byok/react`

React bindings for the client keyring.

### `<ByokProvider storage={...}>`

Provides the keyring context. `storage` is chosen once at mount and cannot change.

```tsx
import { ByokProvider, memoryStorage } from "@tanstack/ai-byok/react";

function Root({ children }: { children: React.ReactNode }) {
  return (
    <ByokProvider storage={memoryStorage()}>{children}</ByokProvider>
  );
}
```

### `useByok()`

Access the keyring and controls. Must be called under `<ByokProvider>` — throws otherwise.

```tsx
import { useByok } from "@tanstack/ai-byok/react";

function KeySettings() {
  const {
    keys, // live keyring — pass to byokHeaders / withByok
    setKey, // (provider, key) => Promise<void>
    clearKey, // (provider) => Promise<void>
    clearAll, // () => Promise<void>
    validateKey, // (provider, key?) => Promise<KeyStatus>
    status, // per-provider KeyStatus map
    storage, // configured KeyringStorage
    locked, // true when unlockable storage may hold encrypted keys
    unlock, // () => Promise<void> — decrypt / load
    hasKey, // (provider) => boolean
  } = useByok();

  return null;
}
```

**`KeyStatus` union**

| `state` | Meaning |
| --- | --- |
| `'empty'` | No key stored |
| `'set'` | Key present and usable; `masked` shows last 4 |
| `'locked'` | Saved in unlockable storage but not decrypted this session |
| `'validating'` | Validation in flight |
| `'valid'` / `'invalid'` / `'unsupported'` | Validation outcome |
| `'error'` | Validation failed (network, etc.); includes `message` |

### `<ByokKeyManager providers={...} />`

Drop-in settings UI for entering, validating, and clearing keys. Only ever shows the last four characters of a saved key. Accepts optional `envStatus`, `highlightProvider`, `openRouter`, and `variant` (`'light' | 'dark'`).

### `<ByokKeyDialog open onOpenChange={...} />`

Modal wrapper around `<ByokKeyManager>` with a trigger button. Supports custom `trigger`, `overlayClassName`, and `panelClassName` for app styling.

## Header convention

Every present provider key is sent as:

```
x-byok-<provider>: <api-key>
```

Keys are **never** placed in the request body, `forwardedProps`, or message history.

## Related

- [Bring Your Own Key (BYOK)](../advanced/byok) — full guide
- [Connection Adapters](../chat/connection-adapters) — `withByok` integration