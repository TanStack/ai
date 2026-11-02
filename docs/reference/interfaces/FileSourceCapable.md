---
id: FileSourceCapable
title: FileSourceCapable
---

Defined in: [packages/ai/src/utilities/content-source.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L74)

The slice of an adapter the file-source preflight reads. Adapters that can
consume `{ type: 'file' }` sources declare `supportsFileSources: true`;
everything else — including adapters written before this arm existed —
fails closed at the activity layer instead of falling through to a
URL/data branch and silently mis-mapping the reference.

## Properties

### name

```ts
name: string;
```

Defined in: [packages/ai/src/utilities/content-source.ts:75](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L75)

***

### supportsFileSources?

```ts
optional supportsFileSources?: boolean;
```

Defined in: [packages/ai/src/utilities/content-source.ts:76](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L76)
