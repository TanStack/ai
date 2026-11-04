---
'@tanstack/ai-computer-sandbox': minor
---

The driver passes the signal of each action to `sandbox.process.exec`, so an abort stops the xdotool or screenshot command. `createSandboxComputerDriver({ signal })` stops the setup commands, and `sandboxComputer` passes the `create` signal to it.
