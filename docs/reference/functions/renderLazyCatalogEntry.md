---
id: renderLazyCatalogEntry
title: renderLazyCatalogEntry
---

# Function: renderLazyCatalogEntry()

```ts
function renderLazyCatalogEntry(
   name, 
   description, 
   includeDescription): string;
```

Defined in: [packages/ai/src/activities/chat/tools/lazy-tools.ts:22](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/lazy-tools.ts#L22)

Render one entry in a lazy-tool catalog according to `includeDescription`.
- 'none' (default) → bare name (preserves legacy chat behavior)
- 'first-sentence' → `name — <first sentence>`
- 'full' → `name — <full description>`
Falls back to the bare name when there is no description.

## Parameters

### name

`string`

### description

`string`

### includeDescription

`"full"` | `"first-sentence"` | `"none"` | `undefined`

## Returns

`string`
