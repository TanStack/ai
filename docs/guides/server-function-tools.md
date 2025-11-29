# Server Function Tools (TanStack Start)

`createServerFnTool` is a **TanStack Start-specific** helper that creates a tool definition, server implementation, and callable server function from a single definition.

**Note:** This feature requires **TanStack Start** (React Start or Solid Start). The base TanStack AI library works with any framework using `toolDefinition()` and `.server()`.

## Why This Exists

When using TanStack Start, you often need the same server logic in two places:

```typescript
// ❌ Duplicate logic (without createServerFnTool)
// For AI tool
const getProductsDef = toolDefinition({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProductsServer = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

// For direct server function calls from components
export const fetchProducts = createServerFn({ method: 'POST' })
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data }) => {
    return await db.products.search(data.query) // Same logic!
  })
```

With `createServerFnTool`, **define once and get all three**:

```typescript
// ✅ Single definition (TanStack Start)
const getProducts = createServerFnTool({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
  execute: async ({ query }) => db.products.search(query),
})

// Use in AI chat: getProducts.server
// Call from components: await getProducts.serverFn({ query: 'laptop' })
// Client execution: getProducts.toolDefinition
```

## TanStack AI Without TanStack Start

If you're **not** using TanStack Start, just use the regular `toolDefinition()` API:

```typescript
import { toolDefinition } from '@tanstack/ai'

// Works with Next.js, Express, Remix, any framework
const getProductsDef = toolDefinition({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

// Use in AI chat
chat({ tools: [getProducts] })

// For direct calls, create your own API endpoint
// (No server function needed)
```

## Installation

Available in both `@tanstack/ai-react` and `@tanstack/ai-solid`.

## Basic Usage

```typescript
import { createServerFnTool } from '@tanstack/ai-react' // or '@tanstack/ai-solid'
import { z } from 'zod'

const getGuitarsTool = createServerFnTool({
  name: 'getGuitars',
  description: 'Get all guitars from the database',
  inputSchema: z.object({
    style: z.string().optional(),
    priceRange: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    brand: z.string(),
    price: z.number(),
    style: z.string(),
  })),
  execute: async ({ style, priceRange }) => {
    // This runs on the server
    return await db.guitars.findMany({
      where: {
        ...(style && { style }),
        ...(priceRange && {
          price: {
            gte: priceRange.min,
            lte: priceRange.max,
          },
        }),
      },
    })
  },
})
```

## What You Get

`createServerFnTool` returns an object with three properties:

### 1. `toolDefinition`

The base tool definition (for client-side execution):

```typescript
// In your API route
chat({
  adapter: openai(),
  messages,
  tools: [getGuitarsTool.toolDefinition], // Client will execute
})
```

### 2. `server`

The server tool implementation (for server-side execution):

```typescript
// In your API route
chat({
  adapter: openai(),
  messages,
  tools: [getGuitarsTool.server], // Server will execute
})
```

### 3. `serverFn`

A callable server function with automatic Zod validation:

```typescript
// In your React/Solid component
function GuitarList() {
  const [guitars, setGuitars] = useState([])
  
  const loadGuitars = async () => {
    // Call directly with full type safety!
    const result = await getGuitarsTool.serverFn({
      style: 'acoustic',
      priceRange: { min: 500, max: 2000 },
    })
    setGuitars(result)
  }
  
  return (
    <div>
      <button onClick={loadGuitars}>Load Guitars</button>
      {/* Render guitars */}
    </div>
  )
}
```

## Complete Example

```typescript
// lib/guitar-tools.ts
import { createServerFnTool } from '@tanstack/ai-react'
import { z } from 'zod'
import { db } from './db'

export const getGuitarsTool = createServerFnTool({
  name: 'getGuitars',
  description: 'Search for guitars in the catalog',
  inputSchema: z.object({
    query: z.string().optional(),
    maxPrice: z.number().optional(),
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })),
  execute: async ({ query, maxPrice }) => {
    return await db.guitars.findMany({
      where: {
        ...(query && {
          name: { contains: query, mode: 'insensitive' },
        }),
        ...(maxPrice && {
          price: { lte: maxPrice },
        }),
      },
    })
  },
})

export const createOrderTool = createServerFnTool({
  name: 'createOrder',
  description: 'Create a new order for a guitar',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    orderId: z.string(),
    total: z.number(),
  }),
  needsApproval: true, // Requires user approval
  execute: async ({ guitarId, quantity }) => {
    const guitar = await db.guitars.findUnique({ where: { id: guitarId } })
    const order = await db.orders.create({
      data: { guitarId, quantity },
    })
    return {
      orderId: order.id,
      total: guitar.price * quantity,
    }
  },
})

// api/chat/route.ts
import { chat, toStreamResponse } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'
import { getGuitarsTool, createOrderTool } from '@/lib/guitar-tools'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openai(),
    messages,
    model: 'gpt-4o',
    tools: [
      getGuitarsTool.server,    // AI can search guitars
      createOrderTool.server,   // AI can create orders (with approval)
    ],
  })

  return toStreamResponse(stream)
}

// components/GuitarSearch.tsx
import { getGuitarsTool } from '@/lib/guitar-tools'
import { useState } from 'react'

function GuitarSearch() {
  const [guitars, setGuitars] = useState([])
  const [loading, setLoading] = useState(false)

  const searchGuitars = async (query: string) => {
    setLoading(true)
    try {
      // Call server function directly - fully typed!
      const results = await getGuitarsTool.serverFn({
        query,
        maxPrice: 2000,
      })
      setGuitars(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        type="text"
        onChange={(e) => searchGuitars(e.target.value)}
        placeholder="Search guitars..."
      />
      {loading && <div>Loading...</div>}
      {guitars.map((guitar) => (
        <div key={guitar.id}>
          {guitar.name} - ${guitar.price}
        </div>
      ))}
    </div>
  )
}
```

