---
'@tanstack/ai-computer-use': minor
---

Each `ComputerDriver` action takes an optional `signal`, for example `move(x, y, { signal })` and `click(x, y, { button, count, signal })`. The computer tools pass the abort signal of the tool call to each action. An abort also stops the `wait` and `hold_key` waits and the wait before the screenshot. `keyUp` and `mouseUp` get no signal, so held keys and buttons are released after an abort.
