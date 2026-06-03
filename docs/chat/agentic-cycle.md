---
title: Agentic Cycle
id: agentic-cycle
order: 1
description: "The agentic cycle in TanStack AI — how the LLM loops through tool calls, results, and reasoning until it produces a final answer."
keywords:
  - tanstack ai
  - agentic cycle
  - agent loop
  - tool calling
  - multi-step reasoning
  - ai agents
---

The agentic cycle is the pattern where the LLM repeatedly calls tools, receives results, and continues reasoning until it can provide a final answer. This enables complex multi-step operations.

> **Tip:** Code Mode can reduce agent loop iterations by letting the LLM write a program that calls multiple tools in a single execution. See [Code Mode](../code-mode/code-mode).

```mermaid
graph TD
    A[User sends message] --> B[LLM analyzes request]
    B --> C{Does task need tools?}
    C -->|No| D[Generate text response]
    C -->|Yes| E[Call appropriate tool]
    E --> F{Where does<br/>tool execute?}
    F -->|Server| G[Execute on server]
    F -->|Client| H[Execute on client]
    G --> I[Tool returns result]
    H --> I
    I --> J[Add result to conversation]
    J --> K[LLM analyzes result]
    K --> L{Task complete?}
    L -->|No| E
    L -->|Yes| D
    D --> M[Stream response to user]
    M --> N[Done]
    
    style E fill:#e1f5ff
    style G fill:#ffe1e1
    style H fill:#ffe1e1
    style L fill:#fff4e1
```

### Detailed Agentic Flow

```mermaid
sequenceDiagram
    participant User
    participant Client
    participant Server
    participant LLM
    participant Tools
    
    User->>Client: "What's the weather in SF and LA?"
    Client->>Server: Send message
    Server->>LLM: Message + tool definitions
    
    Note over LLM: Cycle 1: Call first tool
    
    LLM->>Server: tool_call: get_weather(SF)
    Server->>Tools: Execute get_weather
    Tools-->>Server: {temp: 65, conditions: "sunny"}
    Server->>LLM: tool_result
    
    Note over LLM: Cycle 2: Call second tool
    
    LLM->>Server: tool_call: get_weather(LA)
    Server->>Tools: Execute get_weather
    Tools-->>Server: {temp: 75, conditions: "clear"}
    Server->>LLM: tool_result
    
    Note over LLM: Cycle 3: Generate answer
    
    LLM-->>Server: content: "SF is 65°F..."
    Server-->>Client: Stream response
    Client->>User: Display answer
```

### Multi-Step Example

Here's a real-world example of the agentic cycle:

**User**: "Find me flights to Paris under $500 and book the cheapest one"

**Cycle 1**: LLM calls `searchFlights({destination: "Paris", maxPrice: 500})`
- Tool returns: `[{id: "F1", price: 450}, {id: "F2", price: 480}]`

**Cycle 2**: LLM analyzes results and calls `bookFlight({flightId: "F1"})`
- Tool requires approval (sensitive operation) — see [Tool Approval](../tools/tool-approval)
- User approves
- Tool returns: `{bookingId: "B123", confirmed: true}`

**Cycle 3**: LLM generates final response
- "I found 2 flights under $500. I've booked the cheapest one (Flight F1) for $450. Your booking ID is B123."

### Code Example: Agentic Weather Assistant

```typescript
import { chat, toolDefinition, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { z } from "zod";

// Tool definitions
const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get current weather for a city",
  inputSchema: z.object({
    city: z.string(),
  }),
});

const getClothingAdviceDef = toolDefinition({
  name: "get_clothing_advice",
  description: "Get clothing recommendations based on weather",
  inputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
});

// Server implementations
const getWeather = getWeatherDef.server(async ({ city }) => {
  const response = await fetch(`https://api.weather.com/v1/${city}`);
  return await response.json();
});

const getClothingAdvice = getClothingAdviceDef.server(async ({ temperature, conditions }) => {
  // Business logic for clothing recommendations
  if (temperature < 50) {
    return { recommendation: "Wear a warm jacket" };
  }
  return { recommendation: "Light clothing is fine" };
});

// Server route
export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: [getWeather, getClothingAdvice],
  });

  return toServerSentEventsResponse(stream);
}
```

**User**: "What should I wear in San Francisco today?"

**Agentic Cycle**:
1. LLM calls `get_weather({city: "San Francisco"})` → Returns `{temp: 62, conditions: "cloudy"}`
2. LLM calls `get_clothing_advice({temperature: 62, conditions: "cloudy"})` → Returns `{recommendation: "Light jacket recommended"}`
3. LLM generates: "The weather in San Francisco is 62°F and cloudy. I recommend wearing a light jacket."

The loop continues only while the model's finish reason is `tool_calls` (with pending tool calls) **and** the agent loop strategy permits another iteration; it ends as soon as the model returns a normal `stop` finish reason.

### Controlling the loop

By default the loop is bounded by `maxIterations(5)` — after five iterations it stops even if the model would keep calling tools. Override this with the `agentLoopStrategy` option:

```typescript
import { chat } from "@tanstack/ai";
import { maxIterations } from "@tanstack/ai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [getWeather, getClothingAdvice],
  agentLoopStrategy: maxIterations(3), // default is 5
});
```

Other built-in strategies:

- **`untilFinishReason([...])`** — continue until the model returns one of the given finish reasons (e.g. `untilFinishReason(["stop", "length"])`).
- **`combineStrategies([...])`** — combine multiple strategies with AND logic; the loop continues only while every strategy agrees.

A strategy is just a function that receives `{ iterationCount, finishReason, messages }` and returns `true` to allow another iteration or `false` to stop, so you can also write your own:

```typescript
const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages,
  tools: [getWeather, getClothingAdvice],
  agentLoopStrategy: combineStrategies([
    maxIterations(10),
    ({ messages }) => messages.length < 100,
  ]),
});
```