## Benefits

### 1. **Single Definition**
Define your tool schema and execution logic once, use it in multiple ways.

### 2. **Full Type Safety**
Zod schemas provide end-to-end type safety from server to client.

### 3. **Automatic Validation**
Input arguments are automatically validated against the Zod schema.

### 4. **Code Reuse**
Share the same logic between AI tools and regular server functions.

### 5. **Flexibility**
Choose whether to execute tools server-side (via AI) or call them directly from components.

## Type Safety Example

```typescript
const guitarTool = createServerFnTool({
  name: 'getGuitar',
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  }),
  execute: async ({ id }) => {
    return await db.guitars.findUnique({ where: { id } })
  },
})

// ✅ Fully typed!
const guitar = await guitarTool.serverFn({ id: '123' })
//    ^ { id: string, name: string, price: number }

// ❌ Type error - missing required field
const guitar = await guitarTool.serverFn({})

// ❌ Type error - wrong type
const guitar = await guitarTool.serverFn({ id: 123 })
```

## With Approval Flow

```typescript
const purchaseTool = createServerFnTool({
  name: 'purchaseGuitar',
  description: 'Purchase a guitar',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    orderId: z.string(),
    total: z.number(),
  }),
  needsApproval: true, // Requires user approval when used in AI chat
  execute: async ({ guitarId, quantity }) => {
    const guitar = await db.guitars.findUnique({ where: { id: guitarId } })
    const order = await db.orders.create({
      data: { guitarId, quantity, total: guitar.price * quantity },
    })
    return {
      orderId: order.id,
      total: order.total,
    }
  },
})

// In AI chat - requires approval
chat({ tools: [purchaseTool.server] })

// Direct call - no approval needed
const order = await purchaseTool.serverFn({
  guitarId: '123',
  quantity: 2,
})
```

## Comparison: Standard vs TanStack Start Integration

### Standard Approach (Any Framework)

```typescript
import { toolDefinition } from '@tanstack/ai'

// Works with Next.js, Express, Remix, any framework
const getProductsDef = toolDefinition({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
})

const getProducts = getProductsDef.server(async ({ query }) => {
  return await db.products.search(query)
})

// Use in AI chat
chat({ tools: [getProducts] })

// For component calls, create a separate API endpoint
// app/api/products/route.ts
export async function POST(request: Request) {
  const { query } = await request.json()
  return Response.json(await db.products.search(query))
}

// Then call from component
const response = await fetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({ query: 'laptop' }),
})
const products = await response.json()
```

### With TanStack Start (Bonus Features!)

```typescript
import { createServerFnTool } from '@tanstack/ai-react'

// ✅ Single definition - get AI tool AND server function!
const getProducts = createServerFnTool({
  name: 'getProducts',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), name: z.string() })),
  execute: async ({ query }) => db.products.search(query),
})

// Use in AI chat
chat({ tools: [getProducts.server] })

// Call directly from components - fully typed, no API endpoint needed!
const products = await getProducts.serverFn({ query: 'laptop' })
```

**TanStack Start Benefits:**
- ✅ **No duplicate logic** - Write once, use as both AI tool AND server function
- ✅ **No extra API endpoints** - Call server functions directly from components
- ✅ **Full type safety** - Zod types flow everywhere
- ✅ **Automatic validation** - Input validation built-in
- ✅ **Better DX** - Less boilerplate, more features

**Remember:** The base TanStack AI library (with `toolDefinition()` and `.server()`) works with **any** framework. `createServerFnTool` is an optional enhancement for TanStack Start users.

## Best Practices

1. **Define schemas once** - Keep tool definitions in a shared location
2. **Use outputSchema** - Ensures consistent response types
3. **Handle errors in execute** - Return error states in your output schema
4. **Keep execute functions pure** - Avoid side effects outside the function
5. **Use TypeScript** - Let Zod infer types for maximum safety

## Next Steps

- [Tools Overview](./tools.md) - Learn about the isomorphic tool system
- [Server Tools](./server-tools.md) - Deep dive into server-side tools
- [Client Tools](./client-tools.md) - Deep dive into client-side tools
- [Tool Approval Flow](./tool-approval.md) - Implementing approval workflows
