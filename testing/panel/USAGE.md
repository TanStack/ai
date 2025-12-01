# Stream Processor Test Panel - Usage Guide

## Quick Start

```bash
cd testing/panel
pnpm dev
```

Open http://localhost:3001

## Using the Panel

### Option 1: Load Sample Traces

Use the dropdown to select from pre-loaded examples:

- `textSimple` - Basic text streaming
- `textPunctuation` - Punctuation-based chunking
- `toolCallSingle` - Single tool call
- `toolCallParallel` - Multiple parallel tools
- `toolCallWithText` - Mixed content and tools
- `toolResult` - Tool result handling
- `thinking` - Thinking/reasoning (Claude)
- `approvalRequested` - Approval flow
- `toolInputAvailable` - Client tool execution
- `error` - Error handling
- `deltaOnly` - Delta-only chunks

### Option 2: Upload Your Own Trace

Drag and drop any `.json` trace file, or click the upload area to browse.

### Controls

- **◀ Prev**: Step backward one chunk (replays from start)
- **▶ Next**: Step forward one chunk
- **▶▶ Run All**: Process all chunks with visual animation
- **⟲ Reset**: Clear state and start over

### What You See

**Left Panel - Raw Chunks:**

- Shows the actual `StreamChunk` data from the adapter
- Color-coded by type:
  - Green: `content`
  - Blue: `tool_call`
  - Purple: `tool_result`
  - Yellow: `done`
  - Red: `error`
  - Cyan: `thinking`
  - Orange: `approval-requested`
  - Pink: `tool-input-available`

**Right Top - UIMessage:**

- The parsed message with `parts` array
- This is what the client UI sees
- Shows tool call states, text content, thinking, etc.

**Right Bottom - ModelMessage:**

- The format sent back to the server
- Includes `content`, `toolCalls`, etc.
- Used for agent loop continuation

## Creating Your Own Traces

### Method 1: Record from `chat()`

```typescript
import { chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const stream = chat({
  adapter: openai(),
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
  tools: [weatherTool],
  recordTo: 'tmp/weather-query-' + Date.now() + '.json',
})

for await (const chunk of stream) {
  console.log(chunk)
}

// Drag tmp/weather-query-*.json into the panel!
```

### Method 2: Export from Unit Tests

The sample traces were extracted from unit tests. You can create more by:

1. Writing a unit test that creates chunks
2. Using `createRecording()` helper from `src/traces/index.ts`
3. Saving to a `.json` file

## Validating Stream Processing

Use this panel to:

1. **Debug issues** - Step through chunks to see where things go wrong
2. **Validate fixes** - Load a problematic trace, verify it processes correctly
3. **Document behavior** - Save traces as examples of edge cases
4. **Regression testing** - Keep traces that exposed bugs

## Integration with Tests

Traces from the panel can be used in automated tests:

```typescript
import { StreamProcessor } from '@tanstack/ai'
import myTrace from './traces/my-trace.json'

test('handles my specific scenario', async () => {
  const result = await StreamProcessor.replay(myTrace)
  expect(result.content).toBe('expected text')
  expect(result.toolCalls).toHaveLength(2)
})
```

## Troubleshooting

**"StreamProcessor is not a constructor"**

- Run `pnpm build` in `packages/typescript/ai` first
- The shared processor must be built before ai-client can use it

**"Cannot find module '@/traces'"**

- Make sure you're in the `testing/panel` directory
- Run `pnpm install` if dependencies are missing

**UI not updating during step-through**

- This is expected - handlers fire but React needs state updates
- The current implementation updates state on each step

## Next Steps

1. **Record real sessions** - Use `recordTo` in your apps
2. **Build trace library** - Collect traces from different providers
3. **Add to CI** - Run replay tests as part of test suite
4. **Visualize in devtools** - Could integrate panel into browser devtools
