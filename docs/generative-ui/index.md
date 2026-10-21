---
title: Generative UI
id: generative-ui
order: 1
description: "Let the model author interactive UI during a chat() run. The host builds, stores, and renders it inline in a sandboxed iframe — a chord diagram, a calculator, a live data monitor."
keywords:
  - tanstack ai
  - generative ui
  - artifacts
  - create_artifact
  - sandboxed iframe
  - react-tsx
  - html-fragment
  - FrameArtifactRenderer
  - live data
---

A chat reply is usually text. Sometimes the real answer is a thing the user touches: a loan calculator they can tweak, a guitar chord they can inspect, a spend monitor that keeps ticking. Describing that in prose is weak. Rendering it is strong.

**`@tanstack/ai-generative-ui`** lets the model author a UI during a `chat()` run. The model calls a tool with the source for a small component. The host builds it, stores it, and renders it inline in a sandboxed iframe, as part of the assistant's message.

```ts ignore
import { chat } from '@tanstack/ai'
import { generativeUiArtifacts } from '@tanstack/ai-generative-ui/artifacts'

const stream = chat({
  adapter,
  messages,
  middleware: [generativeUiArtifacts({ store, builder, registry })],
})
```

> **Experimental.** This package is a prototype of the Open Generative UI design. The API can change between releases.

## The artifact model

An artifact is one stored, versioned UI. The model authors only the source. Everything structural (the iframe shell, the bridge, the theme, the build) is host code, so a security or theme fix reaches every stored artifact without regeneration.

There are two kinds:

- **`html-fragment`** — markup plus an optional `<style>` and `<script>`. Best for hand-tuned figures, like an SVG chord diagram.
- **`react-tsx`** — one TSX module whose default export is a component. It may import only host-approved modules (a React table, a chart library, host UI primitives). The host builds it at write time.

Numbers the model presents as computed come from host data, not from model arithmetic. The model renders what the host gives it.

## How it fits with MCP Apps

Generative UI is built on [MCP Apps](../mcp/apps). An artifact addresses as a `ui://` resource with the `text/html;profile=mcp-app` type, so an external MCP host can render the same UI. In your own app, `html-fragment` artifacts render through the same `MCPAppResource` component that renders external MCP server widgets.

The difference: MCP Apps renders widgets a server already wrote. Generative UI lets the model write the widget during the conversation, and the host stores and serves it.

## Where to go next

- [Artifacts](./artifacts) — give the model the tools, then render the result inline. Both the server and the client side.
- [Live data](./live-data) — bind an artifact to a host data source so the view updates in real time.

The [`examples/generative-ui`](https://github.com/TanStack/ai/tree/main/examples/generative-ui) app is the reference host. It wires the store, the builder, the sandbox serving route, and the chat surface end to end.
