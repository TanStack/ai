---
id: CapabilityContext
title: CapabilityContext
---

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:12

The minimal context shape a capability accessor needs. The full
`ChatMiddlewareContext` satisfies this (it has `capabilities`), so accessors
accept any middleware context without referencing `any`.

## Properties

### capabilities

```ts
capabilities: CapabilityRegistry;
```

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:13
