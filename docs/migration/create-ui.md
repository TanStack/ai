---
title: Chat UI packages
id: migrate-create-ui
order: 5
description: "Move from @tanstack/ai-*-ui to the framework /ui subpath."
keywords:
  - tanstack ai
  - migration
  - deprecation
---

Change your import from `@tanstack/ai-react-ui` to `@tanstack/ai-react/ui`. The same move applies to Solid and Vue.

> **Deprecated.** `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` re-export the new `/ui` subpath until each package's `1.0.0`. `npm install` prints a warning. Import from `/ui` in new code. Svelte never published a `*-ui` package. Use `@tanstack/ai-svelte/ui`.

```diff
- import { Chat, ChatMessages, ChatInput } from '@tanstack/ai-react-ui'
+ import { Chat, ChatMessages, ChatInput } from '@tanstack/ai-react/ui'
```

Nothing else changes. `Chat`, `ChatMessages`, `ChatMessage`, `ChatInput`, `ToolApproval`, `TextPart`, and `ThinkingPart` keep their current props and behaviour on the subpath, and stay supported until `1.0.0`.

`useChat` is not re-exported from the shim. Import it from `@tanstack/ai-react`, or the matching framework package.

## Why

A separate `*-ui` package split chat UI from the framework package. Form uses `createFormHook` on `@tanstack/react-form`. Table uses `createTableHook` on `@tanstack/react-table`. Chat now sits on `@tanstack/ai-react/ui` for the same reason.

## Minimum versions

New imports:

- `@tanstack/ai-react` (next minor) `/ui`
- `@tanstack/ai-solid` (next minor) `/ui`
- `@tanstack/ai-vue` (next minor) `/ui`
- `@tanstack/ai-svelte` (next minor) `/ui`
- `@tanstack/ai-preact` (next minor) `/ui`
- `@tanstack/ai-octane` (next minor) `/ui`
- `@tanstack/ai-angular` (next minor) `/ui`
- `@tanstack/ai-remix` (next minor) `/ui`

Deprecated re-exports, removed in `1.0.0`:

- `@tanstack/ai-react-ui` 0.9.0
- `@tanstack/ai-solid-ui` 0.8.0
- `@tanstack/ai-vue-ui` 0.3.0

## Coexistence

Old `*-ui` packages and new `/ui` imports can live in the same app until `1.0.0`. Do not mix them in one chat tree.

## Typed chat UI

The `/ui` subpath also exports `createChatHook`, a typed headless chat UI that derives tool, part, and interrupt components from your chat options. It is new, not a replacement you need to move to. The components above keep working. See the [React UI guide](../ui/react) for how it fits together, and [Solid](../ui/solid), [Vue](../ui/vue), [Svelte](../ui/svelte), [Preact](../ui/preact), [Octane](../ui/octane), [Remix](../ui/remix), or [Angular](../ui/angular) for the other adapters.
