---
title: Computer Use Drivers
id: computer-use-drivers
order: 2
description: "Pick the machine that the model uses: a browser page for each thread with Playwright, or a full Linux desktop for each thread in an E2B sandbox."
keywords:
  - tanstack ai
  - computer use
  - driver
  - playwrightComputer
  - e2bComputer
  - playwright
  - e2b
  - linux desktop
  - sandbox
---

A browser page is not always enough. Sometimes the model must use a desktop app, a file manager, or a terminal. A driver decides which machine the model uses. Change the driver, and the rest of your [computer use](./computer-use) code stays the same.

## Pick a driver

|                       | Playwright                                | E2B                                   |
| --------------------- | ----------------------------------------- | ------------------------------------- |
| **Machine**           | A browser page for each thread            | A Linux desktop sandbox for each thread |
| **Environment**       | `browser`                                 | `linux`                               |
| **Runs on**           | Your server                               | E2B cloud                             |
| **`navigate` tool**   | Yes                                       | No                                    |
| **`zoom`**            | Yes                                       | No                                    |
| **`cursor_position`** | No                                        | Yes                                   |
| **Setup**             | `playwright-core`, then download Chromium | An E2B API key                        |

When a driver has `zoom` or `cursorPosition`, the Anthropic adapter turns on that action for the model.

## Playwright

If the task stays inside a web page, use Playwright.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vue: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
solid: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
svelte: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
preact: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
angular: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vanilla: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
octane: @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod

<!-- ::end:tabs -->

Then download Chromium one time:

```bash
npx playwright-core install chromium
```

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({
    startUrl: 'https://tanstack.com',
    display: { width: 1280, height: 800 },
  }),
})
```

`playwrightComputer()` takes these options. All of them are optional:

- `startUrl`: the URL that each new page opens. Without it, the page stays blank.
- `display`: the viewport of each page in pixels. The default is 1280 x 800.
- `browser`: a Playwright `Browser` that makes the pages. `createComputerUse` never closes it.
- `launch`: the options for `chromium.launch()`. When you give `browser`, the factory ignores them.

Without `browser`, Chromium starts on the first action. `computerUse.close()` closes it.

The `back` and `forward` mouse buttons go back and forward in the page history.

### Share one page

You already have a Playwright page, for example in a test. Give it to `createPlaywrightComputerDriver`. Use the Playwright package that your app already has.

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'
import type { PlaywrightPageLike } from '@tanstack/ai-computer-playwright'

// Your Playwright page. It must have a viewport size.
declare const page: PlaywrightPageLike

const computerUse = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})
```

- Every thread shares this page, so it serves one conversation at a time.
- The page must have a viewport size. If it has none, the driver throws an error.
- The driver reads the viewport size one time, when you create it.
- A page from `playwright`, `playwright-core`, or `@playwright/test` works.

Your app owns this page. `createComputerUse` never closes it.

## E2B

If the model must use any app on a Linux desktop, use E2B. Each thread gets its own desktop in a sandbox, away from your server.

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
2. Give `e2bComputer()` to `createComputerUse`.

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { e2bComputer } from '@tanstack/ai-computer-e2b'

const computerUse = createComputerUse({
  driver: e2bComputer({ timeoutMs: 60 * 60_000 }),
})
```

`e2bComputer()` takes `display` and the options of `Sandbox.create` from `@e2b/desktop`:

- `display`: the screen size of each sandbox in pixels. The default is 1024 x 768.
- `apiKey`: the E2B API key. Without it, E2B reads `E2B_API_KEY`.
- `timeoutMs`: the time in ms after which E2B kills the sandbox.
- `template`: the sandbox template.

CAUTION: Set `timeoutMs` above `idleTimeout` plus the longest time that one thread stays in use. E2B kills a sandbox at its `timeoutMs`, also when the thread is busy.

- There is no `navigate` tool, because a desktop has no address. The model opens the browser on the desktop.
- When a thread closes or goes idle, `createComputerUse` kills its sandbox.
- One scroll step is 100 pixels.
- The driver quotes every key name before it goes to the shell.

### Share one sandbox

You already have a desktop sandbox. Give it to `createE2BComputerDriver`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createE2BComputerDriver } from '@tanstack/ai-computer-e2b'
import type { E2BDesktopLike } from '@tanstack/ai-computer-e2b'

// Your sandbox, from `Sandbox.create()` of `@e2b/desktop`.
declare const desktop: E2BDesktopLike

const computerUse = createComputerUse({
  driver: await createE2BComputerDriver({ desktop }),
})
```

- Every thread shares this sandbox, so it serves one conversation at a time.
- `createE2BComputerDriver` is async. It reads the screen size one time, so call it after the desktop is ready.

Your app owns this sandbox. `createComputerUse` never kills it. When you are done, call `await desktop.kill()`.

## Use it in chat

With every driver, `createComputerUse` gives `tools`, `middleware`, and `interrupt`. Give them to `chat()` with the thread id:

```ts
import { chat } from '@tanstack/ai'
import type { ModelMessage } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { e2bComputer } from '@tanstack/ai-computer-e2b'

declare const messages: Array<ModelMessage>
declare const threadId: string

const computerUse = createComputerUse({
  driver: e2bComputer({ timeoutMs: 60 * 60_000 }),
})

const stream = chat({
  adapter: anthropicText('claude-opus-5-5'),
  messages,
  threadId,
  tools: computerUse.tools,
  middleware: [computerUse.middleware],
  interrupts: [computerUse.interrupt],
})
```

The model now uses a browser page or a full Linux desktop, one for each thread. For a machine that no driver controls, write a [custom driver](./custom-driver).
