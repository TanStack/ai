---
title: Chat UI recipes
id: ui-recipes
order: 0
description: "Five small React chat UIs that each add one thing: a plain chat box, a formatted tool, an approval, a custom question, and per-request context."
keywords:
  - tanstack ai
  - createChatHook
  - chat ui
  - examples
---

Each recipe is one complete example. Each one adds a single piece to the recipe before it.

If you have not built a chat UI here yet, start with the first one.

1. [A chat box with no tools](./basic-chat): a layout, a message, and a text part.
2. [Make a tool look right](./format-a-tool): one tool that shows progress, never raw JSON.
3. [Ask before a tool runs](./tool-approval): a yes or no gate, next to the tool or in a list.
4. [Ask the user your own question](./custom-interrupt): an interrupt with your own schemas.
5. [Send the current user to the server](./request-context): a tenant or user id on each request, kept out of the prompt.

The code is React. The other framework pages use the same option names and component names. Only the framework syntax changes:

- [Solid](../solid), [Vue](../vue), [Svelte](../svelte)
- [Preact](../preact), [Octane](../octane), [Remix](../remix), [Angular](../angular)

For every widget slot in one table, read [Every widget slot](../react#every-widget-slot).
