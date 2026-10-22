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

# @tanstack/ai-computer-sandbox

Sandbox desktop driver for TanStack AI computer use.

Let the model use a Linux desktop in a sandbox. It works with every `@tanstack/ai-sandbox` provider: E2B, Daytona, Docker, and the others. Each thread gets its own sandbox. The model sees screenshots and sends clicks, scrolls, and key presses. The driver runs them on the desktop with `xdotool`.

## Installation

Install the driver and one sandbox provider. This example uses E2B:

```bash
pnpm add @tanstack/ai-computer-sandbox @tanstack/ai-computer-use @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b
```

## Usage

1. Set `E2B_API_KEY` in your server environment.
2. Give `sandboxComputer()` a provider that makes desktop sandboxes:

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { sandboxComputer } from '@tanstack/ai-computer-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const computerUse = createComputerUse({
  driver: sandboxComputer({
    provider: e2bSandbox({ template: 'desktop', timeoutMs: 60 * 60_000 }),
  }),
})
```

3. Give `computerUse.tools`, `middleware`, `interrupt`, and the thread id to `chat()`. The model can now use a desktop.

The default `display` is 1024 x 768. When a thread closes or goes idle, `createComputerUse` destroys its sandbox.

## The sandbox image

The image must have `xdotool`, `xdpyinfo`, and `scrot`. Without `scrot`, the driver takes screenshots with ImageMagick `import`, but they do not show the mouse pointer. When no X display runs on `:0`, the driver also needs `Xvfb` to start one. It starts `startxfce4` too, when the image has it.

- **E2B:** use the `desktop` template. It has all of these.
- **Docker, Daytona, and the others:** use an image with the tools. On Debian or Ubuntu:

```dockerfile
RUN apt-get update && apt-get install -y xvfb xdotool scrot x11-utils
```

When a tool is missing, the driver throws an error with its name.

## Share one sandbox

To drive a sandbox that you already have, use `createSandboxComputerDriver`. Every thread shares this sandbox, so it serves one conversation at a time.

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createSandboxComputerDriver } from '@tanstack/ai-computer-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const sandbox = await e2bSandbox({ template: 'desktop' }).create({})

const computerUse = createComputerUse({
  driver: await createSandboxComputerDriver({ sandbox }),
})
```

- When a display already runs, the driver uses its size.
- Your app owns this sandbox. `createComputerUse` never destroys it. Destroy it when you are done.

## What the driver does

- It sends each action as one shell command through `sandbox.process.exec`.
- It maps `KeyboardEvent.key` names, like `Control` and `Enter`, to `xdotool` names.
- It quotes every key name and all typed text before they go to the shell.
- One scroll step is 100 pixels.
- It supports `cursorPosition`. It has no `zoom` and no `navigate`. The model opens the browser on the desktop.

See the [drivers guide](https://tanstack.com/ai/latest/docs/computer-use/drivers) for more.

## Tests

```bash
pnpm --filter @tanstack/ai-computer-sandbox test:lib
```

To try a real provider, see `testing/computer-sandbox-smoke`.
