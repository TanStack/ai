---
title: Computer Use
id: computer-use
order: 1
description: "Let the model use a web page for the user. It sees screenshots and sends clicks and key presses. Each conversation gets its own browser page, and the same code runs on OpenAI and Anthropic."
keywords:
  - tanstack ai
  - computer use
  - createComputerUse
  - playwrightComputer
  - browser agent
  - playwright
  - openai
  - anthropic
---

You have a chat app. You want the model to do a task on a web page for the user, for example fill in a form or find a price.

Computer use gives the model a screen, a mouse, and a keyboard. The model reads screenshots and sends clicks and key presses. Each conversation gets its own browser page, and the same code runs on OpenAI and on Anthropic.

To build a full app step by step, with the screenshots in the chat, open the [Computer Use tutorial](../tutorials/computer-use).

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod octane

<!-- ::end:tabs -->

Then download Chromium one time:

```bash
npx playwright-core install chromium
```

## 2. Give the model a browser

Create the computer one time, at module scope. Then give its `tools`, `middleware`, and `interrupt` to `chat()`, together with the `threadId` of the request:

```ts
// app/api/chat/route.ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
})

export async function POST(request: Request) {
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
  })
  return toServerSentEventsResponse(stream)
}
```

> [!WARNING]
> Run the browser in a network where it cannot reach private services. The browser can open every address that your server can reach. See [Keep the browser away from private addresses](#keep-the-browser-away-from-private-addresses).

## 3. Register the interrupt on the client

Give `computerSafetyCheck` to `useChat`. It is the same object as `computerUse.interrupt`, and it does not load the driver or Playwright on the client.

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

To show an approval card when a safety check pauses the run, see [Safety checks](./safety-checks).

## 4. Try it

Start the app and send this message:

```text
Go to https://tanstack.com/ai and tell me the title of the page.
```

The model calls `navigate`, reads the screenshot, and answers in the chat. You now have a browser agent.

To use Anthropic, change only the adapter:

```ts
import { anthropicText } from '@tanstack/ai-anthropic'

const adapter = anthropicText('claude-opus-5-5')
```

## How it works

`createComputerUse` gives you three things:

- `tools`: the `computer` tool and the `navigate` tool. With `computer`, the model clicks, types, and takes screenshots. With `navigate`, it opens a URL.
- `middleware`: stops the rest of a turn after a failed action. It also runs the OpenAI safety checks.
- `interrupt`: asks a person to approve an action that has a safety check.

Chromium starts on the first action. Each thread gets a new page on its own first action, and that page opens `startUrl`. After each action, the model gets a new screenshot.

Do you need a full Linux desktop or your own computer, and not a browser page? See [Drivers](./drivers). For a machine that no driver controls, see [Custom driver](./custom-driver).

## Advanced

### One page for each thread

Each `threadId` gets its own machine. With `playwrightComputer()`, the machine is a browser context with one page:

- Each thread has its own cookies and storage.
- Each thread has its own action queue and its own safety-check approvals.
- All threads share one Chromium process.

Give a stable `threadId` to `chat()`. If `chat()` gets no `threadId`, it makes a new id for each request. Then each request gets a new page.

`useChat` sends the same thread id with each request of a chat. `chatParamsFromRequest` reads it, as in the route above.

### Close the pages

Each open page uses memory on your server. When a conversation ends, close the page of its thread. When the server stops, close all pages:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

declare const threadId: string

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
  idleTimeout: 30 * 60_000,
})

// The conversation ended. Close the page of this thread.
await computerUse.close(threadId)

// The server stops. Close every page, then Chromium.
await computerUse.close()
```

A thread that stays idle closes by itself. `idleTimeout` sets this time in ms:

- The default is 10 minutes.
- When the time ends, the page of the thread closes. The next action of that thread opens a new page at `startUrl`.
- `false` keeps every thread open until you call `close`.

### Keep the browser away from private addresses

The browser can open every address that your server can reach. For example, a page can link to an internal admin page or to a cloud metadata URL.

The `navigate` tool accepts only `http:` and `https:` URLs. It does not block private addresses.

To keep the machine off your network, use a [sandbox driver](./drivers#linux-desktop-in-a-sandbox), for example E2B.

### What the model can do

The model clicks, double-clicks, drags, moves the mouse, scrolls, types text, and presses key combos. It can also wait.

- A normal action returns a screenshot 500 ms later, so the page can settle. An OpenAI batch returns one screenshot after the last action.
- `zoom` returns an image of one region. `cursor_position` returns the mouse position as text. Neither takes another screenshot.
- `navigate` opens a URL, then returns a screenshot.

To change the delay, set `screenshotDelay` in ms:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
  screenshotDelay: 1000,
})
```

### Order and failures

In one thread, actions run one at a time, in the order that the model calls them.

- A driver factory, like `playwrightComputer()`, gives each thread its own machine. Those threads can run at the same time.
- A driver that you pass in is one machine. Actions on that machine run one at a time, even from two threads.

If one action fails, the other actions of that model turn do not run. The model gets this result for each of them:

```text
Not executed: an earlier computer action in this turn failed.
```

The next model turn starts clean. The model sees the error and can try again.

### Limits

- **One server process.** The pages live in the memory of one process. If the next request of a thread goes to another server, the thread gets a new page there.
- **Time to approve.** If a person answers a safety check after `idleTimeout`, the page is already closed. The approved action then runs on a new page. Set `idleTimeout` above the time that a person takes to answer.

### Model support

- A model with no computer use is a type error at `chat()`.
- The Anthropic adapter picks the newest computer tool version that the model supports. If the model supports no version, the adapter throws an error.
- `openaiText` uses the Responses API, which has the computer tool. The Chat Completions adapters throw an error, because that API has no computer tool.
