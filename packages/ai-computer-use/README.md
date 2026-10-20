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

You write the code one time. The same code runs on OpenAI and on Anthropic. A driver controls the machine: a Playwright page, an E2B desktop, or your own.

## Installation

```bash
pnpm add @tanstack/ai-computer-use zod
```

You also need a driver:

```bash
# A browser page
pnpm add @tanstack/ai-computer-playwright

# A Linux desktop in an E2B sandbox
pnpm add @tanstack/ai-computer-e2b
```

## Usage

1. Create the tool, the middleware, and the interrupt from a driver.
2. Give all three to `chat()`:

```typescript
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'

const { tool, middleware, interrupt } = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})

const stream = chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages,
  tools: [tool],
  middleware: [middleware],
  interrupts: [interrupt],
})
```

3. On the client, register the safety-check interrupt:

```typescript
import { computerSafetyCheck } from '@tanstack/ai-computer-use'

useChat({ connection, interrupts: [computerSafetyCheck] })
```

`computerSafetyCheck` is the same object as `interrupt`. The client can import it without the driver.

## What it does

- Every action returns a screenshot. The screenshot comes 500 ms after the action. Set `screenshotDelay` to change it.
- Actions run one at a time, in call order.
- When an action fails, the other actions of the same model turn do not run.
- OpenAI can attach safety checks to an action. The action waits until a person approves it. When the person declines, the action does not run.

## What your application owns

- **The machine.** The driver does not start or stop the browser or the sandbox.
- **One conversation at a time.** Create one `createComputerUse` for each conversation.

## Docs

See [Computer Use](https://tanstack.com/ai/latest/docs/computer-use/computer-use).
