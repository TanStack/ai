<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-computer-use

Computer use for TanStack AI. The model sees a screen and uses a mouse and a keyboard.

You write the code one time. The same code runs on OpenAI and on Anthropic. A driver controls the machine: a Playwright browser, a Linux desktop in a sandbox, or your own. A driver factory gives each thread its own machine. A driver that you pass in is one machine.

## Installation

```bash
pnpm add @tanstack/ai-computer-use zod
```

You also need a driver:

```bash
# A browser page for each thread
pnpm add @tanstack/ai-computer-playwright playwright-core
npx playwright-core install chromium

# A Linux desktop in a sandbox for each thread (E2B, Daytona, Docker, ...)
pnpm add @tanstack/ai-computer-sandbox @tanstack/ai-sandbox-e2b
```

## Usage

1. Create the computer from a driver, one time, at module scope.
2. Give `tools`, `middleware`, `interrupt`, and the thread id to `chat()`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  threadId, // the thread id of the client
  tools: computerUse.tools,
  middleware: [computerUse.middleware],
  interrupts: [computerUse.interrupt],
})
```

3. On the client, register the safety-check interrupt:

```typescript
import { computerSafetyCheck } from '@tanstack/ai-computer-use'

useChat({ connection, interrupts: [computerSafetyCheck] })
```

`computerSafetyCheck` is the same object as `interrupt`. The client can import it without the driver.

4. When a conversation ends, close its machine:

```typescript
await computerUse.close(threadId) // the machine of one thread
await computerUse.close() // every thread, then the browser
```

## What it does

- In one thread, actions run one at a time, in call order.
- A driver factory gives each `threadId` its own machine and action queue.
- A driver that you pass in is one machine. Its actions run one at a time, across all threads.
- Safety-check approvals belong to one thread.
- `tools` is `[computer]`. When the driver can navigate, it is `[computer, navigate]`. `navigate` opens only `http:` and `https:` URLs.
- A normal action returns a screenshot 500 ms later. Set `screenshotDelay` to change that wait.
- An OpenAI batch returns one screenshot, after the last action.
- `zoom` returns a region image, and `cursor_position` returns text. Neither takes another screenshot.
- When an action fails, the other actions of the same model turn do not run.
- OpenAI can attach safety checks to an action. The action waits until a person approves it. When the person declines, the action does not run.

## What your application owns

- **A stable thread id.** If `chat()` gets no `threadId`, each request gets a new thread. A driver factory then makes a new machine for that thread.
- **The idle time.** A thread that stays idle for `idleTimeout` closes. The default is 10 minutes. `false` keeps every thread until `close`.
- **One server process.** The machines live in the memory of one process.
- **The network.** The browser can open every address that your server can reach. Run it where that is safe.
- **A driver you pass in.** `createComputerUse` never closes it.

## Docs

See [Computer Use](https://tanstack.com/ai/latest/docs/computer-use/computer-use).
