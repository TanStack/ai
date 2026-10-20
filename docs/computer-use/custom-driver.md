---
title: Custom Computer Use Driver
id: computer-use-custom-driver
order: 4
description: "Let the model use your own machine. Write a ComputerDriver with a small set of mouse, keyboard, and screenshot methods."
keywords:
  - tanstack ai
  - computer use
  - ComputerDriver
  - custom driver
  - virtual machine
---

You have your own machine: a VM, a remote desktop, or a device in a lab. No driver package controls it. Write a `ComputerDriver`, and [computer use](./computer-use) runs on it with no other change.

## Write the driver

A driver is an object with a screen size and a small set of methods. This example sends each method to an HTTP agent that runs on the machine.

```ts
// app/my-driver.ts
import type { ComputerDriver } from '@tanstack/ai-computer-use'

const base = 'http://localhost:8000'

async function send(path: string, body: object) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`)
}

export const myDriver: ComputerDriver = {
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
```

Then pass it to `createComputerUse`:

```ts
import { createComputerUse } from '@tanstack/ai-computer-use'
import { myDriver } from './my-driver'

const { tool, middleware, interrupt } = createComputerUse({ driver: myDriver })
```

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

Two methods are optional. When the driver has one, the Anthropic adapter turns on that action for the model.

- `zoom(region)`: returns PNG bytes of one region at full size. The region has `x`, `y`, `width`, and `height`.
- `cursorPosition()`: returns the mouse position as `{ x, y }`.

Add this function to `app/my-driver.ts`. It narrows the JSON from your agent before it returns it:

```ts
async function cursorPosition() {
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

Then add `cursorPosition` to `myDriver`.

## What the core builds for you

Your driver does only the small steps. The core builds the rest from them:

- **Drags**: `move`, `mouseDown`, more `move` calls, then `mouseUp`.
- **Modifier clicks and scrolls**: `keyDown` for each modifier, the action, then `keyUp` in reverse order.
- **`hold_key` and `wait`**: the core holds the keys or waits, then continues.
- **Key names**: the core changes OpenAI and Anthropic key names to `KeyboardEvent.key` names.
- **Screenshots**: after each action, the core waits `screenshotDelay` ms and calls `screenshot()`.

## Try it

Start your agent on the machine, and send a task in the chat. Your agent gets the first `/screenshot` request, then the clicks and the key presses. The model now uses your own machine.
