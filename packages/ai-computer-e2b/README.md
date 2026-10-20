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

# @tanstack/ai-computer-e2b

E2B desktop driver for TanStack AI computer use.

Let the model use a Linux desktop in an E2B sandbox. Each thread gets its own sandbox. The model sees screenshots and sends clicks, scrolls, and key presses. The driver runs them on the desktop.

## Installation

```bash
pnpm add @tanstack/ai-computer-e2b @tanstack/ai-computer-use @e2b/desktop
```

## Usage

1. Set `E2B_API_KEY` in your server environment.
2. Create the computer with `e2bComputer()`:

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { e2bComputer } from '@tanstack/ai-computer-e2b'

const computerUse = createComputerUse({
  driver: e2bComputer({ timeoutMs: 60 * 60_000 }),
})
```

3. Give `computerUse.tools`, `middleware`, `interrupt`, and the thread id to `chat()`. The model can now use a desktop.

`e2bComputer()` takes `display` and the options of `Sandbox.create`, like `apiKey`, `timeoutMs`, and `template`. The default `display` is 1024 x 768. When a thread closes or goes idle, `createComputerUse` kills its sandbox.

Set `timeoutMs` above `idleTimeout` plus the longest time that one thread stays in use. E2B kills a sandbox at its `timeoutMs`, also when the thread is busy.

## Share one sandbox

To drive a sandbox that you already have, use `createE2BComputerDriver`. Every thread shares this sandbox, so it serves one conversation at a time.

```typescript
import { Sandbox } from '@e2b/desktop'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createE2BComputerDriver } from '@tanstack/ai-computer-e2b'

const desktop = await Sandbox.create()

const computerUse = createComputerUse({
  driver: await createE2BComputerDriver({ desktop }),
})
```

- The driver accepts any object with the shape of an `@e2b/desktop` `Sandbox`.
- The driver reads the screen size once, when you create it.
- Your app owns this sandbox. `createComputerUse` never kills it. Kill it when you are done.

## What the driver does

- It sends the actions to the desktop through the E2B SDK and `xdotool`.
- It maps `KeyboardEvent.key` names, like `Control` and `Enter`, to `xdotool` names.
- It quotes every key name before it goes to the shell.
- One scroll step is 100 pixels.
- It supports `cursorPosition`. It has no `zoom` and no `navigate`. The model opens the browser on the desktop.

See the [drivers guide](https://tanstack.com/ai/latest/docs/computer-use/drivers) for more.

## Tests

```bash
pnpm --filter @tanstack/ai-computer-e2b test:lib
```
