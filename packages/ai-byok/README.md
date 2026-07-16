# @tanstack/ai-byok

Bring-your-own-key toolkit for [TanStack AI](https://tanstack.com/ai). Users
supply their own provider API keys; the library collects them **client-side**,
attaches them **per-request in a header**, and uses them **server-side without
ever persisting or logging them**.

## First principle: never be a custodian

- **Keys live client-side.** The browser is the system of record.
- **The server piece is a stateless pass-through.** It reads the key off the
  incoming request header, hands it to the TanStack AI adapter for one call, and
  never writes it to a DB, cache, log, or observability stream.
- **No central endpoint.** The server helper is trivially self-hostable; there
  is no hardcoded relay URL.

Keys travel in the `x-byok-<provider>` header — never the request body
or message history — so they stay out of persisted conversations and the
event/observability stream.

## Client (React)

```tsx
import { useRef } from 'react'
import { ByokProvider, ByokKeyManager, useByok } from '@tanstack/ai-byok/react'
import { withByok, defaultByokStorage } from '@tanstack/ai-byok/react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

// Wrap your app. `storage` is chosen once. defaultByokStorage() uses passkey
// encryption when supported — all keys, including OpenRouter PKCE.
function App({ children }) {
  return <ByokProvider storage={defaultByokStorage()}>{children}</ByokProvider>
}

// Drop-in settings UI — shows the last 4 chars of a saved key, never the whole key.
function Settings() {
  return <ByokKeyManager />
}

// Attach the keys to the connection. `withByok` adds the per-request BYOK
// headers and, via `onMissingKey`, detects the relay's `byokMissing` 401 so you
// can prompt for (or unlock) the key the server was missing.
function Chat() {
  const { keys, status, unlock } = useByok()
  const keysRef = useRef(keys)
  keysRef.current = keys
  return useChat({
    connection: fetchServerSentEvents(
      '/api/chat',
      withByok(() => keysRef.current, {
        onMissingKey: (provider) => {
          if (status[provider]?.state === 'locked') void unlock()
          else openKeyDialog(provider)
        },
      }),
    ),
  })
}
```

For a lower-level path, `byokHeaders(keys)` returns the raw header map and
`byokFetch(onMissingKey)` wraps a `fetch` to detect the `byokMissing` 401.

### OpenRouter PKCE sign-in

OpenRouter users can connect in one click via OAuth PKCE instead of pasting a
key. Import from `@tanstack/ai-byok/openrouter` (and
`@tanstack/ai-byok/openrouter/react` for `useOpenRouterPkce`) — the returned key
is stored as `openrouter` in the passkey-encrypted keyring like any other BYOK
key when using `defaultByokStorage()`.

### Fetcher transport (`useChat`/`useGeneration` with a `fetcher`)

`withByok` targets the `connection` transport. For the `fetcher` transport —
used by `useGeneration` (image/audio/video/speech/transcribe) and by
`useChat({ fetcher })` — use `byokFetcher`. It hands your fetcher body BYOK
`headers` and a missing-key-aware `fetch`, read fresh on every call, and works
for both fetcher styles:

```ts
// A) fetch-based fetcher — spread headers, use the wrapped fetch for onMissingKey
useGenerateAudio({
  fetcher: byokFetcher(
    () => keysRef.current,
    (input, { headers, fetch, signal }) =>
      fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(input),
        signal,
      }),
    { onMissingKey: (provider) => openKeyDialog(provider) },
  ),
})

// B) TanStack Start server function — forward headers at the call site
useGenerateAudio({
  fetcher: byokFetcher(
    () => keysRef.current,
    (input, { headers }) => generateAudioFn({ data: input, headers }),
  ),
})
```

The key still travels in the `x-byok-<provider>` header, never the `data`
body. On the server, read it off the request with the same `getByokKey`:

```ts
import { getByokKey, byokMissing } from '@tanstack/ai-byok/server'
import { getRequest } from '@tanstack/react-start/server'

export const generateAudioFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; provider: ProviderId }) => data)
  .handler(({ data }) => {
    const apiKey = getByokKey(getRequest(), data.provider)
    if (!apiKey) return byokMissing(data.provider)
    // ...hand apiKey to the adapter for one call
  })
```

The `onMissingKey` callback fires only on the fetch-based path (style A), where
`byokFetcher` owns the `fetch` and can see the `byokMissing` 401. A server
function (style B) surfaces the missing key as a thrown error instead — catch
it and inspect the message, or pre-check with `hasKey(provider)` before calling.

## Server (stateless — no persist, no log)

```ts
import { getByokKey, byokMissing } from '@tanstack/ai-byok/server'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai/adapters'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const apiKey = getByokKey(request, 'openai')
  if (!apiKey) return byokMissing('openai')

  const stream = chat({
    adapter: createOpenaiChat('gpt-5.2', apiKey),
    messages,
  })
  return toServerSentEventsResponse(stream)
}
```

## Storage

Pass one `storage` to `<ByokProvider>`. Built-ins:

- **`defaultByokStorage()` (recommended)** — passkey-encrypted when supported;
  session memory fallback. All keys (pasted and OpenRouter PKCE) share one tier.
- **`memoryStorage()` (default alone)** — session / in-memory. All keys vanish on
  refresh. Zero at-rest liability.
- **`passkeyStorage()`** — encrypted at rest. The keyring is stored in
  IndexedDB as AES-256-GCM ciphertext, with the key derived from a passkey's
  WebAuthn **PRF** output (via HKDF) and unwrapped on demand with a
  biometric/PIN tap. Fully client-side — no server, no custodian.

  Feature-detect with `isPasskeyStorageSupported()` and fall back to
  `memoryStorage()` (PRF is solid on Android and Apple platform authenticators;
  patchy on Firefox / roaming keys on Safari).

  **Honest scope:** this protects against at-rest theft (stolen device,
  storage-dumping extension, backups). It does **not** defeat live in-page XSS —
  an attacker running JS in the origin after you unlock can read the decrypted
  keys from memory. `<ByokKeyManager>` states this while passkey storage is
  active.

`passkeyStorage` is `unlockable`, so `<ByokProvider>` does not decrypt on mount:
`useByok()` reports `locked: true` until you call `unlock()` (or save a key,
which registers a passkey on first use). It does, however, `peek()` on mount —
reading an unencrypted `provider → last-4` sidecar with **no** unlock ceremony —
so after a refresh the UI can immediately show saved keys as `locked` (with
their last-4) before the biometric tap. `KeyringStorage` is a small interface,
so you can supply your own strategy.

Recovery is a non-issue: lose the device, re-paste the key from the provider
dashboard.

## Validation

`validateKey(provider, key)` pings the provider's cheapest authenticated
endpoint to confirm a key works before the user hits a wall mid-stream. It
returns `'valid' | 'invalid' | 'unsupported'`, and **throws** on a network/CORS
failure rather than guessing — some providers block browser origins entirely.
