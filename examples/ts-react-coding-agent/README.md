# TanStack AI — Coding Agent Example

A React (TanStack Start) app that drives a **coding-agent harness** through
TanStack AI — currently [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
via `@tanstack/ai-claude-code`, with the agent registry structured so future
harness adapters (Codex, Gemini CLI, ...) can slot in.

Unlike a normal chat example, the agent here runs its own loop server-side
and executes its own tools — reading, searching, and (in Edit mode) editing
the files in `workspace/`. Its tool activity streams into the UI as a
timeline of resolved tool calls.

## What it demonstrates

- **Session resume** — the server emits the harness session id via a
  `claude-code.session-id` custom event; the client pins it and sends it
  back through `forwardedProps` → `modelOptions.sessionId`, so follow-ups
  continue the same stateful session.
- **Harness tool timeline** — built-in tools (Read, Grep, Edit, ...) arrive
  as already-resolved tool-call parts and render with their inputs/outputs.
- **Permission modes** — a Read-only/Edit toggle maps to `disallowedTools`
  vs `permissionMode: 'acceptEdits'`. Shell commands are denied by the
  adapter's default permission policy either way — ask it to run something
  and watch the denial show up in the timeline.
- **Tool bridging** — `lookup_style_guide` is an ordinary TanStack server
  tool the harness calls from inside its own loop.
- **Sandboxed cwd** — the agent only works inside `workspace/`.

## Running

This is a server-spawning example: each chat turn launches the Claude Code
runtime as a subprocess on your machine.

1. Auth: set `ANTHROPIC_API_KEY`, or have a local Claude Code login
   (`claude login`).
2. From this directory:

   ```bash
   pnpm install
   pnpm dev
   ```

3. Open http://localhost:3000 and try:
   - "What files are in this project, and what do they do?" (Read-only)
   - Switch to **Edit mode**: "Fix the bug in temperature.js" — note it
     calls `lookup_style_guide` first.
   - "Now update todo.md to check off what you did" — same session, no
     re-explaining.

Reset the demo workspace afterwards with `git checkout -- workspace/`.
