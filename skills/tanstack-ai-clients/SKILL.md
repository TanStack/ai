---
name: tanstack-ai-clients
description: >
  Build a chat or AI UI in React, Next.js, TanStack Start, Vue, Solid, Svelte,
  Preact, Angular, Octane, Remix, or vanilla JS with TanStack AI: the useChat
  hook, streaming into components, prebuilt chat UI, and devtools. Use when
  someone wants to add a chat interface, stream an LLM response into the page,
  show tool calls or generated media in the UI, or asks which framework package
  to install. Triggers on "chat UI", "chatbot component", "useChat", "stream to
  React", "Vue chat", "Solid chat", "Svelte chat", "AI devtools".
---

# TanStack AI client packages

The client is headless state management plus a transport. `@tanstack/ai-client`
holds the logic, and each framework package wraps it in that framework's
reactivity.

**Always import from the framework package.** Import from
`@tanstack/ai-client` only in vanilla JS.

## 1. Pick the package

The UI docs have one page per framework:
https://tanstack.com/ai/latest/docs/ui/react.

| Stack                            | Package                                                |
| -------------------------------- | ------------------------------------------------------ |
| React, Next.js, TanStack Start   | `@tanstack/ai-react`                                   |
| Vue                              | `@tanstack/ai-vue`                                     |
| Solid                            | `@tanstack/ai-solid`                                   |
| Svelte 5                         | `@tanstack/ai-svelte`                                  |
| Preact, Angular, Octane, Remix 3 | `@tanstack/ai-preact`, `-angular`, `-octane`, `-remix` |
| No framework                     | `@tanstack/ai-client`                                  |

Chat UI components ship inside the framework package, for example
`@tanstack/ai-react/ui`. The old `@tanstack/ai-*-ui` packages are deprecated, so
do not install them.

## 2. Read the core skill, not this page, for the API

`useChat` and the message types live in `@tanstack/ai`'s skill:

```bash
npx @tanstack/intent@latest load @tanstack/ai#ai-core/chat-experience
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
