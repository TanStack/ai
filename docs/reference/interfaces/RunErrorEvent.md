---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/ai/src/types.ts:994](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L994)

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

Defined in: [packages/ai/src/types.ts:1001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1001)

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

Defined in: [packages/ai/src/types.ts:996](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L996)

Model identifier for multi-model support
