---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/typescript/ai/src/types.ts:919](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L919)

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

Defined in: [packages/typescript/ai/src/types.ts:926](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L926)

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

Defined in: [packages/typescript/ai/src/types.ts:921](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L921)

Model identifier for multi-model support
