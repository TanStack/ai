---
title: Computer Use
id: computer-use
order: 1
description: "Let the model use a web page for the user. It sees screenshots and sends clicks and key presses. The same code runs on OpenAI and Anthropic."
keywords:
  - tanstack ai
  - computer use
  - createComputerUse
  - browser agent
  - playwright
  - openai
  - anthropic
---

You have a chat app. You want the model to do a task on a web page for the user, for example fill in a form or find a price. Computer use gives the model a screen, a mouse, and a keyboard. The same code runs on OpenAI and on Anthropic.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
vue: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
solid: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
svelte: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
preact: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
angular: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
vanilla: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod
octane: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright zod

<!-- ::end:tabs -->

## Give the model a browser page

1. Open a Playwright page that has a viewport size.
2. Create the computer from a driver for that page.
3. Give `tool`, `middleware`, and `interrupt` to `chat()`.

```ts
// app/api/chat/computers.ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'
import { chromium } from 'playwright'

const browser = await chromium.launch()
const computers = new Map<string, ReturnType<typeof createComputerUse>>()

export async function computerFor(threadId: string) {
  const existing = computers.get(threadId)
  if (existing) return existing
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto('https://example.com')
  const computer = createComputerUse({
    driver: createPlaywrightComputerDriver({ page }),
  })
  computers.set(threadId, computer)
  return computer
}
```

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { computerFor } from './computers'

export async function POST(request: Request) {
  const params = await chatParamsFromRequest(request)
  const { tool, middleware, interrupt } = await computerFor(params.threadId)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
    ...(params.resume ? { resume: params.resume } : {}),
    tools: [tool],
    middleware: [middleware],
    interrupts: [interrupt],
  })
  return toServerSentEventsResponse(stream)
}
```

One `createComputerUse` drives one machine for one conversation at a time. The map keeps one computer for each thread. Your app owns the browser. When the conversation ends, close the page.

The `middleware` stops the rest of a turn after a failed action. It also runs the OpenAI safety checks. The `interrupt` asks a person to approve an action that has a safety check.

To use Anthropic, change only the adapter:

```ts
import { anthropicText } from '@tanstack/ai-anthropic'

const adapter = anthropicText('claude-opus-5-5')
```

Need a full Linux desktop and not a browser page? See [Drivers](./drivers).

## Register the interrupt on the client

The client imports `computerSafetyCheck`. It is the same object as `interrupt`, so the client does not load the driver or Playwright.

```tsx
// app/chat.tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { computerSafetyCheck } from '@tanstack/ai-computer-use'

export function Chat() {
  const [input, setInput] = useState('')
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    interrupts: [computerSafetyCheck],
  })

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Send</button>
      </form>
    </>
  )
}
```

To show the approval card for a safety check, see [Safety checks](./safety-checks).

## What the model can do

The model clicks, double-clicks, drags, moves the mouse, scrolls, types text, and presses key combos. It can also wait.

- Every action returns a screenshot of the screen.
- The screenshot comes 500 ms after the action. This time lets the page settle.
- `zoom` returns an image of one region at full size.
- `cursor_position` returns the mouse position as text.

To change the delay, set `screenshotDelay` in ms:

```ts
const computer = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
  screenshotDelay: 1000,
})
```

## Order and failures

Actions run one at a time, in the order that the model calls them.

If one action fails, the other actions of that model turn do not run. The model gets this result for each of them:

```text
Not executed: an earlier computer action in this turn failed.
```

The next model turn starts clean. The model sees the error and can try again.

## Model support

- A model with no computer use is a type error at `chat()`.
- The Anthropic adapter picks the newest computer tool version that the model supports. If the model supports no version, the adapter throws an error.
- `openaiText` uses the Responses API, which has the computer tool. The Chat Completions adapters throw an error, because that API has no computer tool.

## Try it

Start the app and send this message:

```text
Open example.com and tell me the title of the page.
```

The model takes a screenshot, reads the page, and answers in the chat. You now have a browser agent.

To control your own machine with no driver package, see [Custom driver](./custom-driver).
