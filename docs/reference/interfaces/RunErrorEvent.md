---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/typescript/ai/src/types.ts:937](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L937)

Emitted when an error occurs during a run.

@ag-ui/core provides: `message`, `code?`
TanStack AI adds: `model?`, `error?` (deprecated nested form)

## Extends

- `RunErrorEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### ~~error?~~

```ts
optional error: object;
```

Defined in: [packages/typescript/ai/src/types.ts:944](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L944)

#### ~~code?~~

```ts
optional code: string;
```

#### ~~message~~

```ts
message: string;
```

#### Deprecated

Use top-level `message` and `code` fields instead.
Kept for backward compatibility.

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:939](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L939)

Model identifier for multi-model support
