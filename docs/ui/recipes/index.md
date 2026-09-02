---
title: Chat UI recipes
id: ui-recipes
order: 0
description: "Five small React chat UIs, each one thing at a time: a plain chat box, a formatted tool, an approval, a custom interrupt, and per-request context."
keywords:
  - tanstack ai
  - createChatHook
  - chat ui
  - examples
---

Five short examples. Each one adds a single thing to the one before it.

Start with the first if you have not built a chat here yet.

1. [A chat box with no tools](./basic-chat). A layout, a message, and a text part. Nothing else.
2. [Make a tool look right](./format-a-tool). Register one tool and branch on its state, so it never shows raw JSON.
3. [Ask before a tool runs](./tool-approval). Gate a tool behind a yes or no, next to the tool or in a list.
4. [Ask the user your own question](./custom-interrupt). Define an interrupt with your own schemas and render it.
5. [Send the current user to the server](./request-context). Pass a tenant or user id per request, out of the prompt.

The code is React. The [Solid](../solid), [Vue](../vue), and [Svelte](../svelte) guides use the same option groups and the same component names, so each example maps across with only the framework syntax changing.

For the full component map in one place, see the [React guide](../react).
