---
name: tanstack-ai-clients
description: >
  Build the client half of a TanStack AI app: the useChat hook in React, Vue,
  Solid, Svelte, Preact, Angular, Octane, and Remix, the vanilla JS client,
  prebuilt chat UI, and the devtools panels. Use when someone wires a chat UI to
  a server endpoint, asks which framework package to install, streams into a
  component, or wants to inspect messages, tool calls, and streams while
  developing. Triggers on "useChat", "chat UI", "React chat", "Vue chat",
  "Solid chat", "Svelte chat", "streaming component", "devtools".
---

# TanStack AI client packages

The client is headless state management plus a transport. `@tanstack/ai-client`
holds the logic, and each framework package wraps it in that framework's
reactivity.

**Always import from the framework package.** Import from
`@tanstack/ai-client` only in vanilla JS.

## 1. Pick the package

[`packages.md`](./packages.md) lists every client package.

| Stack | Package |
| --- | --- |
| React, Next.js, TanStack Start | `@tanstack/ai-react` |
| Vue | `@tanstack/ai-vue` |
| Solid | `@tanstack/ai-solid` |
| Svelte 5 | `@tanstack/ai-svelte` |
| Preact, Angular, Octane, Remix 3 | `@tanstack/ai-preact`, `-angular`, `-octane`, `-remix` |
| No framework | `@tanstack/ai-client` |

Chat UI components ship inside the framework package, for example
`@tanstack/ai-react/ui`. The old `@tanstack/ai-*-ui` packages are deprecated, so
do not install them.

## 2. Read the core skill, not this page, for the API

`useChat` and the message types live in `@tanstack/ai`'s skill:

```bash
cat node_modules/@tanstack/ai/skills/ai-core/SKILL.md
```

It covers the chat experience end to end, including the server endpoint the
client talks to. Both halves must match, so read both before writing either.

## 3. Add devtools while developing

`@tanstack/ai-devtools-core` plus the framework panel
(`@tanstack/react-ai-devtools`, `@tanstack/solid-ai-devtools`,
`@tanstack/preact-ai-devtools`, `@tanstack/svelte-ai-devtools`) shows messages,
tool calls, streams, and errors. Development only: keep it out of production
builds.

## Common mistakes

- Importing `useChat` from `@tanstack/ai-client` in a framework app.
- Hand-rolling SSE parsing on the client. The transport is built in.
- Installing a deprecated `-ui` package instead of the framework subpath.
