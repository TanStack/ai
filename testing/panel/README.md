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

Trace files are automatically created when you use the chat interface with a `traceId`. The panel subscribes to `aiEventClient` events to record all stream activity.

You can also create trace files programmatically by subscribing to events:

```typescript
import { createEventRecording } from '@/lib/recording'

// Create a recording instance that listens to aiEventClient events
const recording = createEventRecording('tmp/my-trace.json', 'my-trace-id')

// When done, clean up
recording.stop()
```

The recording utility automatically captures:

- Stream chunks (content, tool calls, tool results, done, errors, thinking)
- Final accumulated content
- Tool calls and their results
- Finish reason

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
