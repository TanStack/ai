---
title: Computer Use Drivers
id: computer-use-drivers
order: 2
description: "Pick the machine that the model uses: a browser page for each thread with Playwright, a full Linux desktop for each thread in a sandbox, or your own computer."
keywords:
  - tanstack ai
  - computer use
  - driver
  - playwrightComputer
  - sandboxComputer
  - localComputer
  - playwright
  - e2b
  - daytona
  - linux desktop
  - sandbox
  - robotjs
  - local desktop
---

A driver is the surface the model controls. Pick a browser, a desktop, or a terminal.

A driver decides which machine the model uses. Change the driver, and the rest of your [computer use](./computer-use) code stays the same.

## Pick a driver

|                       | Playwright                                | Sandbox                                 | Your own computer                          |
| --------------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------------ |
| **Machine**           | A browser page for each thread            | A Linux desktop sandbox for each thread | Your mouse, keyboard, and main screen      |
| **Environment**       | `browser`                                 | `linux`                                 | `windows`, `mac`, or `linux`               |
| **Runs on**           | Your server                               | Any sandbox provider                    | The machine that runs `chat()`             |
| **`navigate` tool**   | Yes                                       | No                                      | No                                         |
| **`zoom`**            | Yes                                       | No                                      | Yes                                        |
| **`cursor_position`** | No                                        | Yes                                     | Yes                                        |
| **Setup**             | `playwright-core`, then download Chromium | A provider and a desktop image          | `@jitsi/robotjs`, and permissions on macOS |

## Playwright

If the task stays inside a web page, use Playwright.

Install the packages:

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

Then give `playwrightComputer()` to `createComputerUse`:

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

Do you already have a Playwright page, for example in a test? See [Share one page](#share-one-page).

## Linux desktop in a sandbox

If the model must use any app on a Linux desktop, use a sandbox. Each thread gets its own desktop, away from your server. The driver works with every [sandbox provider](../sandbox/overview): E2B, Daytona, Docker, and the others.

Install the packages. This example uses E2B:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
vue: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
solid: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
svelte: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
preact: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
angular: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
vanilla: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod
octane: @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b zod

<!-- ::end:tabs -->

Then do these steps:

1. Set `E2B_API_KEY` in your server environment.
2. Give `sandboxComputer()` a provider that makes desktop sandboxes. The E2B `desktop` template is one.

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { sandboxComputer } from '@tanstack/ai-computer-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const computerUse = createComputerUse({
  driver: sandboxComputer({
    provider: e2bSandbox({ template: 'desktop', timeoutMs: 60 * 60_000 }),
  }),
})
```

> [!WARNING]
> Set the provider timeout above `idleTimeout` plus the longest time that one thread stays in use. E2B kills a sandbox at its `timeoutMs`, also when the thread is busy.

`sandboxComputer()` takes these options:

- `provider`: the sandbox provider. It makes one sandbox for each thread.
- `display`: the screen size of each desktop in pixels. The default is 1024 x 768.

How the sandbox driver behaves:

- There is no `navigate` tool, because a desktop has no address. The model opens the browser on the desktop.
- When a thread closes or goes idle, `createComputerUse` destroys its sandbox.
- One scroll step is 100 pixels.
- The driver quotes every key name and all typed text before they go to the shell.

### The sandbox image

The image must have these tools:

- `xdotool` and `xdpyinfo`.
- `scrot`. Without it, the driver takes screenshots with ImageMagick `import`, but they do not show the mouse pointer.

When no X display runs, the driver starts one with `Xvfb`. If the image has `startxfce4`, the driver also starts it.

The E2B `desktop` template has all of these. For Docker, Daytona, and the other providers, use an image with the tools. On Debian or Ubuntu:

```dockerfile
RUN apt-get update && apt-get install -y xvfb xdotool scrot x11-utils
```

If a tool is missing, the driver throws an error with its name.

Do you already have a desktop sandbox? See [Share one sandbox](#share-one-sandbox).

## Your own computer

If the model must use the apps on the machine that runs `chat()`, use `localComputer()`. The model moves your real mouse, presses your real keys, and reads your main screen.

> [!WARNING]
> Watch the model while it uses your computer. It can do what you can do there: read files, send messages, and delete data. If you cannot watch it, use a [sandbox](#linux-desktop-in-a-sandbox) or a VM.

Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
vue: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
solid: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
svelte: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
preact: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
angular: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
vanilla: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod
octane: @tanstack/ai-computer-use @tanstack/ai-computer-local @jitsi/robotjs zod

<!-- ::end:tabs -->

`@jitsi/robotjs` has prebuilt binaries for Windows, macOS, and Linux. If pnpm asks to allow its install script, you can deny it.

Then do these steps:

1. On macOS, open System Settings > Privacy & Security. Give the Accessibility and Screen Recording permissions to the app that runs Node, for example your terminal.
2. On Linux, use an X11 session. Wayland is not supported.
3. Give `localComputer()` to `createComputerUse`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { localComputer } from '@tanstack/ai-computer-local'

const computerUse = createComputerUse({
  driver: localComputer(),
})
```

`localComputer()` takes these options. Both are optional:

- `display`: the size of the screenshots that the model sees. The driver scales each screenshot down to this size, and scales each click up to the screen. The default is your screen size, scaled down to fit in 1280 x 800. Keep the aspect ratio of your screen.
- `robot`: the object that moves the mouse and presses the keys. The default is `@jitsi/robotjs`. A test can give a fake with the same methods.

Your computer is one machine:

- Every thread shares it, so it serves one conversation at a time.
- The model sees only the main screen.
- There is no `navigate` tool. The model opens the browser on your desktop.
- There are no `back` and `forward` mouse buttons.

## Use it in chat

With every driver, `createComputerUse` gives `tools`, `middleware`, and `interrupt`. Give them to `chat()` with the thread id:

```ts
import { chat } from '@tanstack/ai'
import type { ModelMessage } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { sandboxComputer } from '@tanstack/ai-computer-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

declare const messages: Array<ModelMessage>
declare const threadId: string

const computerUse = createComputerUse({
  driver: sandboxComputer({
    provider: e2bSandbox({ template: 'desktop', timeoutMs: 60 * 60_000 }),
  }),
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

The model now uses a browser page or a full Linux desktop for each thread, or your own computer. For a machine that no driver controls, write a [custom driver](./custom-driver).

## Advanced

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

### Share one sandbox

You already have a desktop sandbox. Give it to `createSandboxComputerDriver`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createSandboxComputerDriver } from '@tanstack/ai-computer-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const sandbox = await e2bSandbox({ template: 'desktop' }).create({})

const computerUse = createComputerUse({
  driver: await createSandboxComputerDriver({ sandbox }),
})
```

- Every thread shares this sandbox, so it serves one conversation at a time.
- `createSandboxComputerDriver` is async. It starts the desktop if needed, and reads the screen size one time.

Your app owns this sandbox. `createComputerUse` never destroys it. When you are done, call `await sandbox.destroy()`.

### `zoom` and `cursor_position` on Anthropic

The Anthropic adapter turns on `zoom` and `cursor_position` only on the computer tool versions that have those flags:

- `computer_toolset_20260801` turns on both when the driver has the method.
- `computer_20251124` turns on `zoom` only, and only when the driver has `zoom`.
- `computer_20250124` turns on neither.
