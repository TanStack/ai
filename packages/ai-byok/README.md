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
import { byokHeaders, memoryStorage, localStorageStorage } from '@tanstack/ai-byok/react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'

// Wrap your app. `storage` is chosen once. Defaults to the safest option
// (session-only, nothing persisted). Pass `localStorageStorage()` to persist.
function App({ children }) {
  return (
    <ByokProvider storage={memoryStorage()}>{children}</ByokProvider>
  )
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

Pass one `storage` to `<ByokProvider>`. Two are built in:

- **`memoryStorage()` (default)** — session / in-memory. Keys vanish on refresh.
  Never persisted. Zero at-rest liability.
- **`localStorageStorage()` (opt-in)** — persists across refreshes in
  `localStorage` as **plaintext. Keys are not encrypted**, so they are readable
  by any XSS or extension on the origin. `<ByokKeyManager>` shows a warning while
  this storage is active.

`KeyringStorage` is a small interface (`id`, `label`, `persistent`, `load`,
`save`, `clear`), so you can supply your own. A passkey-encrypted
(WebAuthn PRF → AES-256-GCM) storage that encrypts at rest is planned as a
follow-up.

## Validation

`validateKey(provider, key)` pings the provider's cheapest authenticated
endpoint to confirm a key works before the user hits a wall mid-stream. It
returns `'valid' | 'invalid' | 'unsupported'`, and **throws** on a network/CORS
failure rather than guessing — some providers block browser origins entirely.
