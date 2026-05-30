---
title: "Quick Start: React Native"
id: quick-start-react-native
order: 3
description: "Build a React Native or Expo chat screen with TanStack AI's useChat hook, a server-only OpenAI backend, and mobile-compatible streaming transports."
keywords:
  - tanstack ai
  - react native
  - expo
  - mobile
  - useChat
  - streaming
  - xhrHttpStream
  - openai
---

You have a React Native or Expo app and you want to add streaming AI chat
without putting provider SDKs or API keys in the native bundle. By the end of
this guide, your app will call a server-owned Hono route with `useChat` from
`@tanstack/ai-react`, stream responses over a mobile-compatible transport, and
keep `OPENAI_API_KEY` / `OPENAI_MODEL` on the server.

> **Coming from the web quick start?** The hook is the same, but the URL and
> transport are different. React Native needs an absolute backend URL, not
> `/api/chat`, and most Expo runtimes should start with `xhrHttpStream()`.

## 1. Install packages

If you are starting from scratch, create an Expo app first:

```bash
npx create-expo-app@latest my-ai-chat
```

Install TanStack AI, the React hook package, the OpenAI adapter for your
server, and Hono for the example backend:

```bash
pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai hono @hono/node-server zod
```

If your Expo app lives in a workspace, run the command from the app package or
use your workspace filter.

## 2. Keep OpenAI on the server

Create a Hono route that owns the model, API key, and response format. The
native app sends chat messages to this route; it never imports
`@tanstack/ai-openai` and never receives `OPENAI_API_KEY`.

```ts
// server.ts
import { serve } from '@hono/node-server'
import { chat, toHttpResponse, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { Hono } from 'hono'

const app = new Hono()

const model = process.env.OPENAI_MODEL ?? 'gpt-5.2'

function requireOpenAIKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured on the server')
  }
}

app.get('/health', (c) => c.json({ ok: true }))

app.post('/chat/http', async (c) => {
  requireOpenAIKey()
  const body = await c.req.json()
  const stream = chat({
    adapter: openaiText(model),
    messages: body.messages,
  })

  return toHttpResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  })
})

app.post('/chat/sse', async (c) => {
  requireOpenAIKey()
  const body = await c.req.json()
  const stream = chat({
    adapter: openaiText(model),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
})

serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
})
```

Set server-only environment variables where the Hono process runs:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

Run the Hono server before starting the native app. For a TypeScript-only
example, install `tsx` and add a script:

```bash
pnpm add -D tsx
pnpm pkg set scripts.dev:server="tsx server.ts"
pnpm dev:server
```

> **Route pairing matters:** `xhrHttpStream()` and `fetchHttpStream()` expect
> the newline-delimited JSON response from `toHttpResponse()`.
> `xhrServerSentEvents()` expects the `text/event-stream` response from
> `toServerSentEventsResponse()`.

## 3. Configure a native-reachable URL

React Native is not served from your backend origin, so `/api/chat` cannot work
as a default. Expose the backend URL to Expo with a public variable:

```env
EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://192.168.1.10:8787
```

Use the address your device can reach:

- iOS simulator: `http://127.0.0.1:8787` often works.
- Android emulator: use `http://10.0.2.2:8787`.
- Physical device: use your computer's LAN IP, for example
  `http://192.168.1.10:8787`, or a tunneled HTTPS URL.

Only `EXPO_PUBLIC_*` values are bundled into the app. Keep provider keys as
plain server variables such as `OPENAI_API_KEY`.

## 4. Use `useChat` in your native screen

Start with `xhrHttpStream()` for Expo and React Native. It reads the same
newline-delimited JSON produced by `toHttpResponse()` and relies on XHR progress
events, which are usually more reliable on phone runtimes than streaming
`fetch`.

```tsx
// ChatScreen.tsx
import { useState } from 'react'
import { Button, ScrollView, Text, TextInput, View } from 'react-native'
import { useChat, xhrHttpStream } from '@tanstack/ai-react'

const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787'

export function ChatScreen() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error } = useChat({
    connection: xhrHttpStream(`${baseUrl}/chat/http`),
  })

  async function send() {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    await sendMessage(text)
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <ScrollView style={{ flex: 1 }}>
        {messages.map((message) => (
          <View key={message.id} style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: '700' }}>{message.role}</Text>
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <Text key={index}>{part.content}</Text>
              ) : null,
            )}
          </View>
        ))}
      </ScrollView>

      {error ? <Text style={{ color: 'crimson' }}>{error.message}</Text> : null}

      <TextInput
        value={input}
        onChangeText={setInput}
        editable={!isLoading}
        placeholder="Ask for a recipe..."
        style={{ borderWidth: 1, borderRadius: 8, padding: 12 }}
      />
      <Button title={isLoading ? 'Streaming...' : 'Send'} onPress={send} />
    </View>
  )
}
```

