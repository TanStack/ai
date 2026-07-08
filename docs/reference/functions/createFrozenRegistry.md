---
id: createFrozenRegistry
title: createFrozenRegistry
---

# Function: createFrozenRegistry()

```ts
function createFrozenRegistry<TTool>(tools): ToolRegistry<TTool>;
```

Defined in: [packages/ai/src/tool-registry.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L119)

Create a frozen (immutable) tool registry from a tools array.

This is used internally to wrap static `tools` arrays for backward compatibility.
Add and remove operations are no-ops on frozen registries.

## Type Parameters

### TTool

`TTool` *extends* [`AnyTool`](../type-aliases/AnyTool.md) = [`AnyTool`](../type-aliases/AnyTool.md)

## Parameters

### tools

`TTool`[] = `[]`

The static array of tools

## Returns

[`ToolRegistry`](../interfaces/ToolRegistry.md)\<`TTool`\>

A frozen ToolRegistry
