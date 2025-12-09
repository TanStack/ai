# @tanstack/ai-opentelemetry

OpenTelemetry instrumentation for TanStack AI. Automatically creates traces and spans for AI operations following [GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

## Installation

```bash
npm install @tanstack/ai-opentelemetry @opentelemetry/api
```

## Quick Start

```typescript
import { enableOpenTelemetry } from '@tanstack/ai-opentelemetry'

// Enable instrumentation (uses global tracer provider)
enableOpenTelemetry()

// Now all TanStack AI operations will be traced
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})
```

## Configuration

```typescript
import { enableOpenTelemetry } from '@tanstack/ai-opentelemetry'
import { trace } from '@opentelemetry/api'

enableOpenTelemetry({
  // Provide custom tracer
  tracer: trace.getTracer('my-app', '1.0.0'),

  // Record prompt/response content (disabled by default for privacy)
  recordContent: true,

  // Record tool call arguments and results (enabled by default)
  recordToolCalls: true,
})
```

## Spans Created

The instrumentation creates the following spans:

### Chat Span
- **Name**: `chat {model}`
- **Kind**: CLIENT
- **Attributes**:
  - `gen_ai.system`: Provider name (openai, anthropic, etc.)
  - `gen_ai.request.model`: Requested model
  - `gen_ai.response.model`: Actual model used
  - `gen_ai.response.finish_reasons`: How the response ended
  - `gen_ai.usage.input_tokens`: Prompt tokens
  - `gen_ai.usage.output_tokens`: Completion tokens
  - `gen_ai.usage.total_tokens`: Total tokens

### Stream Span
- **Name**: `stream {model}`
- **Kind**: INTERNAL
- **Attributes**:
  - `tanstack_ai.stream.total_chunks`: Number of chunks received
  - `tanstack_ai.stream.duration_ms`: Stream duration

### Tool Span
- **Name**: `tool {toolName}`
- **Kind**: INTERNAL
- **Attributes**:
  - `gen_ai.tool.name`: Tool name
  - `gen_ai.tool.call_id`: Unique tool call ID
  - `gen_ai.tool.duration_ms`: Execution duration

## Example with Jaeger

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'
import { enableOpenTelemetry } from '@tanstack/ai-opentelemetry'

// Setup OpenTelemetry SDK
const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://localhost:14268/api/traces',
  }),
  serviceName: 'my-ai-app',
})
sdk.start()

// Enable TanStack AI instrumentation
enableOpenTelemetry()
```

## Disabling Instrumentation

```typescript
import { disableOpenTelemetry } from '@tanstack/ai-opentelemetry'

disableOpenTelemetry()
```

## Manual Instrumentation

For more control, you can create and manage the instrumentation instance directly:

```typescript
import { TanStackAIInstrumentation } from '@tanstack/ai-opentelemetry'

const instrumentation = new TanStackAIInstrumentation({
  recordContent: true,
})

instrumentation.enable()

// Later...
instrumentation.disable()
```
