---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [packages/ai/src/types.ts:1035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1035)

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

Defined in: [packages/ai/src/types.ts:1042](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1042)

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

Defined in: [packages/ai/src/types.ts:1037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1037)

Model identifier for multi-model support
