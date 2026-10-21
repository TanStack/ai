---
title: Computer Use
id: computer-use
order: 8
description: "Add computer use to a React chat. The model opens tanstack.com in Chromium, reads each screenshot, and clicks until it finds the computer use docs. The chat shows each screenshot."
keywords:
  - tanstack ai
  - tutorial
  - computer use
  - createComputerUse
  - playwrightComputer
  - useChat
  - openai
  - tanstack start
---

You have a chat app. You want the model to do a task on a web page for your user.

With computer use, the model sees only screenshots. It clicks, types, and scrolls on what it sees. In this tutorial, the model opens tanstack.com and finds the TanStack AI computer use docs. Each screenshot shows in your chat.

This tutorial uses React, TanStack Start, and OpenAI. It takes about 15 minutes.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. Then install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod

<!-- ::end:tabs -->

Download Chromium one time:

```bash
npx playwright-core install chromium
```

Put your OpenAI key in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## Client and server

The **server** owns the browser. It runs each action that the model asks for, then sends a screenshot back to the model.

The **client** sends the task. It shows each screenshot, so your user can see what the model sees.

The next steps build the server. Then they build the client.

## 2. Give the model a browser

Create `src/routes/api.chat.ts`, next to `index.tsx`. Start maps that file name to the `/api/chat` path.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

// One computer for the whole server. Each chat thread gets its own page.
const computerUse = createComputerUse({
  driver: playwrightComputer({
    startUrl: 'https://tanstack.com',
    // Show the Chromium window, so you can watch the model work.
    launch: { headless: false },
  }),
  // tanstack.com renders in the browser. Give each page time to draw.
  screenshotDelay: 1000,
})

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    tools: computerUse.tools,
    middleware: [computerUse.middleware],
    interrupts: [computerUse.interrupt],
    // Each action is one step. A search takes more than the default 5.
    agentLoopStrategy: maxIterations(20),
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

- `createComputerUse` is at module scope. Every request uses the same browser.
- `threadId` gives each chat its own page. The page stays open between requests of the same chat.
- `tools` gives the model the `computer` tool and the `navigate` tool.
- `middleware` and `interrupts` pause a risky action until a person approves it.
- `maxIterations(20)` lets the model take up to 20 actions in one reply.

> [!WARNING]
> The browser can open every address that your server can reach. Run this app only on your own machine.

## 3. Show the screenshots

Each computer action returns a screenshot. On the client, the screenshot is an `image` part inside a `tool-result` part.

Replace `src/routes/index.tsx` with this file. It shows the text of each message and every screenshot:

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

type Part = UIMessage['parts'][number]

/** The screenshots in one tool result, as `<img>` sources. */
function screenshots(part: Part) {
  if (part.type !== 'tool-result' || typeof part.content === 'string') return []
  return part.content.flatMap((content) => {
    if (content.type !== 'image') return []
    const { source } = content
    if (source.type === 'data') {
      return [`data:${source.mimeType};base64,${source.value}`]
    }
    return source.type === 'url' ? [source.value] : []
  })
}

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <main>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return <p key={index}>{part.content}</p>
            }
            return screenshots(part).map((src) => (
              <img key={`${index}-${src.slice(-16)}`} src={src} alt="What the model sees" />
            ))
          })}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim()) return
          sendMessage(input.trim())
          setInput('')
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
```

- `screenshots` turns the `image` parts of a tool result into `<img>` sources.
- Each message shows its text parts and its screenshots, in order.

## 4. Approve risky actions

OpenAI can mark an action as risky, for example a form submit. The run then pauses until a person answers.

1. Add these imports to the top of `src/routes/index.tsx`:

```tsx ignore
import type { GenericInterrupt } from '@tanstack/ai-react'
import { computerSafetyCheck } from '@tanstack/ai-computer-use'
```

2. Add the card above `ChatPage`:

```tsx ignore
function SafetyCheckCard({
  interrupt,
}: {
  interrupt: GenericInterrupt<typeof computerSafetyCheck>
}) {
  const checks = interrupt.payload?.checks ?? []
  return (
    <div>
      <p>Approve this computer action?</p>
      <ul>
        {checks.map((check) => (
          <li key={check.id}>{check.message ?? check.code ?? check.id}</li>
        ))}
      </ul>
      <button onClick={() => interrupt.resolveInterrupt({ approved: true })}>
        Approve
      </button>
      <button onClick={() => interrupt.resolveInterrupt({ approved: false })}>
        Decline
      </button>
    </div>
  )
}
```

3. Replace `ChatPage` with this version. It registers `computerSafetyCheck` with `useChat`, and shows a card above the input for each pause:

```tsx ignore
function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, interrupts } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    interrupts: [computerSafetyCheck],
  })

  return (
    <main>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return <p key={index}>{part.content}</p>
            }
            return screenshots(part).map((src) => (
              <img key={`${index}-${src.slice(-16)}`} src={src} alt="What the model sees" />
            ))
          })}
        </div>
      ))}
      {interrupts.map((interrupt) => {
        if (interrupt.kind !== 'generic') return null
        if (!('definitionId' in interrupt)) return null
        if (interrupt.definitionId !== computerSafetyCheck.id) return null
        return <SafetyCheckCard key={interrupt.id} interrupt={interrupt} />
      })}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim()) return
          sendMessage(input.trim())
          setInput('')
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </main>
  )
}
```

- If you click Approve, the action runs.
- If you click Decline, no action of that turn runs.

For more, see [Safety checks](../computer-use/safety-checks).

## 5. Send the task

Start the app with `npm run dev`. Open it in your browser and send this task:

```text
You are on the TanStack home page. Find the TanStack AI documentation page about computer use.
Use the screenshots. Click, type, and scroll only on what you can see. Do not type a URL from memory.
When the page is the computer use docs, say the page title and stop.
```

A Chromium window opens on tanstack.com. The model clicks through the site, and each screenshot shows in the chat. At the end, the model says the title of the computer use page.

The full example is on GitHub: [TanStack/ai `examples/react/computer-use`](https://github.com/TanStack/ai/tree/main/examples/react/computer-use). It has the same task in the input box.

To use Anthropic, change only the adapter. To run a full desktop in a sandbox, see [Drivers](../computer-use/drivers).
