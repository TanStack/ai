---
id: LazyToolsConfig
title: LazyToolsConfig
---

# Interface: LazyToolsConfig

Defined in: [packages/ai/src/types.ts:671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L671)

Configuration for the lazy-tool discovery catalog, shared by chat() and
Code Mode. Optional in both — lazy behavior is triggered purely by tools
marked `lazy: true`; this only tunes how much of each lazy tool's
description appears in the pre-discovery catalog. The post-discovery payload
always returns the full description + schema.

## Properties

### includeDescription?

```ts
optional includeDescription: "full" | "first-sentence" | "none";
```

Defined in: [packages/ai/src/types.ts:677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L677)

How much of each lazy tool's description appears in the pre-discovery
catalog (the names list shown before the model discovers the tool).

#### Default

```ts
'none'
```