You now have a native chat screen that calls your server endpoint, streams
assistant text, and keeps provider credentials outside the app.

## 5. Choose a transport deliberately

Use the transport that matches your server route and runtime:

| Native runtime | Client adapter | Server response |
| --- | --- | --- |
| Most Expo / React Native apps | `xhrHttpStream(url)` with `/chat/http` | `toHttpResponse(stream)` |
| SSE-compatible native runtime or proxy path | `xhrServerSentEvents(url)` with `/chat/sse` | `toServerSentEventsResponse(stream)` |
| Runtime with streaming `fetch` support | `fetchHttpStream(url)` with `/chat/http` | `toHttpResponse(stream)` |

Only use `fetchHttpStream()` when your exact runtime supports all of:

- `Response.body`
- `Response.body.getReader()`
- `TextDecoder`

If any of those are missing, the adapter throws
`UnsupportedResponseStreamError`. A polyfilled `fetch` that buffers the whole
response is not enough; TanStack AI needs incremental response bytes to update
the chat while the model is streaming.

For deeper adapter options such as headers, credentials, `withCredentials`, and
dynamic URLs, see [Connection Adapters](../chat/connection-adapters).

## 6. Try the Expo recipe example

If you are evaluating React Native support, use the included Expo app. It runs a
local Hono/OpenAI server, shows a transport selector, and streams structured
recipe cards so you can verify native chat and structured output behavior
together.

Create `examples/ts-react-native-chat/.env`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

Run the example:

```bash
pnpm --filter ts-react-native-chat dev
```

The command starts:

- Hono on `0.0.0.0:8787`
- Expo/Metro in LAN mode
- `EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://<lan-ip>:8787` when a LAN address is detected

Scan the Expo Go QR code from a phone on the same Wi-Fi network. In the app,
use the Testing mode panel to switch between Fetch HTTP, XHR HTTP, and XHR SSE.
The main recipe card streams structured fields such as title, ingredients,
steps, tips, warnings, and revision across follow-up prompts.

For example-specific commands and network overrides, see
`examples/ts-react-native-chat/README.md`.

## Troubleshooting

### `http://localhost:8081` shows JSON

That is normal. Port `8081` is Metro's manifest and bundle server, not a web UI.
Launch the app from Expo Go, an Android emulator, or an iOS simulator instead.

### A physical device cannot reach the backend

Open `http://<lan-ip>:8787/health` from the phone browser. If it does not return
`{"ok":true}`, confirm the phone and computer are on the same Wi-Fi network,
client isolation is disabled, and your firewall allows Node.js on the Hono port
and Metro port `8081`.

### Android emulator cannot reach `127.0.0.1`

Use `http://10.0.2.2:8787` for
`EXPO_PUBLIC_TANSTACK_AI_BASE_URL`. Android emulators map `10.0.2.2` to the
host machine.

### Expo prints Android SDK or `adb` warnings

This is an Android tooling issue, not a TanStack AI transport issue. Confirm
Android Studio installed the SDK, an emulator exists in Device Manager, and
`adb` is on `PATH`. On Windows, check
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.

### The phone logs `UnsupportedResponseStreamError`

Your runtime does not expose streaming `fetch`, `Response.body.getReader()`, or
`TextDecoder`. Switch from `fetchHttpStream()` to `xhrHttpStream()` or
`xhrServerSentEvents()`. Do not rely on fetch polyfills unless they provide a
real incremental readable stream.

### XHR reports a server error

Check the Hono server terminal first. Common causes are missing
`OPENAI_API_KEY`, an unsupported `OPENAI_MODEL`, or pointing
`xhrServerSentEvents()` at `/chat/http` instead of `/chat/sse` (or the reverse).

You now have the full React Native path: a server-owned provider boundary, a
native-reachable URL, a mobile-compatible transport, and an Expo example that
proves the setup on a real device.
