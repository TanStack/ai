---
'@tanstack/ai-harness-cli': minor
---

The CLI has no UI library now: it does not depend on `ink` or `react`. An interactive terminal uses line mode, which now prints from a session view and opens sign-in links in the browser. `runCli(harness, { ui })` runs your own screen with any TUI library: `ui` gets a ready `createSessionView` view and resolves when the user quits. An Ink screen is in `examples/harness-cli/src/tui.tsx`.
