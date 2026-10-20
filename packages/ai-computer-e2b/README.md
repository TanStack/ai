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

Let the model use a Linux desktop in an E2B sandbox. The model sees screenshots and sends clicks, scrolls, and key presses. The driver runs them on the desktop.

## Installation

```bash
pnpm add @tanstack/ai-computer-e2b @tanstack/ai-computer-use @e2b/desktop
```

## Usage

1. Set `E2B_API_KEY` in your server environment.
2. Create a desktop sandbox and pass it to the driver:

```typescript
import { Sandbox } from '@e2b/desktop'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createE2BComputerDriver } from '@tanstack/ai-computer-e2b'

const desktop = await Sandbox.create()

const { tool, middleware, interrupt } = createComputerUse({
  driver: await createE2BComputerDriver({ desktop }),
})
```

3. Give `tool`, `middleware`, and `interrupt` to `chat()`. The model can now use the desktop.

The driver accepts any object with the shape of an `@e2b/desktop` `Sandbox`.

## What your application owns

- **The sandbox.** The driver does not create, pause, or kill it. Kill it when you are done.
- **The screen size.** The driver reads it once, when you create the driver.

## What the driver does

- It sends the actions to the desktop through the E2B SDK and `xdotool`.
- It maps `KeyboardEvent.key` names, like `Control` and `Enter`, to `xdotool` names.
- It quotes every key name before it goes to the shell.
- One scroll step is 100 pixels.
- It supports `cursorPosition`. It does not support `zoom`.

See the [drivers guide](https://tanstack.com/ai/latest/docs/computer-use/drivers) for more.

## Tests

```bash
pnpm --filter @tanstack/ai-computer-e2b test:lib
```
