---
id: createToolRegistry
title: createToolRegistry
---

# Function: createToolRegistry()

```ts
function createToolRegistry<TTool>(initialTools): ToolRegistry<TTool>;
```

Defined in: [packages/ai/src/tool-registry.ts:78](https://github.com/TanStack/ai/blob/main/packages/ai/src/tool-registry.ts#L78)

Create a mutable tool registry for dynamic tool scenarios.

Tools can be added and removed during chat execution, and the
changes will be reflected in subsequent agent loop iterations.

## Type Parameters

### TTool

`TTool` *extends* [`AnyTool`](../type-aliases/AnyTool.md) = [`AnyTool`](../type-aliases/AnyTool.md)

## Parameters

### initialTools

`TTool`[] = `[]`

Optional initial set of tools

## Returns

[`ToolRegistry`](../interfaces/ToolRegistry.md)\<`TTool`\>

A mutable ToolRegistry

## Example

```typescript
const registry = createToolRegistry([toolA, toolB])

const stream = chat({
  adapter,
  messages,
  toolRegistry: registry,
})

// Later, during tool execution:
registry.add(newTool)  // Immediately available to LLM
```
