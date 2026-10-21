---
title: "Quick Start: React Native"
id: quick-start-react-native
order: 3
description: "Add a streaming chat screen to a React Native or Expo app with useChat. The OpenAI key stays on your server, and the app streams over XHR."
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

You want a streaming AI chat in your React Native or Expo app. You do not want provider SDKs or API keys in the native bundle.

Put the model behind a small server route. The app calls it with `useChat` from `@tanstack/ai-react` and streams over XHR. This takes about 10 minutes.

Two things differ from the [web Quick Start](./quick-start):

- **The URL is absolute.** The app is not served from your backend, so `/api/chat` does not work.
- **The transport is XHR.** Start with `xhrHttpStream()`. Streaming `fetch` is often missing on phones.

## 1. Install

If you start from scratch, create an Expo app first:

<!-- ::start:tabs variant="package-manager" mode="local-install" -->

react: create-expo-app@latest my-ai-chat

<!-- ::end:tabs -->

Install TanStack AI, the React hooks, the OpenAI adapter for the server, and Hono for the example server:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai hono @hono/node-server zod

<!-- ::end:tabs -->

If your Expo app is in a workspace, run the command from the app package, or use your workspace filter.

## 2. Create the server

The server owns the model and the API key. The native app never imports `@tanstack/ai-openai` and never sees `OPENAI_API_KEY`.

Create `server.ts`:

```ts
import { serve } from '@hono/node-server'
import { chat, toHttpResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => c.json({ ok: true }))

app.post('/chat/http', async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured on the server')
  }
  const body = await c.req.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: body.messages,
  })

  return toHttpResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  })
})

serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
})
```

Set the key where the Hono process runs:

```env
OPENAI_API_KEY=sk-...
```

## 3. Start the server

Install `tsx` to run the TypeScript file:

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: tsx

<!-- ::end:tabs -->

Add a script and run it:

```bash
pnpm pkg set scripts.dev:server="tsx server.ts"
pnpm dev:server
```

Keep the server running while you use the app.

## 4. Set the server URL

Give Expo the server address in a public variable:

```env
EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://192.168.1.10:8787
```

Use an address that your device can reach:

- **iOS simulator:** `http://127.0.0.1:8787` often works.
- **Android emulator:** `http://10.0.2.2:8787`.
- **Physical device:** the LAN IP of your computer, for example `http://192.168.1.10:8787`, or a tunneled HTTPS URL.

Expo bundles only `EXPO_PUBLIC_*` values into the app. Keep provider keys as plain server variables, such as `OPENAI_API_KEY`.

## 5. Add the chat screen

Create `ChatScreen.tsx`:

```tsx
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

## 6. Try it

Render `ChatScreen` in your app and open it on a device or simulator. Send a message. The answer streams in, and the provider key stays on the server.

## How it works

1. `sendMessage` posts the messages to `/chat/http` through `xhrHttpStream()`.
2. The Hono route calls `chat()` and returns newline-delimited JSON with `toHttpResponse()`.
3. `xhrHttpStream()` reads the response through XHR progress events and updates `messages` as chunks arrive.

XHR progress events are usually more reliable on phone runtimes than streaming `fetch`.

> [!NOTE]
> Each client transport expects one server response format. `xhrHttpStream()` and `fetchHttpStream()` read the newline-delimited JSON from `toHttpResponse()`. `xhrServerSentEvents()` reads the `text/event-stream` from `toServerSentEventsResponse()`.

## Advanced

### Choose a transport

Use the transport that matches your server route and your runtime:

| Native runtime | Client adapter | Server response |
| --- | --- | --- |
| Most Expo and React Native apps | `xhrHttpStream(url)` with `/chat/http` | `toHttpResponse(stream)` |
| A runtime or proxy path that supports SSE | `xhrServerSentEvents(url)` with `/chat/sse` | `toServerSentEventsResponse(stream)` |
| A runtime with streaming `fetch` | `fetchHttpStream(url)` with `/chat/http` | `toHttpResponse(stream)` |

To serve SSE, add this route to `server.ts` and import `toServerSentEventsResponse` from `@tanstack/ai`:

```ts ignore
app.post('/chat/sse', async (c) => {
  const body = await c.req.json()
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: body.messages,
  })

  return toServerSentEventsResponse(stream)
})
```

Use `fetchHttpStream()` only when your runtime supports all of these:

- `Response.body`
- `Response.body.getReader()`
- `TextDecoder`

If one of them is missing, the adapter throws `UnsupportedResponseStreamError`. A polyfilled `fetch` that buffers the whole response is not enough. TanStack AI needs the response bytes as they arrive to update the chat during the stream.

For headers, credentials, `withCredentials`, and dynamic URLs, see [Request Options](../transports/request-options).

### Run the Expo recipe example

The repo has an Expo app for React Native. It runs a local Hono and OpenAI server, has a transport selector, and streams structured recipe cards. Use it to test native chat and structured output together.

1. Create `examples/ts-react-native-chat/.env`:

   ```env
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-5.2
   ```

2. Run the example:

   ```bash
   pnpm --filter ts-react-native-chat dev
   ```

   The command starts:

   - Hono on `0.0.0.0:8787`.
   - Expo and Metro in LAN mode.
   - `EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://<lan-ip>:8787`, when it finds a LAN address.

3. Scan the Expo Go QR code from a phone on the same Wi-Fi network.

In the app, use the Testing mode panel to switch between Fetch HTTP, XHR HTTP, and XHR SSE. The recipe card streams structured fields: title, ingredients, steps, tips, warnings, and revision. Follow-up prompts revise the same recipe.

For commands and network overrides, see `examples/ts-react-native-chat/README.md`.

### Troubleshooting

**`http://localhost:8081` shows JSON.** This is correct. Port `8081` is the Metro manifest and bundle server, not a web UI. Open the app from Expo Go, an Android emulator, or an iOS simulator.

**A physical device cannot reach the backend.** Open `http://<lan-ip>:8787/health` in the phone browser. If it does not return `{"ok":true}`, make sure that:

- The phone and the computer are on the same Wi-Fi network.
- Client isolation is off on the network.
- Your firewall lets Node.js use the Hono port and Metro port `8081`.

**The Android emulator cannot reach `127.0.0.1`.** Set `EXPO_PUBLIC_TANSTACK_AI_BASE_URL` to `http://10.0.2.2:8787`. Android emulators map `10.0.2.2` to the host machine.

**Expo prints Android SDK or `adb` warnings.** This is an Android tooling error, not a TanStack AI transport error. Make sure that:

- Android Studio installed the SDK.
- An emulator exists in Device Manager.
- `adb` is on `PATH`. On Windows, look for `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.

**The phone logs `UnsupportedResponseStreamError`.** Your runtime does not have streaming `fetch`, `Response.body.getReader()`, or `TextDecoder`. Switch from `fetchHttpStream()` to `xhrHttpStream()` or `xhrServerSentEvents()`. Fetch polyfills work only if they give a real incremental readable stream.

**XHR reports a server error.** Read the Hono server terminal first. The usual causes:

- `OPENAI_API_KEY` is missing.
- `OPENAI_MODEL` names a model that the adapter does not support (in the example app).
- `xhrServerSentEvents()` points at `/chat/http` instead of `/chat/sse`, or the reverse.
