---
id: ToolRegistry
title: ToolRegistry
---

# Interface: ToolRegistry

Defined in: [packages/typescript/ai/src/tool-registry.ts:9](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L9)

A registry that holds tools and allows dynamic tool management.

The registry can be either mutable (allowing additions/removals during execution)
or frozen (static tool list, for backward compatibility with tools arrays).

## Properties

### add()

```ts
add: (tool) => void;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:22](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L22)

Add a tool to the registry dynamically.
For frozen registries, this is a no-op.

#### Parameters

##### tool

[`Tool`](Tool.md)

The tool to add

#### Returns

`void`

***

### get()

```ts
get: (name) => 
  | Tool<SchemaInput, SchemaInput, string>
  | undefined;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L46)

Get a tool by name.

#### Parameters

##### name

`string`

The name of the tool to get

#### Returns

  \| [`Tool`](Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>
  \| `undefined`

The tool if found, undefined otherwise

***

### getTools()

```ts
getTools: () => readonly Tool<SchemaInput, SchemaInput, string>[];
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L14)

Get all current tools in the registry.
Called each agent loop iteration to get the latest tool list.

#### Returns

readonly [`Tool`](Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[]

***

### has()

```ts
has: (name) => boolean;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L38)

Check if a tool exists in the registry.

#### Parameters

##### name

`string`

The name of the tool to check

#### Returns

`boolean`

***

### isFrozen

```ts
readonly isFrozen: boolean;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L52)

Whether this registry is frozen (immutable).
Frozen registries don't allow add/remove operations.

***

### remove()

```ts
remove: (name) => boolean;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:31](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L31)

Remove a tool from the registry by name.
For frozen registries, this always returns false.

#### Parameters

##### name

`string`

The name of the tool to remove

#### Returns

`boolean`

true if the tool was removed, false if not found or frozen
