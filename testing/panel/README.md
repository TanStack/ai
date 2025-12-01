# Stream Processor Test Panel

A visual testing tool for validating the TanStack AI stream processor.

## Features

- **Drop Zone**: Drag & drop JSON trace files to test
- **Sample Traces**: Pre-loaded examples from unit tests
- **Step-through Mode**: Process chunks one at a time
- **Side-by-side View**: See raw chunks and parsed output

## Usage

```bash
# From workspace root
pnpm install
cd testing/panel
pnpm dev
```

Then open http://localhost:3001

## Creating Trace Files

You can create trace files by enabling recording in the `chat()` function:

```typescript
import { chat } from '@tanstack/ai'

const stream = chat({
  adapter,
  model: 'gpt-4o',
  messages,
  // Add recording option (implementation pending)
  recordTo: 'tmp/my-trace.json',
})
```

Or capture traces from the test panel and save them.

## Trace Format

```json
{
  "version": "1.0",
  "timestamp": 1234567890,
  "chunks": [
    {
      "chunk": { "type": "content", "delta": "Hello", ... },
      "timestamp": 1234567891,
      "index": 0
    }
  ],
  "result": {
    "content": "Hello world",
    "toolCalls": [],
    "finishReason": "stop"
  }
}
```
