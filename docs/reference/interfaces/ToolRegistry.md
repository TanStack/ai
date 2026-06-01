---
id: ToolRegistry
title: ToolRegistry
---

# Interface: ToolRegistry\<TTool\>

Defined in: [packages/ai/src/tool-registry.ts:9](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L9)

A registry that holds tools and allows dynamic tool management.

The registry can be either mutable (allowing additions/removals during execution)
or frozen (static tool list, for backward compatibility with tools arrays).

## Type Parameters

### TTool

`TTool` *extends* [`AnyTool`](../type-aliases/AnyTool.md) = [`AnyTool`](../type-aliases/AnyTool.md)

## Properties

### add()

```ts
add: (tool) => void;
```

Defined in: [packages/ai/src/tool-registry.ts:22](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L22)

Add a tool to the registry dynamically.
For frozen registries, this is a no-op.

#### Parameters

##### tool

`TTool`

The tool to add

#### Returns

`void`

***

### get()

```ts
get: (name) => TTool | undefined;
```

Defined in: [packages/ai/src/tool-registry.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L46)

Get a tool by name.

#### Parameters

##### name

`string`

The name of the tool to get

#### Returns

`TTool` \| `undefined`

The tool if found, undefined otherwise

***

### getTools()

```ts
getTools: () => TTool[];
```

Defined in: [packages/ai/src/tool-registry.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L14)

Get all current tools in the registry.
Called each agent loop iteration to get the latest tool list.

#### Returns

`TTool`[]

***

### has()

```ts
has: (name) => boolean;
```

Defined in: [packages/ai/src/tool-registry.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L38)

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

Defined in: [packages/ai/src/tool-registry.ts:52](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L52)

Whether this registry is frozen (immutable).
Frozen registries don't allow add/remove operations.

***

### remove()

```ts
remove: (name) => boolean;
```

Defined in: [packages/ai/src/tool-registry.ts:31](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L31)

Remove a tool from the registry by name.
For frozen registries, this always returns false.

#### Parameters

##### name

`string`

The name of the tool to remove

#### Returns

`boolean`

true if the tool was removed, false if not found or frozen
