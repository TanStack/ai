---
title: Structured Outputs (Moved)
id: structured-outputs
order: 4
description: "Structured outputs documentation has moved to its own top-level Structured Outputs section, with separate guides for one-shot extraction, streaming UIs, multi-turn chat, and combining with tools."
keywords:
  - tanstack ai
  - structured outputs
  - moved
  - redirect
---

The structured-outputs guide has moved to its own top-level section, split by what you're building. Pick the journey that fits:

- **[Overview](../structured-outputs/overview)** — what structured output is, schema library options, provider support, and "which page do I read?"
- **[One-Shot Extraction](../structured-outputs/one-shot)** — single prompt in, single typed object out. Use this when you don't need streaming or chat history.
- **[Streaming UIs](../structured-outputs/streaming)** — `useChat({ outputSchema })` with `partial` and `final` populating a UI field by field.
- **[Multi-Turn Chat](../structured-outputs/multi-turn)** — every assistant turn carries its own typed `StructuredOutputPart`, history stays renderable, and `messages[i].parts.find(p => p.type === "structured-output").data` is typed by your schema.
- **[With Tools](../structured-outputs/with-tools)** — combining `outputSchema` with the agent loop, including pause/resume for server-tool approvals and client-tool invocations.

> **Note:** This URL is kept for backward compatibility. New content lives under `/structured-outputs/*` — update existing bookmarks when you can.
