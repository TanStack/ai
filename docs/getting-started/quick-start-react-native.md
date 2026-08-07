---
title: "Quick Start: React Native"
id: quick-start-react-native
order: 3
description: "Expo/React Native chat with useChat, a server-only OpenAI route, and XHR streaming."
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

If you need mobile chat → keep the provider on a server, use an absolute backend URL, start with `xhrHttpStream()`.

Web quick start differs: no relative `/api/chat`; prefer XHR over streaming `fetch` on Expo.

## 1. Install

New Expo app (optional):

```bash
npx create-expo-app@latest my-ai-chat
```

```bash
pnpm add @tanstack/ai @tanstack/ai-react @tanstack/ai-openai hono @hono/node-server zod
```

In a monorepo, run this in the app package (or use a workspace filter).

## 2. Server: OpenAI stays off the device

Native app never imports `@tanstack/ai-openai` or sees `OPENAI_API_KEY`.

```ts
// server.ts
import { serve } from '@hono/node-server'
import { chat, toHttpResponse, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { Hono } from 'hono'
import { model } from './config'

const app = new Hono()

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

Server env (where Hono runs):

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

Start the server:

```bash
pnpm add -D tsx
pnpm pkg set scripts.dev:server="tsx server.ts"
pnpm dev:server
```

**Route pairing**

| Client | Server |
| --- | --- |
| `xhrHttpStream()` / `fetchHttpStream()` | `toHttpResponse()` (NDJSON) |
| `xhrServerSentEvents()` | `toServerSentEventsResponse()` |

## 3. Absolute URL for the device

```env
EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://192.168.1.10:8787
```

| Runtime | Base URL |
| --- | --- |
| iOS simulator | `http://127.0.0.1:8787` |
| Android emulator | `http://10.0.2.2:8787` |
| Physical device | LAN IP or HTTPS tunnel |

Only `EXPO_PUBLIC_*` is bundled. Keep `OPENAI_API_KEY` server-only.

## 4. Chat screen with `xhrHttpStream`

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

## 5. Pick a transport

| Native runtime | Client | Server |
| --- | --- | --- |
| Most Expo / RN | `xhrHttpStream(url)` → `/chat/http` | `toHttpResponse` |
| SSE-capable path | `xhrServerSentEvents(url)` → `/chat/sse` | `toServerSentEventsResponse` |
| Streaming `fetch` works | `fetchHttpStream(url)` → `/chat/http` | `toHttpResponse` |

Use `fetchHttpStream()` only if the runtime has `Response.body`, `getReader()`, and `TextDecoder`. Missing any → `UnsupportedResponseStreamError`. Buffered polyfills are not enough.

More options (headers, credentials, dynamic URLs): [Connection Adapters](../chat/connection-adapters).

## 6. Try the Expo example

`examples/ts-react-native-chat/.env`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

```bash
pnpm --filter ts-react-native-chat dev
```

Starts Hono on `0.0.0.0:8787`, Expo in LAN mode, and sets `EXPO_PUBLIC_TANSTACK_AI_BASE_URL` when a LAN IP is found. Use the Testing panel to switch Fetch HTTP / XHR HTTP / XHR SSE. Details: `examples/ts-react-native-chat/README.md`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `http://localhost:8081` is JSON | Metro only — open Expo Go / emulator / simulator |
| Device can't reach backend | Open `http://<lan-ip>:8787/health` → `{"ok":true}`; same Wi‑Fi, no client isolation, firewall allows 8787 + 8081 |
| Android emulator + `127.0.0.1` | Use `http://10.0.2.2:8787` |
| Android SDK / `adb` warnings | Android Studio SDK + Device Manager; `adb` on `PATH` |
| `UnsupportedResponseStreamError` | Switch to `xhrHttpStream()` or `xhrServerSentEvents()` |
| XHR server error | Check Hono logs: key, model, HTTP vs SSE route mismatch |
