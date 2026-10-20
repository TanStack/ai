---
title: Computer Use Drivers
id: computer-use-drivers
order: 2
description: "Pick the machine that the model uses: a Playwright browser page or a full Linux desktop in an E2B sandbox."
keywords:
  - tanstack ai
  - computer use
  - driver
  - playwright
  - e2b
  - linux desktop
  - sandbox
---

A browser page is not always enough. Sometimes the model must use a desktop app, a file manager, or a terminal. A driver decides which machine the model uses. Change the driver, and the rest of your [computer use](./computer-use) code stays the same.

## Pick a driver

|                     | Playwright                          | E2B                              |
| ------------------- | ----------------------------------- | -------------------------------- |
| **Machine**         | One browser page                    | A full Linux desktop in a sandbox |
| **Environment**     | `browser`                           | `linux`                          |
| **Runs on**         | Your server                         | E2B cloud                        |
| **`zoom`**          | Yes                                 | No                               |
| **`cursor_position`** | No                                | Yes                              |
| **Setup**           | `pnpm add`, then launch a browser   | An E2B API key, then create a sandbox |

When a driver has `zoom` or `cursorPosition`, the Anthropic adapter turns on that action for the model.

## Playwright

If the task stays inside a web page, use Playwright.

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

```ts
import { chromium } from 'playwright'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const { tool, middleware, interrupt } = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})
```

- The page must have a viewport size. If it has none, the driver throws an error.
- The driver reads the viewport size one time, when you create it.
- The `back` and `forward` mouse buttons go back and forward in the page history.
- A page from `playwright-core` or `@playwright/test` also works.

Your app owns the browser. The driver does not launch it or close it.

## E2B

If the model must use any app on a Linux desktop, use E2B. The desktop runs in a sandbox, away from your server.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
vue: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
solid: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
svelte: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
preact: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
angular: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
vanilla: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod
octane: @tanstack/ai-computer-use @tanstack/ai-computer-e2b @e2b/desktop zod

<!-- ::end:tabs -->

1. Set `E2B_API_KEY` in your server environment.
2. Create a desktop sandbox.
3. Pass the sandbox to the driver.

```ts
import { Sandbox } from '@e2b/desktop'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createE2BComputerDriver } from '@tanstack/ai-computer-e2b'

const desktop = await Sandbox.create()

const { tool, middleware, interrupt } = createComputerUse({
  driver: await createE2BComputerDriver({ desktop }),
})
```

- `createE2BComputerDriver` is async. It reads the screen size one time, so call it after the desktop is ready.
- One scroll step is 100 pixels.
- The driver quotes every key name before it goes to the shell.

Your app owns the sandbox. The driver does not create it or kill it. When the conversation ends, call `await desktop.kill()`.

## Use it in chat

Both drivers give the same three values. Pass them to `chat()`:

```ts
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'

const stream = chat({
  adapter: anthropicText('claude-opus-5-5'),
  messages,
  tools: [tool],
  middleware: [middleware],
  interrupts: [interrupt],
})
```

The model now uses a browser page or a full Linux desktop. For a machine that neither driver controls, write a [custom driver](./custom-driver).
