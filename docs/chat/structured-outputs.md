---
title: Structured Outputs (Moved)
id: structured-outputs
order: 4
description: "Structured outputs have their own section. Pick the guide for what you build: one-shot extraction, a streaming UI, multi-turn chat, tools, or a harness agent."
keywords:
  - tanstack ai
  - structured outputs
  - moved
  - redirect
---

Structured output returns a typed object from the model. Pick the page for the shape you need:

- **[Overview](../structured-outputs/overview)**: what structured output is, which schema libraries work, provider support, and which page to read.
- **[One-Shot Extraction](../structured-outputs/one-shot)**: one prompt in, one typed object out. Use it when you do not need streaming or chat history.
- **[Streaming UIs](../structured-outputs/streaming)**: `useChat({ outputSchema })` fills a UI field by field with `partial` and `final`.
- **[Multi-Turn Chat](../structured-outputs/multi-turn)**: each completed run adds a typed response to the message history. The `data` of its `structured-output` part has the type of your schema.
- **[With Tools](../structured-outputs/with-tools)**: use `outputSchema` with the agent loop, including server-tool approvals and client tools.

Need a coding agent in a sandbox that reads files and then returns a typed object? See [Harness Agents](../structured-outputs/harnesses).
