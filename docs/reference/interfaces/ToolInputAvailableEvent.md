---
id: ToolInputAvailableEvent
title: ToolInputAvailableEvent
---

# Interface: ToolInputAvailableEvent

Defined in: [packages/typescript/ai/src/types.ts:1111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1111)

Emitted when a client tool is invoked. The agent loop yields this and
pauses to let the caller run the tool client-side — `structured-output.complete`
will not fire for that run. Shape fixed by `buildClientToolChunks` in
`activities/chat/index.ts`.

## Extends

- `Omit`\<[`CustomEvent`](CustomEvent.md), `"name"` \| `"value"`\>

## Indexable

```ts
[key: string]: unknown
```

```ts
[key: number]: unknown
```

## Properties

### name

```ts
name: "tool-input-available";
```

Defined in: [packages/typescript/ai/src/types.ts:1115](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1115)

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1116)

#### input

```ts
input: unknown;
```

#### toolCallId

```ts
toolCallId: string;
```

#### toolName

```ts
toolName: string;
```
