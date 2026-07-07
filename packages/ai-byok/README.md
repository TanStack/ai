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

Keys travel in the `x-tanstack-byok-<provider>` header — never the request body
or message history — so they stay out of persisted conversations and the
event/observability stream.

## Client (React)

```tsx
import { ByokProvider, ByokKeyManager, useByok } from '@tanstack/ai-byok/react'
import {
  byokHeaders,
  memoryStorage,
  passkeyStorage,
  isPasskeyStorageSupported,
} from '@tanstack/ai-byok/react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

// Wrap your app. `storage` is chosen once. Defaults to the safest option
// (session-only, nothing persisted). Opt into encrypted persistence with
// passkeyStorage() where supported, falling back to memory otherwise.
function App({ children }) {
  const storage = isPasskeyStorageSupported()
    ? passkeyStorage()
    : memoryStorage()
  return <ByokProvider storage={storage}>{children}</ByokProvider>
}

// Drop-in settings UI — shows the last 4 chars of a saved key, never the whole key.
function Settings() {
  return <ByokKeyManager />
}

// Attach the keys to the connection.
function Chat() {
  const { keys } = useByok()
  return useChat({
    connection: fetchServerSentEvents('/api/chat', {
      headers: byokHeaders(keys),
    }),
  })
}
```

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

Pass one `storage` to `<ByokProvider>`. Two are built in — **there is no
plaintext persistence**:

- **`memoryStorage()` (default)** — session / in-memory. Keys vanish on refresh.
  Never persisted. Zero at-rest liability.
- **`passkeyStorage()` (opt-in)** — encrypted at rest. The keyring is stored in
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
