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

# @tanstack/ai-computer-local

Local computer driver for TanStack AI computer use.

Let the model use the machine that runs `chat()`, on Windows, macOS, or Linux. The model sees screenshots of your main screen. Then it moves your real mouse and presses your real keys.

CAUTION: Watch the model while it uses your computer. It can do what you can do there. If you cannot watch it, use `@tanstack/ai-computer-sandbox` or a VM.

## Installation

```bash
pnpm add @tanstack/ai-computer-local @tanstack/ai-computer-use @jitsi/robotjs
```

`@jitsi/robotjs` has prebuilt binaries for Windows, macOS, and Linux. If pnpm asks to allow its install script, you can deny it.

## Usage

1. On macOS, give the Accessibility and Screen Recording permissions to the app that runs Node.
2. On Linux, use an X11 session. Wayland is not supported.
3. Create the computer with `localComputer()`:

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { localComputer } from '@tanstack/ai-computer-local'

const computerUse = createComputerUse({
  driver: localComputer(),
})
```

4. Give `computerUse.tools`, `middleware`, `interrupt`, and the thread id to `chat()`. The model can now use your computer.

`localComputer()` takes two options:

- `display`: the size of the screenshots that the model sees. The default is your screen size, scaled down to fit in 1280 x 800.
- `robot`: the object that moves the mouse and presses the keys. The default is `@jitsi/robotjs`.

## What the driver does

- It scales each screenshot down to `display`, and each click up to the screen.
- It maps `KeyboardEvent.key` names, like `Control` and `ArrowLeft`, to robotjs names.
- It supports `zoom` and `cursorPosition`. It has no `navigate` and no `back` or `forward` mouse buttons.
- Every thread shares your one computer, so it serves one conversation at a time.

See the [drivers guide](https://tanstack.com/ai/latest/docs/computer-use/drivers#your-own-computer) for more.

## Tests

```bash
pnpm --filter @tanstack/ai-computer-local test:lib
```
