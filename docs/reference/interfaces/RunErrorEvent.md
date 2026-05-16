---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/typescript/ai/src/types.ts:879](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L879)

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

Defined in: [packages/typescript/ai/src/types.ts:886](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L886)

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

Defined in: [packages/typescript/ai/src/types.ts:881](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L881)

Model identifier for multi-model support
