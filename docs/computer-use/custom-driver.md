---
title: Custom Computer Use Driver
id: computer-use-custom-driver
order: 4
description: "Let the model use your own machine. Write a ComputerDriver with a small set of mouse, keyboard, and screenshot methods, and a ComputerDriverFactory to give each thread its own machine."
keywords:
  - tanstack ai
  - computer use
  - ComputerDriver
  - ComputerDriverFactory
  - custom driver
  - virtual machine
---

You have your own machine: a VM, a remote desktop, or a device in a lab. No driver package controls it. Write a `ComputerDriver`, and [computer use](./computer-use) runs on it with no other change.

## Write the driver

A driver is an object with a screen size and a small set of methods. This example sends each method to an HTTP agent that runs on the machine.

```ts
// app/my-driver.ts
import type { ComputerDriver } from '@tanstack/ai-computer-use'

export function createMyDriver(base: string) {
  async function send(path: string, body: object) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
  }

  const driver: ComputerDriver = {
    display: { width: 1920, height: 1080 },
    environment: 'windows',
    async screenshot() {
      const response = await fetch(`${base}/screenshot`)
      if (!response.ok) throw new Error(`/screenshot failed: ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    },
    click: (x, y, { button, count }) => send('/click', { x, y, button, count }),
    move: (x, y) => send('/move', { x, y }),
    mouseDown: (button) => send('/mouse-down', { button }),
    mouseUp: (button) => send('/mouse-up', { button }),
    scroll: (x, y, deltaX, deltaY) => send('/scroll', { x, y, deltaX, deltaY }),
    keyDown: (key) => send('/key-down', { key }),
    keyUp: (key) => send('/key-up', { key }),
    press: (keys) => send('/press', { keys }),
    type: (text) => send('/type', { text }),
  }
  return driver
}
```

Then give it to `createComputerUse`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import type { ComputerDriver } from '@tanstack/ai-computer-use'

// From app/my-driver.ts above.
declare function createMyDriver(base: string): ComputerDriver

const computerUse = createComputerUse({
  driver: createMyDriver('http://localhost:8000'),
})
```

A driver is one machine. Every thread shares it, so it serves one conversation at a time. `createComputerUse` never closes it. To give each thread its own machine, write a [driver factory](#one-machine-for-each-thread).

## The contract

Coordinates are in pixels, in `display` space. Key names are `KeyboardEvent.key` names, for example `'Enter'`, `'Control'`, or `'a'`.

| Member | What it does |
| --- | --- |
| `display` | The screen size in pixels. Screenshots have this size. |
| `environment` | `'browser'`, `'linux'`, `'mac'`, or `'windows'`. |
| `screenshot()` | Returns PNG bytes as a `Uint8Array`. |
| `click(x, y, { button, count })` | Clicks `count` times. `button` is `left`, `right`, `middle`, `back`, or `forward`. |
| `move(x, y)` | Moves the mouse. |
| `mouseDown(button)`, `mouseUp(button)` | Presses or releases a button at the mouse position. |
| `scroll(x, y, deltaX, deltaY)` | Scrolls at the point. The deltas are in pixels. |
| `keyDown(key)`, `keyUp(key)` | Presses or releases one key. |
| `press(keys)` | Presses one combo, like `['Control', 's']`. |
| `type(text)` | Types text as a user does. |

## Add the optional methods

Four methods are optional:

- `zoom(region)`: returns PNG bytes of one region at full size. The region has `x`, `y`, `width`, and `height`. `computer_toolset_20260801` and `computer_20251124` turn on `zoom` when the driver has this method. `computer_20250124` does not.
- `cursorPosition()`: returns the mouse position as `{ x, y }`. Only `computer_toolset_20260801` turns on `cursor_position`, and only when the driver has this method.
- `navigate(url)`: opens the URL. `computerUse.tools` then has the `navigate` tool. The tool accepts only `http:` and `https:` URLs.
- `close()`: frees the machine. `createComputerUse` calls it only on a driver that a factory made.

Add this function to `app/my-driver.ts`. It narrows the JSON from your agent before it returns it:

```ts
export async function readCursorPosition(base: string) {
  const response = await fetch(`${base}/cursor`)
  const data: unknown = await response.json()
  const isPoint =
    typeof data === 'object' &&
    data !== null &&
    'x' in data &&
    'y' in data &&
    typeof data.x === 'number' &&
    typeof data.y === 'number'
  if (!isPoint) throw new Error('The agent sent no cursor position.')
  return { x: data.x, y: data.y }
}
```

Then add `cursorPosition: () => readCursorPosition(base)` to `driver` in `createMyDriver`.

## One machine for each thread

One shared machine serves one conversation at a time. To give each thread its own machine, write a `ComputerDriverFactory`. `createComputerUse` calls `create` on the first action of each thread.

This example asks a pool service for one VM for each thread, and stops the VM when the thread closes:

```ts
// app/my-machines.ts
import type {
  ComputerDriver,
  ComputerDriverFactory,
} from '@tanstack/ai-computer-use'

// From app/my-driver.ts above.
declare function createMyDriver(base: string): ComputerDriver

const pool = 'http://localhost:9000'

export const myMachines: ComputerDriverFactory = {
  display: { width: 1920, height: 1080 },
  environment: 'windows',
  capabilities: { zoom: false, cursorPosition: false, navigate: false },
  async create({ threadId }) {
    const machine = `${pool}/machines/${encodeURIComponent(threadId)}`
    const response = await fetch(machine, { method: 'PUT' })
    if (!response.ok) throw new Error(`Start failed: ${response.status}`)
    return {
      ...createMyDriver(`${machine}/agent`),
      close: async () => {
        await fetch(machine, { method: 'DELETE' })
      },
    }
  },
}
```

Then give the factory to `createComputerUse`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import type { ComputerDriverFactory } from '@tanstack/ai-computer-use'

// From app/my-machines.ts above.
declare const myMachines: ComputerDriverFactory

const computerUse = createComputerUse({ driver: myMachines })
```

The factory has these members:

| Member | What it does |
| --- | --- |
| `display` | The screen size of every machine. Each driver from `create` has this `display`. |
| `environment` | The kind of every machine. |
| `capabilities` | `{ zoom, cursorPosition, navigate }`: the optional methods that every driver from `create` has. The tool is built before any machine exists, so the factory tells it. |
| `create({ threadId })` | Makes the driver of one thread. If it throws, the model gets the error. The next model turn calls `create` again. |
| `close()` | Optional. Frees what the threads share. `computerUse.close()` calls it after it closes every thread. |

When a thread closes or goes idle, `createComputerUse` calls `close()` on the driver of that thread.

## What the core builds for you

Your driver does only the small steps. The core builds the rest from them:

- **Drags**: `move`, `mouseDown`, more `move` calls, then `mouseUp`.
- **Modifier clicks and scrolls**: `keyDown` for each modifier, the action, then `keyUp` in reverse order.
- **`hold_key` and `wait`**: the core holds the keys or waits, then continues.
- **Key names**: the core changes OpenAI and Anthropic key names to `KeyboardEvent.key` names.
- **Screenshots**: after a normal action, the core waits `screenshotDelay` ms and calls `screenshot()`. An OpenAI batch waits once, after the last action, then takes one screenshot. `zoom` and `cursor_position` return their own result. The core does not call `screenshot()` for those two.

## Try it

Start your agent on the machine, and send a task in the chat. Your agent gets the first `/screenshot` request, then the clicks and the key presses. The model now uses your own machine.
